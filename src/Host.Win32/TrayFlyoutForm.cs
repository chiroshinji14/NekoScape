using System.Drawing;
using System.Drawing.Drawing2D;
using NekoScape.Host.Native;
using NekoScape.Host.Settings;

namespace NekoScape.Host;

public sealed record TrayFlyoutState(
    NekoSettings Settings,
    bool LaserActive,
    bool Paused,
    int ActiveCats,
    int Pounces,
    bool IsWindowedMode = false);

public sealed class TrayFlyoutForm : Form
{
    private static readonly Font FontBase = new("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontTitle = new("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point);
    private static readonly Font FontStatus = new("Segoe UI", 8.25f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontSection = new("Segoe UI", 7.25f, FontStyle.Bold, GraphicsUnit.Point);

    internal static readonly (string Key, string Label, Color Swatch)[] BreedPickerOptions =
    [
        ("mix", "All Breeds", ModernTheme.AccentHoney),
        ("persian", "Persian", Color.FromArgb(242, 224, 198)),
        ("siamese", "Siamese", Color.FromArgb(218, 198, 174)),
        ("british_shorthair", "British", Color.FromArgb(146, 158, 172)),
        ("munchkin", "Munchkin", Color.FromArgb(228, 148, 86)),
        ("sphynx", "Sphynx", Color.FromArgb(224, 176, 158)),
        ("domestic_shorthair", "Domestic", Color.FromArgb(182, 128, 84)),
    ];

    private const int PadX = 18;
    private const int ContentWidth = 328;

    private readonly Label _statusLabel;
    private readonly ModernSegmentedBar _sceneBar;
    private readonly ModernSegmentedBar _lightingBar;
    private readonly ModernStepperCard _catStepper;
    private readonly ModernOptionPicker _breedPicker;
    private readonly ModernActionChip _laserChip;
    private readonly ModernActionChip _yarnChip;
    private readonly ModernActionChip _boxChip;
    private readonly ModernActionChip _treatChip;
    private readonly ModernActionChip _pauseChip;
    private readonly ModernActionChip _modeChip;
    private readonly ModernActionChip _settingsChip;

    private TrayFlyoutState _state;
    private Point _anchorCursor;
    private bool _closing;
    private bool _suppressEvents;
    private bool _suppressDeactivate;

    public event Action<string>? SceneSelected;
    public event Action<string>? LightingSelected;
    public event Action<int>? CatCountChanged;
    public event Action<string>? BreedModeSelected;
    public event Action? ToggleLaserRequested;
    public event Action? TossYarnRequested;
    public event Action? ToggleBoxRequested;
    public event Action? DropTreatRequested;
    public event Action? TogglePauseRequested;
    public event Action? ToggleWindowedModeRequested;
    public event Action? OpenSettingsRequested;

    public TrayFlyoutForm(TrayFlyoutState initialState)
    {
        _state = initialState with { Settings = initialState.Settings.Normalized() };
        _anchorCursor = Cursor.Position;

        SuspendLayout();

        Text = "NekoScape Quick Controls";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        KeyPreview = true;
        DoubleBuffered = true;
        ResizeRedraw = true;
        BackColor = ModernTheme.SurfaceWindow;
        ForeColor = ModernTheme.InkPrimary;
        Font = FontBase;
        ClientSize = new Size(364, 498);

        // Header
        var titleLabel = new Label
        {
            Text = "NekoScape",
            Location = new Point(PadX, 16),
            Size = new Size(140, 24),
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = ModernTheme.InkPrimary,
            BackColor = Color.Transparent,
            Font = FontTitle,
        };

        _statusLabel = new Label
        {
            Text = string.Empty,
            Location = new Point(160, 18),
            Size = new Size(186, 20),
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = ModernTheme.InkSecondary,
            BackColor = Color.Transparent,
            Font = FontStatus,
        };

        // 1. Scene Selector
        var sceneHeader = CreateSectionLabel("SCENE", 52);
        _sceneBar = new ModernSegmentedBar(
            [
                ("study", "Study"),
                ("tatami", "Tatami"),
                ("garden", "Garden"),
                ("cafe", "Cafe"),
            ])
        {
            Location = new Point(PadX, 72),
            Size = new Size(ContentWidth, 36),
            AccessibleName = "Scene selector",
        };
        _sceneBar.SelectionChanged += theme =>
        {
            if (!_suppressEvents)
            {
                SceneSelected?.Invoke(theme);
            }
        };

        // 2. Lighting Selector
        var lightingHeader = CreateSectionLabel("LIGHTING", 120);
        _lightingBar = new ModernSegmentedBar(
            [
                ("auto", "Auto"),
                ("day", "Day"),
                ("golden", "Golden"),
                ("night", "Night"),
            ])
        {
            Location = new Point(PadX, 140),
            Size = new Size(ContentWidth, 36),
            AccessibleName = "Lighting mode selector",
        };
        _lightingBar.SelectionChanged += mode =>
        {
            if (!_suppressEvents)
            {
                LightingSelected?.Invoke(mode);
            }
        };

        // 3. Cats & Breeds
        var catsHeader = CreateSectionLabel("CATS & BREEDS", 188);
        _catStepper = new ModernStepperCard("Cats", 1, 12, _state.Settings.CatCount)
        {
            Location = new Point(PadX, 208),
            Size = new Size(ContentWidth, 46),
            AccessibleName = "Cat count stepper",
        };
        _catStepper.ValueChanged += nextCount =>
        {
            if (!_suppressEvents)
            {
                CatCountChanged?.Invoke(nextCount);
            }
        };

        _breedPicker = new ModernOptionPicker("Breed", BreedPickerOptions, _state.Settings.BreedMode)
        {
            Location = new Point(PadX, 262),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Breed mix selector",
        };
        _breedPicker.MenuOpening += () => _suppressDeactivate = true;
        _breedPicker.MenuClosed += () =>
        {
            _suppressDeactivate = false;
            if (!IsDisposed && Visible)
            {
                Activate();
            }
        };
        _breedPicker.SelectionChanged += breedMode =>
        {
            if (!_suppressEvents)
            {
                BreedModeSelected?.Invoke(breedMode);
            }
        };

        // 4. Quick Play (2x2 generous chips)
        var playHeader = CreateSectionLabel("QUICK PLAY", 318);
        const int halfW = 159;
        const int colGap = 10;

        _laserChip = new ModernActionChip("Laser", useCoralAccent: true, glyph: ActionGlyph.Laser)
        {
            Location = new Point(PadX, 338),
            Size = new Size(halfW, 36),
            AccessibleName = "Toggle laser pointer",
        };
        _laserChip.Click += (_, _) => ToggleLaserRequested?.Invoke();

        _yarnChip = new ModernActionChip("Toss Yarn", glyph: ActionGlyph.Yarn)
        {
            Location = new Point(PadX + halfW + colGap, 338),
            Size = new Size(halfW, 36),
            AccessibleName = "Toss yarn ball",
        };
        _yarnChip.Click += (_, _) => TossYarnRequested?.Invoke();

        _boxChip = new ModernActionChip("Scene Box", glyph: ActionGlyph.Box)
        {
            Location = new Point(PadX, 384),
            Size = new Size(halfW, 36),
            AccessibleName = "Toggle cardboard box",
        };
        _boxChip.Click += (_, _) => ToggleBoxRequested?.Invoke();

        _treatChip = new ModernActionChip("Drop Treat", glyph: ActionGlyph.Treat)
        {
            Location = new Point(PadX + halfW + colGap, 384),
            Size = new Size(halfW, 36),
            AccessibleName = "Drop cat treat",
        };
        _treatChip.Click += (_, _) => DropTreatRequested?.Invoke();

        // 5. Subtle Bottom Footer Bar
        const int footerW = 104;
        const int footerGap = 8;

        _pauseChip = new ModernActionChip("Pause", glyph: ActionGlyph.Pause)
        {
            Location = new Point(PadX, 446),
            Size = new Size(footerW, 34),
            AccessibleName = "Pause or resume simulation",
        };
        _pauseChip.Click += (_, _) => TogglePauseRequested?.Invoke();

        _modeChip = new ModernActionChip("Windowed", glyph: ActionGlyph.Window)
        {
            Location = new Point(PadX + footerW + footerGap, 446),
            Size = new Size(footerW, 34),
            AccessibleName = "Toggle windowed or wallpaper mode",
        };
        _modeChip.Click += (_, _) =>
        {
            CloseSafely();
            ToggleWindowedModeRequested?.Invoke();
        };

        _settingsChip = new ModernActionChip("Settings\u2026", glyph: ActionGlyph.Settings)
        {
            Location = new Point(PadX + (footerW + footerGap) * 2, 446),
            Size = new Size(footerW, 34),
            AccessibleName = "Open settings",
        };
        _settingsChip.Click += (_, _) =>
        {
            CloseSafely();
            OpenSettingsRequested?.Invoke();
        };

        Controls.AddRange([
            titleLabel,
            _statusLabel,
            sceneHeader,
            _sceneBar,
            lightingHeader,
            _lightingBar,
            catsHeader,
            _catStepper,
            _breedPicker,
            playHeader,
            _laserChip,
            _yarnChip,
            _boxChip,
            _treatChip,
            _pauseChip,
            _modeChip,
            _settingsChip,
        ]);

        ResumeLayout(performLayout: false);
        ApplyStateVisuals();
    }

    public void PrepareAnchor(Point cursorScreenPoint)
    {
        _anchorCursor = cursorScreenPoint;
        Screen targetScreen = Screen.FromPoint(cursorScreenPoint);
        Location = ComputeAnchorLocation(targetScreen.WorkingArea, targetScreen.Bounds, cursorScreenPoint, Size);
    }

    public void UpdateState(TrayFlyoutState nextState)
    {
        if (IsDisposed)
        {
            return;
        }

        _state = nextState with { Settings = nextState.Settings.Normalized() };
        ApplyStateVisuals();
    }

    public static Point ComputeAnchorLocation(
        Rectangle workingArea,
        Rectangle screenBounds,
        Point cursor,
        Size flyoutSize,
        int margin = 10)
    {
        int desiredX = cursor.X - flyoutSize.Width / 2;
        int desiredY = workingArea.Bottom - flyoutSize.Height - margin;

        bool topTaskbar = workingArea.Top > screenBounds.Top && cursor.Y < workingArea.Top;
        bool leftTaskbar = workingArea.Left > screenBounds.Left && cursor.X < workingArea.Left;
        bool rightTaskbar = workingArea.Right < screenBounds.Right && cursor.X > workingArea.Right;

        if (topTaskbar)
        {
            desiredY = workingArea.Top + margin;
        }
        else if (leftTaskbar)
        {
            desiredX = workingArea.Left + margin;
            desiredY = cursor.Y - flyoutSize.Height / 2;
        }
        else if (rightTaskbar)
        {
            desiredX = workingArea.Right - flyoutSize.Width - margin;
            desiredY = cursor.Y - flyoutSize.Height / 2;
        }

        int minX = workingArea.Left + margin;
        int maxX = Math.Max(minX, workingArea.Right - flyoutSize.Width - margin);
        int minY = workingArea.Top + margin;
        int maxY = Math.Max(minY, workingArea.Bottom - flyoutSize.Height - margin);

        return new Point(
            Math.Clamp(desiredX, minX, maxX),
            Math.Clamp(desiredY, minY, maxY));
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Win32Api.TryEnableRoundedCorners(Handle);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        Win32Api.TryEnableRoundedCorners(Handle);
        Screen targetScreen = Screen.FromPoint(_anchorCursor);
        Location = ComputeAnchorLocation(targetScreen.WorkingArea, targetScreen.Bounds, _anchorCursor, Size);
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        if (!_suppressDeactivate)
        {
            CloseSafely();
        }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Escape)
        {
            CloseSafely();
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        ModernTheme.ConfigureHighQuality(e.Graphics);

        // Compute divider dynamically from scaled controls so it stays centered at 125%-200% DPI.
        int padX = _sceneBar.Left;
        int dividerY = (_boxChip.Bottom + _pauseChip.Top) / 2;
        using (Pen dividerPen = new(ModernTheme.Divider, 1f))
        {
            e.Graphics.DrawLine(dividerPen, padX, dividerY, ClientSize.Width - padX, dividerY);
        }

        // Crisp rounded outer rim
        RectangleF borderRect = new(0.5f, 0.5f, ClientSize.Width - 1.5f, ClientSize.Height - 1.5f);
        using GraphicsPath path = ModernTheme.CreateRoundedRect(borderRect, 11f);
        using Pen borderPen = new(ModernTheme.BorderOuter, 1.25f);
        e.Graphics.DrawPath(borderPen, path);
    }

    private void CloseSafely()
    {
        if (_closing || IsDisposed)
        {
            return;
        }

        _closing = true;
        Close();
    }

    private void ApplyStateVisuals()
    {
        _suppressEvents = true;
        try
        {
            NekoSettings settings = _state.Settings;
            string scene = NekoSettings.NormalizeSceneTheme(settings.SceneTheme);
            string lighting = NekoSettings.NormalizeLightingMode(settings.LightingMode);
            string breedMode = NekoSettings.NormalizeBreedMode(settings.BreedMode);

            int shownCats = _state.ActiveCats > 0 ? _state.ActiveCats : settings.CatCount;
            string modeStatus = _state.Paused
                ? "Paused"
                : (_state.IsWindowedMode ? "Windowed" : "Wallpaper");
            _statusLabel.Text = $"{shownCats} cats \u00b7 {modeStatus}";

            _sceneBar.SelectedKey = scene;
            _lightingBar.SelectedKey = lighting;
            _catStepper.Value = settings.CatCount;
            _breedPicker.SelectedKey = breedMode;

            _laserChip.Active = _state.LaserActive;
            _laserChip.ChipLabel = _state.LaserActive ? "Laser On" : "Laser";

            _pauseChip.ChipLabel = _state.Paused ? "Resume" : "Pause";
            _pauseChip.Glyph = _state.Paused ? ActionGlyph.Play : ActionGlyph.Pause;
            _pauseChip.Active = _state.Paused;

            _modeChip.ChipLabel = _state.IsWindowedMode ? "Wallpaper" : "Windowed";
            _modeChip.Glyph = _state.IsWindowedMode ? ActionGlyph.Wallpaper : ActionGlyph.Window;
            _modeChip.Active = false;
        }
        finally
        {
            _suppressEvents = false;
        }
    }

    private static Label CreateSectionLabel(string text, int y) => new()
    {
        Text = text,
        Location = new Point(PadX + 2, y),
        Size = new Size(ContentWidth - 4, 16),
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = ModernTheme.InkMuted,
        BackColor = Color.Transparent,
        Font = FontSection,
    };
}
