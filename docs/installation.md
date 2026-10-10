# Installation

Everything needed to get the plugin into a DSH profile, plus the runtime probes
and knobs worth knowing about afterwards. English · [简体中文](installation.zh-CN.md)

- [Which way to install](#which-way-to-install)
- [Authenticate to GitHub Packages (once per machine)](#authenticate-to-github-packages-once-per-machine)
- [CLI profiles — from GitHub Packages](#cli-profiles--from-github-packages)
- [DSH Desktop — from GitHub Packages](#dsh-desktop--from-github-packages)
- [From a local checkout (development)](#from-a-local-checkout-development)
- [Pre-download the desktop binary (recommended)](#pre-download-the-desktop-binary-recommended)
- [Verify the install](#verify-the-install)
- [Binary resolution](#binary-resolution)
- [Desktop session variables](#desktop-session-variables)

## Which way to install

| You want to… | Install from | Section |
| --- | --- | --- |
| use the plugin in a CLI profile | GitHub Packages | [CLI profiles](#cli-profiles--from-github-packages) |
| use the plugin in DSH Desktop | GitHub Packages, via the plugin manager | [DSH Desktop](#dsh-desktop--from-github-packages) |
| change this repository's code | a local checkout | [From a local checkout](#from-a-local-checkout-development) |

## Authenticate to GitHub Packages (once per machine)

The package is published to **GitHub Packages** as
[`@brucezhang1993/dsh-computer-use-linux`](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux).

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
only ships the scope mapping in [`.npmrc`](../.npmrc), so no credential is
committed. Installs are authenticated too: GitHub Packages serves packages
privately by default, so make the package public in its
[package settings](https://github.com/users/BruceZhang1993/packages/npm/dsh-computer-use-linux/settings)
if you want unauthenticated installs.

## CLI profiles — from GitHub Packages

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

## DSH Desktop — from GitHub Packages

Open the plugin manager and install `@brucezhang1993/dsh-computer-use-linux`
from the registry (search by name). Desktop profiles are managed exclusively by
the app, so `dsh plugin --profile desktop add …` is refused by design.

## From a local checkout (development)

While working on this repository, install the working copy instead of the
published tarball:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
```

pnpm links the directory, so the bundle behaves exactly like the npm install
and your edits apply on the next restart. No `npm pack`/`npm publish` step in
between.

## Pre-download the desktop binary (recommended)

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

## Verify the install

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

## Binary resolution

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

Use (1) to point the plugin at a binary you built or installed yourself;
(2) is what the pre-download above fills; (5) is the default on a fresh machine.

## Desktop session variables

The server inherits the session it is launched in. These are the names that
matter if you launch DSH from an unusual environment (a systemd unit, a
container, a remote shell):

`WAYLAND_DISPLAY`, `DISPLAY`, `XAUTHORITY`, `XDG_RUNTIME_DIR`,
`DBUS_SESSION_BUS_ADDRESS`, `XDG_CURRENT_DESKTOP`, `DESKTOP_SESSION`,
`YDOTOOL_SOCKET`, plus the `COMPUTER_USE_LINUX_*` knobs above.

They are **not** restated in the bundle patch: the mcp-client's credential
scrub only drops names matching `/KEY|PASSWORD|SECRET|TOKEN/i` and `DSH_*`, so
they reach the server intact.
