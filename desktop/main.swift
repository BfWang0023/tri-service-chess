// 陆海空三军棋 v1.0 · 雷鸟历史棋盘版 —— macOS 原生桌面应用
// Swift + WKWebView + 内嵌极简静态 HTTP 服务（仅绑定 127.0.0.1，零第三方依赖）
import Cocoa
import WebKit
import Network

// ---------------- 极简静态文件 HTTP 服务 ----------------
func dlog(_ msg: String) {
    let line = "[\(Date())] \(msg)\n"
    let path = "/tmp/triservice-debug.log"
    if let h = FileHandle(forWritingAtPath: path) {
        h.seekToEndOfFile(); h.write(Data(line.utf8)); h.closeFile()
    } else {
        try? line.write(toFile: path, atomically: true, encoding: .utf8)
    }
}

final class StaticServer {
    private let root: URL
    private let queue = DispatchQueue(label: "tri.service.chess.http")
    private var listener: NWListener?

    init(root: URL) { self.root = root }

    func start() throws -> UInt16 {
        dlog("StaticServer.start begin")
        for port in UInt16(57890)...UInt16(57990) {
            guard let nwPort = NWEndpoint.Port(rawValue: port) else { continue }
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            guard let l = try? NWListener(using: params, on: nwPort) else { continue }
            let sem = DispatchSemaphore(value: 0)
            var ok = false
            l.stateUpdateHandler = { state in
                switch state {
                case .ready: ok = true; sem.signal()
                case .failed, .waiting: sem.signal()
                default: break
                }
            }
            l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
            l.start(queue: queue)
            if sem.wait(timeout: .now() + 1.5) == .success && ok {
                listener = l
                dlog("StaticServer.start bound port=\(port)")
                return port
            }
            l.cancel()
        }
        dlog("StaticServer.start NO PORT AVAILABLE")
        throw NSError(domain: "http", code: 1)
    }

    private func listenerPort(_ l: NWListener) -> UInt16? {
        if let p = l.port { return p.rawValue }
        return nil
    }

    private func accept(_ conn: NWConnection) {
        conn.start(queue: queue)
        receiveLoop(conn, buffer: Data())
    }

    private func receiveLoop(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else { conn.cancel(); return }
            var buf = buffer
            if let data { buf.append(data) }
            if let range = buf.range(of: Data("\r\n\r\n".utf8)) {
                let header = String(decoding: buf[..<range.lowerBound], as: UTF8.self)
                self.respond(conn, header: header)
                return
            }
            if isComplete || error != nil || buf.count > 1_000_000 { conn.cancel(); return }
            self.receiveLoop(conn, buffer: buf)
        }
    }

    private func respond(_ conn: NWConnection, header: String) {
        let firstLine = header.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? ""
        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { send(conn, status: 400, "Bad Request", nil); return }
        var path = String(parts[1])
        if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
        path = path.removingPercentEncoding ?? path
        if path == "/" { path = "/web/index.html" }
        // 防目录穿越
        let rel = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let fileURL = root.appendingPathComponent(rel).standardizedFileURL
        let rootStd = root.standardizedFileURL
        guard fileURL.path.hasPrefix(rootStd.path + "/") else { send(conn, status: 403, "Forbidden", nil); return }
        guard let data = try? Data(contentsOf: fileURL) else { send(conn, status: 404, "Not Found", nil); return }
        let mime = StaticServer.mimeType(fileURL.pathExtension)
        var resp = "HTTP/1.1 200 OK\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        resp += String(decoding: data, as: UTF8.self)
        send(conn, raw: resp)
    }

    private func send(_ conn: NWConnection, status: Int, _ text: String, _ body: Data?) {
        let bodyData = body ?? Data(text.utf8)
        let head = "HTTP/1.1 \(status) \(text)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(bodyData.count)\r\nConnection: close\r\n\r\n"
        send(conn, raw: head + String(decoding: bodyData, as: UTF8.self))
    }

    private func send(_ conn: NWConnection, raw: String) {
        conn.send(content: Data(raw.utf8), completion: .contentProcessed { _ in conn.cancel() })
    }

    static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "mjs", "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}

// ---------------- 应用控制器 ----------------
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: StaticServer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        dlog("didFinishLaunching begin")
        buildMenu()
        let frame = NSRect(x: 0, y: 0, width: 1180, height: 900)
        window = NSWindow(contentRect: frame,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "陆海空三军棋 v1.0 · 雷鸟历史棋盘版"
        window.minSize = NSSize(width: 900, height: 700)
        window.center()

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: frame, configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)

        // 定位随应用打包的游戏资源
        let root: URL? = Bundle.main.resourceURL?.appendingPathComponent("game")
        dlog("gameRoot=\(root?.path ?? "nil") exists=\(root.map{FileManager.default.fileExists(atPath: $0.path)} ?? false)")
        guard let gameRoot = root, FileManager.default.fileExists(atPath: gameRoot.path) else {
            showError("未找到游戏资源目录（game/）。请通过 build.sh 构建完整 .app。")
            return
        }
        do {
            let s = StaticServer(root: gameRoot)
            let port = try s.start()
            server = s
            let url = URL(string: "http://127.0.0.1:\(port)/web/index.html")!
            dlog("calling webView.load \(url.absoluteString)")
            webView.load(URLRequest(url: url))
            dlog("webView.load returned")
        } catch {
            showError("本地服务启动失败：\(error.localizedDescription)")
        }
    }

    private func showError(_ msg: String) {
        let alert = NSAlert()
        alert.messageText = "启动失败"
        alert.informativeText = msg
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func buildMenu() {
        let mainMenu = NSMenu()
        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 陆海空三军棋", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隐藏", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let viewItem = NSMenuItem()
        mainMenu.addItem(viewItem)
        let viewMenu = NSMenu(title: "视图")
        viewMenu.addItem(withTitle: "重新载入", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "放大", action: #selector(zoomIn), keyEquivalent: "+")
        viewMenu.addItem(withTitle: "缩小", action: #selector(zoomOut), keyEquivalent: "-")
        viewMenu.addItem(withTitle: "实际大小", action: #selector(zoomReset), keyEquivalent: "0")
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(withTitle: "进入全屏幕", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = viewMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadPage() { webView.reload() }
    @objc private func zoomIn() { webView.pageZoom = min(2.5, webView.pageZoom + 0.1) }
    @objc private func zoomOut() { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }
    @objc private func zoomReset() { webView.pageZoom = 1.0 }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        dlog("didFinish url=\(webView.url?.absoluteString ?? "nil")")
        // 诊断标记：证明 WebView 已成功加载页面（便于自动验收）
        let marker = "/tmp/triservice-desktop-loaded.txt"
        let info = "loaded: \(webView.url?.absoluteString ?? "?") at \(Date())\n"
        try? info.write(toFile: marker, atomically: true, encoding: .utf8)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("导航失败: %@", error.localizedDescription)
        dlog("didFail: \(error.localizedDescription)")
        let marker = "/tmp/triservice-desktop-loaded.txt"
        try? "FAILED: \(error.localizedDescription)\n".write(toFile: marker, atomically: true, encoding: .utf8)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
