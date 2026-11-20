using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using NekoScape.Host.Bridge;

namespace NekoScape.Host.Native;

public static class DpiCoordinateMapper
{
    public static RectDto ToLogicalRect(Win32Api.RECT physRect, double originX, double originY, double dpiScale)
    {
        if (dpiScale <= 0 || double.IsNaN(dpiScale) || double.IsInfinity(dpiScale))
        {
            throw new ArgumentOutOfRangeException(nameof(dpiScale), "DPI scale must be positive and finite.");
        }

        double x = (physRect.Left - originX) / dpiScale;
        double y = (physRect.Top - originY) / dpiScale;
        double width = Math.Max(0, (physRect.Right - physRect.Left) / dpiScale);
        double height = Math.Max(0, (physRect.Bottom - physRect.Top) / dpiScale);

        return new RectDto(x, y, width, height);
    }

    public static (double X, double Y) ToLogicalPoint(double physX, double physY, double originX, double originY, double dpiScale)
    {
        if (dpiScale <= 0 || double.IsNaN(dpiScale) || double.IsInfinity(dpiScale))
        {
            throw new ArgumentOutOfRangeException(nameof(dpiScale), "DPI scale must be positive and finite.");
        }

        return ((physX - originX) / dpiScale, (physY - originY) / dpiScale);
    }
}

public sealed class SysListViewReader
{
    private const int MaxLabelChars = 260;
    private string? _cachedRecycleBinName;

    public static bool IsRecycleBinLabel(string? label, string? localizedRecycleBinName = null)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            return false;
        }

        string trimmed = label.Trim();
        if (!string.IsNullOrWhiteSpace(localizedRecycleBinName)
            && string.Equals(trimmed, localizedRecycleBinName.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return string.Equals(trimmed, "Recycle Bin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(trimmed, "Trash", StringComparison.OrdinalIgnoreCase);
    }

    public static double GetMonitorDpiScale(IntPtr hwnd)
    {
        IntPtr monitor = Win32Api.MonitorFromWindow(hwnd, Win32Api.MONITOR_DEFAULTTONEAREST);
        if (monitor != IntPtr.Zero && Win32Api.GetDpiForMonitor(monitor, Win32Api.MDT_EFFECTIVE_DPI, out uint dpiX, out _) == 0 && dpiX > 0)
        {
            return dpiX / 96.0;
        }
        return 1.0;
    }

    public IReadOnlyList<DesktopIconRect> ReadIcons(Rectangle targetMonitorPhysicalBounds, double dpiScale)
    {
        double safeScale = dpiScale > 0 ? dpiScale : 1.0;
        IntPtr listView = FindDesktopListView();
        if (listView == IntPtr.Zero)
        {
            return Array.Empty<DesktopIconRect>();
        }

        int count = (int)Win32Api.SendMessage(listView, Win32Api.LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
        if (count <= 0)
        {
            return Array.Empty<DesktopIconRect>();
        }

        Win32Api.GetWindowThreadProcessId(listView, out uint processId);
        if (processId == 0)
        {
            return Array.Empty<DesktopIconRect>();
        }

        Win32Api.POINT listViewOrigin = new(0, 0);
        Win32Api.ClientToScreen(listView, ref listViewOrigin);

        string? localizedRecycleBinName = GetLocalizedRecycleBinName();

        IntPtr hProcess = Win32Api.OpenProcess(
            Win32Api.PROCESS_VM_OPERATION | Win32Api.PROCESS_VM_READ | Win32Api.PROCESS_VM_WRITE,
            false,
            processId);
        if (hProcess == IntPtr.Zero)
        {
            return Array.Empty<DesktopIconRect>();
        }

        const int rectOffset = 0;
        const int lvItemOffset = 32;
        const int textOffset = 160;
        const int textBufferBytes = MaxLabelChars * 2;
        const int totalRemoteBytes = textOffset + textBufferBytes;

        IntPtr remoteMem = IntPtr.Zero;
        IntPtr localRectMem = IntPtr.Zero;
        IntPtr localLvItemMem = IntPtr.Zero;

        try
        {
            remoteMem = Win32Api.VirtualAllocEx(
                hProcess,
                IntPtr.Zero,
                (UIntPtr)totalRemoteBytes,
                Win32Api.MEM_COMMIT | Win32Api.MEM_RESERVE,
                Win32Api.PAGE_READWRITE);

            if (remoteMem == IntPtr.Zero)
            {
                return Array.Empty<DesktopIconRect>();
            }

            IntPtr remoteRectPtr = remoteMem + rectOffset;
            IntPtr remoteLvItemPtr = remoteMem + lvItemOffset;
            IntPtr remoteTextPtr = remoteMem + textOffset;

            int rectSize = Marshal.SizeOf<Win32Api.RECT>();
            int lvItemSize = Marshal.SizeOf<Win32Api.LVITEMW>();

            localRectMem = Marshal.AllocHGlobal(rectSize);
            localLvItemMem = Marshal.AllocHGlobal(lvItemSize);
            byte[] textBuffer = new byte[textBufferBytes];

            List<DesktopIconRect> icons = new(count);
            for (int i = 0; i < count; i++)
            {
                Win32Api.RECT rectReq = new(Win32Api.LVIR_BOUNDS, 0, 0, 0);
                Marshal.StructureToPtr(rectReq, localRectMem, false);
                if (!Win32Api.WriteProcessMemory(hProcess, remoteRectPtr, localRectMem, (UIntPtr)rectSize, out _))
                {
                    continue;
                }

                IntPtr gotRect = Win32Api.SendMessage(listView, Win32Api.LVM_GETITEMRECT, new IntPtr(i), remoteRectPtr);
                if (gotRect == IntPtr.Zero)
                {
                    continue;
                }

                if (!Win32Api.ReadProcessMemory(hProcess, remoteRectPtr, localRectMem, (UIntPtr)rectSize, out _))
                {
                    continue;
                }

                Win32Api.RECT itemRect = Marshal.PtrToStructure<Win32Api.RECT>(localRectMem);
                Win32Api.RECT screenRect = new(
                    itemRect.Left + listViewOrigin.X,
                    itemRect.Top + listViewOrigin.Y,
                    itemRect.Right + listViewOrigin.X,
                    itemRect.Bottom + listViewOrigin.Y);

                if (screenRect.Width <= 0 || screenRect.Height <= 0)
                {
                    continue;
                }

                Rectangle physBox = Rectangle.FromLTRB(screenRect.Left, screenRect.Top, screenRect.Right, screenRect.Bottom);
                if (!physBox.IntersectsWith(targetMonitorPhysicalBounds))
                {
                    continue;
                }

                Win32Api.LVITEMW lvItem = new()
                {
                    mask = Win32Api.LVIF_TEXT,
                    iItem = i,
                    iSubItem = 0,
                    pszText = remoteTextPtr,
                    cchTextMax = MaxLabelChars
                };

                Marshal.StructureToPtr(lvItem, localLvItemMem, false);
                string label = string.Empty;
                if (Win32Api.WriteProcessMemory(hProcess, remoteLvItemPtr, localLvItemMem, (UIntPtr)lvItemSize, out _))
                {
                    Win32Api.SendMessage(listView, Win32Api.LVM_GETITEMTEXTW, new IntPtr(i), remoteLvItemPtr);
                    if (Win32Api.ReadProcessMemory(hProcess, remoteTextPtr, textBuffer, (UIntPtr)textBufferBytes, out _))
                    {
                        label = DecodeUtf16NullTerminated(textBuffer);
                    }
                }

                RectDto logical = DpiCoordinateMapper.ToLogicalRect(
                    screenRect,
                    targetMonitorPhysicalBounds.Left,
                    targetMonitorPhysicalBounds.Top,
                    safeScale);

                icons.Add(new DesktopIconRect(
                    Id: i,
                    X: Math.Round(logical.X, 2),
                    Y: Math.Round(logical.Y, 2),
                    Width: Math.Round(logical.Width, 2),
                    Height: Math.Round(logical.Height, 2),
                    Label: label,
                    IsRecycleBin: IsRecycleBinLabel(label, localizedRecycleBinName)));
            }

            return icons;
        }
        finally
        {
            if (localRectMem != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(localRectMem);
            }
            if (localLvItemMem != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(localLvItemMem);
            }
            if (remoteMem != IntPtr.Zero)
            {
                Win32Api.VirtualFreeEx(hProcess, remoteMem, UIntPtr.Zero, Win32Api.MEM_RELEASE);
            }
            Win32Api.CloseHandle(hProcess);
        }
    }

    public static IntPtr FindDesktopListView()
    {
        IntPtr progman = Win32Api.FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            IntPtr defView = Win32Api.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (defView != IntPtr.Zero)
            {
                IntPtr list = Win32Api.FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
                if (list != IntPtr.Zero)
                {
                    return list;
                }
            }
        }

        IntPtr workerW = IntPtr.Zero;
        while ((workerW = Win32Api.FindWindowEx(IntPtr.Zero, workerW, "WorkerW", null)) != IntPtr.Zero)
        {
            IntPtr defView = Win32Api.FindWindowEx(workerW, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (defView != IntPtr.Zero)
            {
                IntPtr list = Win32Api.FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
                if (list != IntPtr.Zero)
                {
                    return list;
                }
            }
        }

        return IntPtr.Zero;
    }

    private string? GetLocalizedRecycleBinName()
    {
        if (_cachedRecycleBinName is not null)
        {
            return _cachedRecycleBinName;
        }

        IntPtr pidl = IntPtr.Zero;
        try
        {
            if (Win32Api.SHGetSpecialFolderLocation(IntPtr.Zero, Win32Api.CSIDL_BITBUCKET, out pidl) == 0 && pidl != IntPtr.Zero)
            {
                Win32Api.SHFILEINFOW info = new();
                if (Win32Api.SHGetFileInfoW(pidl, 0, ref info, (uint)Marshal.SizeOf<Win32Api.SHFILEINFOW>(), Win32Api.SHGFI_PIDL | Win32Api.SHGFI_DISPLAYNAME) != IntPtr.Zero)
                {
                    _cachedRecycleBinName = info.szDisplayName;
                }
            }
        }
        finally
        {
            if (pidl != IntPtr.Zero)
            {
                Win32Api.CoTaskMemFree(pidl);
            }
        }

        return _cachedRecycleBinName;
    }

    private static string DecodeUtf16NullTerminated(byte[] buffer)
    {
        int nullCharByteIndex = buffer.Length;
        for (int i = 0; i + 1 < buffer.Length; i += 2)
        {
            if (buffer[i] == 0 && buffer[i + 1] == 0)
            {
                nullCharByteIndex = i;
                break;
            }
        }

        return Encoding.Unicode.GetString(buffer, 0, nullCharByteIndex);
    }
}
