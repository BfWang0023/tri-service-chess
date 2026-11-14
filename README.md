# 陆海空三军棋 v1.0 — 雷鸟历史棋盘版

> **Tri-Service Chess v1.0** · 默认使用 **雷鸟牌历史棋盘资产 v2.0.0**（国立台湾历史博物馆馆藏 2010.031.0527.0002）
> 本地双人 + 三级内置 AI 对战 + 复盘 · 零构建、零外部 AI 依赖

## 运行方法（本地启动）

```bash
# 1. 自动化测试
npm test                    # 57 项历史版测试（数据完整性 / 规则 / 航空 / AI）
npm run test:legacy         # 56 项旧网格版测试

# 2. 本地双人模拟对局
node demo/two-player-sim.mjs [seed]

# 3. AI 对局统计
node demo/ai-sim.mjs 20 normal normal
node demo/ai-sim.mjs 12 hard easy

# 4. 游戏界面（本地双人 / 人机对战 / AI 对 AI）
python3 -m http.server 8080      # 在项目根目录启动
# 浏览器打开 http://localhost:8080/web/index.html
```

> 界面需从**项目根目录**启动静态服务器（`web/app.mjs` 通过 `../src/core/index.mjs` 引入引擎）。

## 第四阶段：视觉重构 + 航空系统修复

- **空对空修复**：战斗机/侦察机现可攻击同一航線上的敌方飞机（此前遗漏空中黑点，导致战斗机无法攻击侦察机）。
- **视觉重构**：棋子放大 68%（军种图标、阵营配色、等级角标、棋背纹理、四种状态反馈）；棋盘海洋蓝/陆地暖沙、线路显示模式（全部/陆军/海军/空军/智能）、滚轮缩放/拖拽平移/双击重置；航空调试视图。
- 详见 `docs/11-air-audit.md`、`docs/acceptance-report.html`、`docs/screenshots/10-16*.png`。

## 跨平台安装包（分发到别的电脑）

一条命令生成全部产物：

```bash
python3 make-dist.py            # 全量：html + 便携版 zip + Windows exe + macOS .app
python3 make-dist.py --skip-win # 不下载 115MB Electron 运行时
```

| 产物 | 平台 | 体积 | 说明 |
|---|---|---|---|
| `dist/三军棋.html` | Windows / macOS / Linux | 304 KB | **最省事**：单文件，双击用浏览器打开，零安装零联网 |
| `dist/三军棋-便携版.zip` | 同上 | 54 KB | 上面的 html + `启动游戏.bat` / `启动游戏.command` + 使用说明 |
| `dist/TriserviceChess-Windows-免安装版.zip` | Windows 10/11 x64 | 115 MB | 真 `.exe`，Electron 独立窗口，不依赖浏览器 |
| `dist/三军棋-macOS.app.zip` | macOS 11+ | ~1 MB | 原生 Swift + WKWebView `.app` |
| `dist/SHA256SUMS.txt` | — | — | 全部产物校验和 |

分发原则：

- **只想「在别人的 Windows 电脑上打开」→ 发 `三军棋.html` 就够了**（微信/U 盘/邮件都行，不用解压）。
- 想要一个能固定在任务栏的独立程序 → 发 Windows 免安装版 zip，解压后双击 `TriserviceChess.exe`。
  包里同时放了一份 `TriserviceChess-web.html`，exe 被安全策略拦下时直接用它。
- 包内文件名一律 ASCII，中文只出现在窗口标题与说明文档里，避免任何解压工具把名字弄成问号。
- **macOS `.dmg` 未生成**：`.dmg` 需要 `hdiutil` 挂载 raw 磁盘设备，当前构建沙箱不允许（`newfs_apfs: Operation not permitted`）。
  `.app.zip` 解压即用，效果等同；在普通 macOS 机器上执行
  `hdiutil create -volname 陆海空三军棋 -srcfolder "desktop/build/陆海空三军棋.app" -ov -format UDZO dist/三军棋-macOS.dmg` 即可补上。

## 桌面端（macOS 原生应用）

```bash
bash desktop/build.sh          # 构建
open "desktop/build/陆海空三军棋.app"   # 运行（或双击）
```

- 原生 Swift + WKWebView，内嵌本地 HTTP 服务（仅 127.0.0.1），**零第三方依赖、无需 Node/Python/网络**。
- 与网页版共用同一套引擎与界面。详见 `docs/10-desktop.md`。
- 项目根目录的 `陆海空三军棋.app` 为指向构建产物的软链接，可双击直接打开。

## 目录结构

```
src/core/
  generated-data.mjs     # 由 data/*.json 自动生成（勿手改）
  board.mjs              # 棋盘拓扑查询（历史图为不规则图网络）
  moves.mjs              # 合法移动/攻击（铁路/铁桥/海上白线/航空/登陆/海岸炮击）
  engine.mjs             # 状态、布阵、回合、交战、胜负、暗棋可见性、存档
  combat.mjs             # 30×30 战斗矩阵统一裁决
  ai.mjs                 # 内置 AI（合法行动 + 评估 + 暗棋推断 + 三级难度）
  index.mjs              # 统一出口
data/
  board.json             # ★ 雷鸟历史棋盘 v2.0.0（169节点/271边，Codex 冻结，未修改）
  pieces.json / combat-matrix.json
  generate_board.py / generate_rules.py / emit_esm.py
web/
  index.html + app.mjs   # 最终界面（历史棋盘 + AI + 复盘）
  board-clean.svg        # Codex 矢量棋盘（视觉基础）
docs/
  08-migration-report.md  # 历史棋盘迁移报告
  09-ai-report.md         # AI 能力与性能报告
  11-air-audit.md         # 航空/海军拓扑审计与修补记录
  12-packaging.md         # 跨平台打包与分发记录（含未验证项）
  acceptance-report.html  # HTML 验收报告（含真实截图）
  screenshots/            # Playwright / Electron 真实运行截图
make-dist.py              # 一键生成全部发布产物到 dist/
electron/                 # Windows 免安装版（Electron 外壳 + 打包脚本）
  main.js                 # 40 行窗口外壳（含 TS_SMOKE 自检分支）
  build-win.py            # 组装 Windows 包（官方运行时 + 校验 + zip）
desktop/                  # macOS 原生 .app（Swift + WKWebView）+ 单文件 HTML 打包
legacy/                   # 旧网格版（读旧存档 + 旧网格测试）
legacy-fixtures/          # 旧网格版测试与数据存档
tests/
  historical-board.test.mjs   # 历史版集成测试（9）
  historical-data.test.mjs    # 数据完整性（7）
  air.test.mjs                # 航空/海面补丁（12）
  ai.test.mjs                 # AI 合法/公平/难度（5）
  combat.test.mjs / rules-source.test.mjs
```

## 版本

- **游戏版本**：v1.0
- **棋盘资产版本**：v2.0.0（`NMTH-2010.031.0527.0002@2.0.0`）

## 关键说明

1. **棋盘**：`data/board.json` 原样来自 Codex 冻结交付包（169 节点 / 271 边 / 16 岸线 / 88 飞越），未手工修改。
2. **AI 公平性**：AI 只消费公开信息，隐藏守方类型不改变其动作；有自动化测试验证。
3. **旧存档**：历史版 `deserializeGame` 校验 `boardRevision`，旧存档被明确拒绝（不会误解释为新版历史地图状态）。
4. **剩余未决**：登陆后按陆军移动、无子可动/重复局面三次=和、侦察短暂揭示等为项目约定；详见 `docs/08`、`docs/09`。
