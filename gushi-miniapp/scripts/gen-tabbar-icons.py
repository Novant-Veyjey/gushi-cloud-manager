# -*- coding: utf-8 -*-
"""
生成 TabBar 图标（81x81，普通 / 选中两套），图形对齐原型的字符图标 ⌂ ▤ ◉ ⌕ 🛒。

用法（需要 Pillow）：
    python scripts/gen-tabbar-icons.py

产物写入 src/assets/tabbar/，由 scripts/copy-tabbar.js 在构建后复制到产物根目录的
assets/tabbar，供 app.config.ts 中的 iconPath / selectedIconPath 使用。
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'tabbar')
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

S = 4                 # 4 倍超采样后缩小，得到平滑边缘
SIZE = 81 * S
W = 26                # 线宽
NORMAL = (139, 153, 144, 255)   # #8b9990 与 tabBar color 一致
ACTIVE = (31, 106, 74, 255)     # #1f6a4a 与 selectedColor 一致


def blank():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def home(color):
    """首页：屋顶 + 房身"""
    img, d = blank()
    d.line([(38, 170), (162, 48), (286, 170)], fill=color, width=W, joint='curve')
    d.rounded_rectangle([86, 170, 238, 284], radius=18, outline=color, width=W)
    return img


def production(color):
    """生产：三行列表"""
    img, d = blank()
    for top in (78, 141, 204):
        d.rounded_rectangle([64, top, 96, top + 32], radius=8, fill=color)
        d.rounded_rectangle([124, top + 5, 262, top + 27], radius=11, fill=color)
    return img


def monitor(color):
    """监测：靶心"""
    img, d = blank()
    d.ellipse([48, 48, 276, 276], outline=color, width=W)
    d.ellipse([118, 118, 206, 206], fill=color)
    return img


def trace(color):
    """溯源：放大镜"""
    img, d = blank()
    d.ellipse([38, 38, 218, 218], outline=color, width=W)
    d.line([(200, 200), (272, 272)], fill=color, width=W + 6)
    d.ellipse([188, 188, 218, 218], fill=color)
    return img


def market(color):
    """市场：购物袋"""
    img, d = blank()
    d.rounded_rectangle([74, 122, 250, 288], radius=22, outline=color, width=W)
    d.arc([106, 50, 218, 174], start=180, end=360, fill=color, width=W)
    return img


ICONS = {'home': home, 'production': production, 'monitor': monitor, 'trace': trace, 'market': market}

if __name__ == '__main__':
    for name, drawer in ICONS.items():
        for suffix, color in (('', NORMAL), ('-on', ACTIVE)):
            big = drawer(color)
            small = big.resize((81, 81), Image.LANCZOS)
            target = os.path.join(OUT, f'{name}{suffix}.png')
            small.save(target, 'PNG')
            print(f'生成 {os.path.basename(target)}  {small.size}  {os.path.getsize(target)} bytes')
