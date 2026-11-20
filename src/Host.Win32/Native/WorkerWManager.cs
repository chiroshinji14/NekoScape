using System.Drawing;

namespace NekoScape.Host.Native;

public sealed record WindowNodeSnapshot(
    IntPtr Handle,
    IntPtr ParentHandle,
    string ClassName,
    bool HasShellDefViewChild,
    IntPtr ShellDefViewHandle,
    bool IsVisible = true);

public enum WorkerWPlacementMode
{
    None,
    SiblingWorkerW,
    ProgmanChildBehindDefView
}

public sealed record WorkerWPlacementTarget(
    WorkerWPlacementMode Mode,
    IntPtr ParentHandle,
    IntPtr InsertAfterHandle,
    IntPtr ShellDefViewHandle);

public sealed class WorkerWManager
{
    private WorkerWPlacementTarget? _lastTarget;

    public WorkerWPlacementTarget? LastTarget => _lastTarget;

    public static WorkerWPlacementTarget SelectPlacementTarget(
        IReadOnlyList<WindowNodeSnapshot> topLevelWindows,
        IReadOnlyList<WindowNodeSnapshot> progmanChildren,
        IntPtr progmanHandle)
    {
        WindowNodeSnapshot? defViewHost = null;
        int defViewHostIndex = -1;

        for (int i = 0; i < topLevelWindows.Count; i++)
        {
            if (topLevelWindows[i].HasShellDefViewChild && topLevelWindows[i].ShellDefViewHandle != IntPtr.Zero)
            {
                defViewHost = topLevelWindows[i];
                defViewHostIndex = i;
                break;
            }
        }

        IntPtr defViewHandle = defViewHost?.ShellDefViewHandle ?? IntPtr.Zero;
        if (defViewHandle == IntPtr.Zero)
        {
            foreach (WindowNodeSnapshot child in progmanChildren)
            {
                if (string.Equals(child.ClassName, "SHELLDLL_DefView", StringComparison.Ordinal))
                {
                    defViewHandle = child.Handle;
                    break;
                }
            }
        }

        if (defViewHandle == IntPtr.Zero)
        {
            return new WorkerWPlacementTarget(
                WorkerWPlacementMode.None,
                IntPtr.Zero,
                IntPtr.Zero,
                IntPtr.Zero);
        }

        bool defViewInProgman = (defViewHost is not null && defViewHost.Handle == progmanHandle)
            || (defViewHost is null && progmanHandle != IntPtr.Zero);

        bool progmanHasWorkerWChild = progmanChildren.Any(
            c => string.Equals(c.ClassName, "WorkerW", StringComparison.Ordinal));

        // Windows 11 24H2+: raised Progman keeps SHELLDLL_DefView and spawns a child WorkerW inside Progman.
        if (defViewInProgman && progmanHasWorkerWChild && progmanHandle != IntPtr.Zero)
        {
            return new WorkerWPlacementTarget(
                WorkerWPlacementMode.ProgmanChildBehindDefView,
                progmanHandle,
                defViewHandle,
                defViewHandle);
        }

        // Windows 10 & Windows 11 (<24H2): sibling top-level WorkerW immediately behind the SHELLDLL_DefView host.
        if (defViewHostIndex >= 0)
        {
            for (int i = defViewHostIndex + 1; i < topLevelWindows.Count; i++)
            {
                WindowNodeSnapshot candidate = topLevelWindows[i];
                if (string.Equals(candidate.ClassName, "WorkerW", StringComparison.Ordinal)
                    && !candidate.HasShellDefViewChild)
                {
                    return new WorkerWPlacementTarget(
                        WorkerWPlacementMode.SiblingWorkerW,
                        candidate.Handle,
                        Win32Api.HWND_TOP,
                        defViewHandle);
                }
            }
        }

        // Fallback for Windows 11 24H2+ / single-Progman setups where no sibling WorkerW was spawned.
        if (defViewInProgman && progmanHandle != IntPtr.Zero)
        {
            return new WorkerWPlacementTarget(
                WorkerWPlacementMode.ProgmanChildBehindDefView,
                progmanHandle,
                defViewHandle,
                defViewHandle);
        }

        return new WorkerWPlacementTarget(
            WorkerWPlacementMode.None,
            IntPtr.Zero,
            IntPtr.Zero,
            defViewHandle);
    }

    public bool AttachToDesktop(IntPtr hostHandle, Rectangle targetPhysicalBounds)
    {
        if (hostHandle == IntPtr.Zero)
        {
            return false;
        }

        IntPtr progman = Win32Api.FindWindow("Progman", null);
        if (progman == IntPtr.Zero)
        {
            return false;
        }

        Win32Api.SendMessageTimeout(
            progman,
            Win32Api.WM_SPAWN_WORKERW,
            UIntPtr.Zero,
            IntPtr.Zero,
            Win32Api.SMTO_NORMAL,
            1000,
            out _);

        WorkerWPlacementTarget target = ResolveLiveTarget(progman);

        // Retry with Win11 24H2+ raised-Progman WPARAM/LPARAM if initial 0x052C didn't create a target.
        if (target.Mode == WorkerWPlacementMode.None)
        {
            Win32Api.SendMessageTimeout(
                progman,
                Win32Api.WM_SPAWN_WORKERW,
                new UIntPtr(0x0D),
                new IntPtr(0x01),
                Win32Api.SMTO_NORMAL,
                1000,
                out _);
            target = ResolveLiveTarget(progman);
        }

        if (target.Mode == WorkerWPlacementMode.None || target.ParentHandle == IntPtr.Zero)
        {
            return false;
        }

        ApplyWallpaperWindowStyles(hostHandle);
        Win32Api.SetParent(hostHandle, target.ParentHandle);
        PositionInParent(hostHandle, target, targetPhysicalBounds);

        _lastTarget = target;
        return true;
    }

    public void EnsureZOrderAndBounds(IntPtr hostHandle, Rectangle targetPhysicalBounds)
    {
        if (hostHandle == IntPtr.Zero)
        {
            return;
        }

        WorkerWPlacementTarget? target = _lastTarget;
        if (target is null || target.Mode == WorkerWPlacementMode.None || Win32Api.GetParent(hostHandle) != target.ParentHandle)
        {
            AttachToDesktop(hostHandle, targetPhysicalBounds);
            return;
        }

        if (target.Mode == WorkerWPlacementMode.ProgmanChildBehindDefView)
        {
            PositionInParent(hostHandle, target, targetPhysicalBounds);
        }
    }

    public void DetachToWindowed(IntPtr hostHandle, Rectangle windowedBounds)
    {
        if (hostHandle == IntPtr.Zero)
        {
            return;
        }

        Win32Api.SetParent(hostHandle, IntPtr.Zero);

        long style = Win32Api.GetWindowLongPtr(hostHandle, Win32Api.GWL_STYLE).ToInt64();
        style &= ~Win32Api.WS_CHILD;
        style |= Win32Api.WS_POPUP | Win32Api.WS_CAPTION | Win32Api.WS_THICKFRAME | Win32Api.WS_MINIMIZEBOX | Win32Api.WS_MAXIMIZEBOX | Win32Api.WS_SYSMENU;
        Win32Api.SetWindowLongPtr(hostHandle, Win32Api.GWL_STYLE, new IntPtr(style));

        long exStyle = Win32Api.GetWindowLongPtr(hostHandle, Win32Api.GWL_EXSTYLE).ToInt64();
        exStyle &= ~(Win32Api.WS_EX_NOACTIVATE | Win32Api.WS_EX_TOOLWINDOW);
        exStyle |= Win32Api.WS_EX_APPWINDOW;
        Win32Api.SetWindowLongPtr(hostHandle, Win32Api.GWL_EXSTYLE, new IntPtr(exStyle));

        Win32Api.SetWindowPos(
            hostHandle,
            Win32Api.HWND_TOP,
            windowedBounds.X,
            windowedBounds.Y,
            windowedBounds.Width,
            windowedBounds.Height,
            Win32Api.SWP_SHOWWINDOW | Win32Api.SWP_FRAMECHANGED);

        _lastTarget = null;
    }

    private static void ApplyWallpaperWindowStyles(IntPtr hostHandle)
    {
        long style = Win32Api.GetWindowLongPtr(hostHandle, Win32Api.GWL_STYLE).ToInt64();
        style &= ~(Win32Api.WS_CAPTION | Win32Api.WS_THICKFRAME | Win32Api.WS_MINIMIZEBOX | Win32Api.WS_MAXIMIZEBOX | Win32Api.WS_SYSMENU);
        style |= Win32Api.WS_POPUP | Win32Api.WS_VISIBLE;
        Win32Api.SetWindowLongPtr(hostHandle, Win32Api.GWL_STYLE, new IntPtr(style));

        long exStyle = Win32Api.GetWindowLongPtr(hostHandle, Win32Api.GWL_EXSTYLE).ToInt64();
        exStyle &= ~Win32Api.WS_EX_APPWINDOW;
        exStyle |= Win32Api.WS_EX_NOACTIVATE | Win32Api.WS_EX_TOOLWINDOW;
        Win32Api.SetWindowLongPtr(hostHandle, Win32Api.GWL_EXSTYLE, new IntPtr(exStyle));
    }

    private static void PositionInParent(IntPtr hostHandle, WorkerWPlacementTarget target, Rectangle targetPhysicalBounds)
    {
        Win32Api.POINT topLeft = new(targetPhysicalBounds.Left, targetPhysicalBounds.Top);
        Win32Api.ScreenToClient(target.ParentHandle, ref topLeft);

        Win32Api.SetWindowPos(
            hostHandle,
            target.InsertAfterHandle,
            topLeft.X,
            topLeft.Y,
            targetPhysicalBounds.Width,
            targetPhysicalBounds.Height,
            Win32Api.SWP_NOACTIVATE | Win32Api.SWP_SHOWWINDOW | Win32Api.SWP_FRAMECHANGED);
    }

    private static WorkerWPlacementTarget ResolveLiveTarget(IntPtr progman)
    {
        List<WindowNodeSnapshot> topLevel = new();
        Win32Api.EnumWindows((hWnd, _) =>
        {
            string className = Win32Api.ReadClassName(hWnd);
            IntPtr defView = Win32Api.FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null);
            topLevel.Add(new WindowNodeSnapshot(
                Handle: hWnd,
                ParentHandle: IntPtr.Zero,
                ClassName: className,
                HasShellDefViewChild: defView != IntPtr.Zero,
                ShellDefViewHandle: defView,
                IsVisible: Win32Api.IsWindowVisible(hWnd)));
            return true;
        }, IntPtr.Zero);

        List<WindowNodeSnapshot> progmanChildren = new();
        Win32Api.EnumChildWindows(progman, (hChild, _) =>
        {
            if (Win32Api.GetParent(hChild) == progman)
            {
                progmanChildren.Add(new WindowNodeSnapshot(
                    Handle: hChild,
                    ParentHandle: progman,
                    ClassName: Win32Api.ReadClassName(hChild),
                    HasShellDefViewChild: false,
                    ShellDefViewHandle: IntPtr.Zero,
                    IsVisible: Win32Api.IsWindowVisible(hChild)));
            }
            return true;
        }, IntPtr.Zero);

        return SelectPlacementTarget(topLevel, progmanChildren, progman);
    }
}
