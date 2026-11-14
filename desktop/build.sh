#!/bin/bash
# 陆海空三军棋 v1.0 —— macOS 桌面应用构建脚本
# 用法：bash desktop/build.sh
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DESKTOP/.." && pwd)"
APP_NAME="陆海空三军棋"
EXE="TriServiceChess"
BUILD="$DESKTOP/build"
APP="$BUILD/$APP_NAME.app"

echo "==> 清理旧构建"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/game"

echo "==> 编译 Swift（Cocoa + WebKit + Network）"
mkdir -p "$BUILD/.modulecache"
SWIFT_FLAGS=(-swift-version 5 -O
  -module-cache-path "$BUILD/.modulecache"
  -o "$APP/Contents/MacOS/$EXE"
  "$DESKTOP/main.swift"
  -framework Cocoa -framework WebKit -framework Network)
CLANG_MODULE_CACHE_PATH="$BUILD/.modulecache" swiftc "${SWIFT_FLAGS[@]}"

echo "==> 打包游戏资源（web + src）"
cp -R "$ROOT/web" "$APP/Contents/Resources/game/"
cp -R "$ROOT/src" "$APP/Contents/Resources/game/"
# 运行时不需要 data/ 与 docs/；generated-data.mjs 已内联全部数据

echo "==> 写入 Info.plist"
cp "$DESKTOP/Info.plist" "$APP/Contents/Info.plist"

echo "==> Ad-hoc 签名"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "（跳过签名）"

echo "==> 完成：$APP"
echo "   双击打开，或运行：open \"$APP\""
