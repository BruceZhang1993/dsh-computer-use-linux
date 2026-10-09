# dsh-computer-use-linux

[![CI](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/BruceZhang1993/dsh-computer-use-linux/actions/workflows/ci.yml)
[![GitHub Packages](https://img.shields.io/badge/registry-GitHub%20Packages-2ea44f)](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Platform: Linux](https://img.shields.io/badge/platform-linux-blue.svg)](https://www.kernel.org)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4B6BFB.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF.svg)](https://modelcontextprotocol.io)

[English](README.md) · **简体中文**

**[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Linux 桌面操作能力** ——
把 [`computer-use-linux`](https://github.com/agent-sh/computer-use-linux) MCP
server 桥接成 DSH 的原生工具，并内置配套 skill。

Agent 可以观察本机桌面（AT-SPI 无障碍树、窗口列表、截图），并对其执行操作（聚焦/移动/缩放窗口、点击、拖拽、滚动、输入文本、按键、调用无障碍动作）—— Wayland 与 X11 都支持，与 Claude Code、Codex 通过上游插件拿到的是同一套工具。

不改动 DSH 本体，无运行时依赖。桥接方就是 DSH 内置的
`@deepseek-ai/dsh-mcp-client` 插件。

## 架构

```
DSH agent
  │  tools: mcp__cul__doctor, mcp__cul__get_app_state, mcp__cul__click, … (18)
  ▼
@deepseek-ai/dsh-mcp-client        ← DSH 内置桥接（官方 MCP SDK，stdio）
  │  换行分隔的 JSON-RPC 2.0
  ▼
bin/computer-use-linux-mcp.mjs     ← 本包：解析 → 校验 → 执行
  ▼
computer-use-linux mcp             ← 锁定版本的上游二进制（Rust，约 9 MB）
  ├─ AT-SPI registry   → 无障碍树、语义化动作
  ├─ compositor backends → 窗口列表 / 聚焦（GNOME、KWin、Hyprland、niri、i3、COSMIC、X11/EWMH）
  ├─ portals / Shell   → 截图
  └─ ydotool / portal / xdotool → 输入合成
```

这套集成由两个决定定义：

- **只桥接，不重写。** 上游 server 是官方支持的桌面引擎，而且本身就说 MCP。把它包装成 DSH 原生工具，意味着上游的每个修复都只差一次版本升级；而命名、重连、图片投影与取消这些事交给 DSH 的 MCP 桥接层负责。
- **把设备层隔离出来。** 一个小 resolver 只负责那件本质上与机器绑定的事：该运行哪个二进制。这是唯一值得自己写代码的地方，而且不需要桌面就能测试。

## 环境要求

- Linux（x86_64 或 arm64）。其他平台上插件自动禁用。
- 装有内置 `@deepseek-ai/dsh-mcp-client` 的 DeepSeek Harness（各发行 profile 都已自带）。
- Node 20+ 用于 launcher。在 DSH Desktop 内部，launcher 通过
  `ELECTRON_RUN_AS_NODE=1` 跑在 Electron 二进制下。
- 一个桌面会话。无障碍、窗口定位与输入后端属于「每个合成器各自的问题」——请运行
  `mcp__cul__doctor`，并参考
  `skills/computer-use-linux/references/setup.md`。

## 安装

本插件发布在 **GitHub Packages** 上：
[`@brucezhang1993/dsh-computer-use-linux`](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux)。把它当作一个 DSH bundle 安装即可 —— 不需要手改 patch 或配置。

### 先认证 GitHub Packages（每台机器一次）

GitHub Packages 只认 **classic personal access token**，`gh auth login` 存的 OAuth token 没有包相关 scope，用不了。到
[github.com/settings/tokens](https://github.com/settings/tokens) 建一个带 `write:packages` 的 classic PAT（只安装就加 `read:packages`，要撤包再加 `delete:packages`），然后：

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy \
  --registry=https://npm.pkg.github.com
# Username: BruceZhang1993
# Password: <上面那个 classic PAT>   ← 不是你的 GitHub 登录密码
```

npm 9+ 必须加 `--auth-type=legacy`，否则会走浏览器登录。token 会被写进用户级 `~/.npmrc`；本仓库只在 [`.npmrc`](.npmrc) 里放 scope 映射，不会提交任何凭据。安装同样需要认证：GitHub Packages 新建的包默认是**私有**的，想免认证安装就到[包的设置页](https://github.com/users/BruceZhang1993/packages/npm/dsh-computer-use-linux/settings)改成 public。

### CLI profile —— 从 GitHub Packages 安装（常规方式）

```sh
dsh plugin --profile web add @brucezhang1993/dsh-computer-use-linux          # 最新版
dsh plugin --profile web add @brucezhang1993/dsh-computer-use-linux@0.1.0    # 锁定版本
```

`dsh plugin` 会在 profile 目录里调用 pnpm；下载之前先按当前 DSH 版本做兼容性检查，
安装成功后把该 bundle 选入 profile 的 `dsh.profile.bundles` —— 正是这一步让 profile
层生效。然后重启 harness。模型的工具列表里就会出现 `mcp__cul__doctor`、
`mcp__cul__get_app_state`、`mcp__cul__list_windows`、`mcp__cul__click` 等工具。

pnpm 会从用户级 `~/.npmrc`（`npm login` 写的那个）或 profile 目录里的 `.npmrc` 读取
`@brucezhang1993:registry`，所以要把映射放到 profile 能看到的位置：

```sh
printf '@brucezhang1993:registry=https://npm.pkg.github.com\n' \
  >> "${DSH_HOME:-$HOME/.dsh}/profiles/web/.npmrc"
```

### DSH Desktop —— 从 GitHub Packages 安装

打开插件管理器，从 registry 里按名字搜索并安装 `@brucezhang1993/dsh-computer-use-linux`。Desktop 的
profile 由应用独占管理，因此 `dsh plugin --profile desktop add …` 会被设计性地拒绝。

### 从本地检出安装（开发用）

如果要改这个仓库本身，就安装工作副本，而不是已发布的 tarball：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
```

pnpm 会链接该目录，因此 bundle 的行为与 npm 安装完全一致，改动在下次重启后生效，
中间不需要任何 `npm pack`／`npm publish` 步骤。仓库结构与自检见[开发](#开发)。

### 预下载桌面二进制（推荐）

launcher 会在首次使用时下载并做 sha256 校验。在安装阶段就做完，可以让第一次工具调用更快，也能提前暴露网络问题。脚本随包一起发布，因此在 profile 目录里执行：

```sh
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"     # 你安装到的那个 profile
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs          # 下载并校验到缓存目录
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs --check  # 只看会用到哪个
```

在源码检出里，同样的脚本从仓库根目录运行：`node scripts/install-binary.mjs`。

## 验证

在仓库里（开发时）：

```sh
node scripts/check-package.mjs   # 静态检查：patch、exports、skill 一致性
node scripts/selftest.mjs        # 经 launcher 走一遍 MCP 握手 + tools/list
node scripts/selftest.mjs --call doctor
node scripts/doctor.mjs          # 桌面就绪报告，不需要 DSH
node --test                      # 单元 + launcher 测试
```

从 GitHub Packages 安装的？`check-package` 与单元测试在源码树里，而运行时探针随包发布。
在 profile 目录里：

```sh
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/selftest.mjs
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/doctor.mjs
```

在会话里，让 agent 先调用 `mcp__cul__doctor`：它会返回平台、portal、无障碍、窗口与输入后端，以及一份就绪摘要。

## 持续集成

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 会在每次推送到
`master`/`main`、每个 pull request，以及手动触发时运行。打 `v*` tag（或手动触发）则交给
[`.github/workflows/release.yml`](.github/workflows/release.yml)：

| Job | 它证明了什么 |
| --- | --- |
| `test` | 在 Node 20 **和** Node 22（ubuntu-latest）上跑 `check-package` 与 `node --test`，确认 `engines` 里声明的下限是真的 |
| `mcp-handshake` | 锁定的上游二进制能下载、能通过 sha256 校验，并能经 launcher 完成一次真正的 MCP `initialize` + `tools/list` |
| `publish`（release.yml） | tag 与 `package.json` 版本一致、该版本尚未发布，然后把 tarball 发到 GitHub Packages |

三个 job 都不需要桌面。在没有缓存二进制的 runner 上，
`test/launcher.test.mjs` 会自我跳过——这正是第二个 job 存在的理由；而
`node scripts/doctor.mjs` **不是** CI 检查项：就绪与否是「你正坐着的那个会话」的属性，不是这个仓库的属性。

本地复现 CI：

```sh
node scripts/check-package.mjs
node --test
node scripts/install-binary.mjs && node scripts/selftest.mjs   # 需要网络
```

## 发布到 GitHub Packages

registry 需要的全部配置都是声明式的：

| 部分 | 位置 | 作用 |
| --- | --- | --- |
| registry | `package.json` 的 `publishConfig.registry` | 即使没有 `.npmrc`，`npm publish` 也会发到 `https://npm.pkg.github.com` |
| scope 映射 | [`.npmrc`](.npmrc) | `@brucezhang1993:registry=https://npm.pkg.github.com` —— 项目级 `.npmrc` 优先于用户级，因此不会误发到 npmjs.org |
| 包与仓库的关联 | `package.json` 的 `repository.url` | 与本仓库 URL 完全一致，发布后包会自动关联本仓库并继承其访问权限 |
| 包名 | `package.json` | GitHub Packages 只接受 scoped 小写名：`@brucezhang1993/dsh-computer-use-linux` |

推荐走 CI 发布 —— `GITHUB_TOKEN` 不需要 PAT，也不用轮换。**打 tag 然后推：**

```sh
npm version 0.2.0 --no-git-tag-version   # 或直接改 package.json
git commit -am 'dsh-computer-use-linux 0.2.0'
git tag v0.2.0 && git push origin master v0.2.0
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) 会重新跑包检查与测试，
用 `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 执行 `npm publish`，并创建带自动生成
notes 的 `v0.2.0` release。因为包已关联本仓库，`GITHUB_TOKEN` 本身就有发布权限。这个 job
可以安全重跑：

- **tag 是版本的唯一来源** —— `scripts/release-version.mjs` 会拒绝「`v0.2.0` tag 但
  `package.json` 还写着 0.1.0」的情况，保证 registry 上的东西与 tag 指向的提交一致；
- **版本已发布就跳过，而不是重复发布** —— job 会先查 GitHub Packages 里这个版本是否存在：
  已存在就跳过发布（重跑因此是绿的），明确不存在（404）才执行 `npm publish`；权限、限流、
  网络或响应无法解析等「无法判定」的情况一律直接失败并给出提示，不会静默地什么都不发；
- **发布前断言真正生效的 registry** —— 任何 `.npmrc` 里的 `@scope:registry` 优先级都高于
  `publishConfig.registry`，所以不能只看 `publishConfig`；
- **只有 tag push 才创建 release**，且已存在就跳过；因此我们自己 `gh release create` 触发的
  release 事件既不会再建 release，也不会重复发布。

`workflow_dispatch` 用于「不想打 tag，直接从分支发」的场景（例如版本号已被占用、需要重跑
一次失败的发布）；它有一个可选的 `version` 输入（带不带 `v` 都行，但必须与 `package.json`
一致），默认取 `package.json`。在工作站上手动发布则是同一件事：

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy --registry=https://npm.pkg.github.com
npm publish              # 读取 publishConfig + .npmrc
npm view @brucezhang1993/dsh-computer-use-linux versions   # 确认发出去的版本
```

新包默认是**私有**的 —— 想免认证安装就在包设置里改掉。

## 工具

上游默认的 18 个工具全部暴露，命名空间为 `mcp__cul__<tool>`。

| 分组 | 工具 |
| --- | --- |
| 诊断 | `doctor`、`setup_accessibility`、`setup_window_targeting` |
| 发现 | `list_apps`、`list_windows`、`focused_window` |
| 观察 | `get_app_state`、`screenshot` |
| 输入 | `click`、`drag`、`scroll`、`press_key`、`type_text` |
| 语义 | `perform_action`、`set_value` |
| 窗口 | `activate_window`、`move_window`、`resize_window` |

上游还有两个条件性工具默认关闭，需显式开启：`run_shell`
（`COMPUTER_USE_LINUX_ENABLE_SHELL=1`，刻意不加沙箱——DSH 已经有带沙箱的 shell 工具）与 `complete_interaction`
（`COMPUTER_USE_LINUX_NOTIFY_ON_COMPLETE=1`）。

## 二进制如何解析

按顺序，命中即止：

1. `COMPUTER_USE_LINUX_BIN` —— 绝对路径（本地构建，或
   `cargo install computer-use-linux`）。
2. `~/.cache/computer-use-linux/plugin/v<version>/computer-use-linux` ——
   插件缓存。**与上游 Claude Code / Codex 插件完全相同的布局**，所以一次下载即可服务机器上所有宿主。
3. `@agent-sh/computer-use-linux` npm 包（若已安装）。
4. `PATH` 上的 `computer-use-linux`。
5. 从 GitHub release 下载，并与发布的 `.sha256` 校验。

下载采用「先落临时文件再重命名」，因此并发的首次启动与被中断的下载都不会留下半截二进制。版本与镜像可覆盖：
`COMPUTER_USE_LINUX_VERSION`、`COMPUTER_USE_LINUX_DOWNLOAD_BASE`、
`COMPUTER_USE_LINUX_SKIP_DOWNLOAD`。

## 这个 bundle 新增了什么

```yaml
# cordis.patch.yml —— 完整的声明式集成面
- insert:
    - id: mcp-computer-use-linux      # 一行 MCP server，工具名为 mcp__cul__*
      name: '@deepseek-ai/dsh-mcp-client'
      ...
    - id: dsh-computer-use-linux      # JS 那半：skill + provider 槽位
      name: 'dsh-computer-use-linux'
```

其余都在插件入口（`lib/index.js`）里：

| 贡献 | 机制 | 为什么不用 patch |
| --- | --- | --- |
| 那 18 个桌面工具 | `@deepseek-ai/dsh-mcp-client` 的 stdio 行 | — |
| `computer-use-linux` skill | `ctx.skills.register()` | `skill-filesystem.bundledSkillDir` 是**单一**槽位，默认值为 `$DSH_BUNDLED_SKILL_DIR`；覆盖它会挤掉别的占用者 |
| Provider 互斥 | 当注册表已挂载时调用 `ctx.computerUse.register()` | 需要运行时服务访问 |
| 二进制诊断 | 激活时打一行日志 | 需要运行时 |

launcher 路径通过锚定在 *profile* 目录（`baseUrl`）上的
`createRequire` 解析，绝不硬编码，因此在任意 `$DSH_HOME` 下的任意 profile 都能工作，也能扛住 pnpm store 的目录布局。

server 需要的那些桌面会话变量（`WAYLAND_DISPLAY`、`DISPLAY`、
`XAUTHORITY`、`XDG_RUNTIME_DIR`、`DBUS_SESSION_BUS_ADDRESS`、
`XDG_CURRENT_DESKTOP`、`DESKTOP_SESSION`、`YDOTOOL_SOCKET`，以及
`COMPUTER_USE_LINUX_*` 开关）**不会**在 patch 里重复声明：
mcp-client 的凭据清洗只丢匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 和 `DSH_*`
的名字，所以它们能原样到达 server。

### Provider 互斥

如果同一套组合里挂载了 `@deepseek-ai/dsh-computer-use`，本插件会占用唯一的 computer-use provider 槽位
（`ctx.computerUse.register('dsh-computer-use-linux')`）。这样第二个桌面驱动会注册失败，而不是悄悄和它抢指针。如果该注册表不存在（标准 profile），插件只打一条日志然后继续；工具不受影响。

## 安全

这些工具会改变真实应用的状态。

- `doctor`、`list_apps`、`list_windows`、`focused_window`、`get_app_state`
  是只读的。`click`、`drag`、`press_key`、`type_text`、`perform_action` 与
  `set_value` 带有 `destructiveHint` —— 它们可以在被指向的任意应用里提交、删除、发送或购买。
- 焦点是全局的：激活窗口会抢走用户的键盘。
- 截图可能拍到密钥；`get_app_state` 支持
  `include_screenshot: false`。
- `ydotoold` 会让任何能触及它 socket 的进程获得完整的输入合成能力。
  请把 socket 放在用户运行时目录（`0600`），绝不要放 `/tmp`。
- 屏幕上的指示器会显示 agent 正在做什么。请保持开启。
- 会话审批策略依然生效；harness 会按自己的策略在调用前询问，这些工具不会绕过它。

## 故障排查

先跑 `node scripts/doctor.mjs`，再看
`skills/computer-use-linux/references/troubleshooting.md` 里的 DSH 侧清单（工具没出现、调用失败、超时、截图变成文本）以及完整的环境变量参考。

## 开发

要改插件本身？按[安装](#从本地检出安装开发用)里的本地路径命令安装检出，改完重启 harness。目录结构：

```
lib/binary.mjs        二进制解析、带校验的下载、server 执行
lib/mcp-probe.mjs     无依赖的 MCP stdio 探针（selftest 与测试共用）
lib/skill.mjs         内置 skill 的 frontmatter 加载器
lib/index.js          插件入口：注册 skill + 占用 provider 槽位
bin/…-mcp.mjs         MCP client 拉起的那只 launcher
cordis.patch.yml      bundle patch（也就是全部集成面）
scripts/              install-binary · selftest · doctor · check-package · release-version
skills/               内置的 DSH skill
test/                 node:test 测试套件（不需要网络，也不需要桌面）
```

这里用 `node --test` 而不是引入 runner 依赖：本包运行时就跑在 DSH
自己的 Node/Electron 上，所以测试直接针对那个运行时，而包本身保持零依赖。

## 许可证

MIT。见 [LICENSE](LICENSE) 与 [THIRD_PARTY.md](THIRD_PARTY.md) —— 桌面引擎是
[agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux)
（MIT），内置 skill 改编自它。
