using System.Drawing;
using NekoScape.Host.Native;

namespace NekoScape.Host.Settings;

public sealed class SettingsDialog : Form
{
    private static readonly Font FontTitle = new("Segoe UI", 12.5f, FontStyle.Bold, GraphicsUnit.Point);
    private static readonly Font FontSubtitle = new("Segoe UI", 8.75f, FontStyle.Regular, GraphicsUnit.Point);
    private static readonly Font FontSection = new("Segoe UI", 7.25f, FontStyle.Bold, GraphicsUnit.Point);

    private const int PadX = 24;
    private const int ContentWidth = 416;

    private readonly ModernSegmentedBar _tabBar;
    private readonly Panel _appearancePage;
    private readonly Panel _simulationPage;
    private readonly Panel _systemPage;
    private readonly ModernActionChip _refreshIconsChip;

    // Appearance & Breeds
    private readonly ModernOptionPicker _scenePicker;
    private readonly ModernSegmentedBar _lightingBar;
    private readonly ModernOptionPicker _breedPicker;
    private readonly ModernToggleRow _kittenModeToggle;
    private readonly ModernOptionPicker _collarPicker;
    private readonly ModernToggleRow _collarBellToggle;

    // Simulation & Performance
    private readonly ModernStepperCard _catStepper;
    private readonly ModernStepperCard _idleNapStepper;
    private readonly ModernSegmentedBar _fpsBar;
    private readonly ModernToggleRow _soundEnabledToggle;
    private readonly ModernStepperCard _soundVolumeStepper;
    private readonly ModernToggleRow _showScenePropsToggle;
    private readonly ModernToggleRow _shellReactionsToggle;

    // System
    private readonly ModernToggleRow _showToyDockToggle;
    private readonly ModernToggleRow _laserHotkeyToggle;
    private readonly ModernToggleRow _launchAtStartupToggle;
    private readonly ModernToggleRow _debugModeToggle;

    private bool _showHudValue;

    public NekoSettings ResultSettings { get; private set; }

    public event Action<NekoSettings>? SettingsApplied;
    public event Action? RescanIconsRequested;

    public SettingsDialog(NekoSettings initialSettings)
    {
        NekoSettings normalized = initialSettings.Normalized();
        ResultSettings = normalized.Clone();
        _showHudValue = normalized.ShowHud;

        SuspendLayout();

        Text = "NekoScape Settings";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        KeyPreview = true;
        ClientSize = new Size(464, 584);
        BackColor = ModernTheme.SurfaceWindow;
        ForeColor = ModernTheme.InkPrimary;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
        DoubleBuffered = true;

        // Header
        var titleLabel = new Label
        {
            Text = "NekoScape Settings",
            Location = new Point(PadX, 16),
            Size = new Size(ContentWidth, 26),
            ForeColor = ModernTheme.InkPrimary,
            Font = FontTitle,
        };

        var subLabel = new Label
        {
            Text = "Personalize your scenes, breeds, toys, and desktop behavior.",
            Location = new Point(PadX, 42),
            Size = new Size(ContentWidth, 18),
            ForeColor = ModernTheme.InkSecondary,
            Font = FontSubtitle,
        };

        // 3-Group Section Tabs
        _tabBar = new ModernSegmentedBar(
            [
                ("appearance", "Appearance"),
                ("simulation", "Simulation"),
                ("system", "System"),
            ],
            isHeaderTab: true)
        {
            Location = new Point(PadX, 70),
            Size = new Size(ContentWidth, 36),
            AccessibleName = "Settings sections",
        };
        _tabBar.SelectionChanged += SwitchTab;

        _appearancePage = CreatePagePanel(visible: true);
        _simulationPage = CreatePagePanel(visible: false);
        _systemPage = CreatePagePanel(visible: false);

        int halfW = (ContentWidth - 12) / 2; // 202

        // ============================================================
        // TAB 1: APPEARANCE & BREEDS
        // ============================================================
        _appearancePage.Controls.Add(CreateSectionHeader("SCENE", 0, 0, ContentWidth));
        _scenePicker = new ModernOptionPicker(
            "Scene Theme",
            TrayFlyoutForm.ScenePickerOptions,
            normalized.SceneTheme)
        {
            Location = new Point(0, 22),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Scene theme selector",
        };
        _appearancePage.Controls.Add(_scenePicker);

        _appearancePage.Controls.Add(CreateSectionHeader("LIGHTING", 0, 78, ContentWidth));
        _lightingBar = new ModernSegmentedBar(
            [
                ("auto", "Auto"),
                ("day", "Day"),
                ("golden", "Golden"),
                ("night", "Night"),
            ])
        {
            Location = new Point(0, 100),
            Size = new Size(ContentWidth, 36),
            SelectedKey = normalized.LightingMode,
            AccessibleName = "Lighting mode selector",
        };
        _appearancePage.Controls.Add(_lightingBar);

        _appearancePage.Controls.Add(CreateSectionHeader("BREEDS & CUSTOMIZATION", 0, 148, ContentWidth));
        _breedPicker = new ModernOptionPicker(
            "Cat Breeds",
            TrayFlyoutForm.BreedPickerOptions,
            normalized.BreedMode)
        {
            Location = new Point(0, 170),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Preferred cat breed mix",
        };
        _kittenModeToggle = new ModernToggleRow(
            "Kitten Mode",
            "Smaller playful proportions, bigger ears, and kitten mews",
            normalized.KittenMode)
        {
            Location = new Point(0, 222),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle kitten mode",
        };
        _collarPicker = new ModernOptionPicker(
            "Collar Color",
            TrayFlyoutForm.CollarPickerOptions,
            CollarColorToPickerKey(normalized.CollarColor))
        {
            Location = new Point(0, 278),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Collar color selector",
        };
        _collarBellToggle = new ModernToggleRow(
            "Collar Bell",
            "Tiny jingle bell chime when a collar is worn",
            normalized.CollarBell)
        {
            Location = new Point(0, 330),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle collar bell",
        };
        _appearancePage.Controls.Add(_breedPicker);
        _appearancePage.Controls.Add(_kittenModeToggle);
        _appearancePage.Controls.Add(_collarPicker);
        _appearancePage.Controls.Add(_collarBellToggle);

        // ============================================================
        // TAB 2: SIMULATION & AUDIO
        // ============================================================
        _simulationPage.Controls.Add(CreateSectionHeader("CATS & PACE", 0, 0, ContentWidth));

        _catStepper = new ModernStepperCard("Cats", NekoSettings.MinCatCount, int.MaxValue, normalized.CatCount)
        {
            Location = new Point(0, 22),
            Size = new Size(halfW, 48),
            AccessibleName = "Number of cats (Shift-click for 5, click number to type)",
        };
        _idleNapStepper = new ModernStepperCard("Idle Nap", 1, 60, Math.Clamp(normalized.IdleNapMinutes, 1, 60), "m")
        {
            Location = new Point(halfW + 12, 22),
            Size = new Size(halfW, 48),
            AccessibleName = "Idle nap timeout in minutes",
        };
        _simulationPage.Controls.Add(_catStepper);
        _simulationPage.Controls.Add(_idleNapStepper);

        _simulationPage.Controls.Add(CreateSectionHeader("FRAME RATE", 0, 84, ContentWidth));
        _fpsBar = new ModernSegmentedBar(
            [
                ("30", "30 FPS"),
                ("60", "60 FPS"),
                ("0", "Uncapped"),
            ])
        {
            Location = new Point(0, 106),
            Size = new Size(ContentWidth, 36),
            SelectedKey = FpsToKey(normalized.FpsCap),
            AccessibleName = "Frame rate limit",
        };
        _simulationPage.Controls.Add(_fpsBar);

        _simulationPage.Controls.Add(CreateSectionHeader("AUDIO", 0, 154, ContentWidth));
        _soundEnabledToggle = new ModernToggleRow(
            "Cat Sounds",
            "Gentle procedural purrs, meows, and toy chimes",
            normalized.SoundEnabled)
        {
            Location = new Point(0, 176),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle cat sound effects",
        };
        _soundVolumeStepper = new ModernStepperCard(
            "Sound Volume",
            0,
            100,
            (int)Math.Round(normalized.SoundVolume * 100),
            "%")
        {
            Location = new Point(0, 232),
            Size = new Size(ContentWidth, 46),
            AccessibleName = "Sound volume percentage",
        };
        _simulationPage.Controls.Add(_soundEnabledToggle);
        _simulationPage.Controls.Add(_soundVolumeStepper);

        _simulationPage.Controls.Add(CreateSectionHeader("WORLD & REACTIONS", 0, 288, ContentWidth));
        _showScenePropsToggle = new ModernToggleRow(
            "Interactive Scene Props",
            "Clickable ponds, fireplaces, aquariums, and cozy details",
            normalized.ShowSceneProps)
        {
            Location = new Point(0, 308),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Toggle interactive scene props",
        };
        _shellReactionsToggle = new ModernToggleRow(
            "Desktop Reactions",
            "Cats walk taskbar/window ledges and react to new files",
            normalized.EnableShellReactions)
        {
            Location = new Point(0, 356),
            Size = new Size(ContentWidth, 44),
            AccessibleName = "Toggle desktop reactions",
        };
        _simulationPage.Controls.Add(_showScenePropsToggle);
        _simulationPage.Controls.Add(_shellReactionsToggle);

        // ============================================================
        // TAB 3: SYSTEM
        // ============================================================
        _systemPage.Controls.Add(CreateSectionHeader("CONTROLS & SHORTCUTS", 0, 0, ContentWidth));
        _showToyDockToggle = new ModernToggleRow(
            "Controls Overlay",
            "Show the floating quick-controls button on the canvas",
            normalized.ShowToyDock)
        {
            Location = new Point(0, 22),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle controls overlay button",
        };
        _laserHotkeyToggle = new ModernToggleRow(
            "Laser Pointer Shortcut",
            "Hold Alt to aim laser or press Ctrl+Alt+L to lock on",
            normalized.EnableLaserHotkey)
        {
            Location = new Point(0, 80),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle laser pointer shortcuts",
        };
        _systemPage.Controls.Add(_showToyDockToggle);
        _systemPage.Controls.Add(_laserHotkeyToggle);

        _systemPage.Controls.Add(CreateSectionHeader("WINDOWS & DIAGNOSTICS", 0, 144, ContentWidth));
        _launchAtStartupToggle = new ModernToggleRow(
            "Start with Windows",
            "Launch NekoScape automatically when you sign in",
            normalized.LaunchAtStartup)
        {
            Location = new Point(0, 166),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Launch NekoScape at Windows startup",
        };
        _debugModeToggle = new ModernToggleRow(
            "Debug Overlay",
            "Show collision bounds, ledges, needs, and cat states",
            normalized.DebugMode)
        {
            Location = new Point(0, 224),
            Size = new Size(ContentWidth, 48),
            AccessibleName = "Toggle debug overlay",
        };
        _systemPage.Controls.Add(_launchAtStartupToggle);
        _systemPage.Controls.Add(_debugModeToggle);

        // ============================================================
        // FOOTER ACTION BAR
        // ============================================================
        _refreshIconsChip = new ModernActionChip("Refresh Icons", glyph: ActionGlyph.Refresh)
        {
            Location = new Point(PadX, 532),
            Size = new Size(124, 34),
            AccessibleName = "Refresh desktop icons",
        };
        _refreshIconsChip.Click += (_, _) => RescanIconsRequested?.Invoke();

        var cancelChip = new ModernActionChip("Cancel")
        {
            Location = new Point(PadX + ContentWidth - 264, 532),
            Size = new Size(82, 34),
            AccessibleName = "Cancel changes",
        };
        cancelChip.Click += (_, _) =>
        {
            DialogResult = DialogResult.Cancel;
            Close();
        };

        var applyChip = new ModernActionChip("Apply")
        {
            Location = new Point(PadX + ContentWidth - 174, 532),
            Size = new Size(82, 34),
            AccessibleName = "Apply changes",
        };
        applyChip.Click += (_, _) =>
        {
            ResultSettings = ReadFormSettings();
            SettingsApplied?.Invoke(ResultSettings);
        };

        var saveChip = new ModernActionChip("Save")
        {
            Location = new Point(PadX + ContentWidth - 84, 532),
            Size = new Size(84, 34),
            Active = true,
            AccessibleName = "Save and close settings",
        };
        saveChip.Click += (_, _) => SaveAndClose();

        Controls.AddRange([
            titleLabel,
            subLabel,
            _tabBar,
            _appearancePage,
            _simulationPage,
            _systemPage,
            _refreshIconsChip,
            cancelChip,
            applyChip,
            saveChip,
        ]);

        ResumeLayout(performLayout: false);
    }

    private void SaveAndClose()
    {
        ResultSettings = ReadFormSettings();
        SettingsApplied?.Invoke(ResultSettings);
        DialogResult = DialogResult.OK;
        Close();
    }

    private void SwitchTab(string key)
    {
        _appearancePage.Visible = string.Equals(key, "appearance", StringComparison.OrdinalIgnoreCase);
        _simulationPage.Visible = string.Equals(key, "simulation", StringComparison.OrdinalIgnoreCase);
        _systemPage.Visible = string.Equals(key, "system", StringComparison.OrdinalIgnoreCase);
    }

    private static Panel CreatePagePanel(bool visible) => new()
    {
        Location = new Point(PadX, 118),
        Size = new Size(ContentWidth, 402),
        BackColor = ModernTheme.SurfaceWindow,
        Visible = visible,
    };

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Win32Api.TryEnableDarkTitleBar(Handle);
        Win32Api.TryEnableRoundedCorners(Handle);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Escape)
        {
            DialogResult = DialogResult.Cancel;
            Close();
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        int padX = _tabBar.Left;
        int dividerY = (_appearancePage.Bottom + _refreshIconsChip.Top) / 2;
        using Pen dividerPen = new(ModernTheme.Divider, 1f);
        e.Graphics.DrawLine(dividerPen, padX, dividerY, ClientSize.Width - padX, dividerY);
    }

    public void SyncFromSettings(NekoSettings settings)
    {
        NekoSettings normalized = settings.Normalized();
        ResultSettings = normalized.Clone();
        _showHudValue = normalized.ShowHud;

        _scenePicker.SelectedKey = normalized.SceneTheme;
        _lightingBar.SelectedKey = normalized.LightingMode;
        _breedPicker.SelectedKey = normalized.BreedMode;
        _kittenModeToggle.Checked = normalized.KittenMode;
        _collarPicker.SelectedKey = CollarColorToPickerKey(normalized.CollarColor);
        _collarBellToggle.Checked = normalized.CollarBell;

        _fpsBar.SelectedKey = FpsToKey(normalized.FpsCap);
        _catStepper.Value = normalized.CatCount;
        _idleNapStepper.Value = Math.Clamp(normalized.IdleNapMinutes, 1, 60);
        _soundEnabledToggle.Checked = normalized.SoundEnabled;
        _soundVolumeStepper.Value = (int)Math.Round(normalized.SoundVolume * 100);
        _showScenePropsToggle.Checked = normalized.ShowSceneProps;
        _shellReactionsToggle.Checked = normalized.EnableShellReactions;

        _showToyDockToggle.Checked = normalized.ShowToyDock;
        _laserHotkeyToggle.Checked = normalized.EnableLaserHotkey;
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
            SceneTheme = NekoSettings.NormalizeSceneTheme(_scenePicker.SelectedKey),
            BreedMode = NekoSettings.NormalizeBreedMode(_breedPicker.SelectedKey),
            ShowSceneProps = _showScenePropsToggle.Checked,
            KittenMode = _kittenModeToggle.Checked,
            CollarColor = PickerKeyToCollarColor(_collarPicker.SelectedKey),
            CollarBell = _collarBellToggle.Checked,
            SoundEnabled = _soundEnabledToggle.Checked,
            SoundVolume = Math.Round(_soundVolumeStepper.Value / 100.0, 2),
        }.Normalized();
    }

    private static string CollarColorToPickerKey(string? collarColor)
    {
        string? normalized = NekoSettings.NormalizeCollarColor(collarColor);
        return normalized is null ? "none" : normalized;
    }

    private static string? PickerKeyToCollarColor(string? key)
        => NekoSettings.NormalizeCollarColor(key);

    private static string FpsToKey(int fpsCap) => fpsCap switch
    {
        <= 0 => "0",
        <= 30 => "30",
        _ => "60",
    };

    private static Label CreateSectionHeader(string text, int x, int y, int width) => new()
    {
        Text = text,
        Location = new Point(x + 2, y),
        Size = new Size(width - 4, 16),
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = ModernTheme.InkMuted,
        Font = FontSection,
    };
}
