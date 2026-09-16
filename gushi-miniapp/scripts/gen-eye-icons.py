# -*- coding: utf-8 -*-
"""生成密码框的显示/隐藏切换图标：灰色圆底 + 椭圆眼睛（徽章式）

- eye-open.png   密码可见时显示：睁眼（椭圆眼眶 + 瞳孔）
- eye-closed.png 密码隐藏时显示：闭眼（下弯眼睑 + 睫毛，无瞳孔）

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

S = 4                          # 4 倍超采样后缩小，边缘平滑
SIZE = 64 * S
BASE = (213, 218, 214, 255)    # 圆底：浅灰，与输入框边框同色系
MARK = (110, 121, 115, 255)    # 眼睛线条：深灰
W = 12                         # 线宽


def badge(color_base, color_mark, closed):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 灰色圆底
    d.ellipse([12, 12, 244, 244], fill=color_base)
    if closed:
        # 闭眼：一条下弯的眼睑弧线 + 三根向下的睫毛
        d.arc([36, 56, 220, 200], start=0, end=180, fill=color_mark, width=W)
        d.line([(84, 158), (66, 184)], fill=color_mark, width=W)
        d.line([(128, 194), (128, 224)], fill=color_mark, width=W)
        d.line([(172, 158), (190, 184)], fill=color_mark, width=W)
    else:
        # 睁眼：上睑较平、下睑较弯的椭圆眼眶 + 实心瞳孔
        d.arc([60, 103, 196, 153], start=180, end=360, fill=color_mark, width=W)
        d.arc([60, 71, 196, 185], start=0, end=180, fill=color_mark, width=W)
        d.ellipse([107, 109, 149, 151], fill=color_mark)
    return img


for name, closed in (('eye-open', False), ('eye-closed', True)):
    small = badge(BASE, MARK, closed).resize((64, 64), Image.LANCZOS)
    target = os.path.join(OUT, f'{name}.png')
    small.save(target, 'PNG')
    print('生成', os.path.basename(target), small.size, os.path.getsize(target), 'bytes')
