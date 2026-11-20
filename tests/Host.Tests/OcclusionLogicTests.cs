using NekoScape.Host.Bridge;
using NekoScape.Host.Hooks;
using NekoScape.Host.Native;
using Xunit;

namespace NekoScape.Host.Tests;

public sealed class OcclusionLogicTests
{
    private static readonly Win32Api.RECT Monitor1080p = new(0, 0, 1920, 1080);

    [Theory]
    [InlineData(Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY, true)]
    [InlineData(Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN, true)]
    [InlineData(Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE, true)]
    [InlineData(Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS, false)]
    public void IsOccluded_RespectsUserNotificationState(
        Win32Api.QUERY_USER_NOTIFICATION_STATE state,
        bool expectedOccluded)
    {
        bool result = OcclusionEvaluator.IsOccluded(
            Monitor1080p,
            state,
            Array.Empty<WindowBoundsSnapshot>());

        Assert.Equal(expectedOccluded, result);
    }

    [Fact]
    public void IsOccluded_Detects95PercentThreshold_AndSupportsSnappedWindows()
    {
        var ninetyFourPercent = new WindowBoundsSnapshot(
            new IntPtr(101),
            "Chrome_WidgetWin_1",
            new Win32Api.RECT(0, 0, 1920, 1015), // 1015 / 1080 = 0.9398
            IsVisible: true,
            IsMinimized: false,
            IsCloaked: false,
            IsSelf: false);

        Assert.False(OcclusionEvaluator.IsOccluded(
            Monitor1080p,
            Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS,
            [ninetyFourPercent]));

        var ninetySixPercent = ninetyFourPercent with { Bounds = new Win32Api.RECT(0, 0, 1920, 1040) }; // 1040 / 1080 = 0.963
        Assert.True(OcclusionEvaluator.IsOccluded(
            Monitor1080p,
            Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS,
            [ninetySixPercent]));

        // Two snapped side-by-side windows covering 100% together
        var leftHalf = new WindowBoundsSnapshot(
            new IntPtr(102), "Notepad", new Win32Api.RECT(0, 0, 960, 1080), true, false, false, false);
        var rightHalf = new WindowBoundsSnapshot(
            new IntPtr(103), "Code", new Win32Api.RECT(960, 0, 1920, 1080), true, false, false, false);

        Assert.True(OcclusionEvaluator.IsOccluded(
            Monitor1080p,
            Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS,
            [leftHalf, rightHalf]));
    }

    [Fact]
    public void IsOccluded_IgnoresShellWindows_Cloaked_Minimized_AndSelf()
    {
        var ignoredWindows = new[]
        {
            new WindowBoundsSnapshot(new IntPtr(1), "Progman", Monitor1080p, true, false, false, false),
            new WindowBoundsSnapshot(new IntPtr(2), "WorkerW", Monitor1080p, true, false, false, false),
            new WindowBoundsSnapshot(new IntPtr(3), "Shell_TrayWnd", Monitor1080p, true, false, false, false),
            new WindowBoundsSnapshot(new IntPtr(4), "ApplicationFrameWindow", Monitor1080p, true, false, true, false),
            new WindowBoundsSnapshot(new IntPtr(5), "Notepad", Monitor1080p, true, true, false, false),
            new WindowBoundsSnapshot(new IntPtr(6), "WindowsForms10.Window", Monitor1080p, true, false, false, true),
            new WindowBoundsSnapshot(new IntPtr(7), "Hidden", Monitor1080p, false, false, false, false)
        };

        Assert.False(OcclusionEvaluator.IsOccluded(
            Monitor1080p,
            Win32Api.QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS,
            ignoredWindows));
    }

    [Fact]
    public void WorkerW_SelectPlacementTarget_SupportsWin10SiblingWorkerW()
    {
        IntPtr progman = new(0x1000);
        IntPtr worker1 = new(0x2000);
        IntPtr worker2 = new(0x3000);
        IntPtr defView = new(0x4000);

        WindowNodeSnapshot[] topLevel =
        [
            new(progman, IntPtr.Zero, "Progman", HasShellDefViewChild: false, IntPtr.Zero),
            new(worker1, IntPtr.Zero, "WorkerW", HasShellDefViewChild: true, defView),
            new(worker2, IntPtr.Zero, "WorkerW", HasShellDefViewChild: false, IntPtr.Zero)
        ];

        WorkerWPlacementTarget target = WorkerWManager.SelectPlacementTarget(
            topLevel,
            Array.Empty<WindowNodeSnapshot>(),
            progman);

        Assert.Equal(WorkerWPlacementMode.SiblingWorkerW, target.Mode);
        Assert.Equal(worker2, target.ParentHandle);
        Assert.Equal(Win32Api.HWND_TOP, target.InsertAfterHandle);
        Assert.Equal(defView, target.ShellDefViewHandle);
    }

    [Fact]
    public void WorkerW_SelectPlacementTarget_SupportsWin11_24H2_ProgmanChildHierarchy()
    {
        IntPtr progman = new(0x1000);
        IntPtr defView = new(0x4000);
        IntPtr childWorker = new(0x5000);
        IntPtr unrelatedTopWorker = new(0x6000);

        WindowNodeSnapshot[] topLevel =
        [
            new(progman, IntPtr.Zero, "Progman", HasShellDefViewChild: true, defView),
            new(unrelatedTopWorker, IntPtr.Zero, "WorkerW", HasShellDefViewChild: false, IntPtr.Zero)
        ];

        WindowNodeSnapshot[] progmanChildren =
        [
            new(defView, progman, "SHELLDLL_DefView", HasShellDefViewChild: false, IntPtr.Zero),
            new(childWorker, progman, "WorkerW", HasShellDefViewChild: false, IntPtr.Zero)
        ];

        WorkerWPlacementTarget target = WorkerWManager.SelectPlacementTarget(
            topLevel,
            progmanChildren,
            progman);

        Assert.Equal(WorkerWPlacementMode.ProgmanChildBehindDefView, target.Mode);
        Assert.Equal(progman, target.ParentHandle);
        Assert.Equal(defView, target.InsertAfterHandle);
        Assert.Equal(defView, target.ShellDefViewHandle);
    }

    [Fact]
    public void WorkerW_SelectPlacementTarget_ReturnsNoneWhenShellMissing()
    {
        WorkerWPlacementTarget target = WorkerWManager.SelectPlacementTarget(
            Array.Empty<WindowNodeSnapshot>(),
            Array.Empty<WindowNodeSnapshot>(),
            IntPtr.Zero);

        Assert.Equal(WorkerWPlacementMode.None, target.Mode);
    }

    [Fact]
    public void RecycleBinStateTracker_DetectsEmptiedTransitionOnlyWhenDroppingToZero()
    {
        var tracker = new RecycleBinStateTracker();

        RecycleBinTransition initial = tracker.Evaluate(3);
        Assert.True(initial.ShouldEmit);
        Assert.False(initial.Emptied);
        Assert.Equal(3, initial.ItemCount);

        RecycleBinTransition unchanged = tracker.Evaluate(3);
        Assert.False(unchanged.ShouldEmit);

        RecycleBinTransition emptied = tracker.Evaluate(0);
        Assert.True(emptied.ShouldEmit);
        Assert.True(emptied.Emptied);
        Assert.Equal(0, emptied.ItemCount);

        RecycleBinTransition stillEmpty = tracker.Evaluate(0);
        Assert.False(stillEmpty.ShouldEmit);
    }

    [Fact]
    public void TypingActivityTracker_And_LaserHotkeyState_WorkAccurately()
    {
        var typing = new TypingActivityTracker(initialTimestampMs: 1000, windowMs: 15_000);
        typing.RecordKeystroke(2000);
        typing.RecordKeystroke(2500);
        typing.RecordKeystroke(3000);

        (double kpm, double idle) = typing.GetSnapshot(5000);
        Assert.Equal(12.0, kpm);
        Assert.Equal(2.0, idle);

        // Pointer movement updates idle time without adding fake keystrokes
        typing.RecordPointerActivity(10_000);
        (double kpmAfterMouse, double idleAfterMouse) = typing.GetSnapshot(11_000);
        Assert.Equal(12.0, kpmAfterMouse);
        Assert.Equal(1.0, idleAfterMouse);

        // Laser hotkey: Alt hold + Ctrl+Alt+L sticky toggle
        var laser = new LaserHotkeyState();
        Assert.False(laser.IsLaserActive(true));

        Assert.True(laser.ProcessKey(Win32Api.VK_LMENU, true, true));
        Assert.True(laser.IsLaserActive(true));

        Assert.True(laser.ProcessKey(Win32Api.VK_LMENU, false, true));
        Assert.False(laser.IsLaserActive(true));

        // Ctrl+Alt+L toggles sticky ON
        laser.ProcessKey(Win32Api.VK_LCONTROL, true, true);
        laser.ProcessKey(Win32Api.VK_LMENU, true, true);
        laser.ProcessKey(Win32Api.VK_L, true, true);
        laser.ProcessKey(Win32Api.VK_L, false, true);
        laser.ProcessKey(Win32Api.VK_LMENU, false, true);
        laser.ProcessKey(Win32Api.VK_LCONTROL, false, true);

        Assert.True(laser.StickyLaser);
        Assert.True(laser.IsLaserActive(true));
        Assert.False(laser.IsLaserActive(false));
    }

    [Fact]
    public void DesktopClickDetector_EmitsSingleAndDoubleClickOnEmptyDesktop_AndIgnoresIconsAndDrags()
    {
        var detector = new DesktopClickDetector();
        DesktopIconRect[] icons =
        [
            new DesktopIconRect(0, 32, 32, 76, 84, "Recycle Bin", IsRecycleBin: true),
            new DesktopIconRect(1, 32, 140, 76, 84, "Projects")
        ];

        // 1. Clean single click on empty wallpaper space
        detector.OnLeftButtonDown(400, 300, 1000, isOnDesktopSurface: true, icons, 1920, 1080);
        PointerClickMessage? click1 = detector.OnLeftButtonUp(402, 301, 1090, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.NotNull(click1);
        Assert.Equal(402, click1!.X);
        Assert.Equal(301, click1.Y);
        Assert.Equal(PointerButtons.Left, click1.Button);
        Assert.Null(click1.DoubleClick);

        // 2. Rapid second click near same location triggers doubleClick: true
        detector.OnLeftButtonDown(404, 302, 1200, isOnDesktopSurface: true, icons, 1920, 1080);
        PointerClickMessage? click2 = detector.OnLeftButtonUp(405, 302, 1260, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.NotNull(click2);
        Assert.True(click2!.DoubleClick);

        // 3. Click on a desktop icon is ignored so Explorer icon clicks/double-clicks are unaffected
        detector.OnLeftButtonDown(50, 60, 2000, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.Null(detector.OnLeftButtonUp(50, 60, 2080, isOnDesktopSurface: true, icons, 1920, 1080));

        // 4. Drag / marquee selection (> 8px movement) is ignored
        detector.OnLeftButtonDown(500, 500, 3000, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.Null(detector.OnLeftButtonUp(540, 520, 3150, isOnDesktopSurface: true, icons, 1920, 1080));

        // 5. Long press (> 450ms) is ignored
        detector.OnLeftButtonDown(600, 400, 4000, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.Null(detector.OnLeftButtonUp(600, 400, 4600, isOnDesktopSurface: true, icons, 1920, 1080));

        // 6. Click on a non-desktop window is ignored
        detector.OnLeftButtonDown(600, 400, 5000, isOnDesktopSurface: false, icons, 1920, 1080);
        Assert.Null(detector.OnLeftButtonUp(600, 400, 5080, isOnDesktopSurface: false, icons, 1920, 1080));

        // 7. Click outside monitor logical bounds is ignored
        detector.OnLeftButtonDown(-50, 200, 6000, isOnDesktopSurface: true, icons, 1920, 1080);
        Assert.Null(detector.OnLeftButtonUp(-50, 200, 6060, isOnDesktopSurface: true, icons, 1920, 1080));
    }

    [Fact]
    public void IsWindowOrDescendant_MatchesHostAndNestedWebViewChildren_AndRejectsOverlappingWindows()
    {
        IntPtr hostHwnd = new(0x1000);
        IntPtr webViewWrapper = new(0x1001);
        IntPtr chromeWidget = new(0x1002);
        IntPtr renderHost = new(0x1003);
        IntPtr overlappingApp = new(0x9000);

        var parents = new Dictionary<IntPtr, IntPtr>
        {
            [renderHost] = chromeWidget,
            [chromeWidget] = webViewWrapper,
            [webViewWrapper] = hostHwnd,
            [hostHwnd] = IntPtr.Zero,
            [overlappingApp] = IntPtr.Zero,
        };

        IntPtr GetParent(IntPtr h) => parents.TryGetValue(h, out IntPtr p) ? p : IntPtr.Zero;

        Assert.True(SystemTrayContext.IsWindowOrDescendant(hostHwnd, hostHwnd, GetParent));
        Assert.True(SystemTrayContext.IsWindowOrDescendant(renderHost, hostHwnd, GetParent));
        Assert.False(SystemTrayContext.IsWindowOrDescendant(overlappingApp, hostHwnd, GetParent));
        Assert.False(SystemTrayContext.IsWindowOrDescendant(IntPtr.Zero, hostHwnd, GetParent));
    }
}
