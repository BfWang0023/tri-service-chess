# 12 · 跨平台打包与分发

> 本文件记录「把三军棋打包成别的电脑也能打开的东西」这一阶段做了什么、
> 哪些产物经过实测、哪些只做过静态检查。凡未实测的，都在第 6 节明确写出。

## 1. 产物一览（`dist/`）

| 文件 | 目标平台 | 体积 | 形态 |
|---|---|---|---|
| `三军棋.html` | Windows / macOS / Linux | 304 KB | 单文件网页，双击用系统浏览器打开 |
| `三军棋-便携版.zip` | 同上 | 54 KB | `三军棋.html` + `启动游戏.bat` + `启动游戏.command` + `使用说明.txt` |
| `TriserviceChess-Windows-免安装版.zip` | Windows 10/11 x64 | 115 MB | 真 `.exe`（Electron 33.2.0 运行时 + 游戏） |
| `三军棋-macOS.app.zip` | macOS 11+ | 0.5 MB | 原生 `.app`（Swift + WKWebView） |
| `SHA256SUMS.txt` | — | — | 上面四个的 SHA-256 |

一键重建：

```bash
python3 make-dist.py              # 全量
python3 make-dist.py --skip-win   # 跳过 Windows（省掉 115MB 运行时下载）
```

拆开看：

- `desktop/bundle_html.py` → `dist/三军棋.html`（把 `src/core/*.mjs` + `web/app.mjs`
  打成一个迷你 CommonJS 运行时内联进 HTML，棋盘 SVG 转 data URI）。
- `electron/build-win.py` → Windows 免安装版。
- `desktop/build.sh` → macOS 原生 `.app`（原有产物，本阶段只是纳入统一流程）。

## 2. 单文件 HTML 为什么是默认推荐

`dist/三军棋.html` 是唯一「不用安装、不用联网、不用 Node/Python、任何系统都能开」的形态：

- 零外部请求：棋盘 SVG 已转 data URI，引擎与数据全部内联，没有 `<script src>`。
- 已用 Playwright + 真实 Chrome 通过 `file://` 协议实测（见第 5 节），
  说明不依赖本地服务器就能跑起来。
- 文件体积 304 KB，微信 / 邮件 / U 盘直接传即可。

## 3. Windows 免安装版怎么做的

本机没有 Windows 工具链（无 wine、无 mingw、无 Rust、无 NSIS），因此没有走
「编译一个 Windows 程序」的路，而是：

1. 从 npmmirror 镜像取 Electron 官方预编译运行时
   `electron-v33.2.0-win32-x64.zip`，用 `SHASUMS256.txt` 里的官方 SHA-256 校验
   （`9f2cb12d…971288`）。
2. 解压后把 `electron.exe` 改名为 `TriserviceChess.exe`。
3. 删掉 `resources/default_app.asar`，换成 `resources/app/`
   （`package.json` + `main.js` + `game.html`）。`main.js` 只有 ~40 行：
   开一个 1320×940 窗口、`loadFile` 载入游戏、禁用菜单与外部导航。
4. 附带 `TriserviceChess-web.html`（与游戏本体同字节），exe 被安全策略拦下时可直接双击它。
5. 用 Python `zipfile` 打包（见第 4 节）。

### 为什么包内文件名是纯 ASCII

第一次用系统 `zip` 打包时，中文目录/文件名在归档里退化成 `?????????-win-x64/`，
Windows 资源管理器解压出来就会是一堆问号——包直接坏掉。改用两条规则：

- 归档内路径一律 ASCII（`triservice-chess-win-x64/`、`TriserviceChess.exe`、
  `game.html`、`README-zh.txt`）；
- 中文只出现在窗口标题、界面文字和 txt 说明里，且 txt 带 UTF-8 BOM（老记事本也能正确显示）。

`make-dist.py` 里统一用 `zipfile` + 默认 UTF-8 标志位（general purpose bit 11），
所以即便有中文名（`三军棋-macOS.app.zip`、`便携版/三军棋.html`）解压也不会乱码。

## 4. macOS

- 原生 `.app` 用原有 `desktop/build.sh`（swiftc + ad-hoc 签名）重新构建，
  重新构建后已 `open` 实测：内置 127.0.0.1 服务起来，页面加载成功
  （`/tmp/triservice-desktop-loaded.txt` 写入 `loaded: http://127.0.0.1:57890/web/index.html`）。
- **没有生成 `.dmg`**：`hdiutil create` 在本构建沙箱里失败于
  `newfs_apfs: /dev/rdisk4s1: Operation not permitted`（沙箱不允许访问 raw 磁盘设备）。
  这不是打包逻辑问题，换一台普通 macOS 机器执行
  `hdiutil create -volname 陆海空三军棋 -srcfolder "desktop/build/陆海空三军棋.app" -ov -format UDZO dist/三军棋-macOS.dmg`
  即可得到 dmg。当前用 `.app.zip` 代替，解压即用。
- `.app` 是 ad-hoc 签名，首次打开需右键 →「打开」绕过 Gatekeeper。

## 5. 实测记录

| 检查 | 方法 | 结果 |
|---|---|---|
| 单文件 HTML 能独立运行 | Playwright + 系统 Chrome，`file://` | 加载成功，60 枚棋子、173 节点、33 个海上节点，无报错 |
| 单文件 HTML 截图 | 同上 | `docs/screenshots/20-singlefile-portable.png` |
| Windows 包里 `game.html` 与 `dist/三军棋.html` 一致 | `shasum -a 256` | 三者（`game.html` / `TriserviceChess-web.html` / `dist/三军棋.html`）哈希完全相同 |
| 发布包里的棋盘补丁确实在 | `grep SEA_PATCH_NODES\|HMID` | 命中 4 处 |
| 归档中文名不坏 | `zipfile` 读回 `flag_bits & 0x800` | 缺 UTF-8 标志的中文条目：0 |
| Electron 外壳 + 游戏本体真的能玩 | 解压 Windows 包里的 `resources/app`，用同版本 Electron（macOS arm64）跑自检 | `boardNodes=173, piecesOnBoard=60, phase=playing, turn=red, errors=null`，全流程点击均成功 |
| Electron 窗口截图 | `webContents.capturePage()` | `docs/screenshots/21-electron-window.png` |
| macOS `.app` 重新构建后可启动 | `open` + 等待加载标记 | 通过 |
| 规则/数据回归 | `npm test` / `npm run test:legacy` | 57 / 56 全通过 |

Electron 自检的入口是 `main.js` 里的 `TS_SMOKE=1` 分支（未设置环境变量时完全不执行），
它会依次点击「本地双人对局 → 自动布阵 → 完成布阵 → 确认接手 →（黑方同样操作）」，
然后把棋盘节点数、棋子数、阶段、回合、页面错误打成一行 `SMOKE {...}` 后退出。
`TS_SHOT=<png>` 可以顺带截图。

## 6. 明确没有验证的部分

- **没有在真实的 Windows 机器上双击过 `TriserviceChess.exe`。**
  本项目环境没有 Windows，也没有 wine，无法执行 PE 程序。
  已验证的是：Electron 33.2.0 外壳代码（`main.js`，`node --check` 通过）、
  同一份 `main.js` + 同一份 `game.html` 在**同版本 Electron** 上完整跑通一局开局、
  运行时压缩包官方 SHA-256 校验通过、包内字节一致。
  Windows 特有的部分（DPI、SmartScreen、路径分隔符）未经实机验证。
- **没有生成 `.dmg`**（原因见第 4 节）。
- Windows 版没有替换 exe 图标（改 PE 资源需要 wine + rcedit），
  任务栏/窗口图标是 Electron 默认图标，窗口标题为「陆海空三军棋」。
- 没有做代码签名：Windows SmartScreen 会提示「已保护你的电脑」，
  macOS Gatekeeper 需要右键打开。

## 7. 分发建议

1. 对方只是要「在电脑上打开下棋」→ 发 `三军棋.html`。最小、最稳、不需要任何解释。
2. 对方要一个像软件的东西 → 发 Windows 免安装版 zip，让他解压整个文件夹后双击 exe。
3. 对方是 Mac → 发 `三军棋-macOS.app.zip`，解压后右键「打开」。
