#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把三军棋打包成单文件 HTML（跨平台：任意系统双击即用，无需服务器/Node/Python）。
做法：把 src/core/*.mjs 与 web/app.mjs 打成一个小型 CommonJS 风格运行时，
内联进 web/index.html，并把 board-clean.svg 以 data URI 内联。
输出：dist/三军棋.html
"""
import base64, json, os, posixpath, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'dist')

MODULES = [
    'src/core/constants.mjs',
    'src/core/generated-data.mjs',
    'src/core/board.mjs',
    'src/core/combat.mjs',
    'src/core/moves.mjs',
    'src/core/engine.mjs',
    'src/core/ai.mjs',
    'src/core/index.mjs',
    'web/app.mjs',
]
ENTRY = 'web/app.mjs'


def resolve(importer, spec):
    if spec.startswith('.'):
        return posixpath.normpath(posixpath.join(posixpath.dirname(importer), spec))
    return spec


def parse_names(raw):
    """解析导出列表：'a, b as c' -> [('a','a'), ('b','c')]"""
    out = []
    for item in raw.split(','):
        item = item.strip()
        if not item:
            continue
        if ' as ' in item:
            name, alias = item.split(' as ', 1)
            out.append((name.strip(), alias.strip()))
        else:
            out.append((item, item))
    return out


def transform(path, src):
    """把 ESM 转成 __mods[id] = function(__exports, __req){...} 的函数体。"""
    # 1) import { a, b } from '...'  ->  const { a, b } = __req(...)
    def imp(m):
        names = m.group(1).strip()
        spec = m.group(3)
        target = resolve(path, spec)
        return "const { %s } = __req(%s);" % (names, json.dumps(target))
    src = re.sub(r"import\s*\{([^}]*)\}\s*from\s*(['\"])([^'\"]+)\2\s*;?", imp, src)

    # 2) export { a, b } from '...'
    _from_counter = [0]
    def exp_from(m):
        names = parse_names(m.group(1))
        target = resolve(path, m.group(3))
        tmp = "__m%d" % _from_counter[0]
        _from_counter[0] += 1
        out = ["const %s = __req(%s);" % (tmp, json.dumps(target))]
        for name, alias in names:
            out.append("__exports[%s] = %s[%s];" % (json.dumps(alias), tmp, json.dumps(name)))
        return ' '.join(out)
    src = re.sub(r"export\s*\{([^}]*)\}\s*from\s*(['\"])([^'\"]+)\2\s*;?", exp_from, src)

    # 3) export * from '...'
    def exp_star(m):
        target = resolve(path, m.group(2))
        return "Object.assign(__exports, __req(%s));" % json.dumps(target)
    src = re.sub(r"export\s*\*\s*from\s*(['\"])([^'\"]+)\1\s*;?", exp_star, src)

    # 4) export { a, b };  (无 from)
    collected = []
    def exp_local(m):
        for name, alias in parse_names(m.group(1)):
            collected.append((name, alias))
        return ''
    src = re.sub(r"export\s*\{([^}]*)\}\s*;", exp_local, src)

    # 5) export const/let/var/function/class NAME ...
    for m in re.finditer(r"(?m)^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", src):
        collected.append((m.group(1), m.group(1)))
    src = re.sub(r"(?m)^export\s+(const|let|var|function|class)\s+", r"\1 ", src)

    # 6) 末尾统一导出
    tail = ''.join("\n__exports[%s] = %s;" % (json.dumps(alias), name) for name, alias in collected)
    return src + tail


def build():
    parts = []
    for rel in MODULES:
        p = os.path.join(ROOT, rel)
        src = open(p, encoding='utf-8').read()
        body = transform(rel, src)
        parts.append('__mods[%s] = function(__exports, __req) {\n%s\n};\n' % (json.dumps(rel), body))

    bundle = """(function(){
'use strict';
var __mods = {};
var __cache = {};
function __req(id){
  if (__cache[id]) return __cache[id];
  var e = {};
  __cache[id] = e;
  __mods[id](e, __req);
  return e;
}
%s
__req(%s);
})();
""" % ('\n'.join(parts), json.dumps(ENTRY))

    # 内联 board-clean.svg 为 data URI，替换 app.mjs 中的 './board-clean.svg'
    svg_path = os.path.join(ROOT, 'web', 'board-clean.svg')
    svg_b64 = base64.b64encode(open(svg_path, 'rb').read()).decode('ascii')
    data_uri = 'data:image/svg+xml;base64,' + svg_b64
    bundle = bundle.replace("'./board-clean.svg'", json.dumps(data_uri))
    bundle = bundle.replace('"./board-clean.svg"', json.dumps(data_uri))

    # 读 index.html，替换脚本
    html = open(os.path.join(ROOT, 'web', 'index.html'), encoding='utf-8').read()
    html = html.replace(
        '<script type="module" src="./app.mjs"></script>',
        '<script>\n' + bundle + '\n</script>'
    )
    # 修正页面标题标识单文件版
    html = html.replace('<title>陆海空三军棋 v1.0 · 雷鸟历史棋盘版</title>',
                        '<title>陆海空三军棋 v1.0 · 雷鸟历史棋盘版（单文件版）</title>')

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, '三军棋.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote', out, '(', len(html.encode('utf-8')), 'bytes )')


if __name__ == '__main__':
    build()
