# 陆海空三军棋（Tri-Service Chess）

一款独立开发、忠实还原台湾传统三军棋规则的双人策略棋类游戏。本项目不是《六边形战争》的扩展。

- 支持本地双人 + 内置人机（**本轮不含 AI**，架构已预留）。
- 现代二维 SVG 界面（`web/`），暗棋（棋子身份对敌方隐藏）。
- **零运行时第三方依赖**：核心引擎为纯 ES Module，`node` 直接运行、浏览器直接 `import`。

## 运行方法

```bash
# 1. 自动化测试（39 项）
node --test                # 或 npm test

# 2. 完整对局演示（随机合法行动，从头下到尾）
node demo/sample-game.mjs

# 3. 本地双人 Web 界面
python3 -m http.server 8080        # 在项目根目录启动静态服务器
# 浏览器打开 http://localhost:8080/web/index.html
```

> Web 界面需从**项目根目录**启动服务器（`web/app.mjs` 通过相对路径 `../src/core/index.mjs` 引入引擎）。

## 当前进度

**第一阶段（规则研究）** ✅ → **第二阶段（规则修正 + 可运行核心）** ✅ → **第三阶段（棋盘复原 + 界面升级 + 可玩性验收）** ✅

| 交付物 | 文件 |
|---|---|
| A. 规则研究报告 | `docs/01-rules-research-report.md` |
| B. 棋盘结构及草图 | `docs/02-board-structure.md` + `docs/board-sketch.svg` |
| C. 棋子与战斗规则数据 | `docs/03-pieces-and-combat-rules.md` |
| D. 技术架构与计划 | `docs/04-technical-architecture-and-plan.md` |
| 第二阶段报告 | `docs/05-phase2-report.md` |
| **第三阶段报告** | `docs/06-phase3-report.md` |
| **AI 接口说明（第四阶段）** | `docs/07-ai-interface.md` |
| **HTML 验收报告** | `docs/acceptance-report.html` |

## 运行方法

```bash
# 1. 自动化测试（56 项）
node --test                # 或 npm test

# 2. 本地双人模拟对局（从头下到夺旗）
node demo/two-player-sim.mjs [seed]

# 3. 完整游戏界面（本地双人）
python3 -m http.server 8080        # 在项目根目录启动静态服务器
# 浏览器打开 http://localhost:8080/web/index.html
```
