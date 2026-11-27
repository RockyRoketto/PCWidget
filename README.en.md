<div align="center">

<img src="winres/icon256.png" width="96" alt="">

# PC Widget

**A Windows desktop widget: CPU, GPU, memory, network and disks at a glance**

[![Version](https://img.shields.io/github/v/release/RockyRoketto/PCWidget?label=version&color=e9b872)](https://github.com/RockyRoketto/PCWidget/releases/latest)
![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-4a4a52)

### [⬇ Download widget.exe](https://github.com/RockyRoketto/PCWidget/releases/latest/download/widget.exe)

[Русский](README.md) · **English** · [What's new](CHANGELOG.en.md)

</div>

<img src="media/themes.png" width="100%" alt="Seven themes: Sheet, Gauge, Fill, LCD, Oscilloscope, Blueprint, Pixels">

CPU and GPU load and temperatures, memory, network, disks and processes, always on your desktop. It is a single exe that lives in the tray, and everything is configured from the widget itself. The interface is currently in Russian only; screenshots show sample data.

[Getting started](#getting-started) · [What it shows](#what-it-shows) · [Looks](#looks) · [Clock and weather](#clock-and-weather) · [Games](#games) · [Updates and removal](#updates-and-removal) · [Privacy](#network-and-privacy)

## Getting started

1. Download `widget.exe` and run it (Windows 10 or 11, 64-bit). If Windows says "Unknown publisher" (the exe is not code-signed), click "More info" → "Run anyway".
2. Click «Установить» (Install). The program copies itself to `Program Files\PCWidget`, appears in the Start menu, starts with Windows and launches right away. Progress and the result are shown on screen; you can delete the downloaded file afterwards.
3. For CPU temperature, clock and power the installer offers the [PawnIO](https://pawnio.eu/) driver (installed through `winget`; you can also do it later from the menu). Without it everything else works, those readings are simply absent.

Settings open by right-clicking the widget or its tray icon. Autostart can be turned off there. To run without installing, pass `--portable`.

**Requirements.** WebView2 Runtime (preinstalled on Windows 11), .NET Framework 4 (preinstalled on Windows) and administrator rights: CPU sensors cannot be read without them. The GPU tile needs an NVIDIA card with its driver; without one it says «Нет данных» (No data).

## Features

### What it shows

Only what you need: any tile can be turned on, hidden or moved. An enabled tile is always visible: while there is no data it shows its name and a hint, such as «Выбери город в настройках» (choose a city in settings) or «Ничего не играет» (nothing is playing).

- CPU, GPU, memory, network (speed, ping, daily and monthly traffic), disks, top processes, session peaks, uptime.
- Optional: clock, calendar, weather, energy, focus timer, Now playing, Where the day went and Claude Code limits.
- **Now playing:** what Windows shows in its volume flyout (browsers and media players): title, artist, cover art, track progress and the buttons the source allows. With several sources, click the name to switch between them. In Column, Strip and Square it is a row; click it to pause and resume.
- **Where the day went** («Куда ушёл день»): how long each program was in the foreground today. Programs show real names instead of exe names (Steam and Epic games are named as in the library) with their icons. After 5 minutes without mouse or keyboard input counting stops, unless a video or a fullscreen game is on screen. In the tile settings you can give a program your own name.
- **Energy:** CPU and GPU consumption in Wh per day and month, with the cost at your tariff. Other PC parts are not counted.
- **Focus:** a pomodoro timer with sound and a notification.
- **Alerts:** temperature and usage thresholds, optional Windows notifications.

### Looks

Seven themes, each in light, dark and "follow Windows".

- Sheet (glass), Gauge (segmented scales), Fill (color gradient), LCD (segmented digits), Oscilloscope, Blueprint, Pixels. Any tile can have its own color.
- Modes: Panel, Wide, Column, Strip, Square. You choose the mode and size.
- Drag tiles with the mouse, make them half or full width; some can also be thin.
- The widget snaps to screen edges, screen center lines and window edges.
- Up to six appearance profiles, transferable as a file.

<img src="media/modes.png" width="100%" alt="Modes: Wide, Column, Square, Strip">

The widget sits on the desktop and survives Win+D, can be always on top, scales, and protects against screen burn-in.

### Clock and weather

- Clock and calendar: several faces matching each theme.
- Weather: now and for the week, with an animated background (can be turned off).
- Optional: per-thread CPU bars, a memory map by process and a GPU fan icon (in the settings of that tile).

<img src="media/features.png" width="100%" alt="Clock, calendar, weather, CPU threads and memory map">

### Games

- **Game mode:** FPS, 1% low and frame time over a windowed or borderless game (Ctrl+Shift+F). Nothing is injected into the game; exclusive fullscreen cannot be overlaid.
- **Game summary:** after a game, a card with FPS, 1% low, stutters, peak temperatures and energy used; it can be saved as an image.

<img src="media/game.png" width="100%" alt="Game summary card">

## Updates and removal

Shortly after start, every hour and when you open the settings the widget checks GitHub for a new version. If there is one, a yellow update bar appears above the tiles: click it (or use «Настройки → Система → О программе → Обновить») and confirm. The widget downloads the new version (progress is shown), verifies its checksum and restarts; settings are kept. Nothing is downloaded without your consent. The check can be turned off in the same place.

To remove it, use «Настройки → Система → Удалить…» (Settings → System → Remove), the menu item «Удалить PC Widget…» or "Apps & features" in Windows. Settings remain in `%APPDATA%\pcwidget` and the unpacked sensor libraries in `%LOCALAPPDATA%\pcwidget`; delete these folders by hand if you wish. The PawnIO driver is removed separately.

## Network and privacy

There is no telemetry. The widget only connects to:

| Where | Why | When |
|---|---|---|
| `1.1.1.1:443` | ping and packet loss (connection only, no data sent) | every 5 seconds |
| `api.github.com`, `github.com` | checking for a new version, and downloading it with your consent | after start, every hour and when you open the settings; can be turned off |
| `open-meteo.com` | weather for the city you type in | only while the weather tile is enabled |

**The Where the day went tile** is off by default and counts only while enabled. It keeps program names, their icons and today's seconds on this PC (`%APPDATA%\pcwidget\day.json`); window titles and websites are not recorded, and none of this leaves the PC.

**The Claude tile** is off by default. It reads local Claude Code files in `~/.claude` (logs, to count tokens, and the session list). It does not read your login token and makes no network requests. The button that connects usage limits adds a small mod to `~/.claude/skills/pcwidget-limits`; disconnecting or uninstalling the widget removes it.

## For developers

A single Go exe without CGO: a custom Win32 window hosting WebView2. Once a second Go sends the readings to the page (HTML, CSS and JavaScript from `assets/`, all embedded in the exe). CPU sensors are read by a small C# helper, compiled on the machine with the built-in `csc.exe`, using LibreHardwareMonitorLib. The GPU is queried through `nvidia-smi`.

You need Go (version as in `go.mod`) and PowerShell.

```powershell
go install github.com/tc-hib/go-winres@latest
```

```powershell
./scripts/build.ps1
```

The script runs the tests, downloads the LibreHardwareMonitor release, adds the icon and manifest, and writes `dist/widget.exe`. Without `go-winres` the exe is built without them.

[MIT](LICENSE) license. Third-party components and their licenses are listed in [THIRD-PARTY.md](THIRD-PARTY.md). This is an independent project, not affiliated with Anthropic, NVIDIA, Microsoft, or the authors of LibreHardwareMonitor and PawnIO. All names belong to their owners.

---

<div align="center">

© RockyRoketto

</div>
