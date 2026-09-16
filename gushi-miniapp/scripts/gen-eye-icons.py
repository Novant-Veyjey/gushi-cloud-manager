# -*- coding: utf-8 -*-
"""生成密码框的小眼睛图标（睁眼 / 闭眼），风格与 TabBar 图标一致"""
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
    # 眼眶：扁椭圆
    d.ellipse([26, 78, 230, 178], outline=color, width=W)
    # 瞳孔：实心圆
    d.ellipse([92, 92, 164, 164], fill=color)
    if closed:
        # 斜杠划过眼睛 = 已隐藏 / 点击切换
        d.line([(38, 238), (218, 18)], fill=color, width=W)
    return img


for name, closed in (('eye-open', False), ('eye-closed', True)):
    small = eye(GREEN, closed).resize((64, 64), Image.LANCZOS)
    target = os.path.join(OUT, f'{name}.png')
    small.save(target, 'PNG')
    print('生成', os.path.basename(target), small.size, os.path.getsize(target), 'bytes')
