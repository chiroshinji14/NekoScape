using System.Drawing;
using System.Drawing.Drawing2D;
using Microsoft.Win32;
using NekoScape.Host.Bridge;
using NekoScape.Host.Hooks;
using NekoScape.Host.Native;
using NekoScape.Host.Settings;

namespace NekoScape.Host;

public sealed class SystemTrayContext : ApplicationContext
{
    private readonly AppSettingsStore _settingsStore;
    private readonly IpcChannel _ipc;
    private readonly WorkerWManager _workerWManager;
    private readonly SysListViewReader _iconReader;
    private readonly WebViewHost _host;
    private readonly RawInputHook _rawInputHook;
    private readonly DesktopWatcher _desktopWatcher;
    private readonly OcclusionMonitor _occlusionMonitor;
    private readonly System.Windows.Forms.Timer _iconPollTimer;
    private readonly NotifyIcon _notifyIcon;
    private readonly Icon _trayIcon;
    private readonly int _monitorIndex;
    private readonly bool _startedWindowed;

    private readonly ToolStripMenuItem _laserMenuItem;
    private readonly ToolStripMenuItem _pauseMenuItem;
    private readonly ToolStripMenuItem _hudMenuItem;
    private readonly ToolStripMenuItem _toyDockMenuItem;
    private readonly ToolStripMenuItem _debugMenuItem;
    private readonly ToolStripMenuItem _windowedMenuItem;
    private readonly ToolStripMenuItem _sceneMenuItem;
    private readonly ToolStripMenuItem _sceneStudyItem;
    private readonly ToolStripMenuItem _sceneTatamiItem;
    private readonly ToolStripMenuItem _sceneGardenItem;
    private readonly ToolStripMenuItem _sceneCafeItem;
    private readonly ToolStripMenuItem _lightingMenuItem;
    private readonly ToolStripMenuItem _lightingAutoItem;
    private readonly ToolStripMenuItem _lightingDayItem;
    private readonly ToolStripMenuItem _lightingGoldenItem;
    private readonly ToolStripMenuItem _lightingNightItem;

    private NekoSettings _settings;
    private IReadOnlyList<DesktopIconRect> _latestIcons = Array.Empty<DesktopIconRect>();
    private double _latestDpiScale = 1.0;
    private bool _userPaused;
    private int _zOrderTickCounter;
    private int _latestActiveCats;
    private int _latestPounces;
    private SettingsDialog? _openSettingsDialog;
    private TrayFlyoutForm? _flyoutForm;
    private long _lastFlyoutDeactivatedTicks;
    private bool _wasLeftDown;
    private bool _isDesktopLeftSession;
    private int _rescanBusy;
    private bool _disposed;

    public SystemTrayContext(HostLaunchOptions options)
    {
        _monitorIndex = options.MonitorIndex;
        _startedWindowed = options.Windowed;

        _settingsStore = new AppSettingsStore();
        _settings = _settingsStore.Current.Clone();
        if (!_settingsStore.HasExplicitUserSetting("showToyDock"))
        {
            _settings.ShowToyDock = false;
        }

        _ipc = new IpcChannel();
        _workerWManager = new WorkerWManager();
        _iconReader = new SysListViewReader();

        Rectangle monitorBounds = GetTargetMonitorBounds();
        _host = new WebViewHost(_ipc, _workerWManager, monitorBounds, options.Windowed, options.DevUrl);

        _rawInputHook = new RawInputHook(
            () => _host.GetRenderCoordinateOrigin(),
            () => _settings.EnableLaserHotkey);
        _desktopWatcher = new DesktopWatcher();
        _occlusionMonitor = new OcclusionMonitor(
            GetTargetMonitorBounds,
            () => _host.IsHandleCreated ? _host.Handle : IntPtr.Zero);

        _trayIcon = CreateCatSilhouetteIcon();
        _laserMenuItem = new ToolStripMenuItem("Toggle Laser Mode", null, (_, _) => OnToggleLaser());
        _pauseMenuItem = new ToolStripMenuItem("Pause Wallpaper", null, async (_, _) => await OnTogglePauseAsync());
        _hudMenuItem = new ToolStripMenuItem("Toggle HUD", null, (_, _) => OnToggleHud())
        {
            Checked = _settings.ShowHud
        };
        _toyDockMenuItem = new ToolStripMenuItem("Show On-Wallpaper Web Dock", null, (_, _) => OnToggleToyDock())
        {
            Checked = _settings.ShowToyDock
        };
        _debugMenuItem = new ToolStripMenuItem("Toggle Debug Wireframes", null, (_, _) => OnToggleDebug())
        {
            Checked = _settings.DebugMode
        };
        _windowedMenuItem = new ToolStripMenuItem("Windowed Preview Mode", null, (_, _) => OnToggleWindowed())
        {
            Checked = options.Windowed
        };

        _sceneStudyItem = new ToolStripMenuItem("Golden Study", null, (_, _) => OnSetSceneTheme("study"));
        _sceneTatamiItem = new ToolStripMenuItem("Kyoto Tatami", null, (_, _) => OnSetSceneTheme("tatami"));
        _sceneGardenItem = new ToolStripMenuItem("Sunlit Courtyard", null, (_, _) => OnSetSceneTheme("garden"));
        _sceneCafeItem = new ToolStripMenuItem("Cat Cafe Tile", null, (_, _) => OnSetSceneTheme("cafe"));
        _sceneMenuItem = new ToolStripMenuItem("Scene", null,
        [
            _sceneStudyItem,
            _sceneTatamiItem,
            _sceneGardenItem,
            _sceneCafeItem
        ]);
        UpdateSceneMenuChecks();

        _lightingAutoItem = new ToolStripMenuItem("Auto", null, (_, _) => OnSetLightingMode("auto"));
        _lightingDayItem = new ToolStripMenuItem("Day", null, (_, _) => OnSetLightingMode("day"));
        _lightingGoldenItem = new ToolStripMenuItem("Golden", null, (_, _) => OnSetLightingMode("golden"));
        _lightingNightItem = new ToolStripMenuItem("Night", null, (_, _) => OnSetLightingMode("night"));
        _lightingMenuItem = new ToolStripMenuItem("Lighting", null,
        [
            _lightingAutoItem,
            _lightingDayItem,
            _lightingGoldenItem,
            _lightingNightItem
        ]);
        UpdateLightingMenuChecks();

        var contextMenu = new ContextMenuStrip();
        contextMenu.Items.Add("Settings\u2026", null, (_, _) => OpenSettingsDialog());
        contextMenu.Items.Add(_laserMenuItem);
        contextMenu.Items.Add("Rescan Desktop Icons", null, (_, _) => RescanIcons(forceSend: true, sendSpawnAction: true));
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add(_pauseMenuItem);
        contextMenu.Items.Add(_hudMenuItem);
        contextMenu.Items.Add(_toyDockMenuItem);
        contextMenu.Items.Add(_debugMenuItem);
        contextMenu.Items.Add(_sceneMenuItem);
        contextMenu.Items.Add(_lightingMenuItem);
        contextMenu.Items.Add(_windowedMenuItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add("Exit", null, (_, _) => ExitApplication());

        _notifyIcon = new NotifyIcon
        {
            Icon = _trayIcon,
            Text = "NekoScape",
            ContextMenuStrip = contextMenu,
            Visible = true
        };
        _notifyIcon.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                ToggleFlyout();
            }
        };
        _notifyIcon.DoubleClick += (_, _) =>
        {
            CloseFlyout();
            OpenSettingsDialog();
        };

        WireEvents();

        _iconPollTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _iconPollTimer.Tick += (_, _) => OnIconPollTick();
        _iconPollTimer.Start();

        _host.Show();
    }

    private void WireEvents()
    {
        _ipc.ReadyReceived += _ =>
        {
            _ipc.Send(new SettingsUpdateMessage(_settings.Clone()));
            RescanIcons(forceSend: true, sendSpawnAction: false);
            _desktopWatcher.PollRecycleBin();
            _ipc.Send(new PowerStateMessage(_host.IsPaused, _userPaused ? PowerReasons.User : PowerReasons.Active));
        };

        _ipc.IconRescanRequested += _req =>
        {
            RescanIcons(forceSend: false, sendSpawnAction: false);
            _ = SchedulePostDropIconRescansAsync();
        };

        _ipc.StatsUpdated += stats =>
        {
            _latestActiveCats = stats.ActiveCats + stats.NappingCats;
            _latestPounces = stats.Pounces;
            string status = stats.Paused
                ? "NekoScape (Paused)"
                : $"NekoScape | {stats.ActiveCats} active, {stats.Pounces} pounces";
            if (status.Length > 63)
            {
                status = status[..63];
            }
            if (!_disposed)
            {
                _notifyIcon.Text = status;
                RefreshFlyoutState();
            }
        };

        _rawInputHook.MouseStateEmitted += msg =>
        {
            bool laserChanged = _laserMenuItem.Checked != msg.LaserMode;
            _laserMenuItem.Checked = msg.LaserMode;
            if (laserChanged)
            {
                RefreshFlyoutState();
            }

            if (msg.Buttons.Left && !_wasLeftDown)
            {
                _isDesktopLeftSession = IsCursorOnDesktopWindow();
            }
            else if (!msg.Buttons.Left && _wasLeftDown)
            {
                bool endedDesktopDrag = _isDesktopLeftSession;
                _isDesktopLeftSession = false;
                if (endedDesktopDrag)
                {
                    _ = SchedulePostDropIconRescansAsync();
                }
            }
            _wasLeftDown = msg.Buttons.Left;

            if (!_host.IsPaused)
            {
                bool effectiveLeft = msg.Buttons.Left && _isDesktopLeftSession;
                MouseRawMessage effectiveMsg = effectiveLeft == msg.Buttons.Left
                    ? msg
                    : msg with { Buttons = msg.Buttons with { Left = false } };
                _ipc.Send(effectiveMsg);
            }
        };

        _rawInputHook.TypingActivityEmitted += msg =>
        {
            if (!_host.IsPaused)
            {
                _ipc.Send(msg);
            }
        };

        _desktopWatcher.NewFileDetected += fileName =>
        {
            if (!_settings.EnableShellReactions || _disposed)
            {
                return;
            }

            InvokeOnUi(() =>
            {
                RescanIcons(forceSend: true, sendSpawnAction: false);
                DesktopIconRect? matched = FindIconByFileName(_latestIcons, fileName);
                _ipc.Send(new NewFileEventMessage(fileName, matched));
            });
        };

        _desktopWatcher.RecycleBinChanged += (itemCount, emptied) =>
        {
            if (!_settings.EnableShellReactions || _disposed)
            {
                return;
            }

            InvokeOnUi(() =>
            {
                DesktopIconRect? bin = _latestIcons.FirstOrDefault(i => i.IsRecycleBin);
                RectDto? binRect = bin is not null
                    ? new RectDto(bin.X, bin.Y, bin.Width, bin.Height)
                    : null;
                _ipc.Send(new RecycleBinEventMessage(itemCount, emptied, binRect));
            });
        };

        _occlusionMonitor.OcclusionChanged += occluded =>
        {
            if (_disposed)
            {
                return;
            }

            InvokeOnUi(async () =>
            {
                if (!_disposed)
                {
                    await _host.SetOccludedAsync(occluded);
                }
            });
        };

        _host.DisplayChanged += () => InvokeOnUi(HandleDisplayChanged);
        _host.UserClosedWindow += () =>
        {
            if (_startedWindowed)
            {
                ExitApplication();
            }
            else
            {
                OnToggleWindowed();
            }
        };

        SystemEvents.DisplaySettingsChanged += OnSystemDisplaySettingsChanged;
        Application.ApplicationExit += OnApplicationOrProcessExit;
        AppDomain.CurrentDomain.ProcessExit += OnApplicationOrProcessExit;
    }

    private void OnSystemDisplaySettingsChanged(object? sender, EventArgs e)
    {
        InvokeOnUi(HandleDisplayChanged);
    }

    private void HandleDisplayChanged()
    {
        if (_disposed)
        {
            return;
        }

        _host.UpdateWallpaperMonitorBounds(GetTargetMonitorBounds());
        RescanIcons(forceSend: true, sendSpawnAction: false);
    }

    private void OnIconPollTick()
    {
        if (_disposed || _host.IsPaused)
        {
            return;
        }

        // Skip SysListView32 polling while the user is holding the left mouse button down
        // so we never contend with Explorer's OLE DoDragDrop loop during folder dragging.
        if (!_wasLeftDown)
        {
            RescanIcons(forceSend: false, sendSpawnAction: false);
        }

        _zOrderTickCounter++;
        if (_zOrderTickCounter >= 3)
        {
            _zOrderTickCounter = 0;
            _host.EnsureDesktopZOrder();
        }
    }

    private void RescanIcons(bool forceSend, bool sendSpawnAction)
    {
        if (_disposed)
        {
            return;
        }

        if (!forceSend && Interlocked.CompareExchange(ref _rescanBusy, 1, 0) != 0)
        {
            return;
        }

        Rectangle monitorBounds = GetTargetMonitorBounds();
        double dpiScale = _host.IsHandleCreated ? SysListViewReader.GetMonitorDpiScale(_host.Handle) : 1.0;

        _ = Task.Run(() =>
        {
            try
            {
                IReadOnlyList<DesktopIconRect> scanned = _iconReader.ReadIcons(monitorBounds, dpiScale);
                if (_disposed)
                {
                    return;
                }

                InvokeOnUi(() =>
                {
                    if (_disposed)
                    {
                        return;
                    }

                    bool changed = forceSend
                        || Math.Abs(dpiScale - _latestDpiScale) > 0.001
                        || !IconsEqual(_latestIcons, scanned);

                    _latestIcons = scanned;
                    _latestDpiScale = dpiScale;

                    if (changed)
                    {
                        _ipc.Send(new IconUpdateMessage(
                            Timestamp: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                            DpiScale: dpiScale,
                            Icons: scanned));
                    }

                    if (sendSpawnAction)
                    {
                        _ipc.Send(new SpawnActionMessage(SpawnActions.RescanIcons));
                    }
                });
            }
            catch (Exception)
            {
            }
            finally
            {
                Interlocked.Exchange(ref _rescanBusy, 0);
            }
        });
    }

    private bool IsCursorOnDesktopWindow()
    {
        if (_host.IsWindowedMode)
        {
            return true;
        }

        if (!Win32Api.GetCursorPos(out Win32Api.POINT pt))
        {
            return false;
        }

        IntPtr hWnd = Win32Api.WindowFromPoint(pt);
        IntPtr current = hWnd;
        for (int depth = 0; depth < 4 && current != IntPtr.Zero; depth++)
        {
            if (_host.IsHandleCreated && current == _host.Handle)
            {
                return true;
            }

            string cls = Win32Api.ReadClassName(current);
            if (string.Equals(cls, "SysListView32", StringComparison.OrdinalIgnoreCase)
                || string.Equals(cls, "SHELLDLL_DefView", StringComparison.OrdinalIgnoreCase)
                || string.Equals(cls, "WorkerW", StringComparison.OrdinalIgnoreCase)
                || string.Equals(cls, "Progman", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            current = Win32Api.GetParent(current);
        }

        return false;
    }

    private async Task SchedulePostDropIconRescansAsync()
    {
        try
        {
            await Task.Delay(90);
            if (!_disposed)
            {
                InvokeOnUi(() => RescanIcons(forceSend: false, sendSpawnAction: false));
            }

            await Task.Delay(150);
            if (!_disposed)
            {
                InvokeOnUi(() => RescanIcons(forceSend: false, sendSpawnAction: false));
            }
        }
        catch (Exception)
        {
        }
    }

    private void OpenSettingsDialog()
    {
        CloseFlyout();

        if (_openSettingsDialog is not null && !_openSettingsDialog.IsDisposed)
        {
            Win32Api.SetForegroundWindow(_openSettingsDialog.Handle);
            _openSettingsDialog.Activate();
            return;
        }

        _openSettingsDialog = new SettingsDialog(_settings);
        _openSettingsDialog.SettingsApplied += ApplyAndSaveSettings;
        _openSettingsDialog.RescanIconsRequested += () => RescanIcons(forceSend: true, sendSpawnAction: true);
        _openSettingsDialog.FormClosed += (_, _) => _openSettingsDialog = null;
        _openSettingsDialog.Show();
        Win32Api.SetForegroundWindow(_openSettingsDialog.Handle);
        _openSettingsDialog.Activate();
    }

    private void ApplyAndSaveSettings(NekoSettings updated)
    {
        _settings = _settingsStore.Save(updated);
        _hudMenuItem.Checked = _settings.ShowHud;
        _toyDockMenuItem.Checked = _settings.ShowToyDock;
        _debugMenuItem.Checked = _settings.DebugMode;
        UpdateSceneMenuChecks();
        UpdateLightingMenuChecks();
        if (!_settings.EnableLaserHotkey)
        {
            _rawInputHook.SetStickyLaser(false);
            _laserMenuItem.Checked = false;
        }
        _ipc.Send(new SettingsUpdateMessage(_settings.Clone()));
        if (_openSettingsDialog is not null && !_openSettingsDialog.IsDisposed)
        {
            _openSettingsDialog.SyncFromSettings(_settings);
        }
        RefreshFlyoutState();
    }

    private void OnSetSceneTheme(string theme)
    {
        _settings.SceneTheme = NekoSettings.NormalizeSceneTheme(theme);
        ApplyAndSaveSettings(_settings);
    }

    private void UpdateSceneMenuChecks()
    {
        string theme = NekoSettings.NormalizeSceneTheme(_settings.SceneTheme);
        _sceneStudyItem.Checked = theme == "study";
        _sceneTatamiItem.Checked = theme == "tatami";
        _sceneGardenItem.Checked = theme == "garden";
        _sceneCafeItem.Checked = theme == "cafe";
    }

    private void OnSetLightingMode(string mode)
    {
        _settings.LightingMode = NekoSettings.NormalizeLightingMode(mode);
        ApplyAndSaveSettings(_settings);
    }

    private void UpdateLightingMenuChecks()
    {
        string mode = NekoSettings.NormalizeLightingMode(_settings.LightingMode);
        _lightingAutoItem.Checked = mode == "auto";
        _lightingDayItem.Checked = mode == "day";
        _lightingGoldenItem.Checked = mode == "golden";
        _lightingNightItem.Checked = mode == "night";
    }

    private void OnSetCatCount(int count)
    {
        _settings.CatCount = Math.Clamp(count, 1, 12);
        ApplyAndSaveSettings(_settings);
    }

    private void OnToggleLaser()
    {
        if (!_settings.EnableLaserHotkey)
        {
            _settings.EnableLaserHotkey = true;
            ApplyAndSaveSettings(_settings);
        }

        bool active = _rawInputHook.ToggleStickyLaser();
        _laserMenuItem.Checked = active;
        _ipc.Send(new SpawnActionMessage(SpawnActions.ToggleLaser));
        RefreshFlyoutState();
    }

    private void OnTossYarn()
    {
        _ipc.Send(new SpawnActionMessage(SpawnActions.ResetYarn));
    }

    private void OnToggleBox()
    {
        _ipc.Send(new SpawnActionMessage(SpawnActions.ToggleBox));
    }

    private async Task OnTogglePauseAsync()
    {
        _userPaused = !_userPaused;
        _pauseMenuItem.Text = _userPaused ? "Resume Wallpaper" : "Pause Wallpaper";
        _pauseMenuItem.Checked = _userPaused;
        RefreshFlyoutState();
        await _host.SetUserPausedAsync(_userPaused);
        RefreshFlyoutState();
    }

    private void OnToggleHud()
    {
        _settings.ShowHud = !_settings.ShowHud;
        ApplyAndSaveSettings(_settings);
    }

    private void OnToggleToyDock()
    {
        _settings.ShowToyDock = !_settings.ShowToyDock;
        ApplyAndSaveSettings(_settings);
    }

    private void OnToggleDebug()
    {
        _settings.DebugMode = !_settings.DebugMode;
        ApplyAndSaveSettings(_settings);
    }

    private void ToggleFlyout()
    {
        if (_disposed)
        {
            return;
        }

        if (_flyoutForm is { IsDisposed: false, Visible: true })
        {
            CloseFlyout();
            return;
        }

        if (Environment.TickCount64 - _lastFlyoutDeactivatedTicks <= 300)
        {
            return;
        }

        var flyout = new TrayFlyoutForm(BuildFlyoutState());
        flyout.SceneSelected += OnSetSceneTheme;
        flyout.LightingSelected += OnSetLightingMode;
        flyout.CatCountChanged += OnSetCatCount;
        flyout.ToggleLaserRequested += OnToggleLaser;
        flyout.TossYarnRequested += OnTossYarn;
        flyout.ToggleBoxRequested += OnToggleBox;
        flyout.RescanIconsRequested += () => RescanIcons(forceSend: true, sendSpawnAction: true);
        flyout.ToggleWebDockRequested += OnToggleToyDock;
        flyout.TogglePauseRequested += () => _ = OnTogglePauseSafeAsync();
        flyout.OpenSettingsRequested += OpenSettingsDialog;
        flyout.SettingsMutated += ApplyAndSaveSettings;
        flyout.Deactivate += (_, _) => _lastFlyoutDeactivatedTicks = Environment.TickCount64;
        flyout.FormClosed += (_, _) =>
        {
            if (ReferenceEquals(_flyoutForm, flyout))
            {
                _flyoutForm = null;
            }
            flyout.Dispose();
        };

        _flyoutForm = flyout;
        flyout.PrepareAnchor(Cursor.Position);
        flyout.Show();
        Win32Api.SetForegroundWindow(flyout.Handle);
        flyout.Activate();
    }

    private async Task OnTogglePauseSafeAsync()
    {
        try
        {
            await OnTogglePauseAsync();
        }
        catch (Exception)
        {
            // Ignore shutdown races if host is disposing mid-toggle.
        }
    }

    private void CloseFlyout()
    {
        if (_flyoutForm is { IsDisposed: false })
        {
            _flyoutForm.Close();
        }
    }

    private void RefreshFlyoutState()
    {
        if (_flyoutForm is { IsDisposed: false, Visible: true })
        {
            _flyoutForm.UpdateState(BuildFlyoutState());
        }
    }

    private TrayFlyoutState BuildFlyoutState() => new(
        Settings: _settings.Clone(),
        LaserActive: _rawInputHook.IsLaserActive,
        Paused: _userPaused || _host.IsPaused,
        ActiveCats: _latestActiveCats > 0 ? _latestActiveCats : _settings.CatCount,
        Pounces: _latestPounces);

    private void OnToggleWindowed()
    {
        bool nextWindowed = !_host.IsWindowedMode;
        _host.SetWindowedMode(nextWindowed, GetTargetMonitorBounds());
        _windowedMenuItem.Checked = nextWindowed;
    }

    private Rectangle GetTargetMonitorBounds()
    {
        Screen[] screens = Screen.AllScreens;
        if (_monitorIndex >= 0 && _monitorIndex < screens.Length)
        {
            return screens[_monitorIndex].Bounds;
        }

        return Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
    }

    private void InvokeOnUi(Action action)
    {
        if (_disposed || _host.IsDisposed || !_host.IsHandleCreated)
        {
            return;
        }

        if (_host.InvokeRequired)
        {
            try
            {
                _host.BeginInvoke(action);
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
            action();
        }
    }

    private static DesktopIconRect? FindIconByFileName(IReadOnlyList<DesktopIconRect> icons, string fileName)
    {
        string stem = Path.GetFileNameWithoutExtension(fileName);
        return icons.FirstOrDefault(i =>
            string.Equals(i.Label, fileName, StringComparison.OrdinalIgnoreCase)
            || string.Equals(i.Label, stem, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IconsEqual(IReadOnlyList<DesktopIconRect> a, IReadOnlyList<DesktopIconRect> b)
    {
        if (a.Count != b.Count)
        {
            return false;
        }

        Span<bool> matched = a.Count <= 128 ? stackalloc bool[a.Count] : new bool[a.Count];
        for (int i = 0; i < a.Count; i++)
        {
            DesktopIconRect ia = a[i];
            bool found = false;
            for (int j = 0; j < b.Count; j++)
            {
                if (matched[j])
                {
                    continue;
                }

                DesktopIconRect ib = b[j];
                if (Math.Abs(ia.X - ib.X) <= 1.5
                    && Math.Abs(ia.Y - ib.Y) <= 1.5
                    && Math.Abs(ia.Width - ib.Width) <= 1.5
                    && Math.Abs(ia.Height - ib.Height) <= 1.5)
                {
                    matched[j] = true;
                    found = true;
                    break;
                }
            }

            if (!found)
            {
                return false;
            }
        }

        return true;
    }

    private static Icon CreateCatSilhouetteIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        // Warm espresso circular badge with terracotta rim
        using (var bgBrush = new SolidBrush(Color.FromArgb(255, 36, 25, 19)))
        {
            g.FillEllipse(bgBrush, 1, 1, 30, 30);
        }
        using (var rimPen = new Pen(Color.FromArgb(255, 232, 166, 93), 1.8f))
        {
            g.DrawEllipse(rimPen, 1.5f, 1.5f, 29f, 29f);
        }

        // Cat silhouette head + pointed ears in warm cream
        using var catPath = new GraphicsPath();
        catPath.AddPolygon([
            new PointF(7.5f, 15.0f),
            new PointF(8.0f, 6.5f),
            new PointF(13.2f, 11.2f),
            new PointF(18.8f, 11.2f),
            new PointF(24.0f, 6.5f),
            new PointF(24.5f, 15.0f),
            new PointF(24.0f, 21.5f),
            new PointF(19.5f, 25.0f),
            new PointF(12.5f, 25.0f),
            new PointF(8.0f, 21.5f)
        ]);
        catPath.CloseFigure();

        using (var catBrush = new SolidBrush(Color.FromArgb(255, 246, 236, 225)))
        {
            g.FillPath(catBrush, catPath);
        }

        // Espresso eyes & terracotta nose
        using (var eyeBrush = new SolidBrush(Color.FromArgb(255, 36, 25, 19)))
        {
            g.FillEllipse(eyeBrush, 11.2f, 15.8f, 2.8f, 3.2f);
            g.FillEllipse(eyeBrush, 18.0f, 15.8f, 2.8f, 3.2f);
        }
        using (var noseBrush = new SolidBrush(Color.FromArgb(255, 217, 91, 82)))
        {
            g.FillPolygon(noseBrush, [
                new PointF(14.8f, 19.6f),
                new PointF(17.2f, 19.6f),
                new PointF(16.0f, 21.2f)
            ]);
        }

        IntPtr hIcon = bmp.GetHicon();
        try
        {
            using Icon temp = Icon.FromHandle(hIcon);
            return (Icon)temp.Clone();
        }
        finally
        {
            Win32Api.DestroyIcon(hIcon);
        }
    }

    private void OnApplicationOrProcessExit(object? sender, EventArgs e)
    {
        try
        {
            _host.RestoreDesktopWallpaper();
        }
        catch (Exception)
        {
        }
    }

    private void ExitApplication()
    {
        Dispose();
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (disposing)
        {
            SystemEvents.DisplaySettingsChanged -= OnSystemDisplaySettingsChanged;
            Application.ApplicationExit -= OnApplicationOrProcessExit;
            AppDomain.CurrentDomain.ProcessExit -= OnApplicationOrProcessExit;
            _host.RestoreDesktopWallpaper();
            _iconPollTimer.Stop();
            _iconPollTimer.Dispose();
            _flyoutForm?.Dispose();
            _flyoutForm = null;
            _openSettingsDialog?.Dispose();
            _occlusionMonitor.Dispose();
            _desktopWatcher.Dispose();
            _rawInputHook.Dispose();
            _notifyIcon.Visible = false;
            _notifyIcon.Dispose();
            _trayIcon.Dispose();
            _host.Dispose();
        }

        base.Dispose(disposing);
    }
}
