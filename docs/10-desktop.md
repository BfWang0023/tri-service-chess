# 桌面端应用（macOS）说明

## 交付物

- 源代码：`desktop/main.swift`（Swift + Cocoa/WebKit/Network）、`desktop/Info.plist`、`desktop/build.sh`
- 构建产物：`desktop/build/陆海空三军棋.app`（双击即用）

## 架构

原生 macOS 应用，**零第三方依赖**：

```
NSApplication + NSWindow
  └─ WKWebView  →  http://127.0.0.1:<动态端口>/web/index.html
        ↑
  内嵌极简静态 HTTP 服务（NWListener，仅绑定回环）
        ↑
  Contents/Resources/game/  （web/ + src/ 打包进 .app）
```

- 内嵌 HTTP 服务在 `.app/Contents/Resources/game/` 上提供静态文件，仅监听 `127.0.0.1`。
- 使用 HTTP 而非 `file://`，以避免 WebKit 对 ES Module 的 CORS 限制，保证 `import` 正常。
- 与网页版**完全同一套引擎与界面**（`src/core` + `web`），规则/AI/界面零重复实现。
- 动态端口，避免端口冲突；含目录穿越防护（越界返回 403/404）。

## 构建

```bash
bash desktop/build.sh
# 产物：desktop/build/陆海空三军棋.app
```

构建脚本会：编译 Swift → 创建 `.app` → 打包 `web/` 与 `src/` → 写入 Info.plist → Ad-hoc 签名。

> 需要 macOS + Xcode Command Line Tools（提供 `swiftc`）。无需 Node.js / Python / 网络。

## 运行

- 双击 `desktop/build/陆海空三军棋.app`
- 或：`open "desktop/build/陆海空三军棋.app"`

内置菜单：重新载入(⌘R)、放大(⌘+)、缩小(⌘-)、实际大小(⌘0)、全屏(⌘F)、退出(⌘Q)。

## 已验证项（本环境实测）

| 项 | 结果 |
|---|---|
| 构建 | 成功（swiftc 编译通过，`.app` 生成，约 1.0 MB） |
| 启动 | 进程存活，未崩溃 |
| 内嵌服务 | 固定端口段 57890–57990 内自动选空闲端口（实测绑定 57890） |
| WebView 真正加载 | ✅ `didFinish url=http://127.0.0.1:57890/web/index.html`（诊断标记证实） |
| 资源完整性 | index.html、app.mjs、board-clean.svg、generated-data.mjs 均 200，字节数与源文件一致 |
| 目录穿越防护 | `GET /../Info.plist` → 404 |
| 根路径 | `GET /` → 200（映射到 web/index.html） |

> 诊断标记：应用启动成功加载页面后写入 `/tmp/triservice-desktop-loaded.txt`，调试日志在 `/tmp/triservice-debug.log`。

## 说明与限制

- 桌面端与网页版共用同一前端；游戏逻辑、AI、界面均为同一份代码。
- 本环境无法对 GUI 窗口截图（`screencapture` 被系统权限拒绝），故未附桌面窗口截图；界面外观与 `docs/screenshots/` 中网页版一致。
- 未做 Apple 公证（notarization）与 App Store 打包；当前为本地自签名应用。
