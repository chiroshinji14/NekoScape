using System.Drawing;
using System.Runtime.InteropServices;
using NekoScape.Host.Bridge;
using NekoScape.Host.Native;

namespace NekoScape.Host.Hooks;

public sealed record LedgeWindowSnapshot(
    IntPtr Handle,
    string ClassName,
    string Title,
    Win32Api.RECT Bounds,
    bool IsVisible,
    bool IsMinimized,
    bool IsCloaked,
    bool IsSelf,
    bool IsToolWindow = false);

public static class WindowLedgeEvaluator
{
    public const int MaxWindowLedges = 6;
    public const double LedgeHeightLogical = 12.0;
    public const double MinLedgeWidthLogical = 80.0;

    public static DesktopIconRect? ComputeTaskbarRect(
        Rectangle monitorBounds,
        Rectangle workingArea,
        double dpiScale)
    {
        double safeScale = dpiScale > 0 && double.IsFinite(dpiScale) ? dpiScale : 1.0;

        Win32Api.RECT? physTaskbar = null;
        if (workingArea.Bottom < monitorBounds.Bottom)
        {
            physTaskbar = new Win32Api.RECT(monitorBounds.Left, workingArea.Bottom, monitorBounds.Right, monitorBounds.Bottom);
        }
        else if (workingArea.Top > monitorBounds.Top)
        {
            physTaskbar = new Win32Api.RECT(monitorBounds.Left, monitorBounds.Top, monitorBounds.Right, workingArea.Top);
        }
        else if (workingArea.Left > monitorBounds.Left)
        {
            physTaskbar = new Win32Api.RECT(monitorBounds.Left, monitorBounds.Top, workingArea.Left, monitorBounds.Bottom);
        }
        else if (workingArea.Right < monitorBounds.Right)
        {
            physTaskbar = new Win32Api.RECT(workingArea.Right, monitorBounds.Top, monitorBounds.Right, monitorBounds.Bottom);
        }

        if (physTaskbar is null)
        {
            return null;
        }

        RectDto logical = DpiCoordinateMapper.ToLogicalRect(
            physTaskbar.Value,
            monitorBounds.Left,
            monitorBounds.Top,
            safeScale);

        if (logical.Width <= 0 || logical.Height <= 0)
        {
            return null;
        }

        return new DesktopIconRect(
            Id: -1,
            X: Math.Round(logical.X, 2),
            Y: Math.Round(logical.Y, 2),
            Width: Math.Round(logical.Width, 2),
            Height: Math.Round(logical.Height, 2),
            Label: "Taskbar",
            IsRecycleBin: false);
    }

    public static IReadOnlyList<DesktopIconRect> ComputeWindowTopLedges(
        Rectangle monitorBounds,
        double dpiScale,
        IReadOnlyList<LedgeWindowSnapshot> windowsInZOrder,
        int maxLedges = MaxWindowLedges)
    {
        double safeScale = dpiScale > 0 && double.IsFinite(dpiScale) ? dpiScale : 1.0;
        int cap = Math.Max(0, maxLedges);
        if (cap == 0 || monitorBounds.Width <= 0 || monitorBounds.Height <= 0)
        {
            return Array.Empty<DesktopIconRect>();
        }

        List<DesktopIconRect> ledges = new(cap);
        List<Win32Api.RECT> higherWindows = [];

        foreach (LedgeWindowSnapshot w in windowsInZOrder)
        {
            if (!w.IsVisible || w.IsMinimized || w.IsCloaked || w.IsSelf)
            {
                continue;
            }

            if (OcclusionEvaluator.IsShellWindowClass(w.ClassName))
            {
                continue;
            }

            int physLeft = Math.Max(w.Bounds.Left, monitorBounds.Left);
            int physRight = Math.Min(w.Bounds.Right, monitorBounds.Right);
            int physTop = w.Bounds.Top;
            int physBottom = Math.Min(w.Bounds.Bottom, monitorBounds.Bottom);

            if (physRight <= physLeft || physBottom <= physTop)
            {
                continue;
            }

            // Track every non-shell visible window in Z-order so buried windows don't emit phantom ledges.
            var clippedWindow = new Win32Api.RECT(physLeft, Math.Max(physTop, monitorBounds.Top), physRight, physBottom);

            if (!w.IsToolWindow
                && !string.IsNullOrWhiteSpace(w.Title)
                && w.Bounds.Width >= 120
                && w.Bounds.Height >= 40)
            {
                int stripHeightPhys = Math.Max(4, (int)Math.Round(LedgeHeightLogical * safeScale));
                int minTopPhys = monitorBounds.Top + (int)Math.Round(8.0 * safeScale);
                int maxTopPhys = monitorBounds.Bottom - stripHeightPhys;

                if (physTop >= minTopPhys && physTop <= maxTopPhys)
                {
                    double logicalWidth = (physRight - physLeft) / safeScale;
                    if (logicalWidth >= MinLedgeWidthLogical
                        && !IsStripFullyOccluded(physLeft, physTop, physRight, physTop + stripHeightPhys, higherWindows))
                    {
                        RectDto logical = DpiCoordinateMapper.ToLogicalRect(
                            new Win32Api.RECT(physLeft, physTop, physRight, physTop + stripHeightPhys),
                            monitorBounds.Left,
                            monitorBounds.Top,
                            safeScale);

                        ledges.Add(new DesktopIconRect(
                            Id: ledges.Count + 1,
                            X: Math.Round(logical.X, 2),
                            Y: Math.Round(logical.Y, 2),
                            Width: Math.Round(logical.Width, 2),
                            Height: LedgeHeightLogical,
                            Label: w.Title.Trim(),
                            IsRecycleBin: false));

                        if (ledges.Count >= cap)
                        {
                            break;
                        }
                    }
                }
            }

            higherWindows.Add(clippedWindow);
        }

        return ledges;
    }

    public static bool LedgesEqual(
        DesktopIconRect? taskbarA,
        IReadOnlyList<DesktopIconRect> ledgesA,
        DesktopIconRect? taskbarB,
        IReadOnlyList<DesktopIconRect> ledgesB)
    {
        if (!RectAlmostEqual(taskbarA, taskbarB))
        {
            return false;
        }

        if (ledgesA.Count != ledgesB.Count)
        {
            return false;
        }

        for (int i = 0; i < ledgesA.Count; i++)
        {
            if (!RectAlmostEqual(ledgesA[i], ledgesB[i])
                || !string.Equals(ledgesA[i].Label, ledgesB[i].Label, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private static bool RectAlmostEqual(DesktopIconRect? a, DesktopIconRect? b)
    {
        if (a is null && b is null) return true;
        if (a is null || b is null) return false;
        return Math.Abs(a.X - b.X) <= 1.5
            && Math.Abs(a.Y - b.Y) <= 1.5
            && Math.Abs(a.Width - b.Width) <= 1.5
            && Math.Abs(a.Height - b.Height) <= 1.5;
    }

    private static bool IsStripFullyOccluded(
        int left,
        int top,
        int right,
        int bottom,
        List<Win32Api.RECT> higherWindows)
    {
        // Sample center and quarter points across the top strip to detect when a higher window covers it.
        int yMid = (top + bottom) / 2;
        int span = right - left;
        int[] sampleXs =
        [
            left + span / 4,
            left + span / 2,
            left + (span * 3) / 4,
        ];

        for (int s = 0; s < sampleXs.Length; s++)
        {
            int sx = sampleXs[s];
            bool covered = false;
            for (int i = 0; i < higherWindows.Count; i++)
            {
                Win32Api.RECT hw = higherWindows[i];
                if (sx >= hw.Left && sx <= hw.Right && yMid >= hw.Top && yMid <= hw.Bottom)
                {
                    covered = true;
                    break;
                }
            }
            if (!covered)
            {
                return false;
            }
        }

        return true;
    }
}

public sealed class WindowLedgeTracker
{
    public WindowLedgesMessage Collect(
        Rectangle monitorBounds,
        Rectangle workingArea,
        double dpiScale,
        IntPtr selfHandle)
    {
        DesktopIconRect? taskbarRect = WindowLedgeEvaluator.ComputeTaskbarRect(
            monitorBounds,
            workingArea,
            dpiScale);

        List<LedgeWindowSnapshot> snapshots = [];
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

            long exStyle = Win32Api.GetWindowLongPtr(hWnd, Win32Api.GWL_EXSTYLE).ToInt64();
            bool isToolWindow = (exStyle & Win32Api.WS_EX_TOOLWINDOW) != 0
                && (exStyle & Win32Api.WS_EX_APPWINDOW) == 0;

            string className = Win32Api.ReadClassName(hWnd);
            string title = Win32Api.ReadWindowTitle(hWnd);

            if (Win32Api.DwmGetWindowAttribute(hWnd, Win32Api.DWMWA_EXTENDED_FRAME_BOUNDS, out Win32Api.RECT rect, Marshal.SizeOf<Win32Api.RECT>()) != 0)
            {
                if (!Win32Api.GetWindowRect(hWnd, out rect))
                {
                    return true;
                }
            }

            snapshots.Add(new LedgeWindowSnapshot(
                Handle: hWnd,
                ClassName: className,
                Title: title,
                Bounds: rect,
                IsVisible: visible,
                IsMinimized: minimized,
                IsCloaked: cloaked,
                IsSelf: hWnd == selfHandle,
                IsToolWindow: isToolWindow));
            return true;
        }, IntPtr.Zero);

        IReadOnlyList<DesktopIconRect> ledges = WindowLedgeEvaluator.ComputeWindowTopLedges(
            monitorBounds,
            dpiScale,
            snapshots);

        return new WindowLedgesMessage(taskbarRect, ledges);
    }
}
