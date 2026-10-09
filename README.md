# dsh-computer-use-linux

**Linux desktop computer use for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** —
the [`computer-use-linux`](https://github.com/agent-sh/computer-use-linux) MCP
server bridged into DSH as native tools, with its skill bundled.

The agent can observe the local desktop (AT-SPI accessibility trees, window
lists, screenshots) and act on it (focus/move/resize windows, click, drag,
scroll, type, press keys, invoke accessibility actions) — on Wayland or X11,
through the same tools Claude Code and Codex get from the upstream plugin.

No DSH modifications. No runtime dependencies. The bridge is the in-box
`@deepseek-ai/dsh-mcp-client` plugin.

## Architecture

```
DSH agent
  │  tools: mcp__cul__doctor, mcp__cul__get_app_state, mcp__cul__click, … (18)
  ▼
@deepseek-ai/dsh-mcp-client        ← in-box DSH bridge (official MCP SDK, stdio)
  │  newline-framed JSON-RPC 2.0
  ▼
bin/computer-use-linux-mcp.mjs     ← this package: resolve → verify → exec
  ▼
computer-use-linux mcp             ← pinned upstream release (Rust, ~9 MB)
  ├─ AT-SPI registry   → accessibility trees, semantic actions
  ├─ compositor backends → window list / focus (GNOME, KWin, Hyprland, niri, i3, COSMIC, X11/EWMH)
  ├─ portals / Shell   → screenshots
  └─ ydotool / portal / xdotool → input synthesis
```

Two decisions define this integration:

- **Bridge, don't reimplement.** The upstream server is the supported desktop
  engine and it already speaks MCP. Wrapping it as DSH native tools keeps every
  upstream fix one version bump away, and the DSH MCP bridge owns naming,
  reconnection, image projection, and cancellation.
- **Isolate the device layer.** A small resolver owns the only piece that is
  inherently machine-specific: which binary to run. That is the one place worth
  custom code, and it is testable without a desktop.

## Requirements

- Linux (x86_64 or arm64). The plugin is disabled on other platforms.
- DeepSeek Harness with the in-box `@deepseek-ai/dsh-mcp-client` available
  (every shipped profile already has it).
- Node 20+ for the launcher. Inside DSH Desktop the launcher runs under the
  Electron binary via `ELECTRON_RUN_AS_NODE=1`.
- A desktop session. Accessibility, window targeting, and input backends are
  per-compositor concerns — run `mcp__cul__doctor` and see
  `skills/computer-use-linux/references/setup.md`.

## Install

### DSH Desktop

Open the plugin manager and install the bundle from this directory, or from a
registry once published. Desktop profiles are managed exclusively by the app,
so `dsh plugin --profile desktop add …` is refused by design.

### CLI profiles

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
```

Then restart the harness. The model's tool list gains
`mcp__cul__doctor`, `mcp__cul__get_app_state`, `mcp__cul__list_windows`,
`mcp__cul__click`, and the rest.

### Pre-download the desktop binary (recommended)

The launcher downloads and sha256-verifies the pinned release on first use.
Doing it at install time keeps the first tool call fast and surfaces network
problems early:

```sh
node scripts/install-binary.mjs          # download + verify into the cache
node scripts/install-binary.mjs --check  # show what would be used
```

## Verify

```sh
node scripts/check-package.mjs   # static: patch, exports, skill consistency
node scripts/selftest.mjs        # MCP handshake + tools/list through the launcher
node scripts/selftest.mjs --call doctor
node scripts/doctor.mjs          # desktop readiness report, no DSH needed
node --test test/                # unit + launcher tests
```

In a session, ask the agent to call `mcp__cul__doctor` first: it returns the
platform, portals, accessibility, windowing and input backends, and a
readiness summary.

## Tools

All 18 default upstream tools are exposed, namespaced as `mcp__cul__<tool>`.

| Group | Tools |
| --- | --- |
| Diagnostics | `doctor`, `setup_accessibility`, `setup_window_targeting` |
| Discovery | `list_apps`, `list_windows`, `focused_window` |
| Observation | `get_app_state`, `screenshot` |
| Input | `click`, `drag`, `scroll`, `press_key`, `type_text` |
| Semantic | `perform_action`, `set_value` |
| Windows | `activate_window`, `move_window`, `resize_window` |

Two conditional upstream tools stay off unless the environment opts in:
`run_shell` (`COMPUTER_USE_LINUX_ENABLE_SHELL=1`, deliberately unsandboxed — DSH
already has a sandboxed shell tool) and `complete_interaction`
(`COMPUTER_USE_LINUX_NOTIFY_ON_COMPLETE=1`).

## How the binary is resolved

In order, first hit wins:

1. `COMPUTER_USE_LINUX_BIN` — an absolute path (a local build, or
   `cargo install computer-use-linux`).
2. `~/.cache/computer-use-linux/plugin/v<version>/computer-use-linux` — the
   plugin cache. **The same layout as the upstream Claude Code / Codex plugin**,
   so one download serves every host on the machine.
3. the `@agent-sh/computer-use-linux` npm package, if installed.
4. `computer-use-linux` on `PATH`.
5. a GitHub release download, verified against the published `.sha256`.

Downloads are staged and renamed, so concurrent first starts and killed
downloads cannot leave a half-written binary. Version and mirror are
overridable: `COMPUTER_USE_LINUX_VERSION`, `COMPUTER_USE_LINUX_DOWNLOAD_BASE`,
`COMPUTER_USE_LINUX_SKIP_DOWNLOAD`.

## What the bundle adds

```yaml
# cordis.patch.yml — the whole declarative surface
- insert:
    - id: mcp-computer-use-linux      # one MCP server row, tools named mcp__cul__*
      name: '@deepseek-ai/dsh-mcp-client'
      ...
    - id: dsh-computer-use-linux      # the JS half: skill + provider slot
      name: 'dsh-computer-use-linux'
```

Everything else lives in the plugin entry (`lib/index.js`):

| Contribution | Mechanism | Why not a patch |
| --- | --- | --- |
| The 18 desktop tools | `@deepseek-ai/dsh-mcp-client` stdio row | — |
| The `computer-use-linux` skill | `ctx.skills.register()` | `skill-filesystem.bundledSkillDir` is a **single** slot defaulting to `$DSH_BUNDLED_SKILL_DIR`; overriding it would displace whatever else owns it |
| Provider exclusivity | `ctx.computerUse.register()` when the registry is mounted | needs runtime service access |
| Binary diagnostics | activation log line | needs runtime |

The launcher path is resolved through `createRequire` anchored at the *profile*
directory (`baseUrl`), never hard-coded, so the bundle works in any profile
under any `$DSH_HOME` and survives the pnpm store layout.

The desktop session variables the server needs (`WAYLAND_DISPLAY`, `DISPLAY`,
`XAUTHORITY`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`,
`XDG_CURRENT_DESKTOP`, `DESKTOP_SESSION`, `YDOTOOL_SOCKET`, and the
`COMPUTER_USE_LINUX_*` knobs) are **not** restated in the patch: the
mcp-client's credential scrub only drops names matching
`/KEY|PASSWORD|SECRET|TOKEN/i` and `DSH_*`, so they reach the server intact.

### Provider exclusivity

If `@deepseek-ai/dsh-computer-use` is mounted in the same composition, this
plugin claims the single computer-use provider slot
(`ctx.computerUse.register('dsh-computer-use-linux')`). A second desktop driver
then fails to register instead of silently fighting over the pointer. If the
registry is absent — a stock profile — the plugin logs and continues; the tools
are unaffected.

## Safety

These tools change real application state.

- `doctor`, `list_apps`, `list_windows`, `focused_window`, `get_app_state` are
  read-only. `click`, `drag`, `press_key`, `type_text`, `perform_action`, and
  `set_value` carry `destructiveHint` — they can submit, delete, send, or
  purchase in whatever application is targeted.
- Focus is global: activating a window steals the user's keyboard.
- Screenshots can capture secrets; `get_app_state` accepts
  `include_screenshot: false`.
- `ydotoold` gives any process that can reach its socket full input synthesis.
  Keep the socket in the user runtime directory (`0600`), never `/tmp`.
- The on-screen indicator shows what the agent is doing. Leave it on.
- Session approval policy still applies; the harness asks before calls
  according to its own policy, and these tools do not bypass it.

## Troubleshooting

Start with `node scripts/doctor.mjs`, then
`skills/computer-use-linux/references/troubleshooting.md` for the DSH-side
checklist (tools missing, calls failing, timeouts, screenshots arriving as
text) and the full environment variable reference.

## Development

```
lib/binary.mjs        binary resolution, verified download, server exec
lib/mcp-probe.mjs     dependency-free MCP stdio probe (selftest + tests)
lib/skill.mjs         bundled-skill frontmatter loader
lib/index.js          plugin entry: skill registration + provider slot
bin/…-mcp.mjs         the launcher the MCP client spawns
cordis.patch.yml      the bundle patch (the whole integration surface)
scripts/              install-binary · selftest · doctor · check-package
skills/               the bundled DSH skill
test/                 node:test suites (no network, no desktop needed)
```

`node --test test/` is used rather than a runner dependency: this package's
runtime is DSH's own Node/Electron, so its tests target that runtime directly
and the package ships with zero dependencies.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md) — the desktop
engine is [agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux)
(MIT), and the bundled skill is adapted from it.
