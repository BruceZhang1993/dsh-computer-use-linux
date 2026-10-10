# dsh-computer-use-linux

[![CI](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Platform: Linux](https://img.shields.io/badge/platform-linux-blue.svg)](https://www.kernel.org)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B6BFB.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF.svg)](https://modelcontextprotocol.io)

**English** · [简体中文](README.zh-CN.md)

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

Install the plugin as a DSH bundle — there is no manual patch or config edit.
The full guide, including GitHub Packages authentication and the pre-download
step, is [docs/installation.md](docs/installation.md).

### CLI profiles — from GitHub Packages (normal install)

```sh
dsh plugin --profile web add @brucezhang1993/dsh-computer-use-linux          # latest
dsh plugin --profile web add @brucezhang1993/dsh-computer-use-linux@0.1.0    # pin a version
```

`dsh plugin` delegates to pnpm in the profile directory, checks the package
against the running DSH version before downloading anything, and once the
install succeeds selects the bundle in the profile's `dsh.profile.bundles` —
that selection is what makes the profile layer load. Then restart the harness.
The model's tool list gains `mcp__cul__doctor`, `mcp__cul__get_app_state`,
`mcp__cul__list_windows`, `mcp__cul__click`, and the rest.

The package is served by GitHub Packages and installs are authenticated there.
Make the scope mapping visible to the profile, and log in once per machine:

```sh
printf '@brucezhang1993:registry=https://npm.pkg.github.com\n' \
  >> "${DSH_HOME:-$HOME/.dsh}/profiles/web/.npmrc"
npm login --scope=@brucezhang1993 --auth-type=legacy \
  --registry=https://npm.pkg.github.com
```

`--auth-type=legacy` is required on npm 9+ so the CLI prompts instead of opening
a browser, and the password is a **classic personal access token** with
`read:packages` — not the token `gh auth login` stores. See
[docs/installation.md](docs/installation.md#authenticate-to-github-packages-once-per-machine)
for the token scopes, why the token goes to `~/.npmrc`, and how to make the
package public if you want unauthenticated installs.

### DSH Desktop — from GitHub Packages

Open the plugin manager and install `@brucezhang1993/dsh-computer-use-linux`
from the registry (search by name). Desktop profiles are managed exclusively by
the app, so `dsh plugin --profile desktop add …` is refused by design.

### From a local checkout (development)

While working on this repository, install the working copy instead of the
published tarball:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
```

pnpm links the directory, so the bundle behaves exactly like the npm install
and your edits apply on the next restart. No `npm pack`/`npm publish` step in
between. See [Development](#development) for the repository layout and its
self-checks.

## Verify

In a session, ask the agent to call `mcp__cul__doctor` first: it returns the
platform, portals, accessibility, windowing and input backends, and a readiness
summary.

From a source checkout:

```sh
node scripts/check-package.mjs   # static: patch, exports, skill consistency
node --test                      # unit + launcher tests
node scripts/doctor.mjs          # desktop readiness report, no DSH needed
node scripts/selftest.mjs        # MCP handshake + tools/list through the launcher
```

`check-package` and the unit tests live in the source tree; the runtime probes
ship inside the package, so an installed copy can still run `selftest.mjs` and
`doctor.mjs`. The exact commands, including the installed-copy paths, are in
[docs/installation.md](docs/installation.md#verify-the-install).

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
[docs/installation.md](docs/installation.md#binary-resolution) covers each hit
and when to prefer it.

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

Working on the plugin itself? Install the checkout with the local-path command
under [Install](#from-a-local-checkout-development) and restart the harness
after a change. The layout:

```
lib/binary.mjs        binary resolution, verified download, server exec
lib/mcp-probe.mjs     dependency-free MCP stdio probe (selftest + tests)
lib/skill.mjs         bundled-skill frontmatter loader
lib/index.js          plugin entry: skill registration + provider slot
bin/…-mcp.mjs         the launcher the MCP client spawns
cordis.patch.yml      the bundle patch (the whole integration surface)
scripts/              install-binary · selftest · doctor · check-package · release-version
skills/               the bundled DSH skill
test/                 node:test suites (no network, no desktop needed)
```

`node --test` is used rather than a runner dependency: this package's
runtime is DSH's own Node/Electron, so its tests target that runtime directly
and the package ships with zero dependencies.

Maintainers: publishing, CI, and release mechanics are in
[docs/releasing.md](docs/releasing.md).

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md) — the desktop
engine is [agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux)
(MIT), and the bundled skill is adapted from it.
