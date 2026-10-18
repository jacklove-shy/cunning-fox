#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
img_clean.py — 批量图片去水印（Pillow）
由 portfolio API 的 toolkit 服务调用，参数经 --params 传入 JSON：
{
  "files": ["C:/path/a.jpg", ...],
  "mode": "cover" | "blur" | "smart",
  "rect": {"x":0.1,"y":0.85,"w":0.3,"h":0.1},   # 归一化 0-1 区域
  "color": "#ffffff",                            # cover 模式填充色
  "outDir": "C:/path/去水印输出_20261017"
}
stdout 协议：每处理一张输出 PROGRESS <pct> <msg>；结束输出 RESULT <json>
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageStat


def log(m):
    print(m, flush=True)


def open_rgb(src):
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im


def rect_px(im, rect):
    W, H = im.size
    x = max(0, min(W - 2, int(rect.get("x", 0) * W)))
    y = max(0, min(H - 2, int(rect.get("y", 0) * H)))
    w = max(4, min(W - x, int(rect.get("w", 0.1) * W)))
    h = max(4, min(H - y, int(rect.get("h", 0.1) * H)))
    return (x, y, x + w, y + h)


def frame_colors(im, box):
    """取区域上下左右四条边的平均色（用于梯度延展）"""
    x0, y0, x1, y1 = box
    W, H = im.size
    def avg(s):
        if s[2] - s[0] < 2 or s[3] - s[1] < 2:
            return None
        st = ImageStat.Stat(im.crop(s))
        return tuple(int(v) for v in st.mean)
    top = avg((x0, max(0, y0 - 10), x1, y0))
    bottom = avg((x0, y1, x1, min(H, y1 + 10)))
    left = avg((max(0, x0 - 10), y0, x0, y1))
    right = avg((x1, y0, min(W, x1 + 10), y1))
    return top, bottom, left, right


def gradient_fill(im, box):
    """用四周颜色拟合线性渐变填入区域：纯色背景→纯色；渐变背景→延展渐变"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    top, bottom, left, right = frame_colors(im, box)
    T = top or bottom or left or right
    B = bottom or top or left or right
    L = left or top or right or bottom
    R = right or top or left or bottom
    # 四个方向都拿不到就放弃
    if not all([T, B, L, R]):
        return False
    # 颜色差异过大（复杂背景）→ 不适合梯度延展
    allc = [T, B, L, R]
    for i in range(3):
        vals = [c[i] for c in allc]
        if max(vals) - min(vals) > 110:
            return False
    # 生成渐变：垂直方向 T→B，水平方向 L→R，各半叠加
    small = Image.new("RGB", (max(2, w // 8), max(2, h // 8)))
    px = small.load()
    sw, sh = small.size
    for yy in range(sh):
        ty = yy / max(1, sh - 1)
        for xx in range(sw):
            tx = xx / max(1, sw - 1)
            vert = tuple(int(T[i] + (B[i] - T[i]) * ty) for i in range(3))
            hori = tuple(int(L[i] + (R[i] - L[i]) * tx) for i in range(3))
            px[xx, yy] = tuple((vert[i] + hori[i]) // 2 for i in range(3))
    im.paste(small.resize((w, h), Image.BILINEAR), box)
    return True


def clean_one(src, dst, mode, rect, color):
    im = open_rgb(src)
    box = rect_px(im, rect)
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0

    if mode == "cover":
        ImageDraw.Draw(im).rectangle(box, fill=color)
    elif mode == "blur":
        r = max(6, min(w, h) // 3)
        im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(radius=r)), box)
    else:  # smart：先试梯度延展（纯色/渐变背景近乎无痕），复杂背景再强模糊
        if not gradient_fill(im, box):
            strong = im.crop(box).filter(ImageFilter.GaussianBlur(radius=max(12, min(w, h) // 2)))
            im.paste(strong, box)

    ext = os.path.splitext(dst)[1].lower()
    if ext in (".jpg", ".jpeg"):
        im.save(dst, quality=92)
    else:
        im.save(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--params", required=True, help="JSON 参数")
    args = ap.parse_args()
    p = json.loads(args.params)
    files = p.get("files", [])
    mode = p.get("mode", "smart")
    rect = p.get("rect") or {"x": 0, "y": 0, "w": 0.1, "h": 0.1}
    color = p.get("color", "#ffffff")
    out_dir = p["outDir"]
    os.makedirs(out_dir, exist_ok=True)

    hexc = color.lstrip("#")
    rgb = tuple(int(hexc[i:i + 2], 16) for i in (0, 2, 4)) if len(hexc) == 6 else (255, 255, 255)

    done, errors = [], []
    for i, src in enumerate(files):
        try:
            base = os.path.basename(src)
            stem, ext = os.path.splitext(base)
            dst = os.path.join(out_dir, stem + "_clean" + ext)
            clean_one(src, dst, mode, rect, rgb)
            done.append({"src": src, "out": dst, "size": os.path.getsize(dst)})
            log("PROGRESS %d %s ✓" % (round((i + 1) / max(1, len(files)) * 100), base))
        except Exception as e:  # noqa: BLE001
            errors.append({"src": src, "error": str(e)})
            log("PROGRESS %d %s ✗ %s" % (round((i + 1) / max(1, len(files)) * 100), os.path.basename(src), e))
    log("RESULT " + json.dumps({"ok": len(done), "failed": len(errors), "files": done, "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
