# -*- coding: utf-8 -*-
"""生成密码框的显示/隐藏切换图标：经典眼睛造型（无底色，中性灰线条）

- eye-open.png   密码隐藏时显示：睁眼，点击查看明文
- eye-closed.png 密码可见时显示：眼睛+斜线，点击隐藏

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

S = 4                        # 4 倍超采样后缩小，边缘平滑
SIZE = 64 * S
GREY = (122, 133, 127, 255)  # 中性灰线条，与输入框边框/占位文字同色系
W = 16                       # 线宽
CX = 128                     # 画布中心 x


def eye(color, closed):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 眼眶：上睑较平、下睑较弯，端点在左右两侧 y=128 处相接，构成杏仁形
    d.arc([18, 88, 238, 168], start=180, end=360, fill=color, width=W)   # 上眼睑（扁弧）
    d.arc([18, 36, 238, 220], start=0, end=180, fill=color, width=W)     # 下眼睑（弯弧）
    # 瞳孔：实心圆，落在眼眶中心略下
    d.ellipse([CX - 34, 96, CX + 34, 164], fill=color)
    if closed:
        # 斜线划过眼睛 = 当前明文可见，点击隐藏
        d.line([(44, 214), (212, 42)], fill=color, width=W)
    return img


for name, closed in (('eye-open', False), ('eye-closed', True)):
    small = eye(GREY, closed).resize((64, 64), Image.LANCZOS)
    target = os.path.join(OUT, f'{name}.png')
    small.save(target, 'PNG')
    print('生成', os.path.basename(target), small.size, os.path.getsize(target), 'bytes')
