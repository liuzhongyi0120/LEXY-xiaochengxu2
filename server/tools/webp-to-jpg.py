#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把素材库里的 webp 全部转成同名的 jpg（同目录），供 iOS 端规避解码兼容问题。

背景
----
微信小程序 image 组件的 webp 解析开关（`webp="{{true}}"`）在部分 iOS 机型 / 微信版本上
并不可靠：素材能被完整下载（服务端日志 200 + 字节数一致），但解码失败 → 走 binderror
落成占位色块。imgRetry 加了 `_r=1` 也救不回来，因为**同一个二进制被再次下载，还是解不开**。

彻底的做法是不让 iOS 碰 webp：服务端额外提供一份同名的 jpg，前端 URL 指过去。
jpg 是 iOS 原生格式，不存在兼容性问题。

用法
----
    python server/tools/webp-to-jpg.py            # 只转 server/data/uploads
    python server/tools/webp-to-jpg.py --dry      # 只看会转多少、预计增量
    MALL_DATA_DIR=/tmp/xx python server/tools/webp-to-jpg.py

幂等：目标 jpg 已存在就跳过；重复执行只会补新增漏转的。
依赖：Pillow（pip install pillow）。没有也不会报错，会明确提示。
"""

import os
import sys

ROOT_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'server', 'data', 'uploads')


def walk_webp(root):
    out = []
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.lower().endswith('.webp'):
                out.append(os.path.join(dirpath, f))
    return out


def main():
    dry = '--dry' in sys.argv
    root = os.environ.get('MALL_DATA_DIR')
    root = os.path.join(root, 'uploads') if root else os.path.normpath(ROOT_DEFAULT)
    if not os.path.isdir(root):
        print('[x] 素材目录不存在：%s' % root)
        return 1

    try:
        from PIL import Image
    except ImportError:
        print('[x] 缺少 Pillow，无法转码。安装：pip install pillow')
        return 1

    files = walk_webp(root)
    done = skip = fail = 0
    grew = 0
    for p in files:
        dst = os.path.splitext(p)[0] + '.jpg'
        if os.path.exists(dst):
            skip += 1
            continue
        try:
            im = Image.open(p)
            if im.mode in ('RGBA', 'LA', 'P'):
                im = im.convert('RGBA')
                bg = Image.new('RGB', im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            elif im.mode != 'RGB':
                im = im.convert('RGB')
            before = os.path.getsize(p)
            if not dry:
                im.save(dst, 'JPEG', quality=88, optimize=True, progressive=True)
                grew += os.path.getsize(dst)
            else:
                grew += int(before * 3.2)  # 粗估
            done += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print('    ! 失败 %s：%s' % (os.path.basename(p), str(e)[:80]))
    print('素材目录：%s' % root)
    print('转出 %d 张，已存在跳过 %d 张，失败 %d 张' % (done, skip, fail))
    print('增量约 %.1f MB%s' % (grew / 1048576.0, '（预估）' if dry else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
