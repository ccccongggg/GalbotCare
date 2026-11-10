# -*- coding: utf-8 -*-
"""
表情帧序列渲染器（在开发PC上运行，产出拷贝到 xcu /userdata/frames/）
用法:
    python render_frames.py --size 480x272 --out frames
    python render_frames.py --size 480x272 --out frames --fps-note 8
依赖: pip install pillow
产物结构:
    frames/<seq_name>/<4位序号>.png
    序列: neutral_loop / happy_loop / angry_loop / sad_loop / surprised_loop /
          thinking_loop / sleepy_loop / love_loop /
          to_<emo>(过渡帧) / blink(眨眼帧)
"""
import argparse, math, os
from PIL import Image, ImageDraw

# ---------------- 眼睛参数（复刻 RoboEyes 风格） ----------------
P = dict(w=110, h=118, tilt=0.0, gap=150, dx=0, dy=0,
         lid=0.0, shape="rect", color=(232, 244, 255), scale=1.0)

EMOTIONS = {
    "neutral":   dict(P, w=110, h=118, tilt=0,    gap=150, dx=0,   dy=0,   lid=0,   shape="rect"),
    "happy":     dict(P,                          shape="happy"),
    "angry":     dict(P, w=122, h=104, tilt=-20,  gap=158, dy=6),
    "sad":       dict(P, w=106, h=110, tilt=14,   gap=146, dy=10),
    "surprised": dict(P, w=124, h=134, tilt=0,    gap=156, dy=-8, shape="circle"),
    "thinking":  dict(P, w=104, h=112, tilt=0,    gap=150, dx=-14, dy=-10, lid=0.35),
    "sleepy":    dict(P, w=110, h=110, tilt=0,    gap=150, dy=8,   lid=0.5),
    "love":      dict(P,                          shape="heart"),
}

FPS = 8          # 目标播放帧率，仅用于时长参考
W, H = 480, 272  # 画布尺寸，用 --size 按实际屏幕改（竖屏直接写 宽x高，如 272x480）
SCALE = 1.0      # 自适应缩放，main() 中根据横竖屏计算


def lerp(a, b, t): return a + (b - a) * t


def lerp_params(a, b, t):
    out = {}
    for k in a:
        va, vb = a[k], b.get(k, a[k])
        out[k] = lerp(va, vb, t) if isinstance(va, (int, float)) else (vb if t > 0.5 else va)
    return out


def draw_eye(base, cx, cy, prm, side):
    """side: 1 左眼 / -1 右眼（倾斜镜像）"""
    w, h = prm["w"] * prm["scale"], prm["h"] * prm["scale"]
    if prm["shape"] == "happy":  # 开心：矩形被底部大圆遮罩切出上弧（Cozmo 式眯眼）
        ew, eh = max(4, w), max(4, prm["h"] * prm["scale"])
        cv = Image.new("RGBA", (int(ew) + 8, int(eh) + 8), (0, 0, 0, 0))
        d = ImageDraw.Draw(cv)
        d.rounded_rectangle([4, 4, 4 + ew, 4 + eh], radius=ew * 0.22, fill=prm["color"])
        # 底部圆形擦除遮罩：圆心在眼下缘之下，切出向上弯的弧
        mask = Image.new("L", cv.size, 255)
        md = ImageDraw.Draw(mask)
        r = ew * 0.80
        md.ellipse([ew / 2 - r, eh * 1.18 - r, ew / 2 + r, eh * 1.18 + r], fill=0)
        cv.putalpha(Image.composite(cv.getchannel("A"), Image.new("L", cv.size, 0), mask))
        cv = cv.rotate(prm["tilt"] * side, expand=True, resample=Image.BICUBIC)
        base.alpha_composite(cv, (int(cx - cv.width / 2), int(cy - cv.height / 2)))
        return
    if prm["shape"] == "heart":  # 爱心眼
        s = w * 0.55
        cv = Image.new("RGBA", (int(s * 2), int(s * 2)), (0, 0, 0, 0))
        d = ImageDraw.Draw(cv)
        col = prm["color"] if prm["color"] != (232, 244, 255) else (255, 95, 126)
        d.polygon([(s, s * 1.5), (0, s * 0.6), (0, s * 0.25), (s * 0.18, 0), (s * 0.55, s * 0.12),
                   (s, s * 0.4), (s * 1.45, s * 0.12), (s * 1.82, 0), (s * 2, s * 0.25), (s * 2, s * 0.6)],
                  fill=col)
        d.ellipse([0, s * 0.25 - s * 0.42, s * 0.84, s * 0.25 + s * 0.42], fill=col)
        d.ellipse([s * 1.16, s * 0.25 - s * 0.42, s * 2, s * 0.25 + s * 0.42], fill=col)
        cv = cv.rotate(prm["tilt"] * side, expand=True, resample=Image.BICUBIC)
        base.alpha_composite(cv, (int(cx - cv.width / 2), int(cy - cv.height / 2)))
        return
    # rect / circle 眼
    ew, eh = max(4, w), max(4, h * (1 - prm["lid"]))
    r = ew / 2 if prm["shape"] == "circle" else ew * 0.22
    cv = Image.new("RGBA", (int(ew) + 8, int(eh) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    d.rounded_rectangle([4, 4, 4 + ew, 4 + eh], radius=r, fill=prm["color"])
    cv = cv.rotate(prm["tilt"] * side, expand=True, resample=Image.BICUBIC)
    base.alpha_composite(cv, (int(cx - cv.width / 2), int(cy - cv.height / 2)))


def draw_frame(prm):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    p = dict(prm)
    for k in ("w", "h", "gap", "dx", "dy"):  # 几何参数按屏幕自适应缩放
        p[k] = prm[k] * SCALE
    cy = H / 2 + p["dy"] + p["h"] * 0.08
    draw_eye(img, W / 2 - p["gap"] / 2 + p["dx"], cy, p, 1)
    draw_eye(img, W / 2 + p["gap"] / 2 + p["dx"], cy, p, -1)
    return img


def save(seq, img, out):
    d = os.path.join(out, seq)
    os.makedirs(d, exist_ok=True)
    n = len([f for f in os.listdir(d) if f.endswith(".png")])
    # 调色板 PNG：体积更小、解码更快，可缩短显示服务每帧的清屏窗口（缓解闪屏）
    q = img.convert("RGB").quantize(colors=256)
    q.save(os.path.join(d, f"{n:04d}.png"), optimize=True)


def main():
    global W, H
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="480x272", help="显示器分辨率，如 480x272 / 1024x600")
    ap.add_argument("--out", default="frames")
    args = ap.parse_args()
    global SCALE
    W, H = (int(x) for x in args.size.lower().split("x"))
    GROUP = 260  # 基准设计下双眼组宽度（gap150 + 眼宽110）
    if H > W:    # 竖屏：眼睛组占宽度约95%，垂直居中
        SCALE = 0.95 * W / GROUP
    else:        # 横屏：按 480 宽基准等比
        SCALE = W / 480.0

    # 1) 各情绪循环帧（含 idle 微动：呼吸/弹跳/脉动）
    loops = {
        "neutral":   lambda i, n: dict(EMOTIONS["neutral"],   dy=3 * math.sin(i / n * 2 * math.pi)),
        "happy":     lambda i, n: dict(EMOTIONS["happy"],     scale=1 + 0.04 * math.sin(i / n * 2 * math.pi)),
        "angry":     lambda i, n: dict(EMOTIONS["angry"],     tilt=-20 + 3 * math.sin(i / n * 2 * math.pi)),
        "sad":       lambda i, n: dict(EMOTIONS["sad"],       dy=10 + 3 * math.sin(i / n * 2 * math.pi)),
        "surprised": lambda i, n: dict(EMOTIONS["surprised"], scale=1 + 0.06 * math.sin(i / n * 2 * math.pi)),
        "thinking":  lambda i, n: dict(EMOTIONS["thinking"],  dx=-14 + 6 * math.sin(i / n * 2 * math.pi)),
        "sleepy":    lambda i, n: dict(EMOTIONS["sleepy"],    lid=0.5 + 0.12 * math.sin(i / n * 2 * math.pi)),
        "love":      lambda i, n: dict(EMOTIONS["love"],      scale=1 + 0.08 * math.sin(i / n * 2 * math.pi)),
    }
    N_LOOP = 12
    for name, fn in loops.items():
        for i in range(N_LOOP):
            save(f"{name}_loop", draw_frame(fn(i, N_LOOP)), args.out)

    # 2) 过渡帧 neutral -> 每个情绪（5帧）
    T = 5
    for name, prm in EMOTIONS.items():
        if name == "neutral":
            continue
        for i in range(1, T + 1):
            save(f"to_{name}", draw_frame(lerp_params(EMOTIONS["neutral"], prm, i / T)), args.out)

    # 3) 眨眼帧（4帧：闭-闭-半开-开）
    for k, lidv in enumerate([0.85, 0.95, 0.5, 0.15]):
        save("blink", draw_frame(dict(EMOTIONS["neutral"], lid=lidv)), args.out)

    n_files = sum(len(files) for _, _, files in os.walk(args.out))
    print(f"done: {n_files} frames -> {args.out}/  (按 {FPS}fps 播放)")


if __name__ == "__main__":
    main()
