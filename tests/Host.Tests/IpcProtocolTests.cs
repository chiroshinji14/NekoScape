using System.Text.Json;
using NekoScape.Host.Bridge;
using NekoScape.Host.Settings;
using Xunit;

namespace NekoScape.Host.Tests;

public sealed class IpcProtocolTests
{
    [Fact]
    public void IconUpdate_Serializes_WithExactCamelCaseSchema()
    {
        var message = new IconUpdateMessage(
            Timestamp: 1774026643000L,
            DpiScale: 1.5,
            Icons:
            [
                new DesktopIconRect(0, 32, 48, 75, 75, "Recycle Bin", IsRecycleBin: true),
                new DesktopIconRect(1, 32, 140, 75, 75, "Projects", IsRecycleBin: false)
            ]);

        string json = IpcChannel.SerializeHostMessage(message);
        using JsonDocument doc = JsonDocument.Parse(json);
        JsonElement root = doc.RootElement;

        Assert.Equal("ICON_UPDATE", root.GetProperty("type").GetString());
        Assert.Equal(1774026643000L, root.GetProperty("timestamp").GetInt64());
        Assert.Equal(1.5, root.GetProperty("dpiScale").GetDouble());

        JsonElement icons = root.GetProperty("icons");
        Assert.Equal(2, icons.GetArrayLength());
        Assert.True(icons[0].GetProperty("isRecycleBin").GetBoolean());
        Assert.Equal("Recycle Bin", icons[0].GetProperty("label").GetString());
        Assert.False(icons[1].GetProperty("isRecycleBin").GetBoolean());

        var roundTrip = Assert.IsType<IconUpdateMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal(2, roundTrip.Icons.Count);
        Assert.Equal(1.5, roundTrip.DpiScale);
    }

    [Fact]
    public void MouseRaw_Serializes_AndRoundTrips()
    {
        var message = new MouseRawMessage(
            X: 960.5,
            Y: 540.25,
            Buttons: new MouseButtonsDto(Left: true, Right: false, Middle: true),
            LaserMode: true,
            SplitPrism: false);

        string json = IpcChannel.SerializeHostMessage(message);
        using JsonDocument doc = JsonDocument.Parse(json);
        JsonElement root = doc.RootElement;

        Assert.Equal("MOUSE_RAW", root.GetProperty("type").GetString());
        Assert.Equal(960.5, root.GetProperty("x").GetDouble());
        Assert.Equal(540.25, root.GetProperty("y").GetDouble());
        Assert.True(root.GetProperty("buttons").GetProperty("left").GetBoolean());
        Assert.False(root.GetProperty("buttons").GetProperty("right").GetBoolean());
        Assert.True(root.GetProperty("buttons").GetProperty("middle").GetBoolean());
        Assert.True(root.GetProperty("laserMode").GetBoolean());
        Assert.False(root.GetProperty("splitPrism").GetBoolean());

        var roundTrip = Assert.IsType<MouseRawMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal(message, roundTrip);
    }

    [Fact]
    public void NewFileEvent_OmitsNullIcon_AndIncludesWhenPresent()
    {
        var withoutIcon = new NewFileEventMessage("Screenshot.png");
        string jsonWithout = IpcChannel.SerializeHostMessage(withoutIcon);
        using (JsonDocument doc = JsonDocument.Parse(jsonWithout))
        {
            Assert.Equal("NEW_FILE_EVENT", doc.RootElement.GetProperty("type").GetString());
            Assert.Equal("Screenshot.png", doc.RootElement.GetProperty("fileName").GetString());
            Assert.False(doc.RootElement.TryGetProperty("icon", out _));
        }

        var icon = new DesktopIconRect(4, 120, 220, 76, 84, "Screenshot.png");
        var withIcon = new NewFileEventMessage("Screenshot.png", icon);
        string jsonWith = IpcChannel.SerializeHostMessage(withIcon);
        var roundTrip = Assert.IsType<NewFileEventMessage>(IpcChannel.DeserializeHostMessage(jsonWith));
        Assert.NotNull(roundTrip.Icon);
        Assert.Equal("Screenshot.png", roundTrip.Icon!.Label);
    }

    [Fact]
    public void RecycleBinEvent_PowerState_TypingActivity_Settings_AndSpawnAction_RoundTrip()
    {
        var binMsg = new RecycleBinEventMessage(0, Emptied: true, new RectDto(20, 20, 74, 80));
        var binRoundTrip = Assert.IsType<RecycleBinEventMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(binMsg)));
        Assert.True(binRoundTrip.Emptied);
        Assert.Equal(74, binRoundTrip.BinRect!.Width);

        var typingMsg = new TypingActivityMessage(142.5, 0.2);
        var typingRoundTrip = Assert.IsType<TypingActivityMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(typingMsg)));
        Assert.Equal(142.5, typingRoundTrip.KeysPerMinute);

        var settingsMsg = new SettingsUpdateMessage(new NekoSettings
        {
            CatCount = 8,
            DebugMode = true,
            LightingMode = "night",
            SceneTheme = "cafe"
        });
        string settingsJson = IpcChannel.SerializeHostMessage(settingsMsg);
        using (JsonDocument settingsDoc = JsonDocument.Parse(settingsJson))
        {
            JsonElement settingsElem = settingsDoc.RootElement.GetProperty("settings");
            Assert.Equal("night", settingsElem.GetProperty("lightingMode").GetString());
            Assert.Equal("cafe", settingsElem.GetProperty("sceneTheme").GetString());
        }
        var settingsRoundTrip = Assert.IsType<SettingsUpdateMessage>(
            IpcChannel.DeserializeHostMessage(settingsJson));
        Assert.Equal(8, settingsRoundTrip.Settings.CatCount);
        Assert.True(settingsRoundTrip.Settings.DebugMode);
        Assert.Equal("night", settingsRoundTrip.Settings.LightingMode);
        Assert.Equal("cafe", settingsRoundTrip.Settings.SceneTheme);

        var powerMsg = new PowerStateMessage(true, PowerReasons.Occluded);
        var powerRoundTrip = Assert.IsType<PowerStateMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(powerMsg)));
        Assert.True(powerRoundTrip.Paused);
        Assert.Equal("occluded", powerRoundTrip.Reason);

        var spawnMsg = new SpawnActionMessage(SpawnActions.ToggleBox);
        var spawnRoundTrip = Assert.IsType<SpawnActionMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(spawnMsg)));
        Assert.Equal("toggleBox", spawnRoundTrip.Action);
    }

    [Fact]
    public void RendererToHostMessages_DeserializeCorrectly_RegardlessOfFieldOrder()
    {
        string readyJson = """{"rendererVersion":"1.2.0","type":"READY"}""";
        var ready = Assert.IsType<ReadyMessage>(IpcChannel.DeserializeRendererMessage(readyJson));
        Assert.Equal("1.2.0", ready.RendererVersion);

        string statsJson = """{"type":"STATS_UPDATE","pounces":14,"bonks":3,"activeCats":5,"nappingCats":1,"paused":false}""";
        var stats = Assert.IsType<StatsUpdateMessage>(IpcChannel.DeserializeRendererMessage(statsJson));
        Assert.Equal(14, stats.Pounces);
        Assert.Equal(3, stats.Bonks);
        Assert.Equal(5, stats.ActiveCats);
        Assert.Equal(1, stats.NappingCats);
        Assert.False(stats.Paused);

        string rescanJson = """{"type":"REQUEST_ICON_RESCAN"}""";
        Assert.IsType<RequestIconRescanMessage>(IpcChannel.DeserializeRendererMessage(rescanJson));

        string unknownJson = """{"type":"FUTURE_MESSAGE"}""";
        Assert.Null(IpcChannel.DeserializeRendererMessage(unknownJson));
    }

    [Theory]
    [InlineData("study")]
    [InlineData("tatami")]
    [InlineData("garden")]
    [InlineData("cafe")]
    public void SettingsUpdate_SceneTheme_SerializesCamelCaseAndRoundTrips(string sceneTheme)
    {
        var defaultMsg = new SettingsUpdateMessage(new NekoSettings());
        string defaultJson = IpcChannel.SerializeHostMessage(defaultMsg);
        using (JsonDocument defaultDoc = JsonDocument.Parse(defaultJson))
        {
            Assert.Equal("study", defaultDoc.RootElement.GetProperty("settings").GetProperty("sceneTheme").GetString());
        }

        var msg = new SettingsUpdateMessage(new NekoSettings { SceneTheme = sceneTheme });
        string json = IpcChannel.SerializeHostMessage(msg);
        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal(sceneTheme, doc.RootElement.GetProperty("settings").GetProperty("sceneTheme").GetString());

        var roundTrip = Assert.IsType<SettingsUpdateMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal(sceneTheme, roundTrip.Settings.SceneTheme);
    }

    [Fact]
    public void PointerClick_SerializesCamelCase_OmitsNullDoubleClick_AndRoundTrips()
    {
        var singleClick = new PointerClickMessage(412.5, 298.25, PointerButtons.Left);
        string singleJson = IpcChannel.SerializeHostMessage(singleClick);
        using (JsonDocument doc = JsonDocument.Parse(singleJson))
        {
            JsonElement root = doc.RootElement;
            Assert.Equal("POINTER_CLICK", root.GetProperty("type").GetString());
            Assert.Equal(412.5, root.GetProperty("x").GetDouble());
            Assert.Equal(298.25, root.GetProperty("y").GetDouble());
            Assert.Equal("left", root.GetProperty("button").GetString());
            Assert.False(root.TryGetProperty("doubleClick", out _));
        }

        var singleRoundTrip = Assert.IsType<PointerClickMessage>(IpcChannel.DeserializeHostMessage(singleJson));
        Assert.Equal(singleClick, singleRoundTrip);

        var doubleClick = new PointerClickMessage(520.0, 310.0, PointerButtons.Left, DoubleClick: true);
        string doubleJson = IpcChannel.SerializeHostMessage(doubleClick);
        using (JsonDocument doc = JsonDocument.Parse(doubleJson))
        {
            Assert.True(doc.RootElement.GetProperty("doubleClick").GetBoolean());
        }

        var doubleRoundTrip = Assert.IsType<PointerClickMessage>(IpcChannel.DeserializeHostMessage(doubleJson));
        Assert.True(doubleRoundTrip.DoubleClick);
    }

    [Fact]
    public void SpawnActions_DropTreatAndToggleProps_SerializeAndRoundTrip()
    {
        var treatMsg = new SpawnActionMessage(SpawnActions.DropTreat);
        var treatRoundTrip = Assert.IsType<SpawnActionMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(treatMsg)));
        Assert.Equal("dropTreat", treatRoundTrip.Action);

        var propsMsg = new SpawnActionMessage(SpawnActions.ToggleProps);
        var propsRoundTrip = Assert.IsType<SpawnActionMessage>(
            IpcChannel.DeserializeHostMessage(IpcChannel.SerializeHostMessage(propsMsg)));
        Assert.Equal("toggleProps", propsRoundTrip.Action);
    }

    [Fact]
    public void SettingsChanged_RendererToHostMessage_DeserializesPartialPatch()
    {
        string json = """{"type":"SETTINGS_CHANGED","settings":{"sceneTheme":"garden","breedMode":"sphynx","showSceneProps":false,"catCount":4}}""";
        var msg = Assert.IsType<SettingsChangedMessage>(IpcChannel.DeserializeRendererMessage(json));
        Assert.NotNull(msg.Settings);
        Assert.Equal("garden", msg.Settings.SceneTheme);
        Assert.Equal("sphynx", msg.Settings.BreedMode);
        Assert.False(msg.Settings.ShowSceneProps);
        Assert.Equal(4, msg.Settings.CatCount);
        Assert.Null(msg.Settings.FpsCap);

        NekoSettings applied = msg.Settings.ApplyTo(new NekoSettings());
        Assert.Equal("garden", applied.SceneTheme);
        Assert.Equal("sphynx", applied.BreedMode);
        Assert.False(applied.ShowSceneProps);
        Assert.Equal(4, applied.CatCount);
        Assert.Equal(60, applied.FpsCap);
    }

    [Fact]
    public void SettingsUpdate_IncludesBreedModeShowScenePropsAndShowHud()
    {
        var msg = new SettingsUpdateMessage(new NekoSettings
        {
            BreedMode = "munchkin",
            ShowSceneProps = false,
            ShowHud = false,
        });
        string json = IpcChannel.SerializeHostMessage(msg);
        using JsonDocument doc = JsonDocument.Parse(json);
        JsonElement s = doc.RootElement.GetProperty("settings");
        Assert.Equal("munchkin", s.GetProperty("breedMode").GetString());
        Assert.False(s.GetProperty("showSceneProps").GetBoolean());
        Assert.False(s.GetProperty("showHud").GetBoolean());

        var roundTrip = Assert.IsType<SettingsUpdateMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal("munchkin", roundTrip.Settings.BreedMode);
        Assert.False(roundTrip.Settings.ShowSceneProps);
        Assert.False(roundTrip.Settings.ShowHud);
    }
}
