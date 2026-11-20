using System.Drawing;
using System.Text.Json;
using NekoScape.Host.Settings;
using Xunit;

namespace NekoScape.Host.Tests;

public sealed class SettingsTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly string _configDir;
    private readonly string _fallbackDir;
    private readonly FakeStartupRegistrar _fakeRegistry;

    public SettingsTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "NekoScape_SettingsTests_" + Guid.NewGuid().ToString("N"));
        _configDir = Path.Combine(_tempRoot, "config");
        _fallbackDir = Path.Combine(_tempRoot, "fallback");
        Directory.CreateDirectory(_configDir);
        _fakeRegistry = new FakeStartupRegistrar();
    }

    [Fact]
    public void Load_ReadsDefaultsMatchingCanonicalSchema()
    {
        File.WriteAllText(Path.Combine(_configDir, "default-settings.json"), """
            {
              "catCount": 6,
              "fpsCap": 60,
              "showHud": false,
              "showToyDock": true,
              "debugMode": false,
              "enableLaserHotkey": true,
              "enableShellReactions": true,
              "launchAtStartup": false,
              "idleNapMinutes": 5,
              "lightingMode": "golden",
              "sceneTheme": "study",
              "breedMode": "mix",
              "showSceneProps": true
            }
            """);

        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);
        NekoSettings settings = store.Current;

        Assert.Equal(6, settings.CatCount);
        Assert.Equal(60, settings.FpsCap);
        Assert.False(settings.ShowHud);
        Assert.True(settings.ShowToyDock);
        Assert.False(settings.DebugMode);
        Assert.True(settings.EnableLaserHotkey);
        Assert.True(settings.EnableShellReactions);
        Assert.False(settings.LaunchAtStartup);
        Assert.Equal(5, settings.IdleNapMinutes);
        Assert.Equal("golden", settings.LightingMode);
        Assert.Equal("study", settings.SceneTheme);
        Assert.Equal("mix", settings.BreedMode);
        Assert.True(settings.ShowSceneProps);
    }

    [Fact]
    public void RepositoryDefaultSettingsJson_MatchesCanonical13FieldContract()
    {
        string configDir = AppSettingsStore.ResolveDefaultConfigDirectory();
        string defaultPath = Path.Combine(configDir, "default-settings.json");
        Assert.True(File.Exists(defaultPath), $"Expected default-settings.json at {defaultPath}");

        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(defaultPath));
        JsonElement root = doc.RootElement;
        Assert.Equal(6, root.GetProperty("catCount").GetInt32());
        Assert.Equal(60, root.GetProperty("fpsCap").GetInt32());
        Assert.False(root.GetProperty("showHud").GetBoolean());
        Assert.True(root.GetProperty("showToyDock").GetBoolean());
        Assert.False(root.GetProperty("debugMode").GetBoolean());
        Assert.True(root.GetProperty("enableLaserHotkey").GetBoolean());
        Assert.True(root.GetProperty("enableShellReactions").GetBoolean());
        Assert.False(root.GetProperty("launchAtStartup").GetBoolean());
        Assert.Equal(5, root.GetProperty("idleNapMinutes").GetInt32());
        Assert.Equal("golden", root.GetProperty("lightingMode").GetString());
        Assert.Equal("study", root.GetProperty("sceneTheme").GetString());
        Assert.Equal("mix", root.GetProperty("breedMode").GetString());
        Assert.True(root.GetProperty("showSceneProps").GetBoolean());
    }

    [Fact]
    public void Load_MergesPartialUserOverridesOntoDefaults()
    {
        File.WriteAllText(Path.Combine(_configDir, "default-settings.json"), """
            {
              "catCount": 6,
              "fpsCap": 60,
              "showHud": false,
              "showToyDock": true,
              "debugMode": false,
              "enableLaserHotkey": true,
              "enableShellReactions": true,
              "launchAtStartup": false,
              "idleNapMinutes": 5,
              "breedMode": "mix",
              "showSceneProps": true
            }
            """);
        File.WriteAllText(Path.Combine(_configDir, "user-settings.json"), """
            {
              "catCount": 10,
              "debugMode": true,
              "breedMode": "blue-grey"
            }
            """);

        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);

        Assert.Equal(10, store.Current.CatCount);
        Assert.True(store.Current.DebugMode);
        Assert.Equal(60, store.Current.FpsCap);
        Assert.False(store.Current.ShowHud);
        Assert.Equal(5, store.Current.IdleNapMinutes);
        Assert.Equal("british_shorthair", store.Current.BreedMode);
        Assert.True(store.Current.ShowSceneProps);
    }

    [Fact]
    public void Save_ClampsBounds_PersistsCamelCaseJson_AndUpdatesStartupRegistry()
    {
        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);

        NekoSettings saved = store.Save(new NekoSettings
        {
            CatCount = 99,
            FpsCap = -10,
            ShowHud = false,
            ShowToyDock = true,
            DebugMode = true,
            EnableLaserHotkey = false,
            EnableShellReactions = false,
            LaunchAtStartup = true,
            IdleNapMinutes = 0,
            LightingMode = "AUTO",
            SceneTheme = "TATAMI",
            BreedMode = "SIAMESE",
            ShowSceneProps = false
        });

        Assert.Equal(12, saved.CatCount);
        Assert.Equal(0, saved.FpsCap);
        Assert.Equal(1, saved.IdleNapMinutes);
        Assert.Equal("auto", saved.LightingMode);
        Assert.Equal("tatami", saved.SceneTheme);
        Assert.Equal("siamese", saved.BreedMode);
        Assert.False(saved.ShowSceneProps);
        Assert.True(_fakeRegistry.Enabled);
        Assert.Equal(@"C:\Apps\NekoScape.exe", _fakeRegistry.ExecutablePath);

        string json = File.ReadAllText(store.UserSettingsPath);
        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal(12, doc.RootElement.GetProperty("catCount").GetInt32());
        Assert.Equal(0, doc.RootElement.GetProperty("fpsCap").GetInt32());
        Assert.True(doc.RootElement.GetProperty("launchAtStartup").GetBoolean());
        Assert.Equal("auto", doc.RootElement.GetProperty("lightingMode").GetString());
        Assert.Equal("tatami", doc.RootElement.GetProperty("sceneTheme").GetString());
        Assert.Equal("siamese", doc.RootElement.GetProperty("breedMode").GetString());
        Assert.False(doc.RootElement.GetProperty("showSceneProps").GetBoolean());

        NekoSettings invalidThemes = store.Save(new NekoSettings { LightingMode = "invalid", SceneTheme = "unknown", BreedMode = "dragon" });
        Assert.Equal("golden", invalidThemes.LightingMode);
        Assert.Equal("study", invalidThemes.SceneTheme);
        Assert.Equal("mix", invalidThemes.BreedMode);

        store.Save(new NekoSettings { LaunchAtStartup = false });
        Assert.False(_fakeRegistry.Enabled);
    }

    [Theory]
    [InlineData("mix", "mix")]
    [InlineData("ALL", "mix")]
    [InlineData("persian", "persian")]
    [InlineData("siamese", "siamese")]
    [InlineData("british_shorthair", "british_shorthair")]
    [InlineData("British Shorthair", "british_shorthair")]
    [InlineData("munchkin", "munchkin")]
    [InlineData("sphynx", "sphynx")]
    [InlineData("domestic-shorthair", "domestic_shorthair")]
    [InlineData("blue-grey", "british_shorthair")]
    [InlineData("calico", "persian")]
    [InlineData("tuxedo", "munchkin")]
    [InlineData("black", "domestic_shorthair")]
    [InlineData("orange-tabby", "domestic_shorthair")]
    [InlineData(null, "mix")]
    [InlineData("", "mix")]
    [InlineData("unknown_breed", "mix")]
    public void NormalizeBreedMode_HandlesRealBreedsLegacyAliasesAndInvalidValues(string? input, string expected)
    {
        Assert.Equal(expected, NekoSettings.NormalizeBreedMode(input));
    }

    [Fact]
    public void NekoSettingsPatch_ApplyTo_MergesOnlySpecifiedFieldsAndNormalizes()
    {
        var baseline = new NekoSettings
        {
            CatCount = 6,
            SceneTheme = "study",
            LightingMode = "golden",
            BreedMode = "mix",
            ShowSceneProps = true,
            ShowToyDock = true
        };

        var patch = new NekoSettingsPatch
        {
            CatCount = 99,
            BreedMode = "calico",
            ShowSceneProps = false
        };

        NekoSettings merged = patch.ApplyTo(baseline);
        Assert.Equal(12, merged.CatCount);
        Assert.Equal("study", merged.SceneTheme);
        Assert.Equal("golden", merged.LightingMode);
        Assert.Equal("persian", merged.BreedMode);
        Assert.False(merged.ShowSceneProps);
        Assert.True(merged.ShowToyDock);
    }

    [Theory]
    [InlineData("study", "study")]
    [InlineData("  TATAMI ", "tatami")]
    [InlineData("Garden", "garden")]
    [InlineData("cafe", "cafe")]
    [InlineData(null, "study")]
    [InlineData("", "study")]
    [InlineData("forest", "study")]
    public void NormalizeSceneTheme_HandlesValidAndInvalidValues(string? input, string expected)
    {
        Assert.Equal(expected, NekoSettings.NormalizeSceneTheme(input));
        Assert.Equal("study", new NekoSettings().SceneTheme);
    }

    [Fact]
    public void HasExplicitUserSetting_DetectsWhetherUserSettingsOverridesKey()
    {
        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);
        Assert.False(store.HasExplicitUserSetting("showToyDock"));

        File.WriteAllText(store.UserSettingsPath, """{"catCount": 4}""");
        Assert.False(store.HasExplicitUserSetting("showToyDock"));
        Assert.True(store.HasExplicitUserSetting("catCount"));

        store.Save(new NekoSettings { ShowToyDock = true });
        Assert.True(store.HasExplicitUserSetting("showToyDock"));
    }

    [Fact]
    public void Save_WithOmittedProperties_PreservesModeDefaultDetectionForShowToyDock()
    {
        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);
        var omitSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "showToyDock", "showHud" };

        store.Save(
            new NekoSettings { CatCount = 9, SceneTheme = "tatami", ShowToyDock = false, ShowHud = false },
            applyStartupRegistry: false,
            omitPropertyNames: omitSet);

        Assert.False(store.HasExplicitUserSetting("showToyDock"));
        Assert.False(store.HasExplicitUserSetting("showHud"));
        Assert.True(store.HasExplicitUserSetting("catCount"));
        Assert.True(store.HasExplicitUserSetting("sceneTheme"));

        // Once explicitly toggled (not omitted), HasExplicitUserSetting becomes true
        store.Save(
            new NekoSettings { CatCount = 9, SceneTheme = "tatami", ShowToyDock = true, ShowHud = false },
            applyStartupRegistry: false,
            omitPropertyNames: new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "showHud" });

        Assert.True(store.HasExplicitUserSetting("showToyDock"));
        Assert.False(store.HasExplicitUserSetting("showHud"));
    }

    [Fact]
    public void TrayFlyoutForm_ComputeAnchorLocation_ClampsInsideWorkingArea()
    {
        var workingArea = new Rectangle(0, 0, 1920, 1032);
        var screenBounds = new Rectangle(0, 0, 1920, 1080);
        var flyoutSize = new Size(344, 412);

        Point bottomRight = TrayFlyoutForm.ComputeAnchorLocation(
            workingArea,
            screenBounds,
            cursor: new Point(1915, 1075),
            flyoutSize);
        Assert.True(bottomRight.X >= workingArea.Left);
        Assert.True(bottomRight.Y >= workingArea.Top);
        Assert.True(bottomRight.X + flyoutSize.Width <= workingArea.Right);
        Assert.True(bottomRight.Y + flyoutSize.Height <= workingArea.Bottom);

        var leftMonitorWork = new Rectangle(-1920, 0, 1920, 1040);
        var leftMonitorBounds = new Rectangle(-1920, 0, 1920, 1080);
        Point leftMonitorAnchor = TrayFlyoutForm.ComputeAnchorLocation(
            leftMonitorWork,
            leftMonitorBounds,
            cursor: new Point(-1918, 1060),
            flyoutSize);
        Assert.True(leftMonitorAnchor.X >= leftMonitorWork.Left);
        Assert.True(leftMonitorAnchor.X + flyoutSize.Width <= leftMonitorWork.Right);
        Assert.True(leftMonitorAnchor.Y + flyoutSize.Height <= leftMonitorWork.Bottom);
    }

    [Fact]
    public void Load_CorruptedUserSettings_FallsBackToDefaults()
    {
        File.WriteAllText(Path.Combine(_configDir, "user-settings.json"), "{ invalid json !!!");
        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);

        Assert.Equal(6, store.Current.CatCount);
        Assert.Equal(60, store.Current.FpsCap);
    }

    [Fact]
    public void ParseArgs_ExtractsWindowedDevUrlAndMonitor()
    {
        HostLaunchOptions opts = Program.ParseArgs(["--windowed", "--dev-url", "http://localhost:5173", "--monitor", "1"]);
        Assert.True(opts.Windowed);
        Assert.Equal("http://localhost:5173", opts.DevUrl);
        Assert.Equal(1, opts.MonitorIndex);

        HostLaunchOptions eqOpts = Program.ParseArgs(["--dev-url=http://127.0.0.1:4173"]);
        Assert.False(eqOpts.Windowed);
        Assert.Equal("http://127.0.0.1:4173", eqOpts.DevUrl);
        Assert.Equal(-1, eqOpts.MonitorIndex);
    }

    [Fact]
    public void SettingsDialog_And_TrayFlyoutForm_RoundTripAll13SettingsCleanly()
    {
        var initial = new NekoSettings
        {
            CatCount = 8,
            FpsCap = 30,
            ShowHud = false,
            ShowToyDock = false,
            DebugMode = true,
            EnableLaserHotkey = false,
            EnableShellReactions = false,
            LaunchAtStartup = true,
            IdleNapMinutes = 15,
            LightingMode = "night",
            SceneTheme = "cafe",
            BreedMode = "persian",
            ShowSceneProps = false
        };

        using var dialog = new SettingsDialog(initial);
        NekoSettings readBack = dialog.ReadFormSettings();
        Assert.Equal(8, readBack.CatCount);
        Assert.Equal(30, readBack.FpsCap);
        Assert.False(readBack.ShowHud);
        Assert.False(readBack.ShowToyDock);
        Assert.True(readBack.DebugMode);
        Assert.False(readBack.EnableLaserHotkey);
        Assert.False(readBack.EnableShellReactions);
        Assert.True(readBack.LaunchAtStartup);
        Assert.Equal(15, readBack.IdleNapMinutes);
        Assert.Equal("night", readBack.LightingMode);
        Assert.Equal("cafe", readBack.SceneTheme);
        Assert.Equal("persian", readBack.BreedMode);
        Assert.False(readBack.ShowSceneProps);

        var updated = new NekoSettings
        {
            CatCount = 4,
            FpsCap = 0,
            ShowToyDock = true,
            SceneTheme = "garden",
            LightingMode = "day",
            BreedMode = "sphynx",
            ShowSceneProps = true
        };
        dialog.SyncFromSettings(updated);
        NekoSettings synced = dialog.ReadFormSettings();
        Assert.Equal(4, synced.CatCount);
        Assert.Equal(0, synced.FpsCap);
        Assert.True(synced.ShowToyDock);
        Assert.Equal("garden", synced.SceneTheme);
        Assert.Equal("day", synced.LightingMode);
        Assert.Equal("sphynx", synced.BreedMode);
        Assert.True(synced.ShowSceneProps);

        using var flyout = new TrayFlyoutForm(new TrayFlyoutState(updated, LaserActive: true, Paused: false, ActiveCats: 4, Pounces: 7, IsWindowedMode: true));
        flyout.UpdateState(new TrayFlyoutState(initial, LaserActive: false, Paused: true, ActiveCats: 8, Pounces: 12, IsWindowedMode: false));
        Assert.Equal(new Size(364, 498), flyout.ClientSize);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempRoot))
        {
            Directory.Delete(_tempRoot, recursive: true);
        }
    }

    private sealed class FakeStartupRegistrar : IStartupRegistrar
    {
        public bool Enabled { get; private set; }
        public string? ExecutablePath { get; private set; }

        public void ApplyStartupSetting(bool enabled, string executablePath)
        {
            Enabled = enabled;
            ExecutablePath = executablePath;
        }

        public bool IsStartupEnabled() => Enabled;
    }
}
