# -*- coding: utf-8 -*-
"""生成密码框的显示/隐藏切换图标：灰色圆形底 + 白色圆环（对齐设计稿样式）

- eye-open.png   密码隐藏时显示：圆环 + 中心点，点击查看明文
- eye-closed.png 密码可见时显示：圆环 + 斜线，点击隐藏

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

S = 4                        # 4 倍超采样后缩小，边缘平滑
SIZE = 64 * S
GREY = (146, 151, 147, 255)  # 中性灰圆底，与设计稿一致
WHITE = (255, 255, 255, 255)
W = 16                       # 圆环 / 斜线线宽


def badge(color_base, color_mark, crossed):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 灰色圆形底
    d.ellipse([14, 14, 242, 242], fill=color_base)
    # 白色圆环
    d.ellipse([80, 80, 176, 176], outline=color_mark, width=W)
    if crossed:
        # 斜线划过圆环 = 当前明文可见，点击隐藏
        d.line([(66, 190), (190, 66)], fill=color_mark, width=W)
    else:
        # 圆环中心点 = 当前密文，点击显示
        d.ellipse([112, 112, 144, 144], fill=color_mark)
    return img


for name, crossed in (('eye-open', False), ('eye-closed', True)):
    small = badge(GREY, WHITE, crossed).resize((64, 64), Image.LANCZOS)
    target = os.path.join(OUT, f'{name}.png')
    small.save(target, 'PNG')
    print('生成', os.path.basename(target), small.size, os.path.getsize(target), 'bytes')
