# 发布

维护者笔记：本包如何发布到 GitHub Packages、CI 证明了什么，以及怎么切一个 release。
[English](releasing.md) · 简体中文

- [registry 配置](#registry-配置)
- [持续集成](#持续集成)
- [切一个 release](#切一个-release)
- [不打 tag 发布](#不打-tag-发布)
- [release job 可以安全重跑](#release-job-可以安全重跑)
- [在工作站上手动发布](#在工作站上手动发布)

## registry 配置

registry 需要的全部配置都是声明式的：

| 部分 | 位置 | 作用 |
| --- | --- | --- |
| registry | `package.json` 的 `publishConfig.registry` | 即使没有 `.npmrc`，`npm publish` 也会发到 `https://npm.pkg.github.com` |
| scope 映射 | [`.npmrc`](../.npmrc) | `@brucezhang1993:registry=https://npm.pkg.github.com` —— 项目级 `.npmrc` 优先于用户级，因此不会误发到 npmjs.org |
| 包与仓库的关联 | `package.json` 的 `repository.url` | 与本仓库 URL 完全一致，发布后包会自动关联本仓库并继承其访问权限 |
| 包名 | `package.json` | GitHub Packages 只接受 scoped 小写名：`@brucezhang1993/dsh-computer-use-linux` |

`node scripts/check-package.mjs` 会断言以上四项，因此元数据一旦漂移，在到达 registry
之前 CI 就会失败。

## 持续集成

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 会在每次推送到
`master`/`main`、每个 pull request，以及手动触发时运行。打 `v*` tag（或手动触发）则交给
[`.github/workflows/release.yml`](../.github/workflows/release.yml)：

| Job | 它证明了什么 |
| --- | --- |
| `test` | 在 Node 20 **和** Node 22（ubuntu-latest）上跑 `check-package` 与 `node --test`，确认 `engines` 里声明的下限是真的 |
| `mcp-handshake` | 锁定的上游二进制能下载、能通过 sha256 校验，并能经 launcher 完成一次真正的 MCP `initialize` + `tools/list` |
| `publish`（release.yml） | tag 与 `package.json` 版本一致、该版本尚未发布，然后把 tarball 发到 GitHub Packages |

三个 job 都不需要桌面。在没有缓存二进制的 runner 上，`test/launcher.test.mjs` 会自我
跳过——这正是第二个 job 存在的理由；而 `node scripts/doctor.mjs` **不是** CI 检查项：
就绪与否是「你正坐着的那个会话」的属性，不是这个仓库的属性。

本地复现 CI：

```sh
node scripts/check-package.mjs
node --test
node scripts/install-binary.mjs && node scripts/selftest.mjs   # 需要网络
```

## 切一个 release

推荐走 CI 发布 —— `GITHUB_TOKEN` 不需要 PAT，也不用轮换。**打 tag 然后推：**

```sh
npm version 0.2.0 --no-git-tag-version   # 或直接改 package.json
git commit -am 'dsh-computer-use-linux 0.2.0'
git tag v0.2.0 && git push origin master v0.2.0
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) 会重新跑包检查与测试，
用 `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 执行 `npm publish`，并创建带自动生成
notes 的 `v0.2.0` release。因为包已关联本仓库，`GITHUB_TOKEN` 本身就有发布权限。

## 不打 tag 发布

`workflow_dispatch` 用于「不想打 tag，直接从分支发」的场景（例如版本号已被占用、需要重跑
一次失败的发布）；它有一个可选的 `version` 输入（带不带 `v` 都行，但必须与 `package.json`
一致），默认取 `package.json`。

## release job 可以安全重跑

- **tag 是版本的唯一来源** —— `scripts/release-version.mjs` 会拒绝「`v0.2.0` tag 但
  `package.json` 还写着 0.1.0」的情况，保证 registry 上的东西与 tag 指向的提交一致；
- **版本已发布就跳过，而不是重复发布** —— job 会先查 GitHub Packages 里这个版本是否存在：
  已存在就跳过发布（重跑因此是绿的），明确不存在（404）才执行 `npm publish`；权限、限流、
  网络或响应无法解析等「无法判定」的情况一律直接失败并给出提示，不会静默地什么都不发；
- **发布前断言真正生效的 registry** —— 任何 `.npmrc` 里的 `@scope:registry` 优先级都高于
  `publishConfig.registry`，所以不能只看 `publishConfig`；
- **只有 tag push 才创建 release**，且已存在就跳过；因此我们自己 `gh release create` 触发的
  release 事件既不会再建 release，也不会重复发布。

## 在工作站上手动发布

不走 CI 的同一件事：

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy --registry=https://npm.pkg.github.com
npm publish              # 读取 publishConfig + .npmrc
npm view @brucezhang1993/dsh-computer-use-linux versions   # 确认发出去的版本
```

新包默认是**私有**的 —— 想免认证安装就在包设置里改掉。

发布前请确认 tarball 里没有本机私人路径（例如 `/home/<user>`）与任何凭据；
`npm pack --dry-run` 是查看文件列表最快的方式，列表由 `package.json` 的 `files` 字段决定。
