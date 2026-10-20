# -*- coding: utf-8 -*-
"""主畫面圖示產生器（第二季：黑底朱印）
用法：python tools/make_icons.py
  畫出跟首頁一樣的「蹲」朱印（Noto Serif TC Black、斜 7 度、內圈墨線、印泥毛邊），
  輸出 icons/icon-180.png（iPhone）、icon-192.png、icon-512.png、icon-512-maskable.png（Android 安全區）。
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = Path(r"C:\Windows\Fonts\NotoSerifTC-Black.otf")
INK = (13, 13, 12)        # --ink
SIGNAL = (255, 74, 31)    # --signal
W = 2048                  # 先畫大張再縮小，邊緣才乾淨


def seal(side):
    """一顆朱印（透明底），跟 css .seal 一樣的比例"""
    pad = int(side * 0.2)
    size = side + pad * 2
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = pad, pad, pad + side, pad + side
    d.rounded_rectangle((x0, y0, x1, y1), radius=side * 0.08, fill=SIGNAL + (255,))
    # 內圈墨線：離外緣 6.5%，寬 3%
    a, b = side * 0.065, side * 0.095
    d.rounded_rectangle((x0 + a, y0 + a, x1 - a, y1 - a), radius=side * 0.05, fill=INK + (255,))
    d.rounded_rectangle((x0 + b, y0 + b, x1 - b, y1 - b), radius=side * 0.035, fill=SIGNAL + (255,))
    font = ImageFont.truetype(str(FONT), int(side * 0.56))
    cx, cy = size / 2, size / 2
    d.text((cx, cy + side * 0.01), "蹲", font=font, fill=INK + (255,), anchor="mm")
    return im


def rough(im, amp, freq, seed):
    """印泥的毛邊：用平滑雜訊把像素推一點點（像網頁的 #ink 濾鏡），再撒一些沒吃到墨的小點"""
    rng = np.random.default_rng(seed)
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]

    def field():
        small = rng.standard_normal((max(2, int(h * freq)), max(2, int(w * freq)))).astype(np.float32)
        f = Image.fromarray(small).resize((w, h), Image.BICUBIC)
        f = np.asarray(f, dtype=np.float32)
        return f / (np.abs(f).max() + 1e-6)

    dx, dy = field() * amp, field() * amp
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xx + dx, 0, w - 1).astype(np.int32)
    sy = np.clip(yy + dy, 0, h - 1).astype(np.int32)
    out = arr[sy, sx]
    # 沒吃到墨的小點：只在朱紅的地方
    speck = np.asarray(Image.fromarray((rng.random((h // 14, w // 14)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), dtype=np.float32) / 255
    red = (out[..., 0] > 200) & (out[..., 1] < 120)
    holes = red & (speck > 0.972)
    out[holes, 3] *= 0.55
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def icon(seal_ratio, seed):
    bg = Image.new("RGBA", (W, W), INK + (255,))
    # 很淡的朱紅光暈，黑底才不會死板
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = W * seal_ratio * 0.95
    gd.ellipse((W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r), fill=SIGNAL + (24,))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.13))
    bg = Image.alpha_composite(bg, glow)

    side = int(W * seal_ratio)
    s = seal(side)
    s = rough(s, amp=side * 0.0024, freq=0.09, seed=seed)
    s = s.rotate(7, resample=Image.BICUBIC, expand=False)  # 逆時針 7 度＝畫面上往左斜，跟網頁一樣
    ox = (W - s.width) // 2
    oy = (W - s.height) // 2
    bg.alpha_composite(s, (ox, oy))
    return bg.convert("RGB")


def main():
    out = ROOT / "icons"
    full = icon(0.60, seed=4)       # 一般圖示（iPhone 會自己切圓角）
    mask = icon(0.50, seed=4)       # Android 可裁切圖示：印章要落在中間 80% 的圓裡
    for name, im, px in (("icon-180.png", full, 180), ("icon-192.png", full, 192),
                         ("icon-512.png", full, 512), ("icon-512-maskable.png", mask, 512)):
        im.resize((px, px), Image.LANCZOS).save(out / name, optimize=True)
        print("寫好", name)
    # 安全區檢查：印章四角離中心的距離要小於 0.4 倍邊長
    corner = 0.50 / 2 * math.sqrt(2)
    print(f"maskable 印章角落距中心 {corner:.3f}（要 < 0.400）")


if __name__ == "__main__":
    main()
