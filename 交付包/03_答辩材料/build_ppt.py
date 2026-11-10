# -*- coding: utf-8 -*-
"""生成答辩 PPT 初稿（10 页）。数据占位符为【待填】，填实测数据后重跑本脚本即可再生成。"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ---------- 调色板：莓红 & 奶油（照护主题） ----------
BERRY = RGBColor(0x6D, 0x2E, 0x46)   # 主色（深莓红）
BERRY_D = RGBColor(0x54, 0x22, 0x35) # 更深
ROSE = RGBColor(0xA2, 0x67, 0x69)    # 辅助（豆沙）
CREAM = RGBColor(0xEC, 0xE2, 0xD0)   # 奶油
BG = RGBColor(0xFA, 0xF6, 0xEF)      # 浅底
INK = RGBColor(0x38, 0x2C, 0x31)     # 正文深色
SAGE = RGBColor(0x6F, 0x9A, 0x82)    # 强调（改进后/成功）
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
MUTE = RGBColor(0x8A, 0x7C, 0x72)    # 弱化灰棕

FONT = "微软雅黑"
EMU_IN = 914400

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]

def slide():
    return prs.slides.add_slide(BLANK)

def _set_ea(run, name):
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = rPr.makeelement(qn('a:ea'), {})
        rPr.append(ea)
    ea.set('typeface', name)

def txt(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
        line_spacing=1.0, space_after=4, wrap=True):
    """runs: list of paragraphs; each paragraph = list of (text, size, bold, color) tuples or a single tuple"""
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    first = True
    for para in runs:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.line_spacing = line_spacing
        p.space_after = Pt(space_after)
        items = para if isinstance(para, list) else [para]
        for (t, size, bold, color) in items:
            r = p.add_run()
            r.text = t
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
            r.font.name = FONT
            _set_ea(r, FONT)
    return box

def rect(s, x, y, w, h, fill, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=None, shadow=False):
    sp = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line
        sp.line.width = Pt(1)
    sp.shadow.inherit = False
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sp.adjustments[0] = radius
        except Exception:
            pass
    return sp

def chip(s, x, y, w, h, text, fill, tcolor=WHITE, size=12, bold=True, radius=0.5):
    rect(s, x, y, w, h, fill, radius=radius)
    txt(s, x + 0.05, y, w - 0.1, h, [(text, size, bold, tcolor)],
        align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

def circle_num(s, x, y, d, n, fill=BERRY, tcolor=WHITE, size=14):
    rect(s, x, y, d, d, fill, shape=MSO_SHAPE.OVAL)
    txt(s, x, y, d, d, [(n, size, True, tcolor)], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

def header(s, tag, title, sub=None):
    rect(s, 0, 0, 13.333, 7.5, BG, shape=MSO_SHAPE.RECTANGLE)  # 背景
    txt(s, 0.6, 0.42, 12.1, 0.34, [(tag, 12, True, ROSE)])
    txt(s, 0.6, 0.72, 12.1, 0.62, [(title, 30, True, BERRY)])
    if sub:
        txt(s, 0.6, 1.34, 12.1, 0.32, [(sub, 13, False, MUTE)])
    # 右上角页脚小标
    txt(s, 10.2, 7.08, 2.6, 0.3, [("陪一把 · JUNCTION CHINA 2026", 10, False, MUTE)], align=PP_ALIGN.RIGHT)

def stat(s, x, y, w, big, label, color=BERRY, big_size=40):
    txt(s, x, y, w, 0.72, [(big, big_size, True, color)])
    txt(s, x, y + 0.72, w, 0.34, [(label, 12, False, MUTE)])

# ============ P1 封面（深色） ============
s = slide()
rect(s, 0, 0, 13.333, 7.5, BERRY)
rect(s, 0, 0, 13.333, 7.5, BERRY_D, shape=MSO_SHAPE.RECTANGLE)  # keep solid
# 装饰圆
rect(s, 10.4, -1.2, 4.2, 4.2, ROSE, shape=MSO_SHAPE.OVAL)
rect(s, 11.4, 4.8, 3.6, 3.6, BERRY_D, shape=MSO_SHAPE.OVAL)
rect(s, -0.9, 5.6, 2.6, 2.6, ROSE, shape=MSO_SHAPE.OVAL)
txt(s, 1.1, 1.05, 11.0, 0.4, [("JUNCTION CHINA 2026 · 具身智能机器人赛道 · 银河通用 GALBOT", 14, True, CREAM)])
txt(s, 1.1, 1.95, 11.0, 1.5, [("陪一把", 66, True, WHITE)])
txt(s, 1.1, 3.35, 11.0, 0.55, [("认知症老人陪伴看护机器人", 24, True, CREAM)])
txt(s, 1.1, 4.05, 11.0, 0.45, [("一台一直「在」的机器人：看着 · 记着 · 陪着 · 拦着", 16, False, CREAM)])
rect(s, 1.1, 5.05, 5.6, 0.045, ROSE, shape=MSO_SHAPE.RECTANGLE)
txt(s, 1.1, 5.35, 11.0, 0.4, [("团队：【待填：团队名】    成员：【待填：姓名 / 分工】", 14, True, WHITE)])
txt(s, 1.1, 5.85, 11.0, 0.4, [("载体：GALBOT G1 ｜ 主题：具身自进化", 13, True, CREAM)])

# ============ P2 痛点与场景 ============
s = slide()
header(s, "01 / 痛点与场景", "不是没人管，是没人「在」", "创意与场景价值 20 分 · 场景叙事《独居老人的一天》")
# 左：大数字 + 痛点
stat(s, 0.7, 1.95, 3.2, "1000万+", "认知症老人（数据【待核对：来源】）")
for i, (t, d) in enumerate([
    ("一整天的沉默", "白天独自在家，一天说不上十句话"),
    ("家属的两个恐惧", "跌倒无人知、走失找不回"),
    ("现有方案的缺口", "摄像头只能「看」，不能陪、不能拦、不能第一时间开口"),
]):
    y = 3.35 + i * 1.12
    circle_num(s, 0.7, y, 0.42, str(i + 1), fill=ROSE)
    txt(s, 1.28, y - 0.03, 4.7, 0.36, [(t, 15, True, INK)])
    txt(s, 1.28, y + 0.32, 4.7, 0.6, [(d, 12, False, MUTE)], line_spacing=1.05)
# 右：一天时间轴卡片
rect(s, 6.6, 1.85, 6.1, 5.0, CREAM, radius=0.06)
txt(s, 6.95, 2.05, 5.4, 0.4, [("《独居老人的一天》", 16, True, BERRY)])
timeline = [
    ("08:30", "认知训练", "机器人指物提问，陪老人练记忆"),
    ("14:00", "回忆录", "聊往事 → 自动生成回忆录，家属端可见"),
    ("15:20", "跌倒", "2 秒语音安抚 + 家属手机告警"),
    ("15:21", "远程查看", "家属点选画面，机器人自主过去查看"),
]
rect(s, 7.12, 2.75, 0.045, 3.05, ROSE, shape=MSO_SHAPE.RECTANGLE)
for i, (tm, tt, td) in enumerate(timeline):
    y = 2.72 + i * 0.98
    rect(s, 7.02, y, 0.22, 0.22, BERRY, shape=MSO_SHAPE.OVAL)
    txt(s, 7.5, y - 0.08, 1.0, 0.32, [(tm, 13, True, ROSE)])
    txt(s, 8.45, y - 0.08, 4.1, 0.32, [(tt, 14, True, INK)])
    txt(s, 8.45, y + 0.24, 4.1, 0.5, [(td, 11.5, False, MUTE)], line_spacing=1.05)

# ============ P3 系统总览 ============
s = slide()
header(s, "02 / 系统总览", "五层架构 × 一条主线", "技术实现 25 分 · 全部跑在自备笔记本，机器人只负责取流与执行")
layers = [
    ("L5 交互呈现", "本地语音 + 家属网页端", False),
    ("L4 Agent 规划", "仲裁抢占 · 状态机 · 记忆库 · 事件日志", True),
    ("L3 技能层", "导航/跟随/指向/抓取/播报/告警", False),
    ("L2 感知（自建）", "姿态·检测·跟踪，跑自备电脑", False),
    ("L1 机器人能力", "GalbotSDK 控制与感知接口", False),
]
for i, (name, desc, hot) in enumerate(layers):
    y = 1.95 + i * 0.86
    fill = BERRY if hot else CREAM
    rect(s, 0.7, y, 6.3, 0.74, fill, radius=0.12)
    tcol = WHITE if hot else INK
    dcol = CREAM if hot else MUTE
    txt(s, 0.95, y + 0.08, 2.0, 0.6, [(name, 13, True, tcol)], anchor=MSO_ANCHOR.MIDDLE)
    txt(s, 3.1, y + 0.08, 3.8, 0.6, [(desc, 11.5, False, dcol)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.0)
txt(s, 0.7, 6.35, 6.3, 0.35, [("★ L4 为完全自研核心：一副身体如何调度多任务", 12, True, BERRY)])
# 右：主线四件套
txt(s, 7.5, 1.95, 5.2, 0.4, [("演示主线 · 四件套（全部零接管）", 16, True, BERRY)])
chain = [("认知训练", "互动破冰"), ("回忆录", "情感与记忆"), ("跌倒告警", "安全刚需"), ("远程查看", "集成度")]
for i, (t, d) in enumerate(chain):
    y = 2.55 + i * 1.02
    rect(s, 7.5, y, 4.6, 0.72, WHITE, radius=0.15)
    rect(s, 7.5, y, 0.12, 0.72, ROSE, shape=MSO_SHAPE.RECTANGLE)
    txt(s, 7.85, y + 0.08, 2.2, 0.55, [(t, 15, True, INK)], anchor=MSO_ANCHOR.MIDDLE)
    txt(s, 9.9, y + 0.08, 2.0, 0.55, [(d, 11, False, MUTE)], anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.RIGHT)
    if i < 3:
        txt(s, 9.55, y + 0.68, 0.5, 0.3, [("▼", 12, True, ROSE)], align=PP_ALIGN.CENTER)
txt(s, 7.5, 6.6, 5.2, 0.4, [("正面命中评分依据：对人工干预的依赖程度", 12.5, True, RGBColor(0x3F, 0x6B, 0x52))])

# ============ P4 FR-03 认知训练 ============
s = slide()
header(s, "03 / 认知训练 FR-03", "指物识物问答：它自己找、自己指、自己判", "P0 · 现场互动：请评委替老人答一题")
steps = [
    ("①", "检测选物", "视野内实时检测，白名单优先（杯、遥控器、眼镜…）"),
    ("②", "反投影定位", "深度 + 内参 → 像素转机器人坐标系 3D 点"),
    ("③", "头臂指向", "头部 2-DOF 指向目标 + 手臂示意，非预设录音"),
    ("④", "判等计分", "同义词表 + LLM 语义判等；答错先给首字提示"),
]
for i, (n, t, d) in enumerate(steps):
    x = 0.7 + i * 3.12
    rect(s, x, 2.0, 2.86, 2.1, CREAM, radius=0.1)
    circle_num(s, x + 0.22, 2.22, 0.44, n, fill=BERRY, size=13)
    txt(s, x + 0.22, 2.78, 2.45, 0.35, [(t, 14.5, True, INK)])
    txt(s, x + 0.22, 3.16, 2.45, 0.9, [(d, 10.5, False, MUTE)], line_spacing=1.1)
    if i < 3:
        txt(s, x + 2.86, 2.75, 0.3, 0.4, [("→", 16, True, ROSE)], align=PP_ALIGN.CENTER)
# 指标条
rect(s, 0.7, 4.55, 11.93, 1.15, WHITE, radius=0.12)
rect(s, 0.7, 4.55, 0.12, 1.15, SAGE, shape=MSO_SHAPE.RECTANGLE)
for i, (b, l) in enumerate([("≥4 / 5 题", "指向命中（目标）"), ("≥80%", "判对错准确率（含同义词）"), ("≤12 秒", "单题全程"), ("0 次", "本环节人工操作")]):
    x = 1.15 + i * 2.9
    txt(s, x, 4.7, 2.7, 0.5, [(b, 24, True, BERRY)])
    txt(s, x, 5.22, 2.7, 0.35, [(l, 11, False, MUTE)])
txt(s, 0.7, 5.95, 11.9, 0.75, [("说明：指向动作由头部关节角 + 预设手臂姿态组成（属预设动作，已如实声明）；选物与判等完全由算法实时完成。", 11.5, False, MUTE)], line_spacing=1.15)

# ============ P5 FR-02 回忆录 ============
s = slide()
header(s, "04 / 回忆录 FR-02", "它记得：对话自动变回忆录", "P0 · 压舱石：不依赖机器人运动，稳定性最高")
# 左：流程 + schema
flow = ["语音对话", "结构化抽取", "回忆录入库", "记忆回溯"]
for i, t in enumerate(flow):
    x = 0.7 + i * 1.42
    chip(s, x, 2.0, 1.24, 0.5, t, BERRY if i in (1, 3) else ROSE, size=11.5)
    if i < 3:
        txt(s, x + 1.2, 2.05, 0.26, 0.4, [("→", 13, True, ROSE)], align=PP_ALIGN.CENTER)
txt(s, 0.7, 2.75, 5.8, 0.35, [("抽取 schema（自研 prompt）", 13, True, INK)])
fields = ["人物", "时间", "地点", "事件", "情绪", "原话摘要"]
for i, f in enumerate(fields):
    chip(s, 0.7 + (i % 3) * 1.35, 3.2 + (i // 3) * 0.56, 1.2, 0.44, f, CREAM, tcolor=INK, size=12)
for i, (t, d) in enumerate([
    ("会引导，不抢话", "每句 ≤15 字，顺着「三班倒」这类细节往深问"),
    ("有底线", "身份证 / 银行卡 / 门牌等隐私不打进库"),
]):
    y = 4.55 + i * 0.95
    circle_num(s, 0.7, y, 0.4, str(i + 1), fill=ROSE)
    txt(s, 1.25, y - 0.05, 5.2, 0.35, [(t, 13.5, True, INK)])
    txt(s, 1.25, y + 0.28, 5.2, 0.5, [(d, 11, False, MUTE)])
# 右：回忆录卡片 mock
rect(s, 7.0, 1.9, 5.7, 4.35, WHITE, radius=0.08)
rect(s, 7.0, 1.9, 5.7, 0.62, BERRY, radius=0.08)
txt(s, 7.3, 1.9, 5.1, 0.62, [("家属端 · 回忆录时间轴", 13, True, WHITE)], anchor=MSO_ANCHOR.MIDDLE)
txt(s, 7.35, 2.75, 5.0, 0.4, [("《纺织厂的三班倒》", 15, True, INK)])
txt(s, 7.35, 3.2, 5.0, 0.3, [("2026-11-08 14:32 · 标签：工作 / 青春", 10.5, False, MUTE)])
rect(s, 7.35, 3.6, 5.0, 0.02, CREAM, shape=MSO_SHAPE.RECTANGLE)
txt(s, 7.35, 3.75, 5.0, 1.55, [("「奶奶 18 岁进纺织厂，最累的是夜班……她说那时候年轻，不觉得苦。」", 11.5, False, INK), ("（演示时为现场对话实时生成，此处为示例样式）", 10.5, False, MUTE)], line_spacing=1.25)
rect(s, 7.35, 5.45, 5.0, 0.62, CREAM, radius=0.15)
txt(s, 7.55, 5.45, 4.7, 0.62, [("下轮对话回溯：「上次您说到纺织厂，后来呢？」 ≥1 次/会话", 11, True, BERRY)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)

# ============ P6 FR-01 跌倒告警 ============
s = slide()
header(s, "05 / 跌倒告警 FR-01", "2 秒开口，但不乱报", "P0 · 自建两级判定：疑似只出声，确认才告警")
# 左：两级判定
rect(s, 0.7, 2.0, 5.9, 1.15, ROSE, radius=0.12)
txt(s, 1.0, 2.12, 5.4, 0.4, [("FALL_SUSPECT 疑似", 15, True, WHITE)])
txt(s, 1.0, 2.5, 5.4, 0.5, [("视觉判据连续 ≥15 帧 → 只出声观察，不打扰", 11.5, False, CREAM)])
txt(s, 3.35, 3.2, 0.6, 0.4, [("▼", 15, True, ROSE)], align=PP_ALIGN.CENTER)
txt(s, 3.95, 3.25, 2.6, 0.3, [("静止 ≥3 秒且无起身", 11, True, MUTE)])
rect(s, 0.7, 3.75, 5.9, 1.15, BERRY, radius=0.12)
txt(s, 1.0, 3.87, 5.4, 0.4, [("FALL_CONFIRMED 确认", 15, True, WHITE)])
txt(s, 1.0, 4.25, 5.4, 0.5, [("停动作 → 语音安抚 → 手机告警（截图+时间）→ 写日志", 11.5, False, CREAM)])
# 判定顺序
rect(s, 0.7, 5.2, 5.9, 0.85, CREAM, radius=0.12)
txt(s, 0.95, 5.2, 5.5, 0.85, [("抢占顺序（安全第一）：停底盘 → 停机械臂 → 播报 → 推送", 12.5, True, BERRY)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.15)
# 右：判据 chips
txt(s, 7.0, 1.95, 5.6, 0.35, [("判定判据（自建，阈值即迭代素材）", 13, True, INK)])
crit = ["bbox 长宽比 ≥1.2", "头-髋高度占比 <0.3", "肩-髋水平角 <25°", "深度一致性 <0.35m", "连续 ≥15 帧", "静止位移 <0.15m ×3s"]
for i, c in enumerate(crit):
    chip(s, 7.0 + (i % 2) * 2.85, 2.4 + (i // 2) * 0.62, 2.7, 0.5, c, WHITE, tcolor=INK, size=11, bold=False)
# 指标
rect(s, 7.0, 4.45, 5.6, 1.6, WHITE, radius=0.1)
rect(s, 7.0, 4.45, 0.12, 1.6, SAGE, shape=MSO_SHAPE.RECTANGLE)
stat(s, 7.4, 4.62, 2.4, "≤2.0s", "倒地→语音安抚（目标）", big_size=28)
stat(s, 9.9, 4.62, 2.4, "≤1 次", "对照动作误报（目标）", big_size=28)
txt(s, 0.7, 6.3, 12.0, 0.4, [("测试数据【待填：跌倒 N 次 / 对照 M 次 / 误报 x 次】——来源：ITER 记录", 11.5, False, MUTE)])

# ============ P7 FR-06 远程查看 ============
s = slide()
header(s, "06 / 远程查看 FR-06", "点选即达：让家属「到场」", "P0 · 手机浏览器打开即用，零安装")
# 左：手机 mock
rect(s, 1.3, 1.95, 2.6, 4.6, INK, radius=0.12)
rect(s, 1.48, 2.35, 2.24, 3.3, WHITE, radius=0.06)
txt(s, 1.55, 2.5, 2.1, 0.3, [("G1 第一视角", 10.5, True, MUTE)], align=PP_ALIGN.CENTER)
rect(s, 1.9, 3.0, 1.4, 1.4, CREAM, shape=MSO_SHAPE.OVAL)
txt(s, 2.02, 3.38, 1.2, 0.35, [("📍 点击", 13, True, BERRY)], align=PP_ALIGN.CENTER)
txt(s, 1.55, 4.5, 2.1, 1.0, [("点选位置", 11, True, INK), ("↓ 反投影", 11, True, INK), ("↓ 自主导航", 11, True, INK)], align=PP_ALIGN.CENTER, line_spacing=1.15, space_after=2)
rect(s, 1.48, 5.75, 2.24, 0.6, ROSE, radius=0.1)
txt(s, 1.55, 5.75, 2.1, 0.6, [("状态 / 告警 / 回忆录", 10.5, True, WHITE)], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
# 右：三行特性
rows = [
    ("零转码直播", "SDK 返回的已是 JPEG 字节 → 直接 MJPEG 转发，首帧 ≤5s【目标】"),
    ("点选反投影导航", "点击画面的深度点 → 地图坐标 → 自主规划路径前往（≤30s/5m【目标】）"),
    ("同屏三合一", "实时画面 + 告警卡片 + 回忆录时间轴，一个网页全看清"),
]
for i, (t, d) in enumerate(rows):
    y = 2.0 + i * 1.06
    circle_num(s, 6.0, y, 0.42, str(i + 1), fill=ROSE)
    txt(s, 6.6, y - 0.05, 6.0, 0.35, [(t, 14.5, True, INK)])
    txt(s, 6.6, y + 0.3, 6.0, 0.6, [(d, 11.5, False, MUTE)], line_spacing=1.1)
rect(s, 6.0, 5.35, 6.6, 1.05, BERRY, radius=0.12)
txt(s, 6.3, 5.35, 6.1, 1.05, [("不是摇杆遥控：家属只做「点一下」，之后全是机器人自己走。", 14, True, WHITE)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.15)
txt(s, 0.7, 6.6, 12.0, 0.35, [("断连兜底：WiFi 不稳 → 机器人热点；推流失败 → 降为静帧刷新", 11, False, MUTE)])

# ============ P8 ITER-01 改进前后 ============
s = slide()
header(s, "07 / 测试与改进", "一次真实的迭代：ITER-01", "测试与改进 10 分 · 所有数字来自运行日志，不编造")
# 前 / 后 两栏
rect(s, 0.7, 1.95, 5.55, 3.1, ROSE, radius=0.08)
txt(s, 1.0, 2.1, 5.0, 0.4, [("改进前（第 1 次真机尝试）", 15, True, WHITE)])
txt(s, 1.0, 2.55, 5.0, 2.4, [("现象：【待填：客观现象 + 日志片段】\n\n指标：【待填：前值，如保持率 __% / 误报 __ 次】\n\n素材：【待填：改进前视频/截图文件名】", 12, False, WHITE)], line_spacing=1.3, anchor=MSO_ANCHOR.MIDDLE)
txt(s, 6.35, 3.15, 0.7, 0.6, [("→", 30, True, BERRY)], align=PP_ALIGN.CENTER)
rect(s, 7.1, 1.95, 5.55, 3.1, SAGE, radius=0.08)
txt(s, 7.4, 2.1, 5.0, 0.4, [("改进后（复测）", 15, True, WHITE)])
txt(s, 7.4, 2.55, 5.0, 2.4, [("现象：【待填：修复后表现】\n\n指标：【待填：后值，前值 → 后值】\n\n素材：【待填：改进后视频/截图文件名】", 12, False, WHITE)], line_spacing=1.3, anchor=MSO_ANCHOR.MIDDLE)
# 根因/改动/复测 三格
cols = [("根因", "【待填：定位到代码 / 参数 / 场地因素】"), ("改动", "【待填：改了什么，参数前后值】"), ("复测", "【待填：n 次测试，__ 次通过】")]
for i, (t, d) in enumerate(cols):
    x = 0.7 + i * 4.05
    rect(s, x, 5.3, 3.85, 1.15, CREAM, radius=0.12)
    txt(s, x + 0.25, 5.42, 3.4, 0.35, [(t, 13, True, BERRY)])
    txt(s, x + 0.25, 5.75, 3.4, 0.6, [(d, 11, False, INK)], line_spacing=1.1)
txt(s, 0.7, 6.65, 12.0, 0.35, [("这正是赛道主题「具身自进化」：真机试错 → 理解问题 → 落实改进 → 用数据说话", 12, True, BERRY)])

# ============ P9 贡献边界 ============
s = slide()
header(s, "08 / 亮底牌", "贡献边界：哪些是别人的，哪些是我们的", "官方第④步 · 已有能力不计为团队原创")
# 左：外部资源
rect(s, 0.7, 1.95, 5.7, 4.5, CREAM, radius=0.08)
txt(s, 1.0, 2.12, 5.1, 0.4, [("外部资源（官方 / 开源）", 15, True, INK)])
ext = [
    ("GalbotSDK v1.9.x + G1 官方 URDF", "Apache-2.0"),
    ("YOLOv8-pose 预训练权重", "Ultralytics"),
    ("云端 LLM / ASR / TTS", "【待填：供应商】"),
    ("Quaternius 动画库（数字孪生）", "CC0"),
    ("Three.js / urdf-loader / FastAPI", "MIT / BSD"),
]
for i, (t, lic) in enumerate(ext):
    y = 2.65 + i * 0.74
    txt(s, 1.0, y, 4.2, 0.6, [(t, 12, True, INK), ("   " + lic, 10, False, MUTE)], line_spacing=1.05)
    if i < len(ext) - 1:
        rect(s, 1.0, y + 0.62, 5.1, 0.015, ROSE, shape=MSO_SHAPE.RECTANGLE)
# 右：自研
rect(s, 6.9, 1.95, 5.7, 4.5, BERRY, radius=0.08)
txt(s, 7.2, 2.12, 5.1, 0.4, [("团队自研", 15, True, WHITE)])
own = [
    ("任务仲裁与抢占调度器", "P0–P4 优先级 · 非阻塞 + 超时监控 · 断点降级"),
    ("跌倒两级判定", "判据、阈值、时序滤波、误报对照测试"),
    ("点选式远程端", "MJPEG 零转码 · 反投影导航 · 告警与回忆录同屏"),
    ("动作编排与对话体态库", "M-01~M-15 动作模块 · D-1~D-4 对话体态 · 四链时间轴"),
    ("记忆回溯与结构化抽取", "老人对话人格 prompt · 抽取 schema · 回溯注入"),
]
for i, (t, d) in enumerate(own):
    y = 2.6 + i * 0.78
    rect(s, 7.2, y + 0.08, 0.16, 0.16, CREAM, shape=MSO_SHAPE.OVAL)
    txt(s, 7.5, y, 5.0, 0.32, [(t, 13, True, WHITE)])
    txt(s, 7.5, y + 0.3, 5.0, 0.4, [(d, 11, False, RGBColor(0xE8, 0xD5, 0xC9))])
txt(s, 0.7, 6.62, 12.0, 0.4, [("诚实声明：遥控、人工辅助与预设动作均已如实说明，详见人工接管记录表。", 11.5, True, ROSE)])

# ============ P10 边界声明（深色收尾） ============
s = slide()
rect(s, 0, 0, 13.333, 7.5, BERRY)
rect(s, 10.6, -1.0, 4.0, 4.0, ROSE, shape=MSO_SHAPE.OVAL)
rect(s, -1.0, 5.9, 3.0, 3.0, BERRY_D, shape=MSO_SHAPE.OVAL)
txt(s, 1.1, 0.9, 11.0, 0.7, [("诚实的边界", 34, True, WHITE)])
txt(s, 1.1, 1.65, 11.0, 0.4, [("官方评分明文：能否准确说明当前限制 —— 我们主动说", 14, False, CREAM)])
bounds = [
    ("非医疗器械", "不做诊断、不做医疗建议，定位是居家提醒与陪伴"),
    ("抓取类需辅助", "收拾/洗衣为能力延展展示，不进主线，失败如实说明"),
    ("预设动作已声明", "手臂姿态为预设关节角（真机标定），指向目标由算法实时决定"),
    ("人工接管如实记录", "整场演示接管 【待填：n】 次，全程可查记录表"),
]
for i, (t, d) in enumerate(bounds):
    y = 2.45 + i * 0.92
    rect(s, 1.1, y, 0.14, 0.72, CREAM, shape=MSO_SHAPE.RECTANGLE)
    txt(s, 1.45, y, 3.4, 0.7, [(t, 15, True, WHITE)], anchor=MSO_ANCHOR.MIDDLE)
    txt(s, 4.9, y, 7.3, 0.7, [(d, 12.5, False, CREAM)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
rect(s, 1.1, 6.15, 11.1, 0.02, ROSE, shape=MSO_SHAPE.RECTANGLE)
txt(s, 1.1, 6.4, 11.0, 0.55, [("陪一把 —— 让机器人一直「在」。谢谢！", 20, True, WHITE)])
txt(s, 1.1, 6.98, 11.0, 0.35, [("致谢：银河通用 GALBOT · JUNCTION CHINA 2026", 11.5, True, CREAM)])

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "PPT初稿_陪一把_10页.pptx")
prs.save(out)
print("saved:", out)
