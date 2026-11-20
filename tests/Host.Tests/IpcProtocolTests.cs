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
    [InlineData("living_room")]
    [InlineData("rainy_window")]
    [InlineData("night_balcony")]
    [InlineData("kitchen")]
    [InlineData("bedroom")]
    [InlineData("snowy_window")]
    [InlineData("sunbeam")]
    [InlineData("aquarium")]
    [InlineData("rooftop")]
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
    public void SettingsChanged_RendererToHostMessage_DeserializesPartialPatch_AndExplicitNullCollar()
    {
        string json = """{"type":"SETTINGS_CHANGED","settings":{"sceneTheme":"garden","breedMode":"sphynx","showSceneProps":false,"catCount":45,"kittenMode":true,"collarColor":null,"soundEnabled":true,"soundVolume":0.65}}""";
        var msg = Assert.IsType<SettingsChangedMessage>(IpcChannel.DeserializeRendererMessage(json));
        Assert.NotNull(msg.Settings);
        Assert.Equal("garden", msg.Settings.SceneTheme);
        Assert.Equal("sphynx", msg.Settings.BreedMode);
        Assert.False(msg.Settings.ShowSceneProps);
        Assert.Equal(45, msg.Settings.CatCount);
        Assert.True(msg.Settings.KittenMode);
        Assert.True(msg.Settings.ClearCollarColor);
        Assert.True(msg.Settings.SoundEnabled);
        Assert.Equal(0.65, msg.Settings.SoundVolume);
        Assert.Null(msg.Settings.FpsCap);

        NekoSettings baseline = new() { CollarColor = "#d94f5c" };
        NekoSettings applied = msg.Settings.ApplyTo(baseline);
        Assert.Equal("garden", applied.SceneTheme);
        Assert.Equal("sphynx", applied.BreedMode);
        Assert.False(applied.ShowSceneProps);
        Assert.Equal(45, applied.CatCount);
        Assert.Equal(60, applied.FpsCap);
        Assert.True(applied.KittenMode);
        Assert.Null(applied.CollarColor);
        Assert.True(applied.SoundEnabled);
        Assert.Equal(0.65, applied.SoundVolume);

        // When collarColor is omitted from patch, existing collarColor is preserved
        string preserveJson = """{"type":"SETTINGS_CHANGED","settings":{"catCount":25}}""";
        var preserveMsg = Assert.IsType<SettingsChangedMessage>(IpcChannel.DeserializeRendererMessage(preserveJson));
        Assert.False(preserveMsg.Settings.ClearCollarColor);
        Assert.Equal("#d94f5c", preserveMsg.Settings.ApplyTo(baseline).CollarColor);
    }

    [Fact]
    public void SettingsUpdate_IncludesV2FieldsAndUncappedCatCount()
    {
        var msg = new SettingsUpdateMessage(new NekoSettings
        {
            CatCount = 42,
            BreedMode = "munchkin",
            ShowSceneProps = false,
            ShowHud = false,
            KittenMode = true,
            CollarColor = "#e2a93b",
            CollarBell = false,
            SoundEnabled = true,
            SoundVolume = 0.75,
        });
        string json = IpcChannel.SerializeHostMessage(msg);
        using JsonDocument doc = JsonDocument.Parse(json);
        JsonElement s = doc.RootElement.GetProperty("settings");
        Assert.Equal(42, s.GetProperty("catCount").GetInt32());
        Assert.Equal("munchkin", s.GetProperty("breedMode").GetString());
        Assert.False(s.GetProperty("showSceneProps").GetBoolean());
        Assert.False(s.GetProperty("showHud").GetBoolean());
        Assert.True(s.GetProperty("kittenMode").GetBoolean());
        Assert.Equal("#e2a93b", s.GetProperty("collarColor").GetString());
        Assert.False(s.GetProperty("collarBell").GetBoolean());
        Assert.True(s.GetProperty("soundEnabled").GetBoolean());
        Assert.Equal(0.75, s.GetProperty("soundVolume").GetDouble());

        var roundTrip = Assert.IsType<SettingsUpdateMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal(42, roundTrip.Settings.CatCount);
        Assert.Equal("munchkin", roundTrip.Settings.BreedMode);
        Assert.False(roundTrip.Settings.ShowSceneProps);
        Assert.False(roundTrip.Settings.ShowHud);
        Assert.True(roundTrip.Settings.KittenMode);
        Assert.Equal("#e2a93b", roundTrip.Settings.CollarColor);
        Assert.False(roundTrip.Settings.CollarBell);
        Assert.True(roundTrip.Settings.SoundEnabled);
        Assert.Equal(0.75, roundTrip.Settings.SoundVolume);
    }

    [Theory]
    [InlineData(SpawnActions.DropMouse, "dropMouse")]
    [InlineData(SpawnActions.DropFish, "dropFish")]
    [InlineData(SpawnActions.DropFeather, "dropFeather")]
    [InlineData(SpawnActions.DropCrinkle, "dropCrinkle")]
    [InlineData(SpawnActions.DropSpring, "dropSpring")]
    [InlineData(SpawnActions.DropPingPong, "dropPingPong")]
    [InlineData(SpawnActions.DropHairTie, "dropHairTie")]
    [InlineData(SpawnActions.DropBubbles, "dropBubbles")]
    [InlineData(SpawnActions.DropCucumber, "dropCucumber")]
    [InlineData(SpawnActions.TogglePaperBag, "togglePaperBag")]
    [InlineData(SpawnActions.ToggleTapedSquare, "toggleTapedSquare")]
    [InlineData(SpawnActions.ClearToys, "clearToys")]
    [InlineData(SpawnActions.PhotoSnapshot, "photoSnapshot")]
    public void SpawnActions_V2ToysAndPhoto_SerializeAndRoundTrip(string actionConst, string expectedValue)
    {
        Assert.Equal(expectedValue, actionConst);
        var msg = new SpawnActionMessage(actionConst);
        string json = IpcChannel.SerializeHostMessage(msg);
        using JsonDocument doc = JsonDocument.Parse(json);
        Assert.Equal("SPAWN_ACTION", doc.RootElement.GetProperty("type").GetString());
        Assert.Equal(expectedValue, doc.RootElement.GetProperty("action").GetString());

        var roundTrip = Assert.IsType<SpawnActionMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.Equal(expectedValue, roundTrip.Action);
    }

    [Fact]
    public void WindowLedgesUpdate_SerializesCamelCaseAndRoundTrips()
    {
        var msg = new WindowLedgesMessage(
            TaskbarRect: new DesktopIconRect(-1, 0, 1032, 1920, 48, "Taskbar"),
            WindowTopLedges:
            [
                new DesktopIconRect(1, 120, 80, 960, 12, "Visual Studio Code"),
                new DesktopIconRect(2, 1100, 140, 720, 12, "Windows Terminal"),
            ]);

        string json = IpcChannel.SerializeHostMessage(msg);
        using (JsonDocument doc = JsonDocument.Parse(json))
        {
            JsonElement root = doc.RootElement;
            Assert.Equal("WINDOW_LEDGES_UPDATE", root.GetProperty("type").GetString());
            Assert.Equal(1032, root.GetProperty("taskbarRect").GetProperty("y").GetDouble());
            Assert.Equal("Taskbar", root.GetProperty("taskbarRect").GetProperty("label").GetString());
            Assert.Equal(2, root.GetProperty("windowTopLedges").GetArrayLength());
            Assert.Equal("Visual Studio Code", root.GetProperty("windowTopLedges")[0].GetProperty("label").GetString());
        }

        var roundTrip = Assert.IsType<WindowLedgesMessage>(IpcChannel.DeserializeHostMessage(json));
        Assert.NotNull(roundTrip.TaskbarRect);
        Assert.Equal(48, roundTrip.TaskbarRect!.Height);
        Assert.Equal(2, roundTrip.WindowTopLedges.Count);
        Assert.Equal("Windows Terminal", roundTrip.WindowTopLedges[1].Label);

        var hiddenTaskbar = new WindowLedgesMessage(null, Array.Empty<DesktopIconRect>());
        string hiddenJson = IpcChannel.SerializeHostMessage(hiddenTaskbar);
        using (JsonDocument hiddenDoc = JsonDocument.Parse(hiddenJson))
        {
            Assert.Equal(JsonValueKind.Null, hiddenDoc.RootElement.GetProperty("taskbarRect").ValueKind);
            Assert.Equal(0, hiddenDoc.RootElement.GetProperty("windowTopLedges").GetArrayLength());
        }
    }

    [Fact]
    public void AudioActivity_SerializesAndOmitsNullSourceX()
    {
        var withoutX = new AudioActivityMessage(0.62);
        string jsonWithout = IpcChannel.SerializeHostMessage(withoutX);
        using (JsonDocument doc = JsonDocument.Parse(jsonWithout))
        {
            Assert.Equal("AUDIO_ACTIVITY", doc.RootElement.GetProperty("type").GetString());
            Assert.Equal(0.62, doc.RootElement.GetProperty("level").GetDouble(), precision: 2);
            Assert.False(doc.RootElement.TryGetProperty("sourceX", out _));
        }

        var withX = new AudioActivityMessage(0.85, SourceX: 640.5);
        string jsonWith = IpcChannel.SerializeHostMessage(withX);
        var roundTrip = Assert.IsType<AudioActivityMessage>(IpcChannel.DeserializeHostMessage(jsonWith));
        Assert.Equal(0.85, roundTrip.Level, precision: 2);
        Assert.Equal(640.5, roundTrip.SourceX);
    }
}
