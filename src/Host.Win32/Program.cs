namespace NekoScape.Host;

public sealed record HostLaunchOptions(
    bool Windowed,
    string? DevUrl,
    int MonitorIndex);

public static class Program
{
    private const string GlobalMutexName = @"Global\NekoScape_SingleInstance";
    private const string LocalMutexName = @"Local\NekoScape_SingleInstance";

    [STAThread]
    public static void Main(string[] args)
    {
        Mutex? instanceMutex = AcquireSingleInstanceMutex(out bool isPrimaryInstance);
        if (!isPrimaryInstance)
        {
            instanceMutex?.Dispose();
            return;
        }

        try
        {
            HostLaunchOptions options = ParseArgs(args);

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, _) => { };
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);

            using var trayContext = new SystemTrayContext(options);
            Application.Run(trayContext);
        }
        finally
        {
            try
            {
                instanceMutex?.ReleaseMutex();
            }
            catch (ApplicationException)
            {
            }
            instanceMutex?.Dispose();
        }
    }

    public static HostLaunchOptions ParseArgs(string[] args)
    {
        bool windowed = false;
        string? devUrl = null;
        int monitorIndex = -1;

        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            if (string.Equals(arg, "--windowed", StringComparison.OrdinalIgnoreCase))
            {
                windowed = true;
            }
            else if (string.Equals(arg, "--dev-url", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                devUrl = args[++i];
            }
            else if (arg.StartsWith("--dev-url=", StringComparison.OrdinalIgnoreCase))
            {
                devUrl = arg["--dev-url=".Length..];
            }
            else if (string.Equals(arg, "--monitor", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length
                && int.TryParse(args[++i], out int parsedMonitor))
            {
                monitorIndex = parsedMonitor;
            }
        }

        return new HostLaunchOptions(windowed, devUrl, monitorIndex);
    }

    private static Mutex? AcquireSingleInstanceMutex(out bool createdNew)
    {
        try
        {
            var mutex = new Mutex(initiallyOwned: true, GlobalMutexName, out createdNew);
            return mutex;
        }
        catch (UnauthorizedAccessException)
        {
            var fallback = new Mutex(initiallyOwned: true, LocalMutexName, out createdNew);
            return fallback;
        }
    }
}
