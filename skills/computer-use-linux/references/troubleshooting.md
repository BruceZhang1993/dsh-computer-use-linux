# Troubleshooting

## Read `doctor` first

`mcp__cul__doctor` (or `node scripts/doctor.mjs`) is the single source of truth.
It reports readiness plus a capability map. Typical failures and their fix:

| `doctor` says | Cause | Fix |
| --- | --- | --- |
| accessibility unavailable | AT-SPI bridge off, or the app started with it disabled | `computer-use-linux setup` (GNOME); restart the target app |
| windowing backend unavailable | no compositor backend could answer | see the window targeting table in `setup.md`; on GNOME install the Shell extension and re-login |
| pointer input unavailable on Wayland | neither absolute `uinput` nor an approved portal session | start `ydotoold` (socket in `$XDG_RUNTIME_DIR`, mode `0600`) or approve the RemoteDesktop portal prompt |
| screenshot route unavailable | portal denied, or a backend mismatch | try `COMPUTER_USE_LINUX_SCREENSHOT_BACKEND=portal`, then `gnome-screenshot` for background/systemd contexts |
| keyboard preflight rejects text | GNOME multi-layout keymap cannot synthesize a character | use `set_value` on the editable field instead of `type_text` |

The server distinguishes *not available* from *failed*: a refused coordinate
action returns `ok: false` rather than falling back to inaccurate relative
motion. Treat that as a configuration signal.

## The DSH side

**Tools do not appear at all.** Check, in order:

1. The bundle is installed and enabled — `dsh plugin --profile <name> ls`, the
   DSH plugin manager, or `plugin_manager list_bundles`.
2. The `mcp-computer-use-linux` row exists in the composed tree:
   `dsh --profile <name> --dump-config | grep -A12 mcp-computer-use-linux`.
3. The launcher resolves:
   `node <plugin>/scripts/install-binary.mjs --check`.
4. The server speaks MCP: `node <plugin>/scripts/selftest.mjs`.

`failOnStartupError` is `false` on purpose: a broken desktop must not stop the
harness from booting. The cost is that a connection failure is a log line, not
a startup error — so check the logs, then the launcher, then the binary.

**Tools appear but every call fails.** The child process died after negotiating.
Run the launcher by hand and watch stderr:

```sh
COMPUTER_USE_LINUX_BIN=/path/to/computer-use-linux node bin/computer-use-linux-mcp.mjs
```

If the binary is missing entirely, the launcher downloads it on first use; on an
air-gapped host set `COMPUTER_USE_LINUX_DOWNLOAD_BASE` to a mirror, or
`COMPUTER_USE_LINUX_SKIP_DOWNLOAD=1` plus `COMPUTER_USE_LINUX_BIN`.

**Calls time out.** The row sets `toolCallTimeoutMs: 120000` because a first-run
download, an uncached AT-SPI tree, or a portal consent dialog can take longer
than the 60 s default. If the desktop is slower still, raise it in the profile
patch. Calls are cancellable like any other tool call.

**Screenshots are text, not images.** Screenshot results are MCP image content.
The harness turns them into real images only when the current model accepts
image input and attachments are enabled; otherwise the model sees a diagnostic
message instead of the image. Observation still works: `get_app_state` with
`include_screenshot: false` returns only the accessibility tree, and every
returned screenshot carries `scale`, `coordinate_width`, and `coordinate_height`
so coordinates stay usable even from metadata.

**A second desktop driver is installed.** If `@deepseek-ai/dsh-computer-use` is
mounted, this plugin claims the provider slot and any other provider fails to
register — by design. Enable exactly one.

## Environment variables

Set these in the environment the harness is launched from; they survive the
mcp-client's credential scrub (only `/KEY|PASSWORD|SECRET|TOKEN/i` and `DSH_*`
names are dropped).

| Variable | Effect |
| --- | --- |
| `COMPUTER_USE_LINUX_BIN` | Absolute path to the binary; skips resolution and download |
| `COMPUTER_USE_LINUX_VERSION` | Release version the plugin pins and caches (default `0.7.13`) |
| `COMPUTER_USE_LINUX_DOWNLOAD_BASE` | Release base URL (mirrors, air-gapped hosts) |
| `COMPUTER_USE_LINUX_SKIP_DOWNLOAD` | `1` forbids the automatic download |
| `COMPUTER_USE_LINUX_COSMIC_HELPER` | Path to the COSMIC helper |
| `COMPUTER_USE_LINUX_INDICATOR` | `0`/`false`/`off` turns the overlay off |
| `COMPUTER_USE_LINUX_INDICATOR_BIN` | Path to the overlay helper |
| `COMPUTER_USE_LINUX_INDICATOR_HIDE_TEXT` | `1` masks all typed text and keycaps |
| `COMPUTER_USE_LINUX_AGENT_NAME` | Name shown in the overlay instead of the MCP client's |
| `COMPUTER_USE_LINUX_ENABLE_SHELL` | `1` registers the unsandboxed `run_shell` tool — leave unset |
| `COMPUTER_USE_LINUX_NOTIFY_ON_COMPLETE` | `1` registers `complete_interaction` (needs `notify-send`) |
| `COMPUTER_USE_LINUX_PERSIST_REMOTE_DESKTOP` | `1` remembers portal pointer/keyboard grants |
| `COMPUTER_USE_LINUX_SCREENSHOT_BACKEND` | Force `gnome-shell`, `portal`, `x11`, or `gnome-screenshot` |
| `COMPUTER_USE_LINUX_FORCE_PORTAL_POINTER` / `…_KEYBOARD` | Prefer the RemoteDesktop portal |
| `COMPUTER_USE_LINUX_FORCE_YDOTOOL_POINTER` / `…_KEYBOARD` | Force ydotool; pointer forcing disables accurate coordinate input |
| `COMPUTER_USE_LINUX_FORCE_XDOTOOL_KEYBOARD` | Prefer `xdotool`/XTEST keyboard when `DISPLAY` exists |
| `COMPUTER_USE_LINUX_XDOTOOL_TYPE_DELAY_MS` | Per-character delay for `xdotool type` (default 12) |
| `COMPUTER_USE_LINUX_PORTAL_SCROLL_INVERT` | `1` reverses portal vertical scrolling |
| `CU_DISABLE_ABS_POINTER` | Disable the `uinput` absolute pointer |
| `YDOTOOL_SOCKET` | Explicit ydotool socket path (operator trust override) |

## Safety reminders

- The overlay exists so a human can see what the agent does. Do not turn it off
  for unattended work; turn off the work instead.
- `run_shell` is not a sandbox. The harness's own shell tool is the supported
  route for command execution.
- Screenshots and AT-SPI trees can contain secrets. `include_screenshot: false`
  is the cheap mitigation.
