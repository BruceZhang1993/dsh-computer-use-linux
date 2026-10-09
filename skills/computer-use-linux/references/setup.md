# Setup

Two layers: the **harness side** (the DSH plugin, which the agent cannot
install for you) and the **desktop side** (accessibility, window targeting, and
input backends, which `mcp__cul__doctor` diagnoses).

## 1. Harness side

The plugin ships as one DSH bundle. It adds a `@deepseek-ai/dsh-mcp-client` row
plus a skill root, and it never modifies DSH itself.

Install into a profile (replace `web` with your profile; a DSH Desktop profile
is managed by the app — use its plugin manager):

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
# or from a registry, once published:
dsh plugin --profile web add dsh-computer-use-linux
```

Then restart the harness (or let the loader reload the profile) and confirm the
tools appear:

```sh
dsh web --profile web        # or restart DSH Desktop
```

The model now sees `mcp__cul__doctor`, `mcp__cul__get_app_state`,
`mcp__cul__click`, and the rest. Server instructions join the system prompt
automatically; the bundled skill is registered on `ctx.skills` by the plugin
entry, so it reaches the session catalog without touching
`skill-filesystem.bundledSkillDir` (a single shared slot).

Because the plugin entry is an ES module, a change *to the plugin itself*
takes effect on the next harness start; profile and patch changes apply on
reload.

Everything the plugin adds is reversible: remove the two rows
(`mcp-computer-use-linux`, `dsh-computer-use-linux`) or remove the bundle.

### Where the desktop binary comes from

The launcher resolves a binary in this order and only downloads when nothing
else exists:

1. `COMPUTER_USE_LINUX_BIN` — an absolute path you chose (a local `cargo build`
   or `cargo install` binary).
2. `~/.cache/computer-use-linux/plugin/v<version>/computer-use-linux` — the
   plugin cache, shared with the upstream Claude Code / Codex plugin.
3. the `@agent-sh/computer-use-linux` npm package, if installed.
4. `computer-use-linux` on `PATH`.
5. a GitHub release download, sha256-verified against the published
   `.sha256` asset.

Pre-download (recommended — avoids paying for it inside the first tool call):

```sh
cd /path/to/dsh-computer-use-linux
node scripts/install-binary.mjs          # downloads + verifies the pinned release
node scripts/install-binary.mjs --check  # report resolution without downloading
```

Pin a different release with `COMPUTER_USE_LINUX_VERSION=0.7.13`, mirror it with
`COMPUTER_USE_LINUX_DOWNLOAD_BASE`, or forbid downloads with
`COMPUTER_USE_LINUX_SKIP_DOWNLOAD=1`.

## 2. Desktop side

Run this first, always:

```sh
computer-use-linux doctor        # or: node scripts/doctor.mjs
```

It prints a JSON readiness report: platform, portals, accessibility, windowing
backend, input backend, and a capability map. Fix what it reports as missing.

### Accessibility (required for trees and semantic actions)

The AT-SPI bridge must be enabled, otherwise `get_app_state` returns an empty or
unscoped tree and element-index calls fail.

- GNOME: `computer-use-linux setup` (or `mcp__cul__setup_accessibility`) sets
  `org.gnome.desktop.interface toolkit-accessibility`.
- KDE Plasma and other desktops: verify the AT-SPI bridge is active in the
  session (`qdbus org.a11y.Bus /org/a11y/bus GetAddress` should answer) and
  that the application itself was started with accessibility enabled.

### Wayland coordinate input

Coordinate clicks, drags, and targeted scrolls need one of:

- an absolute `uinput` pointer — a running **ydotoold** whose socket lives in
  the private runtime directory (`/run/user/$UID/.ydotool_socket`, mode `0600`)
  and whose user can write `/dev/uinput`; or
- an approved `org.freedesktop.portal.RemoteDesktop` session (the server shows
  a consent dialog; `COMPUTER_USE_LINUX_PERSIST_REMOTE_DESKTOP=1` remembers the
  grant).

A launched `ydotoold` is a per-user service, never root. `install.sh` in the
upstream repository automates the systemd user unit; the manual equivalent is
documented there.

Without either, the server refuses coordinate input instead of approximating it
with relative motion — that refusal is the correct behaviour, not a bug.

### Exact window targeting

| Desktop | Backend | Requirement |
| --- | --- | --- |
| GNOME Wayland | bundled Shell extension, then `org.gnome.Shell.Introspect` | run `setup_window_targeting`, then **log out and back in** |
| KDE Plasma / KWin | temporary KWin DBus scripting | Plasma 5 or 6 session bus must expose `org.kde.KWin` |
| Hyprland | `hyprctl clients -j` / `dispatch focuswindow` | `hyprctl` reachable from the session |
| niri | `niri msg`, direct JSON IPC fallback | export the session's `NIRI_SOCKET` |
| i3 | `i3-msg` (optional `xprop`) | active i3 IPC socket |
| COSMIC | `computer-use-linux-cosmic` helper | installed next to the binary by this plugin's cache |
| generic X11 / XFCE | `wmctrl` + `xprop` | both on `PATH` |

Listing windows and focusing a window still work on compositors without a
dedicated backend; only exact targeting degrades.

### Input backends

- X11: keyboard prefers `xdotool`/XTEST, then falls back.
- Wayland: literal text uses `wtype`, then `ydotool` (1.0.3+), then the portal;
  KDE keeps its clipboard route for literal text.
- Overrides exist for every path (`COMPUTER_USE_LINUX_FORCE_*`) and are listed
  in `references/troubleshooting.md`.

### On-screen indicator

The server drives `computer-use-linux-indicator` by default: a click-through
overlay that shows where the agent is clicking and what it types. It is hidden
during every capture, so screenshots never contain it. Turn it off with
`COMPUTER_USE_LINUX_INDICATOR=0`, or mask all typed text with
`COMPUTER_USE_LINUX_INDICATOR_HIDE_TEXT=1` (password-role fields and
`set_value` are always masked).

## Optional: claim the computer-use provider slot

If `@deepseek-ai/dsh-computer-use` is mounted in the same composition, this
plugin registers itself as the single computer-use provider
(`ctx.computerUse.register('dsh-computer-use-linux')`). That is a **safety**
feature: it makes a second desktop driver fail loudly instead of silently
fighting over the pointer. If the registry is absent — the default in a stock
profile — the plugin simply logs and moves on, and the MCP tools work exactly
the same.
