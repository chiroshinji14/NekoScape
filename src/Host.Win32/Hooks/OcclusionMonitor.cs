using System.Drawing;
using System.Runtime.InteropServices;
using NekoScape.Host.Native;

namespace NekoScape.Host.Hooks;

public sealed record WindowBoundsSnapshot(
    IntPtr Handle,
    string ClassName,
    Win32Api.RECT Bounds,
    bool IsVisible,
    bool IsMinimized,
    bool IsCloaked,
    bool IsSelf);

public static class OcclusionEvaluator
{
    private static readonly HashSet<string> ShellWindowClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Progman",
        "WorkerW",
        "Shell_TrayWnd",
        "Shell_SecondaryTrayWnd",
        "DV2ControlHost",
        "TopLevelWindowForOverflowXamlIsland",
        "Windows.UI.Core.CoreWindow"
    };

    public static bool IsShellWindowClass(string? className)
        => !string.IsNullOrWhiteSpace(className) && ShellWindowClasses.Contains(className.Trim());

    public static bool IsOccluded(
        Win32Api.RECT monitorBounds,
        Win32Api.QUERY_USER_NOTIFICATION_STATE notificationState,
        IReadOnlyList<WindowBoundsSnapshot> windows,
        double coverageThreshold = 0.95)
    {
        if (notificationState is Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY
            or Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN
            or Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE)
        {
            return true;
        }

        double coverage = ComputeCoveredFraction(monitorBounds, windows);
        return coverage >= coverageThreshold;
    }

    public static double ComputeCoveredFraction(
        Win32Api.RECT monitorBounds,
        IReadOnlyList<WindowBoundsSnapshot> windows)
    {
        long monitorWidth = (long)monitorBounds.Right - monitorBounds.Left;
        long monitorHeight = (long)monitorBounds.Bottom - monitorBounds.Top;
        if (monitorWidth <= 0 || monitorHeight <= 0)
        {
            return 0.0;
        }

        double monitorArea = (double)monitorWidth * monitorHeight;
        List<Win32Api.RECT> occluders = new();
        SortedSet<int> xCoords = new();
        SortedSet<int> yCoords = new();

        foreach (WindowBoundsSnapshot w in windows)
        {
            if (!w.IsVisible || w.IsMinimized || w.IsCloaked || w.IsSelf)
            {
                continue;
            }

            if (IsShellWindowClass(w.ClassName))
            {
                continue;
            }

            int left = Math.Max(w.Bounds.Left, monitorBounds.Left);
            int top = Math.Max(w.Bounds.Top, monitorBounds.Top);
            int right = Math.Min(w.Bounds.Right, monitorBounds.Right);
            int bottom = Math.Min(w.Bounds.Bottom, monitorBounds.Bottom);

            if (right <= left || bottom <= top)
            {
                continue;
            }

            occluders.Add(new Win32Api.RECT(left, top, right, bottom));
            xCoords.Add(left);
            xCoords.Add(right);
            yCoords.Add(top);
            yCoords.Add(bottom);
        }

        if (occluders.Count == 0 || xCoords.Count < 2 || yCoords.Count < 2)
        {
            return 0.0;
        }

        int[] xs = xCoords.ToArray();
        int[] ys = yCoords.ToArray();
        double coveredArea = 0.0;

        for (int ix = 0; ix < xs.Length - 1; ix++)
        {
            int cellLeft = xs[ix];
            int cellRight = xs[ix + 1];
            double cellWidth = cellRight - cellLeft;
            if (cellWidth <= 0)
            {
                continue;
            }

            for (int iy = 0; iy < ys.Length - 1; iy++)
            {
                int cellTop = ys[iy];
                int cellBottom = ys[iy + 1];
                double cellHeight = cellBottom - cellTop;
                if (cellHeight <= 0)
                {
                    continue;
                }

                for (int k = 0; k < occluders.Count; k++)
                {
                    Win32Api.RECT r = occluders[k];
                    if (r.Left <= cellLeft && r.Right >= cellRight && r.Top <= cellTop && r.Bottom >= cellBottom)
                    {
                        coveredArea += cellWidth * cellHeight;
                        break;
                    }
                }
            }
        }

        return Math.Clamp(coveredArea / monitorArea, 0.0, 1.0);
    }
}

public sealed class OcclusionMonitor : IDisposable
{
    private readonly Func<Rectangle> _getMonitorBounds;
    private readonly Func<IntPtr> _getSelfHandle;
    private readonly System.Threading.Timer _timer;
    private int _polling;
    private bool _disposed;
    private bool _lastOccluded;

    public event Action<bool>? OcclusionChanged;

    public bool IsOccluded => _lastOccluded;

    public OcclusionMonitor(Func<Rectangle> getMonitorBounds, Func<IntPtr> getSelfHandle)
    {
        _getMonitorBounds = getMonitorBounds;
        _getSelfHandle = getSelfHandle;
        _timer = new System.Threading.Timer(OnTick, null, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(500));
    }

    public bool CheckOnce()
    {
        Rectangle bounds = _getMonitorBounds();
        Win32Api.RECT monitorRect = new(bounds.Left, bounds.Top, bounds.Right, bounds.Bottom);
        IntPtr selfHandle = _getSelfHandle();

        if (Win32Api.SHQueryUserNotificationState(out Win32Api.QUERY_USER_NOTIFICATION_STATE quns) != 0)
        {
            quns = Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS;
        }

        List<WindowBoundsSnapshot> snapshots = new();
        Win32Api.EnumWindows((hWnd, _) =>
        {
            bool visible = Win32Api.IsWindowVisible(hWnd);
            if (!visible)
            {
                return true;
            }

            bool minimized = Win32Api.IsIconic(hWnd);
            bool cloaked = false;
            if (Win32Api.DwmGetWindowAttribute(hWnd, Win32Api.DWMWA_CLOAKED, out int cloakedVal, sizeof(int)) == 0)
            {
                cloaked = cloakedVal != 0;
            }

            string className = Win32Api.ReadClassName(hWnd);
            if (Win32Api.DwmGetWindowAttribute(hWnd, Win32Api.DWMWA_EXTENDED_FRAME_BOUNDS, out Win32Api.RECT rect, Marshal.SizeOf<Win32Api.RECT>()) != 0)
            {
                if (!Win32Api.GetWindowRect(hWnd, out rect))
                {
                    return true;
                }
            }

            snapshots.Add(new WindowBoundsSnapshot(
                Handle: hWnd,
                ClassName: className,
                Bounds: rect,
                IsVisible: visible,
                IsMinimized: minimized,
                IsCloaked: cloaked,
                IsSelf: hWnd == selfHandle));
            return true;
        }, IntPtr.Zero);

        bool occluded = OcclusionEvaluator.IsOccluded(monitorRect, quns, snapshots);
        if (occluded != _lastOccluded)
        {
            _lastOccluded = occluded;
            OcclusionChanged?.Invoke(occluded);
        }

        return occluded;
    }

    private void OnTick(object? state)
    {
        if (_disposed || Interlocked.Exchange(ref _polling, 1) != 0)
        {
            return;
        }

        try
        {
            CheckOnce();
        }
        catch (Exception)
        {
            // Keep poller resilient across transient desktop switch states.
        }
        finally
        {
            Interlocked.Exchange(ref _polling, 0);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _timer.Dispose();
    }
}
