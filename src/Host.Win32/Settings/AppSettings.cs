using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.Win32;

namespace NekoScape.Host.Settings;

public sealed class NekoSettings
{
    public int CatCount { get; set; } = 6;
    public int FpsCap { get; set; } = 60;
    public bool ShowHud { get; set; } = true;
    public bool ShowToyDock { get; set; } = true;
    public bool DebugMode { get; set; } = false;
    public bool EnableLaserHotkey { get; set; } = true;
    public bool EnableShellReactions { get; set; } = true;
    public bool LaunchAtStartup { get; set; } = false;
    public int IdleNapMinutes { get; set; } = 5;
    public string LightingMode { get; set; } = "golden";
    public string SceneTheme { get; set; } = "study";

    public NekoSettings Clone() => new()
    {
        CatCount = CatCount,
        FpsCap = FpsCap,
        ShowHud = ShowHud,
        ShowToyDock = ShowToyDock,
        DebugMode = DebugMode,
        EnableLaserHotkey = EnableLaserHotkey,
        EnableShellReactions = EnableShellReactions,
        LaunchAtStartup = LaunchAtStartup,
        IdleNapMinutes = IdleNapMinutes,
        LightingMode = LightingMode,
        SceneTheme = SceneTheme
    };

    public NekoSettings Normalized()
    {
        var copy = Clone();
        copy.CatCount = Math.Clamp(copy.CatCount, 1, 12);
        copy.FpsCap = copy.FpsCap switch
        {
            <= 0 => 0,
            <= 30 => 30,
            <= 60 => 60,
            _ => copy.FpsCap
        };
        copy.IdleNapMinutes = Math.Clamp(copy.IdleNapMinutes, 1, 120);
        copy.LightingMode = NormalizeLightingMode(copy.LightingMode);
        copy.SceneTheme = NormalizeSceneTheme(copy.SceneTheme);
        return copy;
    }

    public static string NormalizeLightingMode(string? mode) => mode?.Trim().ToLowerInvariant() switch
    {
        "auto" => "auto",
        "day" => "day",
        "night" => "night",
        _ => "golden"
    };

    public static string NormalizeSceneTheme(string? theme) => theme?.Trim().ToLowerInvariant() switch
    {
        "tatami" => "tatami",
        "garden" => "garden",
        "cafe" => "cafe",
        _ => "study"
    };
}

public interface IStartupRegistrar
{
    void ApplyStartupSetting(bool enabled, string executablePath);
    bool IsStartupEnabled();
}

public sealed class WindowsStartupRegistrar : IStartupRegistrar
{
    private const string RunSubKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppValueName = "NekoScape";

    public void ApplyStartupSetting(bool enabled, string executablePath)
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunSubKey, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(RunSubKey, writable: true);
        if (key is null)
        {
            return;
        }

        if (enabled)
        {
            string quoted = executablePath.StartsWith('"') ? executablePath : $"\"{executablePath}\"";
            key.SetValue(AppValueName, quoted, RegistryValueKind.String);
        }
        else
        {
            key.DeleteValue(AppValueName, throwOnMissingValue: false);
        }
    }

    public bool IsStartupEnabled()
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunSubKey, writable: false);
        return key?.GetValue(AppValueName) is string value && !string.IsNullOrWhiteSpace(value);
    }
}

public sealed class AppSettingsStore
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    private readonly string _configDirectory;
    private readonly string _fallbackUserDirectory;
    private readonly IStartupRegistrar _startupRegistrar;
    private readonly string _executablePath;

    public string DefaultSettingsPath => Path.Combine(_configDirectory, "default-settings.json");
    public string UserSettingsPath => Path.Combine(_configDirectory, "user-settings.json");
    public string FallbackUserSettingsPath => Path.Combine(_fallbackUserDirectory, "user-settings.json");

    public NekoSettings Current { get; private set; }

    public AppSettingsStore(
        string? configDirectory = null,
        IStartupRegistrar? startupRegistrar = null,
        string? executablePath = null,
        string? fallbackUserDirectory = null)
    {
        _configDirectory = configDirectory ?? ResolveDefaultConfigDirectory();
        _fallbackUserDirectory = fallbackUserDirectory
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NekoScape", "config");
        _startupRegistrar = startupRegistrar ?? new WindowsStartupRegistrar();
        _executablePath = string.IsNullOrWhiteSpace(executablePath)
            ? (Environment.ProcessPath ?? AppContext.BaseDirectory)
            : executablePath;

        Current = Load();
    }

    public NekoSettings Load()
    {
        NekoSettings defaults = LoadDefaults();
        string? activeUserPath = File.Exists(UserSettingsPath)
            ? UserSettingsPath
            : (File.Exists(FallbackUserSettingsPath) ? FallbackUserSettingsPath : null);

        if (activeUserPath is null)
        {
            Current = defaults.Normalized();
            return Current.Clone();
        }

        try
        {
            string defaultJson = JsonSerializer.Serialize(defaults, JsonOptions);
            JsonObject merged = JsonNode.Parse(defaultJson)?.AsObject() ?? new JsonObject();

            string userJson = File.ReadAllText(activeUserPath);
            if (JsonNode.Parse(userJson) is JsonObject userObj)
            {
                foreach (KeyValuePair<string, JsonNode?> kvp in userObj)
                {
                    if (kvp.Value is not null)
                    {
                        merged[kvp.Key] = kvp.Value.DeepClone();
                    }
                }
            }

            NekoSettings? loaded = merged.Deserialize<NekoSettings>(JsonOptions);
            Current = (loaded ?? defaults).Normalized();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            Current = defaults.Normalized();
        }

        return Current.Clone();
    }

    public bool HasExplicitUserSetting(string propertyName)
    {
        string? activeUserPath = File.Exists(UserSettingsPath)
            ? UserSettingsPath
            : (File.Exists(FallbackUserSettingsPath) ? FallbackUserSettingsPath : null);

        if (activeUserPath is null)
        {
            return false;
        }

        try
        {
            string userJson = File.ReadAllText(activeUserPath);
            if (JsonNode.Parse(userJson) is JsonObject userObj)
            {
                foreach (KeyValuePair<string, JsonNode?> kvp in userObj)
                {
                    if (string.Equals(kvp.Key, propertyName, StringComparison.OrdinalIgnoreCase) && kvp.Value is not null)
                    {
                        return true;
                    }
                }
            }
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
        }

        return false;
    }

    public NekoSettings Save(NekoSettings settings, bool applyStartupRegistry = true)
    {
        NekoSettings normalized = settings.Normalized();
        string json = JsonSerializer.Serialize(normalized, JsonOptions);

        try
        {
            Directory.CreateDirectory(_configDirectory);
            File.WriteAllText(UserSettingsPath, json);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            Directory.CreateDirectory(_fallbackUserDirectory);
            File.WriteAllText(FallbackUserSettingsPath, json);
        }

        if (applyStartupRegistry)
        {
            try
            {
                _startupRegistrar.ApplyStartupSetting(normalized.LaunchAtStartup, _executablePath);
            }
            catch (Exception)
            {
                // Non-fatal if registry access is restricted in sandboxed environments.
            }
        }

        Current = normalized;
        return Current.Clone();
    }

    public NekoSettings LoadDefaults()
    {
        if (!File.Exists(DefaultSettingsPath))
        {
            return new NekoSettings();
        }

        try
        {
            string json = File.ReadAllText(DefaultSettingsPath);
            NekoSettings? parsed = JsonSerializer.Deserialize<NekoSettings>(json, JsonOptions);
            return (parsed ?? new NekoSettings()).Normalized();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            return new NekoSettings();
        }
    }

    public static string ResolveDefaultConfigDirectory()
    {
        string baseConfig = Path.Combine(AppContext.BaseDirectory, "config");
        if (File.Exists(Path.Combine(baseConfig, "default-settings.json")))
        {
            return baseConfig;
        }

        DirectoryInfo? dir = new(AppContext.BaseDirectory);
        for (int i = 0; i < 6 && dir is not null; i++)
        {
            string candidate = Path.Combine(dir.FullName, "config");
            if (File.Exists(Path.Combine(candidate, "default-settings.json")))
            {
                return candidate;
            }
            dir = dir.Parent;
        }

        return baseConfig;
    }
}
