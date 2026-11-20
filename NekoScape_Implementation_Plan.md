# Interactive Top-Down Cat Live Wallpaper: Technical & Architecture Plan

## 1. Executive Summary & Conceptual Overview

This project is an interactive, GPU-accelerated live desktop wallpaper for Windows featuring procedural 2D cats living on your desktop floor. Viewed from a top-down $90^\circ$ (bird's-eye) perspective inspired by cozy management and physics-toy visuals, the wallpaper embeds seamlessly behind desktop icons using the native Windows `WorkerW` engine.

By utilizing a top-down view rather than a traditional 2D side-scrolling platformer, desktop shortcut icons naturally act as solid floor obstacles (bounding boxes) rather than awkward platforms. The cats navigate around folders, "bonk" into shortcuts when chasing targets, hide behind icons, pounce on laser dots, and play with desktop props like yarn balls and cardboard boxes.

### Key Highlights
* **Native Desktop Integration:** Renders directly into the Windows shell layer (`WorkerW`), remaining strictly behind desktop icons while capturing mouse and OS events passively.
* **Low Overhead Performance:** Smart occlusion detection automatically pauses the render loop ($0\%$ CPU/GPU utilization) whenever full-screen applications, media players, or games are active.
* **Procedural Cat Rigging:** Uses dynamic spine-chain physics and Verlet-integrated tails to render diverse cat breeds (calico, tabby, tuxedo, Siamese) with organic movement without requiring hundreds of hand-drawn frames.
* **Interactive Desktop Mechanics:** Real-time reading of `SysListView32` icon locations turns your actual desktop layout into an interactive obstacle course for cats, yarn balls, and laser reflections.

---

## 2. Visual Palette & Physics Foundation

### 2.1 Spatial Physics & Perspective Mechanics
* **$90^\circ$ Overhead Vector Physics:** Movement operates on a 2D friction plane with velocity, acceleration, turn rate, and surface traction parameters.
* **Faux-3D Depth via Dynamic Drop Shadows:** Jump/pounce height $z(t)$ is simulated by scaling up the cat sprite by a factor of $(1 + 0.15 \cdot z(t))$ while shifting its drop shadow down-right by $\Delta x = 6 \cdot z(t), \Delta y = 12 \cdot z(t)$ and reducing shadow opacity.
* **Dual-Surface Friction Dynamics:**
  * **Hardwood Planks Zone:** Low surface friction ($\mu_{wood} = 0.82$). Cats drift slightly during sharp turns and slide when sprinting after high-speed targets.
  * **Center Rug Zone:** High surface friction ($\mu_{rug} = 0.96$). Cats turn sharply, decelerate smoothly, and prefer this area for loafing/napping.

### 2.2 Visual Art Style
* **Background Canvas:** Staggered horizontal hardwood planks with soft edge vignetting, paired with a central woven cream rug featuring geometric accents and fringe details.
* **Procedural Capsule Bodies:** Sleek pill-shaped body segments with dynamic ear twitches, eye dilation toward targets, and multi-node spring-physics tails.
* **Color Palette & Breed Variance:** Includes preset coat generators for Calico, Tuxedo, Solid Black (bright yellow/green eyes), Cyan-eyed Blue-Grey, Siamese, and Orange Tabby.
* **UI Elements:** Rounded dark-brown translucent pill overlays (`POUNCES | BONKS`), top laser status badges, and an optional bottom toy dock.

---

## 3. Desktop Geometry & Shell Interaction Mechanics

```
       +-------------------------------------------------------------+
       | [Desktop Wallpaper - Top-Down Room View]                     |
       |                                                             |
       |    +---------------+                                        |
       |    | Folder Icon   |  <--- SysListView32 Bounding Box       |
       |    +---------------+       (Solid Collision AABB)           |
       |            \                                                |
       |             \ (Bonk Event!)                                 |
       |         =^._.^= ---> [Cat Sprinting]                        |
       |                                                             |
       |      ( ( ( Red Yarn Ball ) ) )  ---> Ricochets off Icons    |
       |                                                             |
       |   +-----------------------------------------------------+   |
       |   |                     Center Rug                      |   |
       |   |                 (Loaf & Sleep Zone)                 |   |
       |   +-----------------------------------------------------+   |
       +-------------------------------------------------------------+
```

### 3.1 Icon Bounding Box Collision (`SysListView32`)
* **Solid Obstacles:** Every desktop shortcut's Axis-Aligned Bounding Box (AABB) acts as a physical obstacle.
* **Bonk Detection:** If a cat's velocity $v > v_{threshold}$ upon impacting an icon rectangle, a `BONK` event triggers:
  * Plays a squash-and-stretch animation frame.
  * Spawns an impact dust puff particle.
  * Increments the `BONKS` HUD counter.
  * Triggers a brief $0.5\,\text{s}$ dazed wobble state.
* **Yarn Ball Ricochet:** Batting the yarn ball sends it rolling across the floor, bouncing off icon AABBs with coefficient of restitution $e = 0.75$.

### 3.2 Shell Events & OS Awareness
* **New File Curiosity:** A Win32 `FileSystemWatcher` monitors `C:\Users\<User>\Desktop`. When a new file or screenshot appears:
  1. The new icon rect is fetched.
  2. Nearby idle cats switch state to `STALK`.
  3. Cats trot over to the new file's perimeter to perform a "sniff" animation.
* **Recycle Bin Dynamics:**
  * Polls Recycle Bin item count via `SHGetFolderLocation` / `SHGetStatistic`.
  * If full, cats periodically wander over to the corner trash area and bat at it.
  * When the bin is emptied, a sudden startled reaction (jump + scramble) is triggered for any cats within a radius of $300\,\text{px}$.
* **Cursor & Key Interactions:**
  * **Petting:** Rapid back-and-forth cursor oscillation over a cat's radius triggers purr particles and a squinting animation.
  * **Laser Pointer (`Alt` or `Ctrl+Alt+L`):** Renders a glowing red dot at cursor position. Sweeping over the **Prism Crystal prop** splits the laser into 3 diverging beams (`LASER: SPLIT PRISM (X3)`), fracturing the cat pack into multiple chase groups.
  * **Typing Vibe:** Monitors input frequency without keylogging. Active typing causes cats to sit near the center rug and watch the screen; idling for $>5\,\text{minutes}$ transitions all cats to `NAP` state.

---

## 4. Technical Stack & System Architecture

### 4.1 Recommended Tech Stack
* **Host Shell Application:** C# (.NET 8) Native Win32 Wrapper. Handles window management, low-level hooks, IPC, and tray controls.
* **UI Engine / Renderer:** `WebView2` running a lightweight `TypeScript` + `PixiJS` (or HTML5 Canvas 2D) renderer.
* **Inter-Process Communication:** Bidirectional JSON messaging over `CoreWebView2.PostWebMessageAsJson` at $60\,\text{Hz}$ for mouse positions and $1\,\text{Hz}$ for desktop layout updates.

```
+-------------------------------------------------------------------------+
|                              C# .NET 8 HOST                             |
|                                                                         |
|  +--------------------+  +----------------------+  +-----------------+  |
|  | WorkerW Manager    |  | Desktop Icon Tracker |  | Raw Input Hook  |  |
|  | (Win10 / Win11)    |  | (SysListView32)      |  | (RIDEV_INPUT)   |  |
|  +---------+----------+  +----------+-----------+  +--------+--------+  |
|            |                        |                       |           |
|            +------------------------+-----------------------+           |
|                                     | (JSON IPC Bridge)                 |
|                                     v                                   |
|  +-------------------------------------------------------------------+  |
|  |                         WebView2 Runtime                          |  |
|  |                                                                   |  |
|  |   +-----------------------------------------------------------+   |  |
|  |   |                PixiJS / Canvas 2D Renderer                |   |  |
|  |   |                                                           |   |  |
|  |   |  +-------------------+  +---------------+  +-----------+  |   |  |
|  |   |  | Procedural Cats   |  | Physics Engine|  | UI Overlay|  |   |  |
|  |   |  | (Spine/FSM)       |  | (AABB Solvers)|  | (Pills)   |  |   |  |
|  |   |  +-------------------+  +---------------+  +-----------+  |   |  |
|  |   +-----------------------------------------------------------+   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### 4.2 Win32 Integration Mechanics

#### WorkerW Embedding Algorithm
1. Locate top-level window `Progman`.
2. Issue `SendMessageTimeout(Progman, 0x052C, 0, 0, SMTO_NORMAL, 1000, out result)`.
3. Find the created `WorkerW` window:
   * **Win 10 & Win 11 (<24H2):** Search for `WorkerW` as a sibling behind `SHELLDLL_DefView`.
   * **Win 11 (24H2+):** Search for `WorkerW` spawned directly as a child of `Progman`.
4. Set the host window parent to `WorkerW` via `SetParent(hwndHost, workerwHwnd)`.

#### Desktop Icon Position Reader
```csharp
// High-level process for reading SysListView32 icons
IntPtr hProgman = FindWindow("Progman", null);
IntPtr hShell = FindWindowEx(hProgman, IntPtr.Zero, "SHELLDLL_DefView", null);
IntPtr hList = FindWindowEx(hShell, IntPtr.Zero, "SysListView32", null);

uint processId;
GetWindowThreadProcessId(hList, out processId);
IntPtr hProcess = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, processId);
IntPtr remoteMem = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)Marshal.SizeOf<RECT>(), MEM_COMMIT, PAGE_READWRITE);

// Loop through LVM_GETITEMCOUNT and fetch LVM_GETITEMRECT via ReadProcessMemory
```

#### Smart Throttling & Occlusion Guard
* Polls `SHQueryUserNotificationState` and visible window bounds (`EnumWindows` + `DwmGetWindowAttribute`).
* When a fullscreen game or maximized app window covers the active screen:
  * Triggers `Renderer.Pause()` (stops requestAnimationFrame).
  * Forces CPU/GPU usage down to **$0.0\%$**.

---

## 5. Detailed Module Architecture & Data Specs

### 5.1 Cat Finite State Machine (FSM)

```
             +--------+
             |  IDLE  | <-----------------------+
             +---+----+                         |
                 |                              |
       +---------+---------+                    |
       |                   |                    |
       v                   v                    |
  +---------+         +---------+          +----+----+
  | WANDER  |         |  STALK  |          |   NAP   |
  +----+----+         +----+----+          +---------+
       |                   |                    ^
       | (Speed > Limit)   | (In Range)         | (Idle > 5m)
       v                   v                    |
  +---------+         +---------+               |
  |  BONK   |         | POUNCE  +---------------+
  +---------+         +---------+
```

| State | Trigger Conditions | Movement Behavior | Visual Indicators |
| :--- | :--- | :--- | :--- |
| **`IDLE`** | Default state; no active targets nearby. | Stationary, occasional head turn or tail flick. | Slow eye blink, soft tail sway. |
| **`WANDER`** | Timer trigger or distant interest point. | Smooth steering with Perlin noise wander force. | Paws walking rhythmically. |
| **`STALK`** | Laser active, yarn rolling, or new file added. | Slow crawl towards target ($0.3\times$ speed). | Dilated pupils, lowered body, tail tip twitch. |
| **`WIGGLE`** | $0.4\,\text{s}$ prior to launching a pounce. | Stationary torso, fast butt/hip oscillation. | Hips sway at $12\,\text{Hz}$. |
| **`POUNCE`** | End of wiggle phase; target within pounce range. | High-velocity impulse along target vector + parabolic $z$-height. | Shadow detaches & shifts down-right; scale increases $15\%$. |
| **`BONK`** | Collision with icon/wall while $v > v_{threshold}$. | Velocity inverted with $0.4$ damping; knockback phase. | Star dust particles, squash/stretch mesh deformation. |
| **`NAP`** | $>5\,\text{mins}$ system idle or center rug reached. | Zero velocity. | Curls spine into circle/loaf, eyes closed ("Zzz" bubbles). |

### 5.2 JSON IPC Message Protocol

#### Host to Renderer: Icon Rects Update (`ICON_UPDATE`)
```json
{
  "type": "ICON_UPDATE",
  "timestamp": 1774026643000,
  "icons": [
    { "id": 0, "x": 32, "y": 48, "width": 75, "height": 75, "label": "Recycle Bin" },
    { "id": 1, "x": 32, "y": 140, "width": 75, "height": 75, "label": "Projects" }
  ]
}
```

#### Host to Renderer: Mouse Event (`MOUSE_RAW`)
```json
{
  "type": "MOUSE_RAW",
  "x": 960,
  "y": 540,
  "buttons": { "left": false, "right": false, "middle": false },
  "laserMode": true,
  "splitPrism": false
}
```

---

## 6. Complete Project Directory Structure

```text
CatFloorWallpaper/
├── build/                              # Release binaries & installer scripts
├── config/
│   └── default-settings.json           # Defaults for cat count, FPS caps, hotkeys
├── src/
│   ├── Host.Win32/                     # C# (.NET 8) Desktop Host Application
│   │   ├── Host.Win32.csproj
│   │   ├── Program.cs                  # Entry point & Single-instance mutex
│   │   ├── SystemTrayContext.cs        # Tray icon, context menu & settings dialog
│   │   ├── Native/
│   │   │   ├── Win32Api.cs             # User32/Kernel32 P/Invoke declarations
│   │   │   ├── WorkerWManager.cs       # Win10 & Win11 24H2+ desktop embedding
│   │   │   └── SysListViewReader.cs    # Shared memory Explorer icon reader
│   │   ├── Hooks/
│   │   │   ├── RawInputHook.cs         # Non-intrusive global mouse listener
│   │   │   ├── DesktopWatcher.cs       # FileSystemWatcher for Desktop folder
│   │   │   └── OcclusionMonitor.cs     # Fullscreen app & gaming pause checker
│   │   └── Bridge/
│   │       ├── WebViewHost.cs          # Borderless WebView2 controller
│   │       └── IpcChannel.cs           # Async C# to JS IPC pipeline
│   │
│   └── Renderer.Web/                   # Frontend Web Application (TS + PixiJS)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts                 # Main loop, canvas init & IPC receiver
│           ├── core/
│           │   ├── DynamicFsm.ts       # State machine base class
│           │   ├── PhysicsWorld.ts     # Collision solver (Circle-Circle & Circle-AABB)
│           │   └── SurfaceManager.ts   # Hardwood vs. Rug friction zones
│           ├── entities/
│           │   ├── CatEntity.ts        # Spine chain, coat rendering & behaviors
│           │   ├── CatCoatGenerator.ts # Procedural canvas patterns (Calico, Tabby, etc.)
│           │   ├── YarnBall.ts         # Roll physics + Verlet string renderer
│           │   ├── PrismLaser.ts       # Normal & Split-Prism laser dot logic
│           │   └── CardboardBox.ts     # Floor prop with occupancy slot
│           ├── environment/
│           │   ├── HardwoodFloor.ts    # Procedural plank pattern generator
│           │   └── RugOverlay.ts       # Central woven rug rendering
│           └── ui/
│               ├── HudOverlay.ts       # Translucent pill HUD (Pounces/Bonks)
│               └── DebugVisualizer.ts  # Wireframe rendering for icon AABBs
└── tests/
    ├── Host.Tests/                     # Win32 integration unit tests
    └── Renderer.Tests/                 # Collision & FSM logic unit tests
```

---

## 7. Step-by-Step Implementation Roadmap

### Phase 1: Pure Browser Gameplay Prototype (Weeks 1–2)
* **Objective:** Validate top-down visuals, procedural cat animation, and physics in isolation.
* **Tasks:**
  1. Set up `Renderer.Web` with Vite + TypeScript + PixiJS.
  2. Implement `HardwoodFloor.ts` and `RugOverlay.ts` visual canvas background.
  3. Build `CatEntity.ts` using a 3-node segment chain (`head`, `torso`, `hips`) + 5-node tail.
  4. Build `PhysicsWorld.ts` supporting Circle-Circle (cat-cat) and Circle-AABB (mock icon rects) collisions.
  5. Code the FSM states (`WANDER`, `STALK`, `WIGGLE`, `POUNCE`, `BONK`, `NAP`).
  6. Implement the `PrismLaser` system with Split Prism (X3) beam fracturing and the `YarnBall` prop.
* **Deliverable:** Fully playable browser demo with draggable fake desktop icons and interactive cat pack.

### Phase 2: Win32 Host Shell & Desktop Embedding (Weeks 3–4)
* **Objective:** Parent the application window into the Windows `WorkerW` wallpaper layer.
* **Tasks:**
  1. Initialize C# .NET 8 WPF/WinForms application skeleton (`Host.Win32`).
  2. Implement `WorkerWManager.cs` supporting both Windows 10/11 (<24H2) and Windows 11 (24H2+) window trees.
  3. Embed `WebView2` into the borderless host window, pointing to the local web build.
  4. Implement `RawInputHook.cs` to capture mouse movement and click inputs seamlessly through the desktop layer.
* **Deliverable:** The browser cat floor rendering natively as your active Windows desktop background.

### Phase 3: Desktop Icon Detection & Shell Hooks (Weeks 5–6)
* **Objective:** Connect real Windows desktop geometry and OS events to the live wallpaper.
* **Tasks:**
  1. Complete `SysListViewReader.cs` using `VirtualAllocEx` and `ReadProcessMemory` to scan `SysListView32` icon bounding boxes.
  2. Pass icon rect coordinates down through `IpcChannel.cs` to update `PhysicsWorld.ts` obstacle map in real time.
  3. Integrate DPI scaling translation (`PerMonitorV2` awareness) so bounding boxes map perfectly at 100%, 125%, 150%+ display scaling.
  4. Implement `DesktopWatcher.cs` (`FileSystemWatcher`) for new desktop files and Recycle Bin state listener.
* **Deliverable:** Cats physically bonk into your real desktop folders, react to new files, and chase yarn balls bouncing off desktop shortcuts.

### Phase 4: Optimization, Tray UI & Distribution (Weeks 7–8)
* **Objective:** Ensure daily-driver reliability, zero performance impact during heavy workflows, and easy user customization.
* **Tasks:**
  1. Build `OcclusionMonitor.cs` to auto-pause render loops when fullscreen games or maximized apps are active.
  2. Create `SystemTrayContext.cs` with options to:
     * Toggle Cat Count (1 to 12 cats).
     * Toggle HUD visibility (`POUNCES | BONKS`).
     * Set Frame Rate Caps (30 FPS / 60 FPS / Uncapped).
     * Re-scan Desktop Icons manually.
  3. Write persistent settings saver (`config/user-settings.json`).
  4. Package final release into a single portable EXE or installer using WiX / InnoSetup.
* **Deliverable:** Production-ready live wallpaper software.

---

## 8. Verification & Debugging Checklists

### Win32 Desktop Hooking Checklist
- [ ] Wallpaper stays pinned behind desktop icons when pressing `Win + D` (Show Desktop).
- [ ] No visual flicker occurs when switching virtual desktops or changing desktop wallpapers in Windows settings.
- [ ] Display scaling adjustments (e.g. 150% scaling on 4K display) map icon AABBs cleanly without offset drift.
- [ ] CPU usage stays below $1.5\%$ on mid-range hardware during active 60 FPS animation.
- [ ] GPU usage drops to $0.0\%$ within $1\,\text{second}$ of launching any fullscreen application or game.

### Physics & Cat Behavior Checklist
- [ ] Cat spine segments maintain rigid constraint limits without stretching or snapping on rapid direction changes.
- [ ] Cats do not overlap or clip into icon bounding boxes during high-speed pounces.
- [ ] Bonk particles and impact star overlays trigger only when collision velocity exceeds $v_{threshold} = 350\,\text{px/s}$.
- [ ] Split Prism mode splits 1 laser target into 3 distinct targets without causing cat AI state locks.
- [ ] Cats enter `NAP` state on the center rug after $5\,\text{minutes}$ of input inactivity.