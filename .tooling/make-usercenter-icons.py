# -*- coding: utf-8 -*-
"""
复刻有赞「个人中心」的全部图标字形 -> PNG

为什么走「字体 -> PNG」：
  有赞个人中心的图标不是图片，是**图标字体** usercenter-icon 的字形 ——
    .if{font-family:usercenter-icon!important}
    .if_cart-o:before{content:"<PUA 字符>"}
  字体文件： https://img01.yzcdn.cn/26/03/09/iconfont.woff2  (woff2 / woff / ttf)
  class 全集来自装修台样式表 usercenter-decorate_155be553.css（93 条 .if_* 规则）。

与 tabbar 图标脚本（make-tabbar-icons.py）的**有意差异**：
  tabbar 只有 5 个图标、且要让它们在底栏里一样饱满，所以「墨迹裁剪 + 统一缩放」；
  这里是 93 个图标，**相对大小是设计意图的一部分**（圆形的钱包图标不该被拉到和方块一样大），
  所以改为「按 em 等比缩放」—— 所有字形共用同一个缩放系数，只做居中。

输出：miniprogram/images/usercenter/<class 去掉 if_ 前缀>.png   66x66 8bit RGBA，#333333

用法（需要 Pillow；本机可用 .workbuddy 的 venv 或 Python 3.11 自带的 Pillow）：
    <python> .tooling/make-usercenter-icons.py
生成完请接着跑 `check-usercenter-icons.py` 做位级自证（95/95 逐像素相同才算对）。
"""
import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, '.tooling', '_yz-font', '_yz-mc-icons.ttf')
CSS = os.path.join(ROOT, '.tooling', '_yzmc', 'decorate-usercenter.css')
OUT = os.path.join(ROOT, 'miniprogram', 'images', 'usercenter')
SHEET = os.path.join(ROOT, '.tooling', '_yzmc')

SIZE = 66          # 输出 66x66 = 真机显示 22px 的 3 倍图（与 tabbar 同口径）
FONT_PX = 264      # 先大字号渲染再缩放，边缘更干净
EM_RATIO = 0.86    # 字形 em 框占画布的比例（有赞图标在 24px 字号下的饱满度实测）
INK = (0x33, 0x33, 0x33, 255)   # 有赞个人中心图标的 computed color = rgb(51,51,51)


CP_JSON = os.path.join(ROOT, '.tooling', '_yz-usercenter-icons.json')


def load_codepoints():
    """码点表：优先读**派生出来的小 JSON**（入库），拿不到再回落到解析那个 1MB 的原始 CSS。

    为什么要这份 JSON：原始样式表（`_yzmc/decorate-usercenter.css`，约 1MB）与字体一样
    都属于「抓取原物」、不入库；但脚本的**可复跑性**不能因此断掉 ——
    所以把「class → 码点」这个 2.7KB 的派生结果连同字体 TTF 一起入库。
    """
    if os.path.exists(CP_JSON):
        j = json.load(open(CP_JSON, encoding='utf-8'))
        return [('if_' + k, int(v, 16)) for k, v in sorted(j['icons'].items())]
    return parse_css()


def parse_css():
    """从有赞样式表抽出 .if_xxx:before{content:"…"} 的 class -> 码点全集

    ⚠️ 必须按**规则块**切分再取选择器：有赞有合并写法
        `.if_contact-o:before,.if_order__contact-o:before{content:"…"}`
    只写「.if_xxx:before 紧跟 {」的正则会漏掉这种（第一版就漏了 2 个，
    靠 _uc-icon-check.py 的「两套齐全度」对账才发现）。
    """
    s = open(CSS, encoding='utf-8').read()
    seen = {}
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', s):
        sels, body = m.group(1), m.group(2)
        cm = re.search(r'content\s*:\s*"([^"]*)"', body)
        if not cm or not cm.group(1):
            continue
        cp = ord(cm.group(1)[0])
        if not (0xE000 <= cp <= 0xF8FF):
            continue
        for sm in re.finditer(r'\.(if_[\w-]+):before', sels):
            cls = sm.group(1)
            if cls not in seen:
                seen[cls] = cp
    return sorted(seen.items())


def main():
    pairs = load_codepoints()
    src = ('入库的码点表 %s' % os.path.relpath(CP_JSON, ROOT)) if os.path.exists(CP_JSON) \
        else '原始样式表 %s' % os.path.relpath(CSS, ROOT)
    print('图标 class 数：%d 条（来源：%s）' % (len(pairs), src))

    font = ImageFont.truetype(FONT, FONT_PX)

    # 用 PIL 的 mask 判定「有没有真字形」——缺字形时 FreeType 会给 .notdef（空心方框），
    # 这里只校验空 mask 的情况，方框形状靠下面的对照图肉眼兜底。
    empty = []
    for c, p in pairs:
        m = font.getmask(chr(p))
        if m.size[0] == 0 or m.size[1] == 0 or not m.getbbox():
            empty.append((c, hex(p)))
    if empty:
        print('⚠️ 字体里没有这些码点（渲染为空，剔除）：')
        for c, p in empty:
            print('   ', c, p)
    pairs = [(c, p) for c, p in pairs if (c, hex(p)) not in empty]
    print('可渲染：%d 个\n' % len(pairs))

    os.makedirs(OUT, exist_ok=True)

    # 统一缩放系数：em 框从 FONT_PX 缩到 SIZE*EM_RATIO
    scale = (SIZE * EM_RATIO) / FONT_PX

    made = []
    for cls, cp in pairs:
        name = cls[3:]                     # 去掉 if_
        # 1) 大字号渲染到足够大的画布（字形可能超出 em 框，画布给 3 倍）
        src = Image.new('L', (FONT_PX * 3, FONT_PX * 3), 0)
        ImageDraw.Draw(src).text((FONT_PX, FONT_PX), chr(cp), font=font, fill=255, anchor='lt')
        bb = src.getbbox()
        if not bb:
            print('  !! %-30s U+%04X 无墨迹，跳过' % (cls, cp))
            continue
        g = src.crop(bb)
        # 2) 按 em 等比缩放（**不**按墨迹归一，保住设计的大小关系）
        w = max(1, int(round(g.width * scale)))
        h = max(1, int(round(g.height * scale)))
        g = g.resize((w, h), Image.LANCZOS)
        if w > SIZE or h > SIZE:           # 极少数超出画布的字形再等比压到画布内
            k = min(SIZE / w, SIZE / h)
            w, h = max(1, int(w * k)), max(1, int(h * k))
            g = g.resize((w, h), Image.LANCZOS)
        # 3) 居中贴到 66x66，用 alpha 保住抗锯齿
        canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        solid = Image.new('RGBA', (w, h), INK)
        solid.putalpha(g)
        canvas.paste(solid, ((SIZE - w) // 2, (SIZE - h) // 2), solid)
        canvas.save(os.path.join(OUT, name + '.png'))
        made.append((name, cls, cp, g.width, g.height))

    print('输出 %d 个 PNG -> %s' % (len(made), os.path.relpath(OUT, ROOT)))

    # 4) 对照图（网格 + 名字），供肉眼检查大小是否参差
    COLS, CELL = 10, 96
    rows = (len(made) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL, rows * (CELL + 22)), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    try:
        labelf = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 11)
    except Exception:
        labelf = ImageFont.load_default()
    for i, (name, cls, cp, w, h) in enumerate(made):
        cx, cy = (i % COLS) * CELL, (i // COLS) * (CELL + 22)
        icon = Image.open(os.path.join(OUT, name + '.png'))
        sheet.paste(icon, (cx + (CELL - SIZE) // 2, cy + 12), icon)
        d.rectangle([cx, cy + 4, cx + CELL - 1, cy + CELL], outline=(230, 230, 230))
        d.text((cx + 4, cy + CELL + 4), name[:17], fill=(60, 60, 60), font=labelf)
    out = os.path.join(SHEET, '_usercenter-sheet.png')
    sheet.convert('RGB').save(out)
    print('对照图 ->', os.path.relpath(out, ROOT), '(%dx%d)' % sheet.size)

    # 5) 大小分布检查（发现参差就说明不能按 em 等比）
    ws = sorted(x[3] for x in made)
    hs = sorted(x[4] for x in made)
    print('\n墨迹宽 min/中位/max = %d / %d / %d' % (ws[0], ws[len(ws) // 2], ws[-1]))
    print('墨迹高 min/中位/max = %d / %d / %d' % (hs[0], hs[len(hs) // 2], hs[-1]))
    tiny = [x[0] for x in made if max(x[3], x[4]) < SIZE * 0.45]
    if tiny:
        print('⚠️ 明显偏小的 %d 个：%s' % (len(tiny), ', '.join(tiny[:20])))
    big = [x[0] for x in made if max(x[3], x[4]) > SIZE * 0.98]
    if big:
        print('⚠️ 可能出血的 %d 个：%s' % (len(big), ', '.join(big[:20])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
