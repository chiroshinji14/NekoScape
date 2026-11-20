using System.Diagnostics;
using System.Runtime.InteropServices;
using NekoScape.Host.Bridge;
using NekoScape.Host.Native;

namespace NekoScape.Host.Hooks;

public sealed class TypingActivityTracker
{
    private readonly double _windowMs;
    private readonly Queue<long> _keyTimestampsMs = new();
    private long _lastActivityMs;

    public TypingActivityTracker(long initialTimestampMs = 0, double windowMs = 15_000)
    {
        _windowMs = windowMs > 0 ? windowMs : 15_000;
        _lastActivityMs = initialTimestampMs;
    }

    public int RecordedTimestampCount => _keyTimestampsMs.Count;

    public void RecordKeystroke(long timestampMs)
    {
        _keyTimestampsMs.Enqueue(timestampMs);
        _lastActivityMs = Math.Max(_lastActivityMs, timestampMs);
        PruneOld(timestampMs);
    }

    public void RecordPointerActivity(long timestampMs)
    {
        _lastActivityMs = Math.Max(_lastActivityMs, timestampMs);
    }

    public (double KeysPerMinute, double IdleSeconds) GetSnapshot(long nowMs)
    {
        PruneOld(nowMs);
        double kpm = _keyTimestampsMs.Count * (60_000.0 / _windowMs);
        double idleSeconds = Math.Max(0.0, (nowMs - _lastActivityMs) / 1000.0);
        return (Math.Round(kpm, 1), Math.Round(idleSeconds, 1));
    }

    private void PruneOld(long nowMs)
    {
        double cutoff = nowMs - _windowMs;
        while (_keyTimestampsMs.Count > 0 && _keyTimestampsMs.Peek() < cutoff)
        {
            _keyTimestampsMs.Dequeue();
        }
    }
}

public sealed class LaserHotkeyState
{
    private bool _altDown;
    private bool _ctrlDown;
    private bool _lDown;
    private bool _stickyLaser;

    public bool StickyLaser => _stickyLaser;

    public bool IsLaserActive(bool enableLaserHotkey)
        => enableLaserHotkey && (_stickyLaser || _altDown);

    public bool ToggleSticky()
    {
        _stickyLaser = !_stickyLaser;
        return _stickyLaser;
    }

    public void SetSticky(bool enabled)
    {
        _stickyLaser = enabled;
    }

    /// <summary>
    /// Evaluates ONLY Alt, Ctrl, and L hotkey modifiers; never records or logs other keys.
    /// Returns true if the effective laser state changed.
    /// </summary>
    public bool ProcessKey(ushort vKey, bool isKeyDown, bool enableLaserHotkey)
    {
        bool previousActive = IsLaserActive(enableLaserHotkey);

        switch (vKey)
        {
            case Win32Api.VK_MENU:
            case Win32Api.VK_LMENU:
            case Win32Api.VK_RMENU:
                _altDown = isKeyDown;
                break;

            case Win32Api.VK_CONTROL:
            case Win32Api.VK_LCONTROL:
            case Win32Api.VK_RCONTROL:
                _ctrlDown = isKeyDown;
                break;

            case Win32Api.VK_L:
                if (isKeyDown && !_lDown && enableLaserHotkey && _ctrlDown && _altDown)
                {
                    _stickyLaser = !_stickyLaser;
                }
                _lDown = isKeyDown;
                break;
        }

        return IsLaserActive(enableLaserHotkey) != previousActive;
    }
}

public sealed class RawInputHook : NativeWindow, IDisposable
{
    private readonly Func<(int OriginX, int OriginY, double DpiScale)> _getOriginAndDpi;
    private readonly Func<bool> _isLaserHotkeyEnabled;
    private readonly TypingActivityTracker _typingTracker;
    private readonly LaserHotkeyState _laserState = new();
    private readonly System.Windows.Forms.Timer _typingTimer;
    private readonly long _minMouseIntervalTicks;

    private bool _leftButton;
    private bool _rightButton;
    private bool _middleButton;
    private long _lastMouseEmitTicks;
    private bool _disposed;

    public event Action<MouseRawMessage>? MouseStateEmitted;
    public event Action<TypingActivityMessage>? TypingActivityEmitted;

    public bool IsLaserActive => _laserState.IsLaserActive(_isLaserHotkeyEnabled());

    public RawInputHook(
        Func<(int OriginX, int OriginY, double DpiScale)> getOriginAndDpi,
        Func<bool> isLaserHotkeyEnabled)
    {
        _getOriginAndDpi = getOriginAndDpi;
        _isLaserHotkeyEnabled = isLaserHotkeyEnabled;
        _typingTracker = new TypingActivityTracker(Environment.TickCount64);
        _minMouseIntervalTicks = Stopwatch.Frequency / 60; // 60 Hz ceiling

        CreateHandle(new CreateParams
        {
            Parent = Win32Api.HWND_MESSAGE,
            Caption = "NekoScape_RawInputSink"
        });

        RegisterDevices(Handle);

        _typingTimer = new System.Windows.Forms.Timer
        {
            Interval = 1000
        };
        _typingTimer.Tick += (_, _) => EmitTypingSnapshot();
        _typingTimer.Start();
    }

    public bool ToggleStickyLaser()
    {
        _laserState.ToggleSticky();
        EmitMouseNow(recordActivity: false);
        return IsLaserActive;
    }

    public void SetStickyLaser(bool enabled)
    {
        _laserState.SetSticky(enabled);
        EmitMouseNow(recordActivity: false);
    }

    private static void RegisterDevices(IntPtr targetHandle)
    {
        Win32Api.RAWINPUTDEVICE[] devices =
        [
            new Win32Api.RAWINPUTDEVICE
            {
                usUsagePage = Win32Api.HID_USAGE_PAGE_GENERIC,
                usUsage = Win32Api.HID_USAGE_GENERIC_MOUSE,
                dwFlags = Win32Api.RIDEV_INPUTSINK,
                hwndTarget = targetHandle
            },
            new Win32Api.RAWINPUTDEVICE
            {
                usUsagePage = Win32Api.HID_USAGE_PAGE_GENERIC,
                usUsage = Win32Api.HID_USAGE_GENERIC_KEYBOARD,
                dwFlags = Win32Api.RIDEV_INPUTSINK,
                hwndTarget = targetHandle
            }
        ];

        Win32Api.RegisterRawInputDevices(
            devices,
            (uint)devices.Length,
            (uint)Marshal.SizeOf<Win32Api.RAWINPUTDEVICE>());
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Win32Api.WM_INPUT)
        {
            ProcessRawInput(m.LParam);
        }

        base.WndProc(ref m);
    }

    private void ProcessRawInput(IntPtr hRawInput)
    {
        uint size = 0;
        uint headerSize = (uint)Marshal.SizeOf<Win32Api.RAWINPUTHEADER>();
        if (Win32Api.GetRawInputData(hRawInput, Win32Api.RID_INPUT, IntPtr.Zero, ref size, headerSize) != 0 || size == 0)
        {
            return;
        }

        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            uint read = Win32Api.GetRawInputData(hRawInput, Win32Api.RID_INPUT, buffer, ref size, headerSize);
            if (read == unchecked((uint)-1))
            {
                return;
            }

            Win32Api.RAWINPUT raw = Marshal.PtrToStructure<Win32Api.RAWINPUT>(buffer);
            if (raw.header.dwType == Win32Api.RIM_TYPEMOUSE)
            {
                HandleMouseInput(raw.mouse);
            }
            else if (raw.header.dwType == Win32Api.RIM_TYPEKEYBOARD)
            {
                HandleKeyboardInput(raw.keyboard);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private void HandleMouseInput(Win32Api.RAWMOUSE mouse)
    {
        bool buttonsChanged = false;
        ushort flags = mouse.usButtonFlags;

        if ((flags & Win32Api.RI_MOUSE_LEFT_BUTTON_DOWN) != 0)
        {
            _leftButton = true;
            buttonsChanged = true;
        }
        else if ((flags & Win32Api.RI_MOUSE_LEFT_BUTTON_UP) != 0)
        {
            _leftButton = false;
            buttonsChanged = true;
        }

        if ((flags & Win32Api.RI_MOUSE_RIGHT_BUTTON_DOWN) != 0)
        {
            _rightButton = true;
            buttonsChanged = true;
        }
        else if ((flags & Win32Api.RI_MOUSE_RIGHT_BUTTON_UP) != 0)
        {
            _rightButton = false;
            buttonsChanged = true;
        }

        if ((flags & Win32Api.RI_MOUSE_MIDDLE_BUTTON_DOWN) != 0)
        {
            _middleButton = true;
            buttonsChanged = true;
        }
        else if ((flags & Win32Api.RI_MOUSE_MIDDLE_BUTTON_UP) != 0)
        {
            _middleButton = false;
            buttonsChanged = true;
        }

        _typingTracker.RecordPointerActivity(Environment.TickCount64);

        long nowTicks = Stopwatch.GetTimestamp();
        if (!buttonsChanged && nowTicks - _lastMouseEmitTicks < _minMouseIntervalTicks)
        {
            return;
        }

        _lastMouseEmitTicks = nowTicks;
        EmitMouseNow(recordActivity: false);
    }

    private void HandleKeyboardInput(Win32Api.RAWKEYBOARD keyboard)
    {
        bool isKeyDown = (keyboard.Flags & Win32Api.RI_KEY_BREAK) == 0;

        // Record ONLY the keystroke timestamp for Typing Vibe; never store key characters/codes.
        if (isKeyDown)
        {
            _typingTracker.RecordKeystroke(Environment.TickCount64);
        }

        bool laserChanged = _laserState.ProcessKey(keyboard.VKey, isKeyDown, _isLaserHotkeyEnabled());
        if (laserChanged)
        {
            EmitMouseNow(recordActivity: false);
        }
    }

    private void EmitMouseNow(bool recordActivity)
    {
        if (recordActivity)
        {
            _typingTracker.RecordPointerActivity(Environment.TickCount64);
        }

        if (!Win32Api.GetCursorPos(out Win32Api.POINT pt))
        {
            return;
        }

        (int originX, int originY, double dpiScale) = _getOriginAndDpi();
        double safeScale = dpiScale > 0 ? dpiScale : 1.0;
        (double logicalX, double logicalY) = DpiCoordinateMapper.ToLogicalPoint(
            pt.X,
            pt.Y,
            originX,
            originY,
            safeScale);

        MouseRawMessage msg = new(
            X: Math.Round(logicalX, 2),
            Y: Math.Round(logicalY, 2),
            Buttons: new MouseButtonsDto(_leftButton, _rightButton, _middleButton),
            LaserMode: IsLaserActive,
            SplitPrism: false);

        MouseStateEmitted?.Invoke(msg);
    }

    private void EmitTypingSnapshot()
    {
        (double kpm, double idleSeconds) = _typingTracker.GetSnapshot(Environment.TickCount64);
        TypingActivityEmitted?.Invoke(new TypingActivityMessage(kpm, idleSeconds));
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _typingTimer.Stop();
        _typingTimer.Dispose();

        if (Handle != IntPtr.Zero)
        {
            Win32Api.RAWINPUTDEVICE[] remove =
            [
                new Win32Api.RAWINPUTDEVICE
                {
                    usUsagePage = Win32Api.HID_USAGE_PAGE_GENERIC,
                    usUsage = Win32Api.HID_USAGE_GENERIC_MOUSE,
                    dwFlags = Win32Api.RIDEV_REMOVE,
                    hwndTarget = IntPtr.Zero
                },
                new Win32Api.RAWINPUTDEVICE
                {
                    usUsagePage = Win32Api.HID_USAGE_PAGE_GENERIC,
                    usUsage = Win32Api.HID_USAGE_GENERIC_KEYBOARD,
                    dwFlags = Win32Api.RIDEV_REMOVE,
                    hwndTarget = IntPtr.Zero
                }
            ];
            Win32Api.RegisterRawInputDevices(remove, (uint)remove.Length, (uint)Marshal.SizeOf<Win32Api.RAWINPUTDEVICE>());
            DestroyHandle();
        }
    }
}
