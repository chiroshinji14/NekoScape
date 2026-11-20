using System.Drawing;
using NekoScape.Host.Bridge;
using NekoScape.Host.Hooks;
using NekoScape.Host.Native;
using Xunit;

namespace NekoScape.Host.Tests;

public sealed class WindowLedgeTests
{
    [Fact]
    public void ComputeTaskbarRect_HandlesBottomTopLeftRightAndAutoHide_WithDpiScaling()
    {
        var monitor = new Rectangle(0, 0, 2880, 1620); // 1.5x of 1920x1080
        var bottomWork = new Rectangle(0, 0, 2880, 1548);
        DesktopIconRect? bottomBar = WindowLedgeEvaluator.ComputeTaskbarRect(monitor, bottomWork, 1.5);
        Assert.NotNull(bottomBar);
        Assert.Equal(0, bottomBar!.X);
        Assert.Equal(1032, bottomBar.Y);
        Assert.Equal(1920, bottomBar.Width);
        Assert.Equal(48, bottomBar.Height);
        Assert.Equal("Taskbar", bottomBar.Label);

        // Secondary monitor with negative origin & top taskbar
        var leftMonitor = new Rectangle(-1920, 0, 1920, 1080);
        var topBarWork = new Rectangle(-1920, 44, 1920, 1036);
        DesktopIconRect? topBar = WindowLedgeEvaluator.ComputeTaskbarRect(leftMonitor, topBarWork, 1.0);
        Assert.NotNull(topBar);
        Assert.Equal(0, topBar!.X);
        Assert.Equal(0, topBar.Y);
        Assert.Equal(1920, topBar.Width);
        Assert.Equal(44, topBar.Height);

        // Left & right taskbars
        var leftBarWork = new Rectangle(64, 0, 1856, 1080);
        DesktopIconRect? leftBar = WindowLedgeEvaluator.ComputeTaskbarRect(new Rectangle(0, 0, 1920, 1080), leftBarWork, 1.0);
        Assert.NotNull(leftBar);
        Assert.Equal(64, leftBar!.Width);
        Assert.Equal(1080, leftBar.Height);

        var rightBarWork = new Rectangle(0, 0, 1860, 1080);
        DesktopIconRect? rightBar = WindowLedgeEvaluator.ComputeTaskbarRect(new Rectangle(0, 0, 1920, 1080), rightBarWork, 1.0);
        Assert.NotNull(rightBar);
        Assert.Equal(1860, rightBar!.X);
        Assert.Equal(60, rightBar.Width);

        // Auto-hidden taskbar (working area equals monitor bounds)
        Assert.Null(WindowLedgeEvaluator.ComputeTaskbarRect(new Rectangle(0, 0, 1920, 1080), new Rectangle(0, 0, 1920, 1080), 1.0));
    }

    [Fact]
    public void ComputeWindowTopLedges_FiltersInvalidWindows_CapsAtSix_AndRespectsZOrderOcclusion()
    {
        var monitor = new Rectangle(0, 0, 2880, 1620); // 1.5x DPI -> 1920x1080 logical

        LedgeWindowSnapshot[] windows =
        [
            // Ignored shell/cloaked/minimized/self/tool/blank-title windows
            new(new IntPtr(1), "Shell_TrayWnd", "Taskbar", new Win32Api.RECT(0, 1548, 2880, 1620), true, false, false, false),
            new(new IntPtr(2), "AppWindow", "Cloaked", new Win32Api.RECT(100, 100, 1000, 800), true, false, true, false),
            new(new IntPtr(3), "AppWindow", "Minimized", new Win32Api.RECT(100, 100, 1000, 800), true, true, false, false),
            new(new IntPtr(4), "AppWindow", "Self", new Win32Api.RECT(100, 100, 1000, 800), true, false, false, true),
            new(new IntPtr(5), "AppWindow", "Tooltip", new Win32Api.RECT(100, 100, 500, 300), true, false, false, false, IsToolWindow: true),
            new(new IntPtr(6), "AppWindow", "   ", new Win32Api.RECT(100, 100, 800, 600), true, false, false, false),

            // Valid top-most window #1 (clipped on left edge, scaled by 1.5)
            new(new IntPtr(10), "Chrome_WidgetWin_1", "NekoScape Docs", new Win32Api.RECT(-150, 150, 1200, 1200), true, false, false, false),

            // Buried window #2 whose top strip lies completely behind window #1 -> should be skipped!
            new(new IntPtr(11), "Notepad", "Hidden Behind Chrome", new Win32Api.RECT(100, 240, 1000, 900), true, false, false, false),

            // Valid windows #2..#7 (tiled/cascaded upwards in Z-order so their top ledges are visible, 7 total -> capped at 6!)
            new(new IntPtr(12), "Code", "VS Code", new Win32Api.RECT(1350, 840, 2700, 1400), true, false, false, false),
            new(new IntPtr(13), "Terminal", "PowerShell", new Win32Api.RECT(1350, 680, 2700, 1200), true, false, false, false),
            new(new IntPtr(14), "Explorer", "Projects", new Win32Api.RECT(1350, 520, 2700, 1000), true, false, false, false),
            new(new IntPtr(15), "Spotify", "Music", new Win32Api.RECT(1350, 360, 2700, 800), true, false, false, false),
            new(new IntPtr(16), "Slack", "Team Chat", new Win32Api.RECT(1350, 200, 2700, 600), true, false, false, false),
            new(new IntPtr(17), "Calc", "Calculator", new Win32Api.RECT(1350, 100, 2700, 400), true, false, false, false),
        ];

        IReadOnlyList<DesktopIconRect> ledges = WindowLedgeEvaluator.ComputeWindowTopLedges(monitor, 1.5, windows);

        Assert.Equal(WindowLedgeEvaluator.MaxWindowLedges, ledges.Count);
        Assert.Equal("NekoScape Docs", ledges[0].Label);
        Assert.Equal(0, ledges[0].X);
        Assert.Equal(100, ledges[0].Y);
        Assert.Equal(800, ledges[0].Width);
        Assert.Equal(WindowLedgeEvaluator.LedgeHeightLogical, ledges[0].Height);

        Assert.DoesNotContain(ledges, l => l.Label == "Hidden Behind Chrome");
        Assert.Equal("VS Code", ledges[1].Label);
        Assert.Equal("Team Chat", ledges[5].Label);
    }

    [Fact]
    public void LedgesEqual_DetectsUnchangedVsChangedLedges()
    {
        var tb1 = new DesktopIconRect(-1, 0, 1032, 1920, 48, "Taskbar");
        var tb2 = new DesktopIconRect(-1, 0, 1033, 1920, 48, "Taskbar");
        var tbChanged = new DesktopIconRect(-1, 0, 1020, 1920, 60, "Taskbar");

        DesktopIconRect[] l1 = [new(1, 100, 80, 800, 12, "Editor")];
        DesktopIconRect[] l2 = [new(1, 100.5, 80.5, 800, 12, "Editor")];
        DesktopIconRect[] lRenamed = [new(1, 100, 80, 800, 12, "Browser")];

        Assert.True(WindowLedgeEvaluator.LedgesEqual(tb1, l1, tb2, l2));
        Assert.False(WindowLedgeEvaluator.LedgesEqual(tb1, l1, tbChanged, l1));
        Assert.False(WindowLedgeEvaluator.LedgesEqual(tb1, l1, tb1, lRenamed));
        Assert.False(WindowLedgeEvaluator.LedgesEqual(tb1, l1, null, l1));
    }
}
