using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace NekoScape.Host.Settings;

public sealed record BreedModeOption(string Key, string Label, string ShortLabel);

public sealed record SceneThemeOption(string Key, string Label, string Subtitle);

public sealed record CollarColorOption(string Key, string Label, string? HexColor);

public sealed class NekoSettings
{
    public const int MinCatCount = 1;

    private static readonly Regex SeparatorRegex = new(@"[\s-]+", RegexOptions.Compiled);

    public static readonly IReadOnlyList<BreedModeOption> BreedModeOptions =
    [
        new("mix", "All Breeds", "All Breeds"),
        new("persian", "Persian", "Persian"),
        new("siamese", "Siamese", "Siamese"),
        new("british_shorthair", "British Shorthair", "British"),
        new("munchkin", "Munchkin", "Munchkin"),
        new("sphynx", "Sphynx", "Sphynx"),
        new("domestic_shorthair", "Domestic Shorthair", "Domestic"),
        new("maine_coon", "Maine Coon", "Maine Coon"),
        new("scottish_fold", "Scottish Fold", "Scottish Fold"),
        new("bengal", "Bengal", "Bengal"),
        new("ragdoll", "Ragdoll", "Ragdoll"),
        new("russian_blue", "Russian Blue", "Russian Blue"),
        new("abyssinian", "Abyssinian", "Abyssinian"),
        new("american_curl", "American Curl", "American Curl"),
        new("japanese_bobtail", "Japanese Bobtail", "Bobtail"),
    ];

    public static readonly IReadOnlyList<SceneThemeOption> SceneThemeOptions =
    [
        new("study", "Golden Study", "Oak, Monstera & Books"),
        new("tatami", "Kyoto Tatami", "Bonsai, Tea & Lantern"),
        new("garden", "Sunlit Garden", "Koi Pond & Clover"),
        new("cafe", "Cat Cafe", "Bistro & Cat Tower"),
        new("living_room", "Living Room", "Fireplace, Sofa & Laptop"),
        new("rainy_window", "Rainy Window", "Raindrops & Sill Perch"),
        new("night_balcony", "Night Balcony", "City Bokeh & Moths"),
        new("kitchen", "Sunny Kitchen", "Fridge Lookout & Fountain"),
        new("bedroom", "Cozy Bedroom", "Blanket Lump & Litter Box"),
        new("snowy_window", "Snowy Window", "Snowfall & Warm Radiator"),
        new("sunbeam", "Sunbeam Studio", "Drifting Sunbeam & Tape"),
        new("aquarium", "Aquarium Fort", "Tabletop Tank & Tunnel"),
        new("rooftop", "Sunset Rooftop", "String Lights & Parapet"),
    ];

    public static readonly IReadOnlyList<CollarColorOption> CollarColorOptions =
    [
        new("none", "None", null),
        new("crimson", "Crimson", "#d94f5c"),
        new("teal", "Teal", "#2fa69a"),
        new("gold", "Gold", "#e2a93b"),
        new("lavender", "Lavender", "#8b74d6"),
    ];

    public int CatCount { get; set; } = 6;
    public int FpsCap { get; set; } = 60;
    public bool ShowHud { get; set; } = false;
    public bool ShowToyDock { get; set; } = true;
    public bool DebugMode { get; set; } = false;
    public bool EnableLaserHotkey { get; set; } = true;
    public bool EnableShellReactions { get; set; } = true;
    public bool LaunchAtStartup { get; set; } = false;
    public int IdleNapMinutes { get; set; } = 5;
    public string LightingMode { get; set; } = "golden";
    public string SceneTheme { get; set; } = "study";
    public string BreedMode { get; set; } = "mix";
    public bool ShowSceneProps { get; set; } = true;
    public bool KittenMode { get; set; } = false;
    public string? CollarColor { get; set; } = null;
    public bool CollarBell { get; set; } = true;
    public bool SoundEnabled { get; set; } = false;
    public double SoundVolume { get; set; } = 0.45;

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
        SceneTheme = SceneTheme,
        BreedMode = BreedMode,
        ShowSceneProps = ShowSceneProps,
        KittenMode = KittenMode,
        CollarColor = CollarColor,
        CollarBell = CollarBell,
        SoundEnabled = SoundEnabled,
        SoundVolume = SoundVolume,
    };

    public NekoSettings Normalized()
    {
        var copy = Clone();
        copy.CatCount = Math.Max(MinCatCount, copy.CatCount);
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
        copy.BreedMode = NormalizeBreedMode(copy.BreedMode);
        copy.CollarColor = NormalizeCollarColor(copy.CollarColor);
        copy.SoundVolume = double.IsFinite(copy.SoundVolume)
            ? Math.Clamp(Math.Round(copy.SoundVolume, 2), 0.0, 1.0)
            : 0.45;
        return copy;
    }

    public static string NormalizeLightingMode(string? mode) => mode?.Trim().ToLowerInvariant() switch
    {
        "auto" => "auto",
        "day" => "day",
        "night" => "night",
        _ => "golden"
    };

    public static string NormalizeSceneTheme(string? theme)
    {
        if (string.IsNullOrWhiteSpace(theme))
        {
            return "study";
        }

        string key = SeparatorRegex.Replace(theme.Trim().ToLowerInvariant(), "_");
        foreach (SceneThemeOption option in SceneThemeOptions)
        {
            if (string.Equals(option.Key, key, StringComparison.OrdinalIgnoreCase))
            {
                return option.Key;
            }
        }

        return "study";
    }

    public static string GetSceneThemeLabel(string? theme)
    {
        string normalized = NormalizeSceneTheme(theme);
        foreach (SceneThemeOption option in SceneThemeOptions)
        {
            if (string.Equals(option.Key, normalized, StringComparison.OrdinalIgnoreCase))
            {
                return option.Label;
            }
        }
        return "Golden Study";
    }

    public static string? NormalizeCollarColor(string? color)
    {
        if (string.IsNullOrWhiteSpace(color))
        {
            return null;
        }

        string trimmed = color.Trim();
        if (string.Equals(trimmed, "none", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return trimmed.ToLowerInvariant();
    }

    public static string NormalizeBreedMode(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode))
        {
            return "mix";
        }

        string key = SeparatorRegex.Replace(mode.Trim().ToLowerInvariant(), "_");
        return key switch
        {
            "" or "mix" or "all" or "mixed" => "mix",
            "persian" or "calico" => "persian",
            "siamese" => "siamese",
            "british_shorthair" or "blue_grey" or "british" or "bsh" => "british_shorthair",
            "munchkin" or "tuxedo" => "munchkin",
            "sphynx" => "sphynx",
            "domestic_shorthair" or "black" or "orange_tabby" or "tabby" or "dsh" => "domestic_shorthair",
            "maine_coon" or "maine" or "mainecoon" => "maine_coon",
            "scottish_fold" or "scottish" or "fold" or "scottishfold" => "scottish_fold",
            "bengal" => "bengal",
            "ragdoll" => "ragdoll",
            "russian_blue" or "russian" or "russianblue" => "russian_blue",
            "abyssinian" or "aby" => "abyssinian",
            "american_curl" or "curl" or "americancurl" => "american_curl",
            "japanese_bobtail" or "bobtail" or "mike" or "japanesebobtail" => "japanese_bobtail",
            _ => "mix"
        };
    }

    public static string GetBreedModeLabel(string? mode)
    {
        string normalized = NormalizeBreedMode(mode);
        foreach (BreedModeOption option in BreedModeOptions)
        {
            if (string.Equals(option.Key, normalized, StringComparison.OrdinalIgnoreCase))
            {
                return option.Label;
            }
        }
        return "All Breeds";
    }
}

public sealed class NekoSettingsPatch
{
    public int? CatCount { get; set; }
    public int? FpsCap { get; set; }
    public bool? ShowHud { get; set; }
    public bool? ShowToyDock { get; set; }
    public bool? DebugMode { get; set; }
    public bool? EnableLaserHotkey { get; set; }
    public bool? EnableShellReactions { get; set; }
    public bool? LaunchAtStartup { get; set; }
    public int? IdleNapMinutes { get; set; }
    public string? LightingMode { get; set; }
    public string? SceneTheme { get; set; }
    public string? BreedMode { get; set; }
    public bool? ShowSceneProps { get; set; }
    public bool? KittenMode { get; set; }
    public string? CollarColor { get; set; }
    [JsonIgnore]
    public bool ClearCollarColor { get; set; }
    public bool? CollarBell { get; set; }
    public bool? SoundEnabled { get; set; }
    public double? SoundVolume { get; set; }

    public NekoSettings ApplyTo(NekoSettings current)
    {
        NekoSettings updated = current.Clone();
        if (CatCount.HasValue) updated.CatCount = CatCount.Value;
        if (FpsCap.HasValue) updated.FpsCap = FpsCap.Value;
        if (ShowHud.HasValue) updated.ShowHud = ShowHud.Value;
        if (ShowToyDock.HasValue) updated.ShowToyDock = ShowToyDock.Value;
        if (DebugMode.HasValue) updated.DebugMode = DebugMode.Value;
        if (EnableLaserHotkey.HasValue) updated.EnableLaserHotkey = EnableLaserHotkey.Value;
        if (EnableShellReactions.HasValue) updated.EnableShellReactions = EnableShellReactions.Value;
        if (LaunchAtStartup.HasValue) updated.LaunchAtStartup = LaunchAtStartup.Value;
        if (IdleNapMinutes.HasValue) updated.IdleNapMinutes = IdleNapMinutes.Value;
        if (LightingMode is not null) updated.LightingMode = LightingMode;
        if (SceneTheme is not null) updated.SceneTheme = SceneTheme;
        if (BreedMode is not null) updated.BreedMode = BreedMode;
        if (ShowSceneProps.HasValue) updated.ShowSceneProps = ShowSceneProps.Value;
        if (KittenMode.HasValue) updated.KittenMode = KittenMode.Value;
        if (CollarColor is not null)
        {
            updated.CollarColor = CollarColor;
        }
        else if (ClearCollarColor)
        {
            updated.CollarColor = null;
        }
        if (CollarBell.HasValue) updated.CollarBell = CollarBell.Value;
        if (SoundEnabled.HasValue) updated.SoundEnabled = SoundEnabled.Value;
        if (SoundVolume.HasValue) updated.SoundVolume = SoundVolume.Value;
        return updated.Normalized();
    }
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
                    else if (string.Equals(kvp.Key, "collarColor", StringComparison.OrdinalIgnoreCase))
                    {
                        merged[kvp.Key] = null;
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

    public NekoSettings Save(
        NekoSettings settings,
        bool applyStartupRegistry = true,
        IReadOnlySet<string>? omitPropertyNames = null)
    {
        NekoSettings normalized = settings.Normalized();
        string json;
        if (omitPropertyNames is { Count: > 0 }
            && JsonNode.Parse(JsonSerializer.Serialize(normalized, JsonOptions)) is JsonObject obj)
        {
            List<string> keysToRemove = [];
            foreach (KeyValuePair<string, JsonNode?> kvp in obj)
            {
                if (omitPropertyNames.Contains(kvp.Key)
                    || omitPropertyNames.Any(omitted => string.Equals(omitted, kvp.Key, StringComparison.OrdinalIgnoreCase)))
                {
                    keysToRemove.Add(kvp.Key);
                }
            }
            foreach (string key in keysToRemove)
            {
                obj.Remove(key);
            }
            json = obj.ToJsonString(JsonOptions);
        }
        else
        {
            json = JsonSerializer.Serialize(normalized, JsonOptions);
        }

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
