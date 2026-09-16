# -*- coding: utf-8 -*-
"""生成密码框的密码可见性切换图标（主题绿线条，无底色）

- eye-open.png   密码以明文显示时：睁眼（椭圆眼眶 + 瞳孔）
- eye-closed.png 密码隐藏时：闭眼（下弯眼睑 + 睫毛，无瞳孔）

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

S = 4               # 4 倍超采样后缩小，边缘平滑
SIZE = 64 * S
W = 18              # 线宽
GREEN = (39, 132, 90, 255)   # #27845a 与主题 --g700 一致


def eye(color, closed):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if closed:
        # 闭眼：一条下弯的眼睑弧线 + 三根向下的睫毛（没有瞳孔，一眼就能看出「闭着」）
        d.arc([36, 56, 220, 200], start=0, end=180, fill=color, width=W)
        d.line([(84, 158), (66, 184)], fill=color, width=W)
        d.line([(128, 194), (128, 224)], fill=color, width=W)
        d.line([(172, 158), (190, 184)], fill=color, width=W)
    else:
        # 睁眼：扁椭圆眼眶 + 实心瞳孔
        d.ellipse([26, 78, 230, 178], outline=color, width=W)
        d.ellipse([98, 98, 158, 158], fill=color)
    return img


for name, closed in (('eye-open', False), ('eye-closed', True)):
    small = eye(GREEN, closed).resize((64, 64), Image.LANCZOS)
    target = os.path.join(OUT, f'{name}.png')
    small.save(target, 'PNG')
    print('生成', os.path.basename(target), small.size, os.path.getsize(target), 'bytes')
