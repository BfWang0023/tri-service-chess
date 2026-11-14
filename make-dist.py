#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""陆海空三军棋 —— 一键生成全部发布产物（在 macOS 上运行）。

产出：
  dist/三军棋.html                      通用单文件（Win/macOS/Linux，双击即玩）
  dist/三军棋-便携版.zip                上面那个 html + 启动器 + 说明
  dist/TriserviceChess-Windows-免安装版.zip   Windows 真 .exe（Electron 内核）
  dist/三军棋-macOS.app.zip              macOS 原生 .app（Swift + WKWebView）
  dist/SHA256SUMS.txt                   全部产物的校验和

用法：
  python3 make-dist.py              # 全量
  python3 make-dist.py --skip-win   # 跳过 Windows（不下载 115MB 运行时）
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
PORTABLE = DIST / "便携版"
MAC_APP = ROOT / "desktop" / "build" / "陆海空三军棋.app"
SINGLE_HTML = DIST / "三军棋.html"


def run(cmd: list[str], **kw) -> None:
    print("  $ " + " ".join(cmd))
    subprocess.run(cmd, check=True, **kw)


def zip_dir(src: Path, out: Path, arc_root: str | None = None) -> None:
    """用 zipfile 而不是系统 zip：中文名会带上 UTF-8 标志位，解压不变乱码。"""
    if out.exists():
        out.unlink()
    name = arc_root if arc_root is not None else src.name
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for item in sorted(src.rglob("*")):
            if item.name == ".DS_Store" or ".modulecache" in item.parts:
                continue
            arc = Path(name) / item.relative_to(src)
            if item.is_dir():
                zf.writestr(zipfile.ZipInfo(str(arc) + "/"), b"")
            else:
                zf.write(item, str(arc))
    print(f"  ✓ {out.relative_to(ROOT)}  {out.stat().st_size/1e6:.1f} MB")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-win", action="store_true", help="不构建 Windows 版")
    ap.add_argument("--skip-mac", action="store_true", help="不重建 macOS .app")
    args = ap.parse_args()

    DIST.mkdir(exist_ok=True)

    print("== 1/5 生成单文件 HTML ==")
    run([sys.executable, str(ROOT / "desktop" / "bundle_html.py")], cwd=ROOT)
    if not SINGLE_HTML.is_file():
        sys.exit("单文件 HTML 生成失败")

    print("== 2/5 组装便携版 ==")
    PORTABLE.mkdir(exist_ok=True)
    shutil.copy2(SINGLE_HTML, PORTABLE / "三军棋.html")
    zip_dir(PORTABLE, DIST / "三军棋-便携版.zip")

    print("== 3/5 Windows 免安装版 ==")
    if args.skip_win:
        print("  (已跳过)")
    else:
        run([sys.executable, str(ROOT / "electron" / "build-win.py")], cwd=ROOT)

    print("== 4/5 macOS 原生 .app ==")
    if args.skip_mac:
        print("  (已跳过)")
    elif sys.platform != "darwin":
        print("  (非 macOS，跳过)")
    else:
        run(["bash", str(ROOT / "desktop" / "build.sh")], cwd=ROOT)
        zip_dir(MAC_APP, DIST / "三军棋-macOS.app.zip")

    print("== 5/5 校验和 ==")
    lines = []
    for p in sorted(DIST.glob("*")):
        if p.is_file() and p.name != "SHA256SUMS.txt" and not p.name.startswith("."):
            lines.append(f"{sha256(p)}  {p.name}")
    (DIST / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print((DIST / "SHA256SUMS.txt").read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
