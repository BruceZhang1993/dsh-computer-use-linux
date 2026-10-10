# Releasing

Maintainer notes: how this package is published to GitHub Packages, what CI
proves, and how to cut a release. English · [简体中文](releasing.zh-CN.md)

- [Registry configuration](#registry-configuration)
- [Continuous integration](#continuous-integration)
- [Cut a release](#cut-a-release)
- [Publish without a tag](#publish-without-a-tag)
- [The release job is safe to re-run](#the-release-job-is-safe-to-re-run)
- [Publish from a workstation](#publish-from-a-workstation)

## Registry configuration

Everything the registry needs is declarative:

| Piece | Where | What it does |
| --- | --- | --- |
| Registry | `publishConfig.registry` in `package.json` | `npm publish` targets `https://npm.pkg.github.com` even without an `.npmrc` |
| Scope mapping | [`.npmrc`](../.npmrc) | `@brucezhang1993:registry=https://npm.pkg.github.com` — a project `.npmrc` wins over the user one, so `npm publish` cannot land on npmjs.org by accident |
| Package link | `repository.url` in `package.json` | matches this repo exactly, so the published package is linked to it and inherits its access permissions |
| Name | `package.json` | GitHub Packages only accepts scoped names: `@brucezhang1993/dsh-computer-use-linux`, all lowercase |

`node scripts/check-package.mjs` asserts all four, so a metadata drift fails CI
before it can reach the registry.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to
`master`/`main`, on every pull request, and on demand. A `v*` tag (or a manual
dispatch) hands over to [`.github/workflows/release.yml`](../.github/workflows/release.yml):

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

## Cut a release

Publishing from CI is preferred — `GITHUB_TOKEN` needs no PAT and no rotation.
**Tag it and push:**

```sh
npm version 0.2.0 --no-git-tag-version   # bump, or edit package.json
git commit -am 'dsh-computer-use-linux 0.2.0'
git tag v0.2.0 && git push origin master v0.2.0
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) then re-runs
the package checks and the tests, publishes with
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and opens the GitHub release
`v0.2.0` with generated notes. Because the package is linked to this repository,
`GITHUB_TOKEN` is already authorised to publish it.

## Publish without a tag

`workflow_dispatch` publishes from a branch when a tag is not what you want
(re-running a publish that failed after the version was already reserved, say);
it takes an optional `version` input — with or without the `v`, and it must
match `package.json` — and defaults to `package.json`.

## The release job is safe to re-run

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

## Publish from a workstation

Same thing without CI:

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy --registry=https://npm.pkg.github.com
npm publish              # reads publishConfig + .npmrc
npm view @brucezhang1993/dsh-computer-use-linux versions   # confirm what landed
```

A fresh package is **private** — change that in the package settings if you want
unauthenticated `npm install`.

Before publishing, confirm the tarball contains no private machine paths (such
as `/home/<user>`) and no credentials; `npm pack --dry-run` is the quickest
look at the file list, which follows the `files` field in `package.json`.
