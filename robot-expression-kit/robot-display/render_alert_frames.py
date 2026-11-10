# -*- coding: utf-8 -*-
"""
跌倒检测警报帧渲染器 —— 红色感叹号动态动画（开发PC上运行）
用途: 机器人跌倒检测触发时, 在 G1 胸口屏幕(竖屏 1080x1920)上显示红色感叹号警报动画。
     帧序列与 render_frames.py 的目录结构一致, 可直接被 player.py 当作 "alert" 情绪播放。

用法:
    python render_alert_frames.py --size 1080x1920 --out frames_1080x1920
    python render_alert_frames.py --size 1080x1920 --out frames_1080x1920 --text "检测到跌倒"
    python render_alert_frames.py --size 272x480 --out frames_portrait   # 小竖屏备用

产物:
    <out>/alert_loop/0000.png ...   12帧循环动画(8fps, 1.5s/圈)
    <out>/to_alert/0000.png ...     neutral -> alert 过渡帧5张(--transition 模式用)

动画设计(警示优先):
    1. 红色感叹号整体脉动缩放(呼吸式), 紧急感
    2. 小幅左右高频抖动, 模拟警报闪烁
    3. 感叹号背后两圈红色波纹由内向外扩散淡出
    4. 底部白底黑字文本条(可 --text 关闭), 告知场景含义
依赖: pip install pillow
"""
import argparse, math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FPS = 8
N_LOOP = 12          # 循环帧数(8fps -> 1.5s 一圈)
N_TRANS = 5          # 过渡帧数
RED = (255, 59, 48)          # 警报红
RED_BRIGHT = (255, 96, 80)   # 脉动亮红
BG = (0, 0, 0, 255)          # 黑底, 与现有表情帧一致
PALE = (232, 244, 255)       # 文字浅色(与现有眼睛同色系)

# 候选中文字体(渲染机器上逐个尝试, 找不到则跳过文字)
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def find_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return None


def draw_exclamation(canvas, cx, cy, size, color, tilt_deg):
    """画一个圆角感叹号(竖条+圆点), 以(cx,cy)为中心, size 为整体高度"""
    bw = size * 0.30                       # 竖条宽度
    bar_h = size * 0.52                    # 竖条高度
    dot_r = bw * 0.56                      # 圆点半径
    dot_gap = size * 0.10                  # 竖条与圆点间隙
    total_h = bar_h + dot_gap + dot_r * 2
    y0 = cy - total_h / 2

    cv = Image.new("RGBA", (int(bw * 3) + 8, int(size) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    ox = cv.width / 2
    # 竖条: 上端圆角大、下端小圆角
    d.rounded_rectangle([ox - bw / 2, 4, ox + bw / 2, 4 + bar_h],
                        radius=bw * 0.35, fill=color)
    # 圆点
    dy = 4 + bar_h + dot_gap + dot_r
    d.ellipse([ox - dot_r, dy - dot_r, ox + dot_r, dy + dot_r], fill=color)
    cv = cv.rotate(tilt_deg, expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(cv, (int(cx - cv.width / 2), int(cy - cv.height / 2)))


def draw_frame(w, h, i, text=None, font=None):
    """第 i 帧(0..N_LOOP-1): 感叹号脉动+抖动+双波纹扩散"""
    t = i / N_LOOP * 2 * math.pi
    img = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(img)

    # ---- 几何: 竖屏时感叹号占屏宽约 55%, 垂直略偏上给文字留空间 ----
    mark_size = (0.80 * w) if h > w else (0.80 * h)
    cy = h * 0.42
    cx = w / 2

    # ---- 脉动 + 抖动 ----
    pulse = 1 + 0.07 * math.sin(t)                       # 呼吸缩放
    shake_dx = mark_size * 0.008 * math.sin(t * 2.0)     # 高频小幅抖动
    size = mark_size * pulse
    color = RED if math.sin(t) >= 0 else RED_BRIGHT      # 明暗交替闪烁

    cx_p, cy_p = cx + shake_dx, cy

    # ambient red light around screen edges (fading inward, blinking)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    beat = 0.5 + 0.5 * math.sin(t)
    g_alpha = int(120 + 110 * beat)
    band = int(0.08 * w)
    for k in range(4):
        a = int(g_alpha * (1.0 - 0.22 * k))
        inset = int(band * 0.5 * k)
        gd.rectangle([inset, inset, w - inset, h - inset],
                     outline=(255, 59, 48, a), width=band)
    glow = glow.filter(ImageFilter.GaussianBlur(band * 0.40))
    img.alpha_composite(glow)

    draw_exclamation(img, cx_p, cy_p, size, color + (255,), tilt_deg=2.5 * math.sin(t * 2.0))

    # ---- 底部文字条(独立图层合成, 保证闪烁透明度生效) ----
    if text and font:
        bbox = font.getbbox(text)
        tw, th = bbox[2], bbox[3] - bbox[1]
        pad_x, pad_y = th * 0.9, th * 0.55
        bx0, bx1 = cx - tw / 2 - pad_x, cx + tw / 2 + pad_x
        by0, by1 = h * 0.78, h * 0.78 + th + pad_y * 2
        alpha = 200 + int(55 * (math.sin(t) > 0))          # 文字条轻微闪烁
        bar = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar)
        bd.rounded_rectangle([bx0, by0, bx1, by1], radius=(by1 - by0) / 4,
                             fill=(255, 59, 48, alpha))
        bd.text((cx - tw / 2, by0 + pad_y), text, font=font, fill=PALE)
        img.alpha_composite(bar)
    return img


def save(seq, img, out):
    d = os.path.join(out, seq)
    os.makedirs(d, exist_ok=True)
    n = len([f for f in os.listdir(d) if f.endswith(".png")])
    q = img.convert("RGB").quantize(colors=256)   # 调色板PNG: 与现有帧一致, 体积小解码快
    q.save(os.path.join(d, f"{n:04d}.png"), optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="1080x1920",
                    help="画布分辨率, G1竖屏用 1080x1920 (默认), 小竖屏 272x480")
    ap.add_argument("--out", default="frames_1080x1920", help="输出帧目录(与 player.py --frames 对应)")
    ap.add_argument("--text", default="检测到跌倒",
                    help="底部警示文字, 传空字符串 --text '' 可关闭")
    args = ap.parse_args()
    W, H = (int(x) for x in args.size.lower().split("x"))

    font = None
    if args.text:
        fsize = int(0.06 * W if H > W else 0.10 * H)
        font = find_font(fsize)
        if font is None:
            print("[warn] 未找到中文字体, 跳过底部文字")

    # 1) 循环帧
    for i in range(N_LOOP):
        save("alert_loop", draw_frame(W, H, i, args.text, font), args.out)

    # 2) 过渡帧 neutral(眼睛) -> alert(淡入), --transition 模式用
    from render_frames import EMOTIONS, draw_frame as draw_face  # 复用眼睛渲染
    import render_frames
    render_frames.W, render_frames.H = W, H
    render_frames.SCALE = 0.95 * W / 260 if H > W else W / 480.0
    neutral = draw_face(EMOTIONS["neutral"]).convert("RGBA")
    for i in range(1, N_TRANS + 1):
        a = draw_frame(W, H, i, args.text, font)
        blend = Image.blend(neutral, a, i / N_TRANS)
        save("to_alert", blend, args.out)

    print(f"done: alert_loop {N_LOOP} 帧 + to_alert {N_TRANS} 帧 -> {args.out}/  (按 {FPS}fps 播放)")


if __name__ == "__main__":
    main()
