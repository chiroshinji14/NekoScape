using System.Runtime.InteropServices;

namespace NekoScape.Host.Native;

public static class Win32Api
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    // Window Messages
    public const uint WM_DISPLAYCHANGE = 0x007E;
    public const uint WM_SHOWWINDOW = 0x0018;
    public const uint WM_SYSCOMMAND = 0x0112;
    public const uint WM_INPUT = 0x00FF;
    public const uint WM_WINDOWPOSCHANGED = 0x0047;
    public const uint WM_SPAWN_WORKERW = 0x052C;

    public const int SC_MINIMIZE = 0xF020;

    // SendMessageTimeout flags
    public const uint SMTO_NORMAL = 0x0000;

    // Special HWNDs
    public static readonly IntPtr HWND_TOP = IntPtr.Zero;
    public static readonly IntPtr HWND_BOTTOM = new(1);
    public static readonly IntPtr HWND_MESSAGE = new(-3);

    // GetWindowLongPtr / SetWindowLongPtr indices
    public const int GWL_STYLE = -16;
    public const int GWL_EXSTYLE = -20;

    // Window Styles
    public const long WS_POPUP = 0x80000000L;
    public const long WS_CHILD = 0x40000000L;
    public const long WS_VISIBLE = 0x10000000L;
    public const long WS_CAPTION = 0x00C00000L;
    public const long WS_THICKFRAME = 0x00040000L;
    public const long WS_MINIMIZEBOX = 0x00020000L;
    public const long WS_MAXIMIZEBOX = 0x00010000L;
    public const long WS_SYSMENU = 0x00080000L;

    // Extended Window Styles
    public const long WS_EX_TOOLWINDOW = 0x00000080L;
    public const long WS_EX_APPWINDOW = 0x00040000L;
    public const long WS_EX_NOACTIVATE = 0x08000000L;

    // SetWindowPos flags
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_FRAMECHANGED = 0x0020;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public const uint SWP_ASYNCWINDOWPOS = 0x4000;

    // GetWindow commands
    public const uint GW_HWNDFIRST = 0;
    public const uint GW_HWNDNEXT = 2;
    public const uint GW_HWNDPREV = 3;

    // Process / Virtual Memory
    public const uint PROCESS_VM_OPERATION = 0x0008;
    public const uint PROCESS_VM_READ = 0x0010;
    public const uint PROCESS_VM_WRITE = 0x0020;
    public const uint MEM_COMMIT = 0x1000;
    public const uint MEM_RESERVE = 0x2000;
    public const uint MEM_RELEASE = 0x8000;
    public const uint PAGE_READWRITE = 0x04;

    // ListView messages & flags
    public const uint LVM_FIRST = 0x1000;
    public const uint LVM_GETITEMCOUNT = LVM_FIRST + 4;
    public const uint LVM_GETITEMRECT = LVM_FIRST + 14;
    public const uint LVM_GETITEMTEXTW = LVM_FIRST + 115;
    public const int LVIR_BOUNDS = 0;
    public const uint LVIF_TEXT = 0x0001;

    // Raw Input
    public const ushort HID_USAGE_PAGE_GENERIC = 0x01;
    public const ushort HID_USAGE_GENERIC_MOUSE = 0x02;
    public const ushort HID_USAGE_GENERIC_KEYBOARD = 0x06;
    public const uint RIDEV_INPUTSINK = 0x00000100;
    public const uint RIDEV_REMOVE = 0x00000001;
    public const uint RID_INPUT = 0x10000003;
    public const uint RIM_TYPEMOUSE = 0;
    public const uint RIM_TYPEKEYBOARD = 1;

    public const ushort RI_MOUSE_LEFT_BUTTON_DOWN = 0x0001;
    public const ushort RI_MOUSE_LEFT_BUTTON_UP = 0x0002;
    public const ushort RI_MOUSE_RIGHT_BUTTON_DOWN = 0x0004;
    public const ushort RI_MOUSE_RIGHT_BUTTON_UP = 0x0008;
    public const ushort RI_MOUSE_MIDDLE_BUTTON_DOWN = 0x0010;
    public const ushort RI_MOUSE_MIDDLE_BUTTON_UP = 0x0020;

    public const ushort RI_KEY_BREAK = 0x0001;

    // Virtual Keys (only modifier + L hotkey checked; no general key logging)
    public const ushort VK_CONTROL = 0x11;
    public const ushort VK_MENU = 0x12;
    public const ushort VK_L = 0x4C;
    public const ushort VK_LCONTROL = 0xA2;
    public const ushort VK_RCONTROL = 0xA3;
    public const ushort VK_LMENU = 0xA4;
    public const ushort VK_RMENU = 0xA5;

    // DWM attributes
    public const uint DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    public const uint DWMWA_CLOAKED = 14;
    public const uint DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    public const int DWMWCP_ROUND = 2;

    // Monitor & DPI
    public const uint MONITOR_DEFAULTTONEAREST = 2;
    public const int MDT_EFFECTIVE_DPI = 0;

    // Shell special folders & SHGetFileInfo
    public const int CSIDL_BITBUCKET = 0x000A;
    public const uint SHGFI_PIDL = 0x000000008;
    public const uint SHGFI_DISPLAYNAME = 0x000000200;

    public enum QUERY_USER_NOTIFICATION_STATE
    {
        QUNS_NOT_PRESENT = 1,
        QUNS_BUSY = 2,
        QUNS_RUNNING_D3D_FULL_SCREEN = 3,
        QUNS_PRESENTATION_MODE = 4,
        QUNS_ACCEPTS_NOTIFICATIONS = 5,
        QUNS_QUIET_TIME = 6,
        QUNS_APP = 7
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;

        public POINT(int x, int y)
        {
            X = x;
            Y = y;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;

        public RECT(int left, int top, int right, int bottom)
        {
            Left = left;
            Top = top;
            Right = right;
            Bottom = bottom;
        }

        public int Width => Right - Left;
        public int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct RAWMOUSE
    {
        [FieldOffset(0)]
        public ushort usFlags;
        [FieldOffset(4)]
        public uint ulButtons;
        [FieldOffset(4)]
        public ushort usButtonFlags;
        [FieldOffset(6)]
        public ushort usButtonData;
        [FieldOffset(8)]
        public uint ulRawButtons;
        [FieldOffset(12)]
        public int lLastX;
        [FieldOffset(16)]
        public int lLastY;
        [FieldOffset(20)]
        public uint ulExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct RAWINPUT
    {
        [FieldOffset(0)]
        public RAWINPUTHEADER header;
        [FieldOffset(24)]
        public RAWMOUSE mouse;
        [FieldOffset(24)]
        public RAWKEYBOARD keyboard;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct LVITEMW
    {
        public uint mask;
        public int iItem;
        public int iSubItem;
        public uint state;
        public uint stateMask;
        public IntPtr pszText;
        public int cchTextMax;
        public int iImage;
        public IntPtr lParam;
        public int iIndent;
        public int iGroupId;
        public uint cColumns;
        public IntPtr puColumns;
        public IntPtr piColFmt;
        public int iGroup;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SHQUERYRBINFO
    {
        public int cbSize;
        public long i64Size;
        public long i64NumItems;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SHFILEINFOW
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    // User32
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string? lpszClass, string? lpszWindow);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint Msg,
        UIntPtr wParam,
        IntPtr lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetParent(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int GetClassName(IntPtr hWnd, char[] lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, char[] lpString, int nMaxCount);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT Point);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool RegisterRawInputDevices(
        [In] RAWINPUTDEVICE[] pRawInputDevices,
        uint uiNumDevices,
        uint cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetRawInputData(
        IntPtr hRawInput,
        uint uiCommand,
        IntPtr pData,
        ref uint pcbSize,
        uint cbSizeHeader);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetMonitorInfoW(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    // Kernel32
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, [MarshalAs(UnmanagedType.Bool)] bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ReadProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        IntPtr lpBuffer,
        UIntPtr nSize,
        out UIntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ReadProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        [Out] byte[] lpBuffer,
        UIntPtr nSize,
        out UIntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WriteProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        IntPtr lpBuffer,
        UIntPtr nSize,
        out UIntPtr lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WriteProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        [In] byte[] lpBuffer,
        UIntPtr nSize,
        out UIntPtr lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);

    // Shell32 & Ole32
    [DllImport("shell32.dll")]
    public static extern int SHQueryUserNotificationState(out QUERY_USER_NOTIFICATION_STATE pquns);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHQueryRecycleBinW(string? pszRootPath, ref SHQUERYRBINFO pSHQueryRBInfo);

    [DllImport("shell32.dll")]
    public static extern int SHGetSpecialFolderLocation(IntPtr hwndOwner, int nFolder, out IntPtr ppidl);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SHGetFileInfoW(
        IntPtr pszPath,
        uint dwFileAttributes,
        ref SHFILEINFOW psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("ole32.dll")]
    public static extern void CoTaskMemFree(IntPtr pv);

    // Dwmapi
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint dwAttribute, out int pvAttribute, int cbAttribute);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint dwAttribute, out RECT pvAttribute, int cbAttribute);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, uint dwAttribute, ref int pvAttribute, int cbAttribute);

    public static void TryEnableRoundedCorners(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return;
        }

        try
        {
            int preference = DWMWCP_ROUND;
            _ = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref preference, sizeof(int));
        }
        catch
        {
            // Ignore on older OS versions where DWMWA_WINDOW_CORNER_PREFERENCE is unsupported.
        }
    }

    // Shcore
    [DllImport("shcore.dll")]
    public static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    public static string ReadClassName(IntPtr hWnd)
    {
        char[] buffer = new char[256];
        int length = GetClassName(hWnd, buffer, buffer.Length);
        return length > 0 ? new string(buffer, 0, length) : string.Empty;
    }
}
