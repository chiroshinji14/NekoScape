using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Web.WebView2.Core;
using NekoScape.Host.Settings;

namespace NekoScape.Host.Bridge;

public sealed record DesktopIconRect(
    int Id,
    double X,
    double Y,
    double Width,
    double Height,
    string Label,
    bool IsRecycleBin = false);

public sealed record RectDto(
    double X,
    double Y,
    double Width,
    double Height);

public sealed record MouseButtonsDto(
    bool Left,
    bool Right,
    bool Middle);

public abstract record HostToRendererMessage([property: JsonPropertyOrder(-1)] string Type);

public sealed record IconUpdateMessage(
    long Timestamp,
    double DpiScale,
    IReadOnlyList<DesktopIconRect> Icons) : HostToRendererMessage("ICON_UPDATE");

public sealed record MouseRawMessage(
    double X,
    double Y,
    MouseButtonsDto Buttons,
    bool LaserMode,
    bool SplitPrism) : HostToRendererMessage("MOUSE_RAW");

public sealed record NewFileEventMessage(
    string FileName,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DesktopIconRect? Icon = null)
    : HostToRendererMessage("NEW_FILE_EVENT");

public sealed record RecycleBinEventMessage(
    int ItemCount,
    bool Emptied,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] RectDto? BinRect = null)
    : HostToRendererMessage("RECYCLE_BIN_EVENT");

public sealed record TypingActivityMessage(
    double KeysPerMinute,
    double IdleSeconds) : HostToRendererMessage("TYPING_ACTIVITY");

public sealed record SettingsUpdateMessage(
    NekoSettings Settings) : HostToRendererMessage("SETTINGS_UPDATE");

public sealed record PowerStateMessage(
    bool Paused,
    string Reason) : HostToRendererMessage("POWER_STATE");

public sealed record SpawnActionMessage(
    string Action) : HostToRendererMessage("SPAWN_ACTION");

public abstract record RendererToHostMessage([property: JsonPropertyOrder(-1)] string Type);

public sealed record ReadyMessage(
    string RendererVersion) : RendererToHostMessage("READY");

public sealed record StatsUpdateMessage(
    int Pounces,
    int Bonks,
    int ActiveCats,
    int NappingCats,
    bool Paused) : RendererToHostMessage("STATS_UPDATE");

public sealed record RequestIconRescanMessage() : RendererToHostMessage("REQUEST_ICON_RESCAN");

public static class PowerReasons
{
    public const string Occluded = "occluded";
    public const string User = "user";
    public const string Active = "active";
}

public static class SpawnActions
{
    public const string ResetYarn = "resetYarn";
    public const string ToggleLaser = "toggleLaser";
    public const string RescanIcons = "rescanIcons";
    public const string ToggleBox = "toggleBox";
}

public sealed class IpcChannel
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private CoreWebView2? _webView;
    private Control? _uiControl;

    public event Action<ReadyMessage>? ReadyReceived;
    public event Action<StatsUpdateMessage>? StatsUpdated;
    public event Action<RequestIconRescanMessage>? IconRescanRequested;
    public event Action<RendererToHostMessage>? MessageReceived;

    public void Attach(CoreWebView2 webView, Control uiControl)
    {
        if (_webView is not null)
        {
            _webView.WebMessageReceived -= OnWebMessageReceived;
        }

        _webView = webView;
        _uiControl = uiControl;
        _webView.WebMessageReceived += OnWebMessageReceived;
    }

    public void Detach()
    {
        if (_webView is not null)
        {
            _webView.WebMessageReceived -= OnWebMessageReceived;
            _webView = null;
        }
        _uiControl = null;
    }

    public void Send(HostToRendererMessage message)
    {
        CoreWebView2? webView = _webView;
        Control? control = _uiControl;
        if (webView is null || control is null || control.IsDisposed || !control.IsHandleCreated)
        {
            return;
        }

        string json = SerializeHostMessage(message);
        if (control.InvokeRequired)
        {
            try
            {
                control.BeginInvoke(() =>
                {
                    if (_webView is not null && !control.IsDisposed)
                    {
                        _webView.PostWebMessageAsJson(json);
                    }
                });
            }
            catch (ObjectDisposedException)
            {
            }
            catch (InvalidOperationException)
            {
            }
        }
        else
        {
            webView.PostWebMessageAsJson(json);
        }
    }

    public static string SerializeHostMessage(HostToRendererMessage message)
        => JsonSerializer.Serialize(message, message.GetType(), JsonOptions);

    public static string SerializeRendererMessage(RendererToHostMessage message)
        => JsonSerializer.Serialize(message, message.GetType(), JsonOptions);

    public static HostToRendererMessage? DeserializeHostMessage(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        using JsonDocument doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("type", out JsonElement typeElement))
        {
            return null;
        }

        string? type = typeElement.GetString();
        return type switch
        {
            "ICON_UPDATE" => doc.RootElement.Deserialize<IconUpdateMessage>(JsonOptions),
            "MOUSE_RAW" => doc.RootElement.Deserialize<MouseRawMessage>(JsonOptions),
            "NEW_FILE_EVENT" => doc.RootElement.Deserialize<NewFileEventMessage>(JsonOptions),
            "RECYCLE_BIN_EVENT" => doc.RootElement.Deserialize<RecycleBinEventMessage>(JsonOptions),
            "TYPING_ACTIVITY" => doc.RootElement.Deserialize<TypingActivityMessage>(JsonOptions),
            "SETTINGS_UPDATE" => doc.RootElement.Deserialize<SettingsUpdateMessage>(JsonOptions),
            "POWER_STATE" => doc.RootElement.Deserialize<PowerStateMessage>(JsonOptions),
            "SPAWN_ACTION" => doc.RootElement.Deserialize<SpawnActionMessage>(JsonOptions),
            _ => null
        };
    }

    public static RendererToHostMessage? DeserializeRendererMessage(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        using JsonDocument doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("type", out JsonElement typeElement))
        {
            return null;
        }

        string? type = typeElement.GetString();
        return type switch
        {
            "READY" => doc.RootElement.Deserialize<ReadyMessage>(JsonOptions),
            "STATS_UPDATE" => doc.RootElement.Deserialize<StatsUpdateMessage>(JsonOptions),
            "REQUEST_ICON_RESCAN" => doc.RootElement.Deserialize<RequestIconRescanMessage>(JsonOptions),
            _ => null
        };
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string json = e.WebMessageAsJson;
            RendererToHostMessage? message = DeserializeRendererMessage(json);
            if (message is null)
            {
                return;
            }

            MessageReceived?.Invoke(message);
            switch (message)
            {
                case ReadyMessage ready:
                    ReadyReceived?.Invoke(ready);
                    break;
                case StatsUpdateMessage stats:
                    StatsUpdated?.Invoke(stats);
                    break;
                case RequestIconRescanMessage rescan:
                    IconRescanRequested?.Invoke(rescan);
                    break;
            }
        }
        catch (JsonException)
        {
            // Ignore malformed messages from page script.
        }
    }
}
