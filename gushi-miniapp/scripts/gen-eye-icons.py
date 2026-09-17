# -*- coding: utf-8 -*-
"""生成密码框的密码可见性切换图标（主题绿线条，无底色）

- eye-open.png   密码以明文显示时：睁眼（椭圆眼眶 + 瞳孔）
- eye-closed.png 密码隐藏时：闭眼（下弯眼睑 + 睫毛，无瞳孔）

关键：绘制完成后会把图形内容**裁剪并居中**贴到正方形画布上。
早期版本直接使用绘制坐标，图形整体偏向画布下方，
在手机上看就是「图标歪斜、没有垂直居中」。

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons'))
os.makedirs(OUT, exist_ok=True)

S = 4                          # 超采样倍数，缩小后边缘平滑
SIZE = 64 * S                  # 绘制用画布边长（256）
OUTPUT = 96                    # 输出边长：图标显示约 26px 实际，96 足够高分屏清晰
MARGIN = 0.06                  # 内容四周留白比例，避免贴边
W = 18                         # 线宽（绘制坐标系）
GREEN = (39, 132, 90, 255)     # #27845a，与主题 --g700 一致


def draw_eye(closed: bool) -> Image.Image:
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if closed:
        # 闭眼：一条下弯的眼睑弧线 + 三根向下的睫毛（没有瞳孔，一眼能看出「闭着」）
        d.arc([36, 56, 220, 200], start=0, end=180, fill=GREEN, width=W)
        d.line([(84, 158), (66, 184)], fill=GREEN, width=W)
        d.line([(128, 194), (128, 224)], fill=GREEN, width=W)
        d.line([(172, 158), (190, 184)], fill=GREEN, width=W)
    else:
        # 睁眼：扁椭圆眼眶 + 实心瞳孔
        d.ellipse([26, 78, 230, 178], outline=GREEN, width=W)
        d.ellipse([98, 98, 158, 158], fill=GREEN)
    return img


def center_on_canvas(img: Image.Image, size: int, margin: float = MARGIN) -> Image.Image:
    """把非透明内容裁出来再居中贴进正方形画布。

    两个图标都以画布中心为视觉中心，且都按最长边等比缩放，
    所以「睁眼 / 闭眼」切换时大小一致、不会跳动。
    """
    bbox = img.getbbox()
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if not bbox:
        return canvas
    content = img.crop(bbox)
    limit = size * (1 - 2 * margin)
    ratio = min(limit / content.width, limit / content.height)
    target = (max(1, round(content.width * ratio)), max(1, round(content.height * ratio)))
    content = content.resize(target, Image.LANCZOS)
    canvas.paste(content, ((size - target[0]) // 2, (size - target[1]) // 2), content)
    return canvas


for name, closed in (('eye-open', False), ('eye-closed', True)):
    icon = center_on_canvas(draw_eye(closed), OUTPUT)
    target = os.path.join(OUT, f'{name}.png')
    icon.save(target, 'PNG')
    box = icon.getbbox()
    print(f'生成 {os.path.basename(target)}  {icon.size}  '
          f'内容框={box}  左右留白={box[0]}/{OUTPUT - box[2]}  上下留白={box[1]}/{OUTPUT - box[3]}  '
          f'{os.path.getsize(target)} bytes')
