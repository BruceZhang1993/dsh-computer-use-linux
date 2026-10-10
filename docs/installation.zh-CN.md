# 安装

把插件装进 DSH profile 所需的全部内容，外加安装之后用得上的运行时探针与开关。
[English](installation.md) · 简体中文

- [该用哪种方式安装](#该用哪种方式安装)
- [先认证 GitHub Packages（每台机器一次）](#先认证-github-packages每台机器一次)
- [CLI profile —— 从 GitHub Packages 安装](#cli-profile--从-github-packages-安装)
- [DSH Desktop —— 从 GitHub Packages 安装](#dsh-desktop--从-github-packages-安装)
- [从本地检出安装（开发用）](#从本地检出安装开发用)
- [预下载桌面二进制（推荐）](#预下载桌面二进制推荐)
- [验证安装](#验证安装)
- [二进制解析](#二进制解析)
- [桌面会话变量](#桌面会话变量)

## 该用哪种方式安装

| 你的目的 | 安装来源 | 章节 |
| --- | --- | --- |
| 在 CLI profile 里使用插件 | GitHub Packages | [CLI profile](#cli-profile--从-github-packages-安装) |
| 在 DSH Desktop 里使用插件 | GitHub Packages，通过插件管理器 | [DSH Desktop](#dsh-desktop--从-github-packages-安装) |
| 修改本仓库的代码 | 本地检出 | [从本地检出安装](#从本地检出安装开发用) |

## 先认证 GitHub Packages（每台机器一次）

本插件发布在 **GitHub Packages** 上：
[`@brucezhang1993/dsh-computer-use-linux`](https://github.com/BruceZhang1993/dsh-computer-use-linux/pkgs/npm/dsh-computer-use-linux)。

GitHub Packages 只认 **classic personal access token**，`gh auth login` 存的
OAuth token 没有包相关 scope，用不了。到
[github.com/settings/tokens](https://github.com/settings/tokens) 建一个带
`write:packages` 的 classic PAT（只安装就加 `read:packages`，要撤包再加
`delete:packages`），然后：

```sh
npm login --scope=@brucezhang1993 --auth-type=legacy \
  --registry=https://npm.pkg.github.com
# Username: BruceZhang1993
# Password: <上面那个 classic PAT>   ← 不是你的 GitHub 登录密码
```

npm 9+ 必须加 `--auth-type=legacy`，否则会走浏览器登录。token 会被写进用户级
`~/.npmrc`；本仓库只在 [`.npmrc`](../.npmrc) 里放 scope 映射，不会提交任何凭据。
安装同样需要认证：GitHub Packages 新建的包默认是**私有**的，想免认证安装就到
[包的设置页](https://github.com/users/BruceZhang1993/packages/npm/dsh-computer-use-linux/settings)
改成 public。

## CLI profile —— 从 GitHub Packages 安装

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

## DSH Desktop —— 从 GitHub Packages 安装

打开插件管理器，从 registry 里按名字搜索并安装
`@brucezhang1993/dsh-computer-use-linux`。Desktop 的 profile 由应用独占管理，因此
`dsh plugin --profile desktop add …` 会被设计性地拒绝。

## 从本地检出安装（开发用）

如果要改这个仓库本身，就安装工作副本，而不是已发布的 tarball：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-computer-use-linux
```

pnpm 会链接该目录，因此 bundle 的行为与 npm 安装完全一致，改动在下次重启后生效，
中间不需要任何 `npm pack`／`npm publish` 步骤。

## 预下载桌面二进制（推荐）

launcher 会在首次使用时下载并做 sha256 校验。在安装阶段就做完，可以让第一次工具调用
更快，也能提前暴露网络问题。脚本随包一起发布，因此在 profile 目录里执行：

```sh
cd "${DSH_HOME:-$HOME/.dsh}/profiles/web"     # 你安装到的那个 profile
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs          # 下载并校验到缓存目录
node node_modules/@brucezhang1993/dsh-computer-use-linux/scripts/install-binary.mjs --check  # 只看会用到哪个
```

在源码检出里，同样的脚本从仓库根目录运行：`node scripts/install-binary.mjs`。

## 验证安装

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

在会话里，让 agent 先调用 `mcp__cul__doctor`：它会返回平台、portal、无障碍、窗口与
输入后端，以及一份就绪摘要。

## 二进制解析

按顺序，命中即止：

1. `COMPUTER_USE_LINUX_BIN` —— 绝对路径（本地构建，或
   `cargo install computer-use-linux`）。
2. `~/.cache/computer-use-linux/plugin/v<version>/computer-use-linux` ——
   插件缓存。**与上游 Claude Code / Codex 插件完全相同的布局**，所以一次下载即可服务机器上所有宿主。
3. `@agent-sh/computer-use-linux` npm 包（若已安装）。
4. `PATH` 上的 `computer-use-linux`。
5. 从 GitHub release 下载，并与发布的 `.sha256` 校验。

下载采用「先落临时文件再重命名」，因此并发的首次启动与被中断的下载都不会留下半截二进制。
版本与镜像可覆盖：`COMPUTER_USE_LINUX_VERSION`、`COMPUTER_USE_LINUX_DOWNLOAD_BASE`、
`COMPUTER_USE_LINUX_SKIP_DOWNLOAD`。

用 (1) 把插件指向你自己构建或安装的二进制；(2) 就是上面「预下载」填的位置；
(5) 是全新机器上的默认行为。

## 桌面会话变量

server 继承它被启动时所在的那个会话。如果你从非常规环境（systemd 单元、容器、远程 shell）
启动 DSH，下面这些名字就很重要：

`WAYLAND_DISPLAY`、`DISPLAY`、`XAUTHORITY`、`XDG_RUNTIME_DIR`、
`DBUS_SESSION_BUS_ADDRESS`、`XDG_CURRENT_DESKTOP`、`DESKTOP_SESSION`、
`YDOTOOL_SOCKET`，以及上面的 `COMPUTER_USE_LINUX_*` 开关。

它们**不会**在 bundle patch 里重复声明：mcp-client 的凭据清洗只丢匹配
`/KEY|PASSWORD|SECRET|TOKEN/i` 和 `DSH_*` 的名字，所以它们能原样到达 server。
