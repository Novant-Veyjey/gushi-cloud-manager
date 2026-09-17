# -*- coding: utf-8 -*-
"""生成密码框的密码可见性切换图标（主题绿线条，无底色）

- eye-open.png   密码以明文显示时：睁眼（椭圆眼眶 + 瞳孔）
- eye-closed.png 密码隐藏时：闭眼（下弯眼睑 + 睫毛，无瞳孔）

输出为**紧凑图**：先按内容裁剪，只留 3% 的均匀白边，再等比缩放到宽度 96。
这样图片里几乎不含透明留白，可见图形就是图片本身——
避免「图形只占画布一小块」在各种缩放/适配下看起来偏斜或偏小。
（早期版本图形落在画布偏下位置，手机上就是「图标歪斜」。）

用法（需要 Pillow）：python scripts/gen-eye-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'icons'))
os.makedirs(OUT, exist_ok=True)

S = 4                          # 超采样倍数，缩小后边缘平滑
SIZE = 64 * S                  # 绘制用画布边长（256）
OUTPUT_W = 96                  # 输出宽度；高度按内容比例，不强制正方形
PAD_RATIO = 0.03               # 均匀小白边，避免抗锯齿边缘被裁掉
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


def to_compact(img: Image.Image) -> Image.Image:
    """按内容裁剪 → 加均匀白边 → 等比缩放到固定宽度。"""
    bbox = img.getbbox()
    content = img.crop(bbox) if bbox else img
    pad = max(2, round(max(content.size) * PAD_RATIO))
    canvas = Image.new('RGBA', (content.width + pad * 2, content.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(content, (pad, pad), content)
    height = max(1, round(canvas.height * OUTPUT_W / canvas.width))
    return canvas.resize((OUTPUT_W, height), Image.LANCZOS)


for name, closed in (('eye-open', False), ('eye-closed', True)):
    icon = to_compact(draw_eye(closed))
    target = os.path.join(OUT, f'{name}.png')
    icon.save(target, 'PNG')
    box = icon.getbbox()
    print(f'生成 {os.path.basename(target)}  {icon.size}  内容框={box}  '
          f'上下留白={box[1]}/{icon.height - box[3]}  左右留白={box[0]}/{icon.width - box[2]}  '
          f'{os.path.getsize(target)} bytes')
