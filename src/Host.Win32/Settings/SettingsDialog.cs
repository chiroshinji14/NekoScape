using System.Drawing;
using NekoScape.Host.Native;

namespace NekoScape.Host.Settings;

public sealed class SettingsDialog : Form
{
    private static readonly Font FontTitle = new("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Point);
    private static readonly Font FontSubtitle = new("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontSection = new("Segoe UI", 7.5f, FontStyle.Bold, GraphicsUnit.Point);

    private readonly Dictionary<string, ModernSceneCard> _sceneCards = new(StringComparer.OrdinalIgnoreCase);
    private readonly ModernSegmentedBar _lightingBar;
    private readonly ModernSegmentedBar _fpsBar;
    private readonly ModernStepperCard _catStepper;
    private readonly ModernStepperCard _idleNapStepper;

    private readonly ModernToggleRow _showToyDockToggle;
    private readonly ModernToggleRow _laserHotkeyToggle;
    private readonly ModernToggleRow _shellReactionsToggle;
    private readonly ModernToggleRow _debugModeToggle;
    private readonly ModernToggleRow _launchAtStartupToggle;

    private string _selectedSceneTheme = "study";
    private bool _showHudValue;

    public NekoSettings ResultSettings { get; private set; }

    public event Action<NekoSettings>? SettingsApplied;
    public event Action? RescanIconsRequested;

    public SettingsDialog(NekoSettings initialSettings)
    {
        NekoSettings normalized = initialSettings.Normalized();
        ResultSettings = normalized.Clone();
        _selectedSceneTheme = normalized.SceneTheme;
        _showHudValue = normalized.ShowHud;

        SuspendLayout();

        Text = "NekoScape Preferences";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(420, 628);
        BackColor = ModernTheme.SurfaceWindow;
        ForeColor = ModernTheme.InkPrimary;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
        DoubleBuffered = true;

        int padX = 20;
        int contentW = ClientSize.Width - padX * 2; // 380

        // Header
        var titleLabel = new Label
        {
            Text = "NekoScape Control Center",
            Location = new Point(padX, 14),
            Size = new Size(250, 24),
            ForeColor = ModernTheme.InkPrimary,
            Font = FontTitle,
        };

        var subLabel = new Label
        {
            Text = "Customize your desktop cats, environment props & simulation.",
            Location = new Point(padX, 38),
            Size = new Size(contentW, 18),
            ForeColor = ModernTheme.InkSecondary,
            Font = FontSubtitle,
        };

        Controls.Add(titleLabel);
        Controls.Add(subLabel);

        // Section 1: Scene Bento Grid (2x2)
        Controls.Add(CreateSectionHeader("ENVIRONMENT SCENE", padX, 64, contentW));

        int cardW = (contentW - 10) / 2; // 185
        (string Key, string Title, string Sub, Color Floor, Color Rug, Color Accent, Point Pos)[] sceneSpecs =
        [
            ("study", "Golden Study", "Oak, Monstera & Books", Color.FromArgb(148, 98, 56), Color.FromArgb(228, 212, 190), Color.FromArgb(60, 145, 92), new Point(padX, 82)),
            ("tatami", "Kyoto Tatami", "Bonsai, Tea & Lantern", Color.FromArgb(164, 152, 92), Color.FromArgb(47, 74, 58), Color.FromArgb(240, 168, 184), new Point(padX + cardW + 10, 82)),
            ("garden", "Courtyard Garden", "Koi Pond & Flowers", Color.FromArgb(124, 118, 108), Color.FromArgb(72, 130, 74), Color.FromArgb(46, 134, 152), new Point(padX, 142)),
            ("cafe", "Cat Cafe Patio", "Bistro & Cat Tower", Color.FromArgb(172, 138, 108), Color.FromArgb(196, 118, 76), Color.FromArgb(236, 224, 210), new Point(padX + cardW + 10, 142)),
        ];

        foreach (var spec in sceneSpecs)
        {
            var card = new ModernSceneCard(spec.Key, spec.Title, spec.Sub, spec.Floor, spec.Rug, spec.Accent)
            {
                Location = spec.Pos,
                Size = new Size(cardW, 54),
                Selected = string.Equals(spec.Key, _selectedSceneTheme, StringComparison.OrdinalIgnoreCase),
            };
            card.Clicked += key => SelectSceneCard(key);
            _sceneCards[spec.Key] = card;
            Controls.Add(card);
        }

        // Section 2: Lighting & Frame Rate
        Controls.Add(CreateSectionHeader("ATMOSPHERE LIGHTING", padX, 204, 215));
        _lightingBar = new ModernSegmentedBar(
            [
                ("auto", "Auto"),
                ("day", "Day"),
                ("golden", "Golden"),
                ("night", "Night"),
            ])
        {
            Location = new Point(padX, 222),
            Size = new Size(218, 34),
            SelectedKey = normalized.LightingMode,
        };
        Controls.Add(_lightingBar);

        Controls.Add(CreateSectionHeader("FRAME RATE CAP", padX + 228, 204, 152));
        _fpsBar = new ModernSegmentedBar(
            [
                ("30", "30"),
                ("60", "60"),
                ("0", "Max"),
            ])
        {
            Location = new Point(padX + 228, 222),
            Size = new Size(152, 34),
            SelectedKey = FpsToKey(normalized.FpsCap),
        };
        Controls.Add(_fpsBar);

        // Section 3: Steppers (Cat Count & Idle Nap)
        Controls.Add(CreateSectionHeader("SIMULATION PARAMETERS", padX, 264, contentW));

        _catStepper = new ModernStepperCard("Cat Pack Size", 1, 12, normalized.CatCount)
        {
            Location = new Point(padX, 282),
            Size = new Size(cardW, 46),
        };
        Controls.Add(_catStepper);

        _idleNapStepper = new ModernStepperCard("Idle Nap Timeout", 1, 60, Math.Clamp(normalized.IdleNapMinutes, 1, 60), "m")
        {
            Location = new Point(padX + cardW + 10, 282),
            Size = new Size(cardW, 46),
        };
        Controls.Add(_idleNapStepper);

        // Section 4: Pill Toggles
        Controls.Add(CreateSectionHeader("INTERACTION & OVERLAYS", padX, 336, contentW));

        _showToyDockToggle = new ModernToggleRow(
            "Show On-Wallpaper Web FAB",
            "Floating bottom-right control button on the desktop canvas",
            normalized.ShowToyDock)
        {
            Location = new Point(padX, 354),
            Size = new Size(contentW, 42),
        };

        _laserHotkeyToggle = new ModernToggleRow(
            "Enable Laser Pointer Hotkeys",
            "Hold Alt to aim laser or press Ctrl+Alt+L for sticky laser",
            normalized.EnableLaserHotkey)
        {
            Location = new Point(padX, 400),
            Size = new Size(contentW, 42),
        };

        _shellReactionsToggle = new ModernToggleRow(
            "Enable Desktop Shell Reactions",
            "Cats pounce toward newly created files and Recycle Bin events",
            normalized.EnableShellReactions)
        {
            Location = new Point(padX, 446),
            Size = new Size(contentW, 42),
        };

        _debugModeToggle = new ModernToggleRow(
            "Show Debug Collision Wireframes",
            "Overlay icon AABBs, cat velocity vectors, and state labels",
            normalized.DebugMode)
        {
            Location = new Point(padX, 492),
            Size = new Size(contentW, 42),
        };

        _launchAtStartupToggle = new ModernToggleRow(
            "Launch NekoScape at Windows Startup",
            "Automatically start wallpaper in the system tray on sign-in",
            normalized.LaunchAtStartup)
        {
            Location = new Point(padX, 538),
            Size = new Size(contentW, 42),
        };

        Controls.Add(_showToyDockToggle);
        Controls.Add(_laserHotkeyToggle);
        Controls.Add(_shellReactionsToggle);
        Controls.Add(_debugModeToggle);
        Controls.Add(_launchAtStartupToggle);

        // Bottom Action Bar
        var rescanChip = new ModernActionChip("Rescan Icons")
        {
            Location = new Point(padX, 588),
            Size = new Size(118, 30),
        };
        rescanChip.Click += (_, _) => RescanIconsRequested?.Invoke();

        var cancelChip = new ModernActionChip("Cancel")
        {
            Location = new Point(padX + contentW - 246, 588),
            Size = new Size(76, 30),
        };
        cancelChip.Click += (_, _) =>
        {
            DialogResult = DialogResult.Cancel;
            Close();
        };

        var applyChip = new ModernActionChip("Apply")
        {
            Location = new Point(padX + contentW - 164, 588),
            Size = new Size(76, 30),
        };
        applyChip.Click += (_, _) =>
        {
            ResultSettings = ReadFormSettings();
            SettingsApplied?.Invoke(ResultSettings);
        };

        var saveChip = new ModernActionChip("Save")
        {
            Location = new Point(padX + contentW - 82, 588),
            Size = new Size(82, 30),
            Active = true,
        };
        saveChip.Click += (_, _) =>
        {
            ResultSettings = ReadFormSettings();
            SettingsApplied?.Invoke(ResultSettings);
            DialogResult = DialogResult.OK;
            Close();
        };

        Controls.Add(rescanChip);
        Controls.Add(cancelChip);
        Controls.Add(applyChip);
        Controls.Add(saveChip);

        ResumeLayout(performLayout: false);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Win32Api.TryEnableRoundedCorners(Handle);
    }

    private void SelectSceneCard(string sceneKey)
    {
        _selectedSceneTheme = NekoSettings.NormalizeSceneTheme(sceneKey);
        foreach (KeyValuePair<string, ModernSceneCard> kvp in _sceneCards)
        {
            kvp.Value.Selected = string.Equals(kvp.Key, _selectedSceneTheme, StringComparison.OrdinalIgnoreCase);
        }
    }

    public void SyncFromSettings(NekoSettings settings)
    {
        NekoSettings normalized = settings.Normalized();
        ResultSettings = normalized.Clone();
        _showHudValue = normalized.ShowHud;

        SelectSceneCard(normalized.SceneTheme);
        _lightingBar.SelectedKey = normalized.LightingMode;
        _fpsBar.SelectedKey = FpsToKey(normalized.FpsCap);
        _catStepper.Value = normalized.CatCount;
        _idleNapStepper.Value = Math.Clamp(normalized.IdleNapMinutes, 1, 60);
        _showToyDockToggle.Checked = normalized.ShowToyDock;
        _laserHotkeyToggle.Checked = normalized.EnableLaserHotkey;
        _shellReactionsToggle.Checked = normalized.EnableShellReactions;
        _debugModeToggle.Checked = normalized.DebugMode;
        _launchAtStartupToggle.Checked = normalized.LaunchAtStartup;
    }

    public NekoSettings ReadFormSettings()
    {
        int fpsCap = _fpsBar.SelectedKey switch
        {
            "30" => 30,
            "0" => 0,
            _ => 60,
        };

        return new NekoSettings
        {
            CatCount = _catStepper.Value,
            FpsCap = fpsCap,
            ShowHud = _showHudValue,
            ShowToyDock = _showToyDockToggle.Checked,
            DebugMode = _debugModeToggle.Checked,
            EnableLaserHotkey = _laserHotkeyToggle.Checked,
            EnableShellReactions = _shellReactionsToggle.Checked,
            LaunchAtStartup = _launchAtStartupToggle.Checked,
            IdleNapMinutes = _idleNapStepper.Value,
            LightingMode = NekoSettings.NormalizeLightingMode(_lightingBar.SelectedKey),
            SceneTheme = NekoSettings.NormalizeSceneTheme(_selectedSceneTheme),
        }.Normalized();
    }

    private static string FpsToKey(int fpsCap) => fpsCap switch
    {
        <= 0 => "0",
        <= 30 => "30",
        _ => "60",
    };

    private static Label CreateSectionHeader(string text, int x, int y, int width) => new()
    {
        Text = text,
        Location = new Point(x, y),
        Size = new Size(width, 16),
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = ModernTheme.InkMuted,
        Font = FontSection,
    };
}
