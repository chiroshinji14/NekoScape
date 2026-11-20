using System.Drawing;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using NekoScape.Host.Native;

namespace NekoScape.Host.Bridge;

public sealed class WebViewHost : Form
{
    public const string VirtualHostName = "nekoscape.local";
    private static readonly Color EspressoBackColor = Color.FromArgb(255, 36, 25, 19);

    private sealed class SafeWebView2 : WebView2
    {
        protected override void OnSizeChanged(EventArgs e)
        {
            if (IsDisposed || Disposing || !IsHandleCreated)
            {
                return;
            }

            try
            {
                base.OnSizeChanged(e);
            }
            catch (InvalidOperationException)
            {
            }
            catch (COMException)
            {
            }
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            if (IsDisposed || Disposing)
            {
                return;
            }

            try
            {
                base.OnVisibleChanged(e);
            }
            catch (InvalidOperationException)
            {
            }
            catch (COMException)
            {
            }
        }

        protected override void OnParentChanged(EventArgs e)
        {
            if (IsDisposed || Disposing)
            {
                return;
            }

            try
            {
                base.OnParentChanged(e);
            }
            catch (InvalidOperationException)
            {
            }
            catch (COMException)
            {
            }
        }
    }

    private readonly WebView2 _webView;
    private readonly IpcChannel _ipc;
    private readonly string? _devUrl;
    private readonly WorkerWManager _workerWManager;
    private CancellationTokenSource? _suspendCts;
    private bool _isWindowedMode;
    private bool _isInitialized;
    private bool _isOccludedPaused;
    private bool _isUserPaused;
    private bool _desktopRestoredOnExit;
    private Rectangle _targetPhysicalBounds;
    private Rectangle _windowedBounds = new(160, 90, 1280, 720);

    public IpcChannel Ipc => _ipc;
    public bool IsWindowedMode => _isWindowedMode;
    public bool IsPaused => _isOccludedPaused || _isUserPaused;

    public event Action? DisplayChanged;
    public event Action? UserClosedWindow;

    public WebViewHost(
        IpcChannel ipc,
        WorkerWManager workerWManager,
        Rectangle initialMonitorBounds,
        bool windowedMode,
        string? devUrl)
    {
        _ipc = ipc;
        _workerWManager = workerWManager;
        _targetPhysicalBounds = initialMonitorBounds;
        _isWindowedMode = windowedMode;
        _devUrl = devUrl;

        Text = "NekoScape";
        BackColor = EspressoBackColor;
        StartPosition = FormStartPosition.Manual;
        KeyPreview = false;

        if (_isWindowedMode)
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            ShowInTaskbar = true;
            MinimumSize = new Size(640, 480);
            Bounds = CenterInBounds(initialMonitorBounds, 1280, 720);
            _windowedBounds = Bounds;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            MinimumSize = Size.Empty;
            Bounds = initialMonitorBounds;
        }

        _webView = new SafeWebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = EspressoBackColor
        };
        Controls.Add(_webView);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (_isWindowedMode)
        {
            Win32Api.TryEnableDarkTitleBar(Handle);
        }
    }

    protected override async void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (_isWindowedMode && !IsDisposed)
        {
            await SetOccludedAsync(WindowState == FormWindowState.Minimized);
        }
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            if (!_isWindowedMode)
            {
                cp.ExStyle |= unchecked((int)(Win32Api.WS_EX_NOACTIVATE | Win32Api.WS_EX_TOOLWINDOW));
                cp.ExStyle &= unchecked((int)~Win32Api.WS_EX_APPWINDOW);
            }
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => !_isWindowedMode;

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);

        await InitializeWebViewAsync();

        if (!_isWindowedMode && !IsDisposed && IsHandleCreated)
        {
            _workerWManager.AttachToDesktop(Handle, _targetPhysicalBounds);
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!_isWindowedMode && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            return;
        }

        if (_isWindowedMode && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            UserClosedWindow?.Invoke();
            return;
        }

        base.OnFormClosing(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Win32Api.WM_SYSCOMMAND && !_isWindowedMode)
        {
            int cmd = m.WParam.ToInt32() & 0xFFF0;
            if (cmd == Win32Api.SC_MINIMIZE)
            {
                return;
            }
        }
        else if (m.Msg == Win32Api.WM_DISPLAYCHANGE)
        {
            DisplayChanged?.Invoke();
        }

        base.WndProc(ref m);
    }

    public (int OriginX, int OriginY, double DpiScale) GetRenderCoordinateOrigin()
    {
        double dpiScale = Handle != IntPtr.Zero ? SysListViewReader.GetMonitorDpiScale(Handle) : 1.0;

        if (_isWindowedMode && _webView.IsHandleCreated)
        {
            Point topLeft = _webView.PointToScreen(Point.Empty);
            return (topLeft.X, topLeft.Y, dpiScale);
        }

        return (_targetPhysicalBounds.Left, _targetPhysicalBounds.Top, dpiScale);
    }

    public (double Width, double Height) GetLogicalViewportSize()
    {
        double dpiScale = Handle != IntPtr.Zero ? SysListViewReader.GetMonitorDpiScale(Handle) : 1.0;
        double safeScale = dpiScale > 0 ? dpiScale : 1.0;

        if (_isWindowedMode && _webView.IsHandleCreated)
        {
            Size client = _webView.ClientSize;
            return (client.Width / safeScale, client.Height / safeScale);
        }

        return (_targetPhysicalBounds.Width / safeScale, _targetPhysicalBounds.Height / safeScale);
    }

    public void UpdateWallpaperMonitorBounds(Rectangle monitorPhysicalBounds)
    {
        _targetPhysicalBounds = monitorPhysicalBounds;
        if (!_isWindowedMode && IsHandleCreated)
        {
            _workerWManager.AttachToDesktop(Handle, _targetPhysicalBounds);
        }
    }

    public void EnsureDesktopZOrder()
    {
        if (!_isWindowedMode && IsHandleCreated)
        {
            _workerWManager.EnsureZOrderAndBounds(Handle, _targetPhysicalBounds);
        }
    }

    public void SetWindowedMode(bool windowed, Rectangle monitorPhysicalBounds)
    {
        _targetPhysicalBounds = monitorPhysicalBounds;
        if (_isWindowedMode == windowed || !IsHandleCreated)
        {
            _isWindowedMode = windowed;
            return;
        }

        _isWindowedMode = windowed;
        if (windowed)
        {
            MinimumSize = new Size(640, 480);
            _windowedBounds = CenterInBounds(monitorPhysicalBounds, 1280, 720);
            _workerWManager.DetachToWindowed(Handle, _windowedBounds);
            Win32Api.TryEnableDarkTitleBar(Handle);
            _ = SetOccludedAsync(false);
            Activate();
        }
        else
        {
            MinimumSize = Size.Empty;
            _windowedBounds = Bounds;
            _workerWManager.AttachToDesktop(Handle, monitorPhysicalBounds);
        }
    }

    public async Task SetOccludedAsync(bool occluded)
    {
        if (_isOccludedPaused == occluded)
        {
            return;
        }

        _isOccludedPaused = occluded;
        await ApplyPowerStateAsync();
    }

    public async Task SetUserPausedAsync(bool paused)
    {
        if (_isUserPaused == paused)
        {
            return;
        }

        _isUserPaused = paused;
        await ApplyPowerStateAsync();
    }

    private Task ApplyPowerStateAsync()
    {
        if (!_isInitialized || _webView.CoreWebView2 is null || IsDisposed)
        {
            return Task.CompletedTask;
        }

        _suspendCts?.Cancel();
        _suspendCts?.Dispose();
        _suspendCts = null;

        bool shouldPause = _isOccludedPaused || _isUserPaused;
        string reason = _isUserPaused
            ? PowerReasons.User
            : (_isOccludedPaused ? PowerReasons.Occluded : PowerReasons.Active);

        // Keep WebView2 visible at all times so its DirectComposition surface never tears down
        // or flashes black when windows are maximized/minimized. Pausing the PixiJS ticker via
        // POWER_STATE IPC already drops CPU/GPU frame rendering to zero while holding the last frame.
        try
        {
            _webView.CoreWebView2.IsMuted = shouldPause;
        }
        catch (Exception)
        {
        }

        _ipc.Send(new PowerStateMessage(shouldPause, reason));
        return Task.CompletedTask;
    }

    private async Task InitializeWebViewAsync()
    {
        if (_isInitialized || IsDisposed)
        {
            return;
        }

        string userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NekoScape",
            "WebView2");
        Directory.CreateDirectory(userDataFolder);

        CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await _webView.EnsureCoreWebView2Async(env);

        CoreWebView2 core = _webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsPinchZoomEnabled = false;
        core.Settings.IsSwipeNavigationEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.IsStatusBarEnabled = false;

        _ipc.Attach(core, this);
        _isInitialized = true;

        if (!string.IsNullOrWhiteSpace(_devUrl))
        {
            core.Navigate(_devUrl);
            return;
        }

        string? wwwFolder = ResolveWebRootDirectory();
        if (wwwFolder is not null)
        {
            core.SetVirtualHostNameToFolderMapping(
                VirtualHostName,
                wwwFolder,
                CoreWebView2HostResourceAccessKind.Allow);
            core.Navigate($"https://{VirtualHostName}/index.html");
            return;
        }

        core.NavigateToString(BuildMissingAssetsHtml());
    }

    public static string? ResolveWebRootDirectory()
    {
        string packagedWww = Path.Combine(AppContext.BaseDirectory, "www");
        if (File.Exists(Path.Combine(packagedWww, "index.html")))
        {
            return packagedWww;
        }

        DirectoryInfo? dir = new(AppContext.BaseDirectory);
        for (int i = 0; i < 6 && dir is not null; i++)
        {
            string devDist = Path.Combine(dir.FullName, "src", "Renderer.Web", "dist");
            if (File.Exists(Path.Combine(devDist, "index.html")))
            {
                return devDist;
            }
            dir = dir.Parent;
        }

        return null;
    }

    private static Rectangle CenterInBounds(Rectangle bounds, int width, int height)
    {
        int w = Math.Min(width, Math.Max(640, bounds.Width - 80));
        int h = Math.Min(height, Math.Max(480, bounds.Height - 80));
        int x = bounds.Left + (bounds.Width - w) / 2;
        int y = bounds.Top + (bounds.Height - h) / 2;
        return new Rectangle(x, y, w, h);
    }

    private static string BuildMissingAssetsHtml() =>
        """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>NekoScape</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #241913;
              color: #F6ECE1;
              font-family: 'Segoe UI Variable', system-ui, sans-serif;
            }
            .card {
              max-width: 520px;
              padding: 28px 32px;
              border-radius: 16px;
              background: rgba(46, 32, 24, 0.92);
              border: 1px solid rgba(246, 232, 214, 0.16);
            }
            h1 { margin: 0 0 12px; font-size: 20px; color: #E8A65D; }
            p { margin: 8px 0; color: #CBBBA9; line-height: 1.5; }
            code {
              font-family: 'Cascadia Mono', Consolas, monospace;
              background: rgba(0, 0, 0, 0.25);
              padding: 2px 6px;
              border-radius: 6px;
              color: #F6ECE1;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>NekoScape Renderer Bundle Not Found</h1>
            <p>Build the frontend bundle before launching in standalone mode:</p>
            <p><code>cd src/Renderer.Web &amp;&amp; npm run build</code></p>
            <p>Or pass a Vite dev server URL via <code>--dev-url http://localhost:5173</code>.</p>
          </div>
        </body>
        </html>
        """;

    public void RestoreDesktopWallpaper()
    {
        if (_desktopRestoredOnExit)
        {
            return;
        }
        _desktopRestoredOnExit = true;

        if (!_isWindowedMode)
        {
            IntPtr handle = IsHandleCreated ? Handle : IntPtr.Zero;
            _workerWManager.DetachAndRestoreWallpaper(handle);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            RestoreDesktopWallpaper();
            _suspendCts?.Cancel();
            _suspendCts?.Dispose();
            _ipc.Detach();
        }
        base.Dispose(disposing);
    }
}
