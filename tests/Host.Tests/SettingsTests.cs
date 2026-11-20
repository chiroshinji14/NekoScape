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
              "showHud": true,
              "showToyDock": true,
              "debugMode": false,
              "enableLaserHotkey": true,
              "enableShellReactions": true,
              "launchAtStartup": false,
              "idleNapMinutes": 5,
              "lightingMode": "golden",
              "sceneTheme": "study"
            }
            """);

        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);
        NekoSettings settings = store.Current;

        Assert.Equal(6, settings.CatCount);
        Assert.Equal(60, settings.FpsCap);
        Assert.True(settings.ShowHud);
        Assert.True(settings.ShowToyDock);
        Assert.False(settings.DebugMode);
        Assert.True(settings.EnableLaserHotkey);
        Assert.True(settings.EnableShellReactions);
        Assert.False(settings.LaunchAtStartup);
        Assert.Equal(5, settings.IdleNapMinutes);
        Assert.Equal("golden", settings.LightingMode);
        Assert.Equal("study", settings.SceneTheme);
    }

    [Fact]
    public void Load_MergesPartialUserOverridesOntoDefaults()
    {
        File.WriteAllText(Path.Combine(_configDir, "default-settings.json"), """
            {
              "catCount": 6,
              "fpsCap": 60,
              "showHud": true,
              "showToyDock": true,
              "debugMode": false,
              "enableLaserHotkey": true,
              "enableShellReactions": true,
              "launchAtStartup": false,
              "idleNapMinutes": 5
            }
            """);
        File.WriteAllText(Path.Combine(_configDir, "user-settings.json"), """
            {
              "catCount": 10,
              "debugMode": true
            }
            """);

        var store = new AppSettingsStore(_configDir, _fakeRegistry, @"C:\Apps\NekoScape.exe", _fallbackDir);

        Assert.Equal(10, store.Current.CatCount);
        Assert.True(store.Current.DebugMode);
        Assert.Equal(60, store.Current.FpsCap);
        Assert.True(store.Current.ShowHud);
        Assert.Equal(5, store.Current.IdleNapMinutes);
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
            SceneTheme = "TATAMI"
        });

        Assert.Equal(12, saved.CatCount);
        Assert.Equal(0, saved.FpsCap);
        Assert.Equal(1, saved.IdleNapMinutes);
        Assert.Equal("auto", saved.LightingMode);
        Assert.Equal("tatami", saved.SceneTheme);
        Assert.True(_fakeRegistry.Enabled);
        Assert.Equal(@"C:\Apps\NekoScape.exe", _fakeRegistry.ExecutablePath);

        string json = File.ReadAllText(store.UserSettingsPath);
        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal(12, doc.RootElement.GetProperty("catCount").GetInt32());
        Assert.Equal(0, doc.RootElement.GetProperty("fpsCap").GetInt32());
        Assert.True(doc.RootElement.GetProperty("launchAtStartup").GetBoolean());
        Assert.Equal("auto", doc.RootElement.GetProperty("lightingMode").GetString());
        Assert.Equal("tatami", doc.RootElement.GetProperty("sceneTheme").GetString());

        NekoSettings invalidThemes = store.Save(new NekoSettings { LightingMode = "invalid", SceneTheme = "unknown" });
        Assert.Equal("golden", invalidThemes.LightingMode);
        Assert.Equal("study", invalidThemes.SceneTheme);

        store.Save(new NekoSettings { LaunchAtStartup = false });
        Assert.False(_fakeRegistry.Enabled);
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
