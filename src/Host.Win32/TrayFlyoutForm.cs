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
    int Pounces);

public sealed class TrayFlyoutForm : Form
{
    private static readonly Font FontBase = new("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontTitle = new("Segoe UI", 10.5f, FontStyle.Bold, GraphicsUnit.Point);
    private static readonly Font FontStatus = new("Segoe UI", 8.25f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontSection = new("Segoe UI", 7.25f, FontStyle.Bold, GraphicsUnit.Point);

    private readonly Label _statusLabel;
    private readonly ModernSegmentedBar _tabSwitcher;
    private readonly Panel _spacePage;
    private readonly Panel _settingsPage;

    // Space tab controls
    private readonly Dictionary<string, ModernSceneCard> _sceneCards = new(StringComparer.OrdinalIgnoreCase);
    private readonly ModernSegmentedBar _lightingBar;
    private readonly ModernStepperCard _catStepper;
    private readonly ModernActionChip _laserChip;
    private readonly ModernActionChip _yarnChip;
    private readonly ModernActionChip _boxChip;
    private readonly ModernActionChip _rescanChip;

    // Settings tab controls
    private readonly ModernSegmentedBar _fpsBar;
    private readonly ModernSegmentedBar _napBar;
    private readonly ModernToggleRow _webDockToggle;
    private readonly ModernToggleRow _laserHotkeyToggle;
    private readonly ModernToggleRow _shellReactionsToggle;
    private readonly ModernToggleRow _debugToggle;

    // Persistent footer controls
    private readonly ModernActionChip _pauseChip;
    private readonly ModernActionChip _fabQuickChip;
    private readonly ModernActionChip _openWindowChip;

    private TrayFlyoutState _state;
    private Point _anchorCursor;
    private bool _closing;
    private bool _suppressEvents;

    public event Action<string>? SceneSelected;
    public event Action<string>? LightingSelected;
    public event Action<int>? CatCountChanged;
    public event Action? ToggleLaserRequested;
    public event Action? TossYarnRequested;
    public event Action? ToggleBoxRequested;
    public event Action? RescanIconsRequested;
    public event Action? ToggleWebDockRequested;
    public event Action? TogglePauseRequested;
    public event Action? OpenSettingsRequested;
    public event Action<NekoSettings>? SettingsMutated;

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
        ClientSize = new Size(348, 456);

        // Header title + status badge
        var titleLabel = new Label
        {
            Text = "NekoScape",
            Location = new Point(16, 12),
            Size = new Size(135, 22),
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = ModernTheme.InkPrimary,
            BackColor = Color.Transparent,
            Font = FontTitle,
        };

        _statusLabel = new Label
        {
            Text = string.Empty,
            Location = new Point(152, 13),
            Size = new Size(180, 20),
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = ModernTheme.InkSecondary,
            BackColor = Color.Transparent,
            Font = FontStatus,
        };

        // Page containers
        _spacePage = new Panel
        {
            Location = new Point(16, 78),
            Size = new Size(316, 326),
            BackColor = ModernTheme.SurfaceWindow,
        };

        _settingsPage = new Panel
        {
            Location = new Point(16, 78),
            Size = new Size(316, 326),
            BackColor = ModernTheme.SurfaceWindow,
            Visible = false,
        };

        // Two-Tab Switcher: Space | Settings
        _tabSwitcher = new ModernSegmentedBar(
            [
                ("space", "Space & Props"),
                ("settings", "Settings"),
            ],
            isHeaderTab: true)
        {
            Location = new Point(16, 40),
            Size = new Size(316, 32),
        };
        _tabSwitcher.SelectionChanged += key =>
        {
            bool showSpace = string.Equals(key, "space", StringComparison.OrdinalIgnoreCase);
            _spacePage.Visible = showSpace;
            _settingsPage.Visible = !showSpace;
        };

        // ============================================================
        // SPACE TAB CONTENT
        // ============================================================
        _spacePage.Controls.Add(CreateSectionLabel("ENVIRONMENT SCENE", 0));

        (string Key, string Title, string Sub, Color Floor, Color Rug, Color Accent, Point Pos)[] sceneSpecs =
        [
            ("study", "Study", "Oak & Espresso", Color.FromArgb(148, 98, 56), Color.FromArgb(228, 212, 190), Color.FromArgb(60, 145, 92), new Point(0, 18)),
            ("tatami", "Tatami", "Bonsai & Tea", Color.FromArgb(164, 152, 92), Color.FromArgb(47, 74, 58), Color.FromArgb(240, 168, 184), new Point(162, 18)),
            ("garden", "Garden", "Koi & Clover", Color.FromArgb(124, 118, 108), Color.FromArgb(72, 130, 74), Color.FromArgb(46, 134, 152), new Point(0, 78)),
            ("cafe", "Cafe", "Bistro & Tree", Color.FromArgb(172, 138, 108), Color.FromArgb(196, 118, 76), Color.FromArgb(236, 224, 210), new Point(162, 78)),
        ];

        foreach (var spec in sceneSpecs)
        {
            var card = new ModernSceneCard(spec.Key, spec.Title, spec.Sub, spec.Floor, spec.Rug, spec.Accent)
            {
                Location = spec.Pos,
                Size = new Size(154, 54),
                AccessibleName = $"Switch scene to {spec.Title}",
            };
            card.Clicked += key => SceneSelected?.Invoke(key);
            _sceneCards[spec.Key] = card;
            _spacePage.Controls.Add(card);
        }

        _spacePage.Controls.Add(CreateSectionLabel("ATMOSPHERE LIGHTING", 140));
        _lightingBar = new ModernSegmentedBar(
            [
                ("auto", "Auto"),
                ("day", "Day"),
                ("golden", "Golden"),
                ("night", "Night"),
            ])
        {
            Location = new Point(0, 158),
            Size = new Size(316, 34),
            AccessibleName = "Lighting mode selector",
        };
        _lightingBar.SelectionChanged += mode =>
        {
            if (!_suppressEvents)
            {
                LightingSelected?.Invoke(mode);
            }
        };
        _spacePage.Controls.Add(_lightingBar);

        _catStepper = new ModernStepperCard("Cat Pack", 1, 12, _state.Settings.CatCount)
        {
            Location = new Point(0, 200),
            Size = new Size(316, 46),
            AccessibleName = "Cat pack count stepper",
        };
        _catStepper.ValueChanged += nextCount =>
        {
            if (!_suppressEvents)
            {
                CatCountChanged?.Invoke(nextCount);
            }
        };
        _spacePage.Controls.Add(_catStepper);

        _spacePage.Controls.Add(CreateSectionLabel("INTERACTIVE PROPS", 252));

        _laserChip = new ModernActionChip("Laser Pointer", useCoralAccent: true)
        {
            Location = new Point(0, 270),
            Size = new Size(154, 26),
            AccessibleName = "Toggle laser pointer",
        };
        _laserChip.Click += (_, _) => ToggleLaserRequested?.Invoke();

        _yarnChip = new ModernActionChip("Toss Yarn")
        {
            Location = new Point(162, 270),
            Size = new Size(154, 26),
            AccessibleName = "Toss yarn ball",
        };
        _yarnChip.Click += (_, _) => TossYarnRequested?.Invoke();

        _boxChip = new ModernActionChip("Scene Box")
        {
            Location = new Point(0, 300),
            Size = new Size(154, 26),
            AccessibleName = "Toggle themed scene box",
        };
        _boxChip.Click += (_, _) => ToggleBoxRequested?.Invoke();

        _rescanChip = new ModernActionChip("Rescan Icons")
        {
            Location = new Point(162, 300),
            Size = new Size(154, 26),
            AccessibleName = "Rescan desktop icons",
        };
        _rescanChip.Click += (_, _) => RescanIconsRequested?.Invoke();

        _spacePage.Controls.Add(_laserChip);
        _spacePage.Controls.Add(_yarnChip);
        _spacePage.Controls.Add(_boxChip);
        _spacePage.Controls.Add(_rescanChip);

        // ============================================================
        // SETTINGS TAB CONTENT
        // ============================================================
        _settingsPage.Controls.Add(CreateSectionLabel("FRAME RATE CAP", 0));
        _fpsBar = new ModernSegmentedBar(
            [
                ("30", "30 FPS"),
                ("60", "60 FPS"),
                ("0", "Uncapped"),
            ])
        {
            Location = new Point(0, 18),
            Size = new Size(316, 32),
            AccessibleName = "Frame rate cap selector",
        };
        _fpsBar.SelectionChanged += key =>
        {
            if (_suppressEvents)
            {
                return;
            }
            int fps = int.TryParse(key, out int parsed) ? parsed : 60;
            MutateSetting(s => s.FpsCap = fps);
        };
        _settingsPage.Controls.Add(_fpsBar);

        _settingsPage.Controls.Add(CreateSectionLabel("IDLE NAP TIMEOUT", 56));
        _napBar = new ModernSegmentedBar(
            [
                ("1", "1m"),
                ("5", "5m"),
                ("15", "15m"),
                ("30", "30m"),
            ])
        {
            Location = new Point(0, 74),
            Size = new Size(316, 32),
            AccessibleName = "Idle nap timeout selector",
        };
        _napBar.SelectionChanged += key =>
        {
            if (_suppressEvents)
            {
                return;
            }
            int mins = int.TryParse(key, out int parsed) ? parsed : 5;
            MutateSetting(s => s.IdleNapMinutes = mins);
        };
        _settingsPage.Controls.Add(_napBar);

        _settingsPage.Controls.Add(CreateSectionLabel("BEHAVIOR & OVERLAYS", 112));

        _webDockToggle = new ModernToggleRow("On-Wallpaper Web FAB", "Bottom-right floating control button", _state.Settings.ShowToyDock)
        {
            Location = new Point(0, 130),
            Size = new Size(316, 44),
        };
        _webDockToggle.CheckedChanged += _ =>
        {
            if (!_suppressEvents)
            {
                ToggleWebDockRequested?.Invoke();
            }
        };

        _laserHotkeyToggle = new ModernToggleRow("Laser Pointer Hotkeys", "Hold Alt or press Ctrl+Alt+L", _state.Settings.EnableLaserHotkey)
        {
            Location = new Point(0, 178),
            Size = new Size(316, 44),
        };
        _laserHotkeyToggle.CheckedChanged += enabled =>
        {
            if (!_suppressEvents)
            {
                MutateSetting(s => s.EnableLaserHotkey = enabled);
            }
        };

        _shellReactionsToggle = new ModernToggleRow("Desktop Shell Reactions", "Cats investigate new files & Recycle Bin", _state.Settings.EnableShellReactions)
        {
            Location = new Point(0, 226),
            Size = new Size(316, 44),
        };
        _shellReactionsToggle.CheckedChanged += enabled =>
        {
            if (!_suppressEvents)
            {
                MutateSetting(s => s.EnableShellReactions = enabled);
            }
        };

        _debugToggle = new ModernToggleRow("Debug Wireframes", "Render collision AABBs & cat state vectors", _state.Settings.DebugMode)
        {
            Location = new Point(0, 274),
            Size = new Size(316, 44),
        };
        _debugToggle.CheckedChanged += enabled =>
        {
            if (!_suppressEvents)
            {
                MutateSetting(s => s.DebugMode = enabled);
            }
        };

        _settingsPage.Controls.Add(_webDockToggle);
        _settingsPage.Controls.Add(_laserHotkeyToggle);
        _settingsPage.Controls.Add(_shellReactionsToggle);
        _settingsPage.Controls.Add(_debugToggle);

        // ============================================================
        // PERSISTENT FOOTER BAR
        // ============================================================
        _pauseChip = new ModernActionChip("Pause")
        {
            Location = new Point(16, 412),
            Size = new Size(100, 30),
            AccessibleName = "Pause or resume simulation",
        };
        _pauseChip.Click += (_, _) => TogglePauseRequested?.Invoke();

        _fabQuickChip = new ModernActionChip("Web FAB")
        {
            Location = new Point(124, 412),
            Size = new Size(100, 30),
            AccessibleName = "Toggle on-wallpaper web button",
        };
        _fabQuickChip.Click += (_, _) => ToggleWebDockRequested?.Invoke();

        _openWindowChip = new ModernActionChip("Window\u2026")
        {
            Location = new Point(232, 412),
            Size = new Size(100, 30),
            AccessibleName = "Open standalone settings window",
        };
        _openWindowChip.Click += (_, _) =>
        {
            CloseSafely();
            OpenSettingsRequested?.Invoke();
        };

        Controls.Add(titleLabel);
        Controls.Add(_statusLabel);
        Controls.Add(_tabSwitcher);
        Controls.Add(_spacePage);
        Controls.Add(_settingsPage);
        Controls.Add(_pauseChip);
        Controls.Add(_fabQuickChip);
        Controls.Add(_openWindowChip);

        ResumeLayout(performLayout: false);

        ApplyStateVisuals();
    }

    private void MutateSetting(Action<NekoSettings> mutator)
    {
        NekoSettings clone = _state.Settings.Clone();
        mutator(clone);
        NekoSettings normalized = clone.Normalized();
        _state = _state with { Settings = normalized };
        ApplyStateVisuals();
        SettingsMutated?.Invoke(normalized);
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
        CloseSafely();
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

            string statusPart = _state.Paused
                ? "Paused"
                : $"{_state.Pounces} pounces";
            int shownCats = _state.ActiveCats > 0 ? _state.ActiveCats : settings.CatCount;
            _statusLabel.Text = $"{shownCats} cats \u00b7 {statusPart}";

            foreach (KeyValuePair<string, ModernSceneCard> kvp in _sceneCards)
            {
                kvp.Value.Selected = string.Equals(kvp.Key, scene, StringComparison.OrdinalIgnoreCase);
            }

            _lightingBar.SelectedKey = lighting;
            _catStepper.Value = settings.CatCount;

            _laserChip.Active = _state.LaserActive;
            _laserChip.ChipLabel = _state.LaserActive ? "Laser: ON" : "Laser Pointer";

            string fpsKey = settings.FpsCap switch
            {
                <= 0 => "0",
                <= 30 => "30",
                _ => "60",
            };
            _fpsBar.SelectedKey = fpsKey;

            string napKey = settings.IdleNapMinutes switch
            {
                <= 1 => "1",
                <= 7 => "5",
                <= 20 => "15",
                _ => "30",
            };
            _napBar.SelectedKey = napKey;

            _webDockToggle.Checked = settings.ShowToyDock;
            _laserHotkeyToggle.Checked = settings.EnableLaserHotkey;
            _shellReactionsToggle.Checked = settings.EnableShellReactions;
            _debugToggle.Checked = settings.DebugMode;

            _pauseChip.ChipLabel = _state.Paused ? "Resume" : "Pause";
            _pauseChip.Active = _state.Paused;
            _fabQuickChip.Active = settings.ShowToyDock;
        }
        finally
        {
            _suppressEvents = false;
        }
    }

    private static Label CreateSectionLabel(string text, int y) => new()
    {
        Text = text,
        Location = new Point(2, y),
        Size = new Size(312, 16),
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = ModernTheme.InkMuted,
        BackColor = Color.Transparent,
        Font = FontSection,
    };
}
