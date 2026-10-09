# dsh-computer-use-linux

[![CI](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml)
[![GitHub Packages](https://img.shields.io/badge/registry-GitHub%20Packages-2ea44f)](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux)
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

The plugin is published on **GitHub Packages** as
[`@brucezhang1993/dsh-computer-use-linux`](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux).
Install it as a DSH bundle — there is no manual patch or config edit.

### Authenticate to GitHub Packages (once per machine)

GitHub Packages requires a **personal access token (classic)** — not the OAuth
token `gh auth login` stores, which carries no package scopes. Create one with
`write:packages` (add `read:packages` to only install, `delete:packages` to
unpublish) at
[github.com/settings/tokens](https://github.com/settings/tokens), then:

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy \
  --registry=https://npm.pkg.github.com
# Username: BruceZhang1993
# Password: <the classic PAT>   ← not your GitHub account password
```

`--auth-type=legacy` is required on npm 9+ so the CLI prompts instead of opening
a browser. The token is written to your user-level `~/.npmrc`; this repository
only ships the scope mapping in [`.npmrc`](.npmrc), so no credential is
committed. Installs are authenticated too: GitHub Packages serves packages
privately by default, so make the package public in its
[package settings](https://github.com/users/BruceZhang1993/packages/npm/dsh-computer-use-linux/settings)
if you want unauthenticated installs.

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

pnpm reads `@brucezhang1993:registry` from your user-level `~/.npmrc` (written by
`npm login`) or from a `.npmrc` in the profile directory, so put the mapping
where the profile can see it:

```sh
printf '@brucezhang1993:registry=https://npm.pkg.github.com\n' \
  >> "${DSH_HOME:-$HOME/.dsh}/profiles/web/.npmrc"
```

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

### Pre-download the desktop binary (recommended)

The launcher downloads and sha256-verifies the pinned release on first use.
Doing it at install time keeps the first tool call fast and surfaces network
problems early. The scripts ship inside the package, so run them from the
profile directory:

```sh
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"     # the profile you installed into
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs          # download + verify into the cache
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs --check  # show what would be used
```

In a source checkout the same scripts run from the repository root:
`node scripts/install-binary.mjs`.

## Verify

From the repository (development):

```sh
node scripts/check-package.mjs   # static: patch, exports, skill consistency
node scripts/selftest.mjs        # MCP handshake + tools/list through the launcher
node scripts/selftest.mjs --call doctor
node scripts/doctor.mjs          # desktop readiness report, no DSH needed
node --test                      # unit + launcher tests
```

Installed from GitHub Packages? `check-package` and the unit tests live in the
source tree, but the runtime probes ship inside the package. From the profile
directory:

```sh
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/selftest.mjs
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/doctor.mjs
```

In a session, ask the agent to call `mcp__cul__doctor` first: it returns the
platform, portals, accessibility, windowing and input backends, and a
readiness summary.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`master`/`main`, on every pull request, and on demand. A `v*` tag (or a manual
dispatch) hands over to [`.github/workflows/release.yml`](.github/workflows/release.yml):

| Job | What it proves |
| --- | --- |
| `test` | `check-package` and `node --test` on Node 20 **and** Node 22 (ubuntu-latest), so the declared `engines` floor is real |
| `mcp-handshake` | the pinned upstream binary downloads, sha256-verifies, and answers a real MCP `initialize` + `tools/list` through the launcher |
| `publish` (release.yml) | the tag and `package.json` agree, the version is not on the registry yet, and the tarball publishes to GitHub Packages |

All three jobs are desktop-free. `test/launcher.test.mjs` self-skips on a runner
without a cached binary, which is why the second job exists; and
`node scripts/doctor.mjs` is **not** a CI check — readiness is a property of the
session you are sitting in, not of this repository.

To reproduce CI locally:

```sh
node scripts/check-package.mjs
node --test
node scripts/install-binary.mjs && node scripts/selftest.mjs   # network
```

## Publishing to GitHub Packages

Everything the registry needs is declarative:

| Piece | Where | What it does |
| --- | --- | --- |
| Registry | `publishConfig.registry` in `package.json` | `npm publish` targets `https://npm.pkg.github.com` even without an `.npmrc` |
| Scope mapping | [`.npmrc`](.npmrc) | `@brucezhang1993:registry=https://npm.pkg.github.com` — a project `.npmrc` wins over the user one, so `npm publish` cannot land on npmjs.org by accident |
| Package link | `repository.url` in `package.json` | matches this repo exactly, so the published package is linked to it and inherits its access permissions |
| Name | `package.json` | GitHub Packages only accepts scoped names: `@brucezhang1993/dsh-computer-use-linux`, all lowercase |

Publishing from CI is preferred — `GITHUB_TOKEN` needs no PAT and no rotation.
**Tag it and push:**

```sh
npm version 0.2.0 --no-git-tag-version   # bump, or edit package.json
git commit -am 'dsh-computer-use-linux 0.2.0'
git tag v0.2.0 && git push origin master v0.2.0
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) then re-runs the
package checks and the tests, publishes with
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and opens the GitHub release
`v0.2.0` with generated notes. Because the package is linked to this repository,
`GITHUB_TOKEN` is already authorised to publish it. The job is safe to re-run:

- **the tag is the source of truth** — `scripts/release-version.mjs` refuses a
  `v0.2.0` tag whose `package.json` still says `0.1.0`, so the registry gets
  exactly what the tag points at;
- **a published version is skipped, not re-published** — the job asks
  GitHub Packages whether the version already exists and only publishes on a
  definite "no"; it exits with an error when the answer is inconclusive (auth,
  rate limit, network, unparseable document) rather than silently publishing
  nothing;
- **the effective registry is asserted** before publishing, because a
  `@scope:registry` mapping in any `.npmrc` outranks `publishConfig.registry`;
- **the release is only created for tag pushes** and skipped if it already
  exists, so re-running the release event our own `gh release create` triggers
  cannot create a second release or a second publish.

`workflow_dispatch` publishes from a branch when a tag is not what you want
(re-running a publish that failed after the version was already reserved, say);
it takes an optional `version` input — with or without the `v`, and it must
match `package.json` — and defaults to `package.json`. The same thing from a
workstation:

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy --registry=https://npm.pkg.github.com
npm publish              # reads publishConfig + .npmrc
npm view @brucezhang1993/dsh-computer-use-linux versions   # confirm what landed
```

A fresh package is **private** — change that in the package settings if you want
unauthenticated `npm install`.

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

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md) — the desktop
engine is [agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux)
(MIT), and the bundled skill is adapted from it.
