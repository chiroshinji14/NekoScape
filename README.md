# NekoScape

Interactive top-down live desktop wallpaper for Windows powered by a `.NET 10` Win32/WebView2 host (`src/Host.Win32`) and a `TypeScript` + `PixiJS v8` physics simulation (`src/Renderer.Web`).

Cats roam behind your desktop icons across 4 switchable top-down environments, coalesce around real `SysListView32` shortcut mats, leap onto icons to perch, scratch icon edges, spring into and out of an open cardboard box in parabolic arcs, bat yarn balls around your folders, sniff newly created desktop files, react when the Recycle Bin is emptied, and automatically pause at ~0% CPU/GPU whenever a fullscreen or maximized app covers the screen.

## Switchable Scenes & Lighting

Choose from 4 themed desktop environments (from the Windows tray flyout, right-click `Scene` submenu, `Settings…`, or the web FAB popover):

- **Golden Study (`study`):** Warm honey-oak floorboards, woven cream bouclé rug, and warm cork-linen icon mats.
- **Kyoto Tatami (`tatami`):** Woven rush tatami mats framed with dark cypress borders and warm cedar accents.
- **Sunlit Courtyard (`garden`):** Natural courtyard limestone pavers with mossy stone trim and soft sunlit mats.
- **Cat Cafe Tile (`cafe`):** Warm checkered terracotta-and-cream cafe tiles with cozy felt icon mats.

Each scene pairs with 4 lighting grades: **`Auto`** (sun-synced to your local clock for Day, Golden Hour, and Night), **`Day`**, **`Golden`**, and **`Night`** (cool moonlit grade with a warm desk-lamp pool and glowing cat eyes). Nearby desktop shortcuts automatically merge into smooth-union SDF floor mats beneath your icons.

## Cat & Desktop Icon Behaviors

- **Icon Perching & Scratching:** Cats hop onto desktop shortcut mats to perch (`JUMP_TO_ICON` -> `PERCH_ICON`) or sidle up to an icon boundary to scratch (`SCRATCH_ICON`) with tiny scuff puffs.
- **Cardboard Box Jump-In / Jump-Out:** Cats approach the open corrugated cardboard box, leap inside along a parabolic `z(t)` arc (`JUMP_TO_BOX` -> `IN_BOX`), curl up under the box flaps, and bound back out (`JUMP_OUT_BOX`) when ready to roam or when startled.
- **Physics & Bonks:** Grounded cats collide smoothly with desktop icon AABBs and the box exterior, rebounding with a dazed `BONK` animation when impacting faster than `350 px/s`.
- **Toys & Shell Reactions:** Chasing the laser dot (and 3-way refractive Split Prism beams), batting the crimson yarn ball with trailing Verlet thread, petting via rapid back-and-forth cursor strokes, gathering around the rug while you type, napping after idle timeout, sniffing newly created desktop files, and startling away when the Recycle Bin is emptied.

## Prerequisites

- Windows 10 or Windows 11 (x64, including Windows 11 24H2+ `Progman` desktop layering)
- [.NET 10 SDK](https://dotnet.microsoft.com/) (or `.NET 10 WindowsDesktop Runtime` for running framework-dependent builds)
- Microsoft Edge WebView2 Runtime (pre-installed on Windows 11 and modern Windows 10)
- Node.js 20+ and npm (for building/testing `src/Renderer.Web`)

## Quick Start

### 1. Browser Preview (Renderer Only)

Run the standalone PixiJS simulation with interactive mock desktop icons in your browser:

```powershell
cd src/Renderer.Web
npm install
npm run dev
```

### 2. Build & Run Host + Renderer Together

Build the web bundle first, then run the Win32 host in windowed preview mode (recommended while testing) or embedded wallpaper mode:

```powershell
# Build frontend assets into src/Renderer.Web/dist
cd src/Renderer.Web
npm install
npm run build
cd ../..

# Build & run Win32 host in standalone preview window
dotnet run --project src/Host.Win32/Host.Win32.csproj -- --windowed

# Or attach live to Vite dev server for hot reload
dotnet run --project src/Host.Win32/Host.Win32.csproj -- --windowed --dev-url http://localhost:5173

# Embed behind desktop icons (Windows WorkerW / Progman wallpaper mode)
dotnet run --project src/Host.Win32/Host.Win32.csproj
```

### CLI Flags

| Flag | Description |
| :--- | :--- |
| `--windowed` | Opens NekoScape in a resizable standalone preview window instead of embedding into `WorkerW` / `Progman`. |
| `--dev-url <url>` | Loads the renderer from a running Vite dev server (e.g. `http://localhost:5173`) instead of `www/` or `dist/`. |
| `--monitor <index>` | Targets a specific zero-based monitor index (defaults to primary monitor). |

## Hotkeys & Controls

### Keyboard Shortcuts

- **`Alt` (Hold):** Activates the red laser dot at the cursor while held (when Laser Hotkeys are enabled).
- **`Ctrl + Alt + L`:** Toggles sticky laser mode on or off.
- **`D` (in browser preview / focused window):** Toggles debug wireframe AABB bounding boxes and state labels (also toggleable from the system tray menu).

### Windows "Show Hidden Icons" Quick Flyout vs. Web FAB Popover

- **Windows Tray Quick Flyout (Left-Click Tray Icon):** Left-click NekoScape in the Windows notification area or **"Show Hidden Icons"** (`^`) overflow tray to open the warm dark-espresso quick-controls flyout anchored beside your taskbar. From there you can immediately switch **Scene** (`Study`, `Tatami`, `Garden`, `Cafe`), **Lighting** (`Auto`, `Day`, `Golden`, `Night`), **Cat Pack** (`1–12`), trigger **Toys & Actions** (`Toggle Laser`, `Toss Yarn`, `Toggle Box`, `Rescan Icons`), and control **View & Host** (`Show HUD`, `Web Dock`, `Pause / Resume`, `Settings…`). Press `Escape` or click outside to dismiss.
- **Windows Right-Click Context Menu & Settings Dialog:** Right-click the tray icon for the full menu (`Settings…`, `Toggle Laser Mode`, `Rescan Desktop Icons`, `Pause / Resume Wallpaper`, `Toggle HUD`, `Show On-Wallpaper Web Dock`, `Toggle Debug Wireframes`, `Scene` submenu, `Lighting` submenu, `Windowed Preview Mode`, `Exit`), or double-click the tray icon to open `Settings…` (includes Cat Count `1–12`, FPS Cap `30 / 60 / Uncapped`, Scene Theme, Lighting Mode, Idle Nap timeout, Launch at Startup, and desktop icon rescan). When running natively via `Host.Win32`, the on-wallpaper web dock stays off by default until you explicitly enable `Show On-Wallpaper Web Dock`, keeping controls right in the tray flyout.
- **Web FAB Popover (Browser Preview / Optional Web Dock):** In standalone browser preview (`npm run dev`) or when `Show On-Wallpaper Web Dock` is enabled, a compact floating action button (FAB) and popover panel at the bottom-right of the stage exposes scene switching, lighting selection, cat count, toys, debug wireframes, and standalone mock-icon controls (`New File`, `Tidy Icons`, `Empty Bin`, `Play with Icon`).

## Build & Test Commands

### .NET Host & Unit Tests

```powershell
dotnet build NekoScape.sln
dotnet test NekoScape.sln
```

### Web Renderer Typecheck & Tests

```powershell
cd src/Renderer.Web
npm run typecheck
npm test
npm run build
```

## Packaging (Portable & Installer)

Build the renderer, publish `NekoScape.exe`, and assemble `build/release/NekoScape/`:

```powershell
# Framework-dependent x64 portable folder
./build/package-portable.ps1

# Self-contained x64 portable folder + ZIP archive
./build/package-portable.ps1 -SelfContained -CreateZip
```

To create a Windows installer after running `package-portable.ps1`, compile `build/NekoScape.iss` with Inno Setup 6 (`iscc build/NekoScape.iss`).

## Configuration & Privacy

- Default configuration lives in `config/default-settings.json`, and user overrides are saved to `config/user-settings.json` (falling back to `%LocalAppData%\NekoScape\config\user-settings.json` if the install directory is read-only).
- **Typing Vibe Privacy:** `RawInputHook` records only anonymous keystroke timestamps to calculate rolling `keysPerMinute` and `idleSeconds` (plus `Ctrl`/`Alt`/`L` checks for the laser pointer hotkey). No typed characters or general key codes are stored or logged.
