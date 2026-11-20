using System.Runtime.InteropServices;
using NekoScape.Host.Native;

namespace NekoScape.Host.Hooks;

public sealed record RecycleBinTransition(int ItemCount, bool Emptied, bool ShouldEmit);

public sealed class RecycleBinStateTracker
{
    private long? _previousCount;

    public RecycleBinTransition Evaluate(long currentCount)
    {
        long normalized = Math.Max(0, currentCount);
        int clampedInt = (int)Math.Min(normalized, int.MaxValue);

        if (_previousCount is null)
        {
            _previousCount = normalized;
            return new RecycleBinTransition(clampedInt, Emptied: false, ShouldEmit: normalized > 0);
        }

        long prev = _previousCount.Value;
        _previousCount = normalized;

        if (prev > 0 && normalized == 0)
        {
            return new RecycleBinTransition(0, Emptied: true, ShouldEmit: true);
        }

        if (prev != normalized)
        {
            return new RecycleBinTransition(clampedInt, Emptied: false, ShouldEmit: true);
        }

        return new RecycleBinTransition(clampedInt, Emptied: false, ShouldEmit: false);
    }
}

public sealed class DesktopWatcher : IDisposable
{
    private readonly FileSystemWatcher? _watcher;
    private readonly System.Threading.Timer _recycleTimer;
    private readonly RecycleBinStateTracker _recycleTracker = new();
    private readonly Dictionary<string, System.Threading.Timer> _pendingFiles = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _debounceLock = new();
    private readonly TimeSpan _debounceDelay;
    private int _pollingRecycle;
    private bool _disposed;

    public event Action<string>? NewFileDetected;
    public event Action<int, bool>? RecycleBinChanged;

    public DesktopWatcher(TimeSpan? debounceDelay = null, TimeSpan? recyclePollInterval = null)
    {
        _debounceDelay = debounceDelay ?? TimeSpan.FromMilliseconds(250);
        TimeSpan pollInterval = recyclePollInterval ?? TimeSpan.FromSeconds(2);

        string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (!string.IsNullOrWhiteSpace(desktopDir) && Directory.Exists(desktopDir))
        {
            _watcher = new FileSystemWatcher(desktopDir)
            {
                Filter = "*.*",
                IncludeSubdirectories = false,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.CreationTime,
                EnableRaisingEvents = true
            };
            _watcher.Created += OnDesktopEntryCreated;
            _watcher.Renamed += OnDesktopEntryRenamed;
        }

        _recycleTimer = new System.Threading.Timer(
            _ => PollRecycleBin(),
            null,
            pollInterval,
            pollInterval);
    }

    public static bool IsIgnoredDesktopFile(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return true;
        }

        string name = Path.GetFileName(fileName).Trim();
        return string.Equals(name, "desktop.ini", StringComparison.OrdinalIgnoreCase)
            || string.Equals(name, "thumbs.db", StringComparison.OrdinalIgnoreCase)
            || string.Equals(name, ".DS_Store", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("~$", StringComparison.Ordinal)
            || name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase);
    }

    public void PollRecycleBin()
    {
        if (_disposed || Interlocked.Exchange(ref _pollingRecycle, 1) != 0)
        {
            return;
        }

        try
        {
            Win32Api.SHQUERYRBINFO info = new()
            {
                cbSize = Marshal.SizeOf<Win32Api.SHQUERYRBINFO>()
            };

            int hr = Win32Api.SHQueryRecycleBinW(null, ref info);
            if (hr != 0)
            {
                return;
            }

            RecycleBinTransition transition = _recycleTracker.Evaluate(info.i64NumItems);
            if (transition.ShouldEmit)
            {
                RecycleBinChanged?.Invoke(transition.ItemCount, transition.Emptied);
            }
        }
        catch (Exception)
        {
            // Keep poller resilient across Explorer restarts.
        }
        finally
        {
            Interlocked.Exchange(ref _pollingRecycle, 0);
        }
    }

    private void OnDesktopEntryCreated(object sender, FileSystemEventArgs e)
    {
        ScheduleNewFile(e.Name);
    }

    private void OnDesktopEntryRenamed(object sender, RenamedEventArgs e)
    {
        ScheduleNewFile(e.Name);
    }

    private void ScheduleNewFile(string? rawName)
    {
        if (_disposed || IsIgnoredDesktopFile(rawName))
        {
            return;
        }

        string fileName = Path.GetFileName(rawName!);
        lock (_debounceLock)
        {
            if (_disposed)
            {
                return;
            }

            if (_pendingFiles.TryGetValue(fileName, out System.Threading.Timer? existing))
            {
                existing.Change(_debounceDelay, Timeout.InfiniteTimeSpan);
                return;
            }

            System.Threading.Timer? timer = null;
            timer = new System.Threading.Timer(_ =>
            {
                lock (_debounceLock)
                {
                    if (_pendingFiles.TryGetValue(fileName, out System.Threading.Timer? current) && ReferenceEquals(current, timer))
                    {
                        _pendingFiles.Remove(fileName);
                    }
                    timer?.Dispose();
                }

                if (!_disposed)
                {
                    NewFileDetected?.Invoke(fileName);
                }
            }, null, _debounceDelay, Timeout.InfiniteTimeSpan);

            _pendingFiles[fileName] = timer;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (_watcher is not null)
        {
            _watcher.EnableRaisingEvents = false;
            _watcher.Created -= OnDesktopEntryCreated;
            _watcher.Renamed -= OnDesktopEntryRenamed;
            _watcher.Dispose();
        }

        _recycleTimer.Dispose();

        lock (_debounceLock)
        {
            foreach (System.Threading.Timer timer in _pendingFiles.Values)
            {
                timer.Dispose();
            }
            _pendingFiles.Clear();
        }
    }
}
