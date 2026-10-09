---
name: computer-use-linux
description: "Observe and operate the local Linux desktop through the computer-use-linux MCP server: AT-SPI accessibility trees, screenshots, compositor window targeting, and synthetic input (click, drag, scroll, type, press keys). Tools appear as mcp__cul__<tool>."
whenToUse: "Use when the user asks the agent to drive a local Linux GUI application — clicking, typing, reading a window's contents, taking a screenshot, or diagnosing why desktop control does not work. Not for web pages, remote machines, or headless automation."
---

# computer-use-linux

This profile bridges the [`computer-use-linux`](https://github.com/agent-sh/computer-use-linux)
MCP server into DeepSeek Harness. The server runs **on this machine**, over
stdio, and controls **the desktop the harness is running in**.

Every tool is namespaced: `mcp__cul__<tool>`, for example
`mcp__cul__get_app_state`, `mcp__cul__click`. The server's own instruction text
is already in the system prompt, so start here only when you need the workflow
or the failure modes.

## When to use

Use it when the task is about a real GUI application on this desktop:

- read what a window contains (accessibility tree, not guesswork);
- focus, move, or resize a window;
- click, drag, scroll, type, or send key chords into an application;
- take a screenshot of the screen or of one window;
- find out why desktop control is not working (`mcp__cul__doctor`).

Do not use it when a better-scoped tool exists: browser automation for
websites, file/shell tools for headless work, or an application's own CLI or
API. Desktop control is the most fragile, highest-privilege option available.

## The loop

1. **Diagnose once per session.** `mcp__cul__doctor` returns a readiness report
   (platform, portals, accessibility, windowing backend, input backend). If
   readiness is false, fix the reported cause before acting — a mutating call
   against a half-configured session either fails or hits the wrong target.
2. **Discover.** `mcp__cul__list_windows` and `mcp__cul__focused_window` give
   window ids, pids, `app_id`, `wm_class`, titles, focus state, and bounds.
   `mcp__cul__list_apps` lists applications the AT-SPI registry can see.
3. **Observe.** `mcp__cul__get_app_state` returns a screenshot plus a
   size-bounded accessibility tree with element indices. Always scope it with
   `app_name_or_bundle_identifier` or a window target; an unscoped call returns
   the whole desktop tree and reports `tree_scoped: false`.
4. **Act** with element indices, semantic selectors, or window-targeted input.
5. **Re-observe.** Never assume an action landed. Call `get_app_state` again,
   or check the focused element feedback that targeted `type_text` and
   `press_key` return.

Indices are stable for the lifetime of one `get_app_state` snapshot and are
republished only between input operations — always resolve a fresh snapshot
after anything changes on screen.

## Tools

| Group | Tools |
| --- | --- |
| Diagnostics | `doctor`, `setup_accessibility`, `setup_window_targeting` |
| Discovery | `list_apps`, `list_windows`, `focused_window` |
| Observation | `get_app_state`, `screenshot` |
| Input | `click`, `drag`, `scroll`, `press_key`, `type_text` |
| Semantic | `perform_action`, `set_value` |
| Windows | `activate_window`, `move_window`, `resize_window` |

Two tools beyond this list are deliberately absent unless the server was
started with the matching environment variable: `complete_interaction`
(`COMPUTER_USE_LINUX_NOTIFY_ON_COMPLETE=1`) and `run_shell`
(`COMPUTER_USE_LINUX_ENABLE_SHELL=1`). Leave `run_shell` off — the harness
already has a shell tool with a sandbox, and that server-side tool is an
unsandboxed trust-boundary opt-in.

## Targeting and coordinates

- **Prefer semantic, then targeted, then coordinate.** An AT-SPI element index
  or selector survives layout changes; raw pixels do not. For a plain left
  click on an element that exposes a native `click`/`press`/`toggle` action,
  the server uses the accessibility action instead of the pointer.
- **Coordinate input needs a scale conversion.** Screenshots are size-bounded
  and may be downscaled. Divide preview `x`/`y` by the returned `scale` before
  passing them, and use `coordinate_width`/`coordinate_height` to verify.
- **`relative: true` on coordinate `click`/`scroll`** measures from the
  targeted window's clipped crop origin, not from GDK/widget coordinates, and
  is rejected without a window target.
- **Target the window** (`window_id`, `pid`, `app_id`, `wm_class`, `title`, or
  a terminal selector) for `press_key`/`type_text` when focus is uncertain.
  Results warn when no editable element holds focus, or when the target is
  partially or fully off-screen.
- **Focus is global.** Any call that activates a window steals the user's
  keyboard focus. Announce what you are about to do when a person is using the
  machine.

## Safety

These tools change real application state. Treat them like shell access, not
like a screenshot utility.

- Read-only: `doctor`, `list_apps`, `list_windows`, `focused_window`,
  `get_app_state`. Everything else mutates focus, geometry, scroll position, or
  application content; `click`, `drag`, `press_key`, `type_text`,
  `perform_action`, and `set_value` are marked `destructiveHint` because they
  can submit, delete, send, or purchase.
- `setup_accessibility` and `setup_window_targeting` change user desktop
  configuration. On GNOME, `setup_window_targeting` needs a **log out and back
  in** before it takes effect.
- Never type into a window you have not identified, and never send
  `Enter`/`Tab` blindly after typing — verify the field first.
- Screenshots can capture passwords and private content. `get_app_state`
  accepts `include_screenshot: false` when only the tree is needed.
- AT-SPI exposes window contents to any client on this user's session bus, and
  `ydotoold` gives any process that can reach its socket full input synthesis.
  Keep the socket in the user runtime directory (`0600`), never `/tmp`.

## First-time setup

Most of this is a one-time human step; `doctor` tells you what is missing.

- **Accessibility (AT-SPI)** must be enabled, or the tree is empty.
  `mcp__cul__setup_accessibility` does it on GNOME; on KDE Plasma check that the
  AT-SPI bridge is enabled in the session.
- **Wayland coordinate input** needs either the absolute `uinput` pointer
  (a running `ydotoold` with access to `/dev/uinput`) or an approved
  `org.freedesktop.portal.RemoteDesktop` session. Without either, coordinate
  clicks and drags return `ok: false` rather than approximating.
- **Exact window activation on GNOME** needs the bundled Shell extension
  (`setup_window_targeting`, then re-login). On KDE Plasma, niri, Hyprland, i3,
  and generic X11/EWMH, the relevant compositor tools must be reachable from
  the session.
- **Screenshots** go through the desktop portal on Wayland and may show a
  consent prompt the first time. `COMPUTER_USE_LINUX_PERSIST_REMOTE_DESKTOP=1`
  remembers portal grants.

See `references/setup.md` for the commands and `references/troubleshooting.md`
for interpreting a failing `doctor` report.
