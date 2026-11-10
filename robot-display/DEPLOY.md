# 机器人表情显示系统 - 部署说明

通过"预渲染帧序列 + service_display 高频切图"在机器人竖屏显示器上实现 8 种情绪表情动画。

## 包内容

| 文件 | 说明 |
|---|---|
| `render_frames.py` | 表情帧渲染器（开发机运行，已预渲染可跳过） |
| `player.py` | 表情播放守护进程（xcu 上运行） |
| `orchestrator_lite.py` | **动作编排·简化版**：情绪→屏幕+颈部，最小闭环（推荐先跑这个） |
| `orchestrator.py` | 动作编排·完整版：Idle呼吸/注意层/情绪层三轨编排（手臂/躯干/底盘/语音） |
| `preview.html` | 浏览器效果预览页（部署前可先本地确认效果） |
| `frames/` | 横屏帧序列 480x272（135 帧，小屏备用） |
| `frames_portrait/` | 竖屏帧序列 272x480（135 帧，小屏备用） |
| `frames_1080x1920/` | ⭐ **主用：竖屏 1080x1920（G1 胸口屏为竖装，内容宽1080×高1920）** |
| `frames_1920x1080/` | 横屏 1920x1080（备用，本机竖装基本不用） |

> **G1 屏幕规格（已按银河通用官方资料确认）**：5.5 寸触摸屏，面板分辨率 1920×1080，位于胸口，**竖装使用**。
> 因此所有显示内容一律按 **宽1080 × 高1920（竖屏）** 制作，即用 `frames_1080x1920/`。
> 面板本身是 1920×1080 的横板，竖装后物理上是转了 90°，所以内容尺寸是"1080 宽、1920 高"。

表情：neutral / happy / angry / sad / surprised / thinking / sleepy / love（每种含循环帧 + 过渡帧 + 眨眼帧，8fps 设计）。

## 部署步骤（xcu 上）

```bash
# 1. 把整个目录拷到 xcu，例如 /userdata/robot-display/
#    （--frames 指向的目录必须是 1080x1920 竖屏帧，即 frames_1080x1920/）

# 2. 启动播放器
source /data/config/default/service_display/profile
cd /path/to/service_display 所在目录   # player.py 会在该目录下调用 ./service_display
python3 player.py --bin ./service_display --frames /userdata/robot-display/frames_1080x1920 --fps 8
```

参数说明：
- `--fps`：播放帧率，默认 8。若日志出现 `[warn] 发送耗时 > 帧间隔` 或画面闪，降到 6/5 再试
- `--debounce`：切换去抖秒数，默认 0.25。若表情来回跳，加大到 0.5
- `--transition`：可选，启用过渡帧动画（默认关闭 = 直接切换，防闪）
- `--frames`：帧目录；`--bin`：service_display 路径；`--cwd`：service_display 工作目录

## 对接对话系统

**方式一（仅表情）**：对话系统直接 POST 到 player.py：

```bash
curl http://127.0.0.1:8901/emotion -X POST -d '{"emotion":"happy"}'
```

**方式二（表情+动作，推荐）**：启动动作编排器，对话系统改 POST 到编排器：

```bash
# 简化版（先跑通）：表情+颈部动作
python3 orchestrator_lite.py            # 真机；先跑 --list-joints 核对关节名
python3 orchestrator_lite.py --dry      # 无机器人干跑验证时间线

# 完整版（打通后再上）：+呼吸感+注意层+手臂/躯干/底盘/语音
python3 orchestrator.py --dry           # 同样支持干跑

curl http://127.0.0.1:8902/emotion -X POST -d '{"emotion":"happy"}'
```

编排器自动把表情转发给 player.py(:8901)，同时驱动颈部/身体动作链。
**首次真机必做**：`--list-joints` 查真实关节名 → 改脚本顶部 `NECK_JOINTS`/`JOINTS` →
`--dry` 验证时间线 → 手放急停旁首次真机运行。手臂姿态（ARM_POSES）为占位值需真机示教标定。

建议：对话 LLM 输出 JSON `{"text": "...", "emotion": "happy|sad|angry|surprised|thinking|sleepy|love|neutral"}`，
后端把 emotion 字段 POST 到编排器接口即可。重复/连续请求有去抖，无需限流。

## 自带监控

播放器终端每 30 秒输出：
`[stats] 已发 N 帧 | 单帧延迟均值 Xms | 慢帧 N | 目标fps X`
- 单帧延迟均值 < 帧间隔(1000/fps ms) = 正常
- 若延迟高：降 `--fps`；若延迟正常但仍闪：多为显示服务切图清屏行为，可尝试 `./service_display --help` 查找视频类 topic 改推视频

## 修改表情造型（可选）

编辑 `render_frames.py` 顶部 `EMOTIONS` 参数表（眼宽高/倾斜/眼距/眼睑/形状）后重渲染：

```bash
pip install pillow
python render_frames.py --size 272x480 --out frames_portrait
```

## 预览（可选，无需机器人）

```bash
python -m http.server 8766
# 浏览器打开 http://localhost:8766/preview.html?dir=frames_portrait
```
