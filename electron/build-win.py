#!/usr/bin/env python3
"""把单文件 三军棋.html 打包成 Windows 免安装版（内含真实 .exe）。

不依赖 Windows 工具链：直接复用 Electron 官方预编译运行时，
把 resources/app 换成我们的游戏，改掉可执行文件名即可。

用法：
    python3 electron/build-win.py            # 需要 dist/三军棋.html 已生成
    python3 electron/build-win.py --check    # 只校验运行时压缩包
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ELECTRON = ROOT / "electron"
BUILD = ROOT / ".cache" / "electron"   # 运行时缓存，不放 dist
STAGE = BUILD / "stage"
# 打包内部一律用纯 ASCII 名字：跨语言压缩/解压不会把文件名弄坏，
# 中文只出现在窗口标题、界面和说明文档里。
APP_NAME = "TriserviceChess"
BUNDLE = STAGE / "triservice-chess-win-x64"

ELECTRON_VERSION = "v33.2.0"
ZIP_NAME = f"electron-{ELECTRON_VERSION}-win32-x64.zip"
ZIP_URL = f"https://registry.npmmirror.com/-/binary/electron/{ELECTRON_VERSION}/{ZIP_NAME}"
ZIP_SHA256 = "9f2cb12d87761a5e0bbd69960507172223132cbbfc32737dc4ed9803ae971288"

GAME_HTML = DIST / "三军棋.html"
OUT_ZIP = DIST / "TriserviceChess-Windows-免安装版.zip"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_runtime() -> Path:
    zip_path = BUILD / ZIP_NAME
    if zip_path.is_file():
        got = sha256(zip_path)
        if got == ZIP_SHA256:
            print(f"[ok] 运行时已就绪 {zip_path.name} ({zip_path.stat().st_size/1e6:.1f} MB)")
            return zip_path
        print(f"[warn] 校验不符，重新下载（{got[:12]}… != {ZIP_SHA256[:12]}…）")
        zip_path.unlink()
    BUILD.mkdir(parents=True, exist_ok=True)
    print(f"[..] 下载 {ZIP_URL}")
    subprocess.run(
        ["curl", "-fL", "--retry", "3", "-o", str(zip_path), ZIP_URL], check=True
    )
    got = sha256(zip_path)
    if got != ZIP_SHA256:
        sys.exit(f"运行时压缩包校验失败：{got} != {ZIP_SHA256}")
    print(f"[ok] 下载完成并校验通过 ({zip_path.stat().st_size/1e6:.1f} MB)")
    return zip_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验运行时压缩包")
    args = ap.parse_args()

    zip_path = ensure_runtime()
    if args.check:
        return 0

    if not GAME_HTML.is_file():
        sys.exit(f"缺少 {GAME_HTML}，先运行 python3 desktop/bundle_html.py")

    if STAGE.exists():
        shutil.rmtree(STAGE)
    BUNDLE.mkdir(parents=True)
    print("[..] 解压运行时")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(BUNDLE)

    src_exe = BUNDLE / "electron.exe"
    if not src_exe.is_file():
        sys.exit("运行时里没有 electron.exe，压缩包结构异常")
    src_exe.rename(BUNDLE / f"{APP_NAME}.exe")

    # 去掉 Electron 自带的示例应用，换成我们的游戏。
    resources = BUNDLE / "resources"
    for leftover in ("default_app.asar", "app.asar", "app"):
        target = resources / leftover
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()

    app_dir = resources / "app"
    app_dir.mkdir()
    shutil.copy2(ELECTRON / "package.json", app_dir / "package.json")
    shutil.copy2(ELECTRON / "main.js", app_dir / "main.js")
    shutil.copy2(GAME_HTML, app_dir / "game.html")
    print(f"[ok] 已装入 {GAME_HTML.name} ({GAME_HTML.stat().st_size/1024:.0f} KB)")

    # 附带说明与网页版兜底：万一 exe 被安全软件拦下，双击 html 照样能玩。
    shutil.copy2(GAME_HTML, BUNDLE / "TriserviceChess-web.html")
    readme = ELECTRON / "使用说明-Windows.txt"
    if readme.is_file():
        shutil.copy2(readme, BUNDLE / "使用说明.txt")

    if OUT_ZIP.exists():
        OUT_ZIP.unlink()
    print("[..] 打包 zip")
    # 用 Python 的 zipfile 而不是系统 zip：只有它会给中文文件名打上 UTF-8 标志位
    # （general purpose bit 11），否则 Windows 资源管理器解压出来会变成问号。
    with zipfile.ZipFile(
        OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
    ) as zf:
        for src in sorted(BUNDLE.rglob("*")):
            arc = Path(BUNDLE.name) / src.relative_to(BUNDLE)
            if src.is_dir():
                zf.writestr(
                    zipfile.ZipInfo(str(arc) + "/"), b"", compress_type=zipfile.ZIP_STORED
                )
            else:
                zf.write(src, str(arc))
    size = OUT_ZIP.stat().st_size / 1e6
    print(f"[done] {OUT_ZIP.relative_to(ROOT)} ({size:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
