// 陆海空三军棋 · 桌面外壳（Windows / macOS / Linux 通用）
// 纯本地运行：把已打包好的单文件 三军棋.html 载入独立窗口，不访问网络。
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

// 文件名保持纯 ASCII：压缩包在任何语言的 Windows / 解压工具里都不会被改名。
const GAME_FILE = path.join(__dirname, 'game.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 940,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: '#141a24',
    title: '陆海空三军棋',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.setTitle('陆海空三军棋');

  // 游戏内没有任何外链，意外跳转一律用系统浏览器处理，窗口本身不离开本地文件。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadFile(GAME_FILE);

  // 发布前自检：TS_SMOKE=1 时等页面加载完，走一遍「本地双人 → 自动布阵 →
  // 完成布阵」，打印棋盘自检结果后退出。正式运行时这段分支不会执行。
  if (process.env.TS_SMOKE === '1') {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = (sel) =>
      win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return false; el.click(); return true; })()`
      );
    win.webContents.once('did-finish-load', async () => {
      try {
        const steps = {};
        steps.mode = await click('#btn-mode-local');
        await sleep(400);
        steps.autoSetupRed = await click('#btn-auto');
        await sleep(700);
        steps.finishRed = await click('#btn-finish-setup');
        await sleep(500);
        steps.takeoverBlack = await click('#handoff-btn');
        await sleep(400);
        steps.autoSetupBlue = await click('#btn-auto');
        await sleep(700);
        steps.finishBlue = await click('#btn-finish-setup');
        await sleep(500);
        steps.takeoverRed = await click('#handoff-btn');
        await sleep(900);
        const report = await win.webContents.executeJavaScript(`(() => {
          const app = window.__app || {};
          const st = app.game || {};
          return {
            title: document.title,
            svg: !!document.querySelector('svg'),
            boardNodes: Object.keys((window.__board && window.__board.nodes) || {}).length,
            boardEdges: ((window.__board && window.__board.edges) || []).length,
            piecesOnBoard: document.querySelectorAll('.piece').length,
            piecesInState: (st.pieces || []).length,
            occupancy: Object.keys(st.occupancy || {}).length,
            buttons: document.querySelectorAll('button').length,
            phase: st.phase || null,
            turn: st.turn || null,
            errors: window.__bootErrors || null,
          };
        })()`);
        report.steps = steps;
        console.log('SMOKE ' + JSON.stringify(report));
        // TS_SHOT=<png 路径>：把窗口内容截一张图，用于发布验收记录。
        if (process.env.TS_SHOT) {
          const fs = require('node:fs');
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.TS_SHOT, image.toPNG());
          console.log('SHOT ' + process.env.TS_SHOT);
        }
      } catch (err) {
        console.log('SMOKE ERROR ' + (err && err.message));
      }
      app.exit(0);
    });
    win.webContents.on('console-message', (_e, level, message) => {
      if (/error/i.test(String(level))) console.log('PAGE-ERROR ' + message);
    });
  }

  return win;
}

// 只要一个窗口：再开一次就聚焦已有窗口。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
