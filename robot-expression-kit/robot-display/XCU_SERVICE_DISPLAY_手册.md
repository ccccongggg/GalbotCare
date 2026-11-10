# XCU 屏幕显示 · service_display 速查手册（交接给 Codex 队友）

> 本手册说明**不依赖 player.py**、直接操作 xcu 屏幕显示服务的最短路径。
> 适用场景：单张图片快速上屏验证 / 调试 / 演示任意静态画面。

---

## 1. 核心原理

xcu 胸口屏幕由系统服务 `service_display` 控制。所有画面（包括本仓库
`player.py` 的表情动画）最终都是通过它的 `display_show_file` topic 推图：

```json
{"command": "setDisplayFile", "parameters": {"filePath": "<xcu上的绝对路径>"}}
```

- `player.py` = 高频循环调用上面这条命令 → 动画效果
- 直接手动调用一次 = 单张静态图上屏

**关键前提：图片文件必须已经存在于 xcu 本机文件系统上**（如 `/userdata/`），
`filePath` 不能是开发机路径。

### 屏幕规格（银河通用 G1，官方资料确认）

| 项 | 值 |
|---|---|
| 尺寸 | 5.5 寸触摸屏 |
| 面板分辨率 | 1920×1080（面板本身是横向板） |
| 位置 | 胸口 |
| **安装朝向** | **竖装**（本机确认） |

⚠️ **竖屏注意事项**：
- 竖装后有效显示方向为**竖屏**，制作内容请按 **宽 1080 × 高 1920** 出图（参考 `frames_1080x1920/`）。
- 手动推一张横版图（如 1920×1080）上屏，画面会被旋转/拉伸或留黑边，**先在开发机把图转成 1080×1920 再拷过去**：
  `python -c "from PIL import Image; Image.open('123.png').resize((1080,1920)).save('123.png')"`（或直接用竖版素材）。

---

## 2. 三步上手（在 xcu 的 shell 中执行）

### 第 1 步：加载 service_display 环境

```bash
source /data/config/default/service_display/profile
```

加载后才能找到并正确调用 `./service_display`（环境变量/库路径都在这个 profile 里）。
**每开一个新 shell 都要重新 source 一次。**

### 第 2 步：把图片拷到 xcu 指定目录

把要显示的图片放到 xcu 本机目录，例如 `/userdata/`：

```bash
# 在开发机上执行（IP 以实际为准）
scp 123.png root@<xcu_ip>:/userdata/123.png
```

目标路径示例：`/userdata/123.png`

### 第 3 步：推图上屏

```bash
./service_display -c --topic=display_show_file \
  --sendmsg="{\"command\":\"setDisplayFile\", \"parameters\":{\"filePath\":\"/userdata/123.png\"}}"
```

执行成功后胸口屏幕立即显示 `/userdata/123.png`。

> 注意 shell 引号：`--sendmsg` 的 JSON 内部双引号需用 `\"` 转义（如上），或改用单引号包裹整段：
> `--sendmsg='{"command":"setDisplayFile","parameters":{"filePath":"/userdata/123.png"}}'`

---

## 3. 恢复系统默认界面（重要！）

测试完成后，屏幕会一直停留在你推的图片上。执行以下命令让屏幕**恢复到 WiFi 界面**（系统默认 UI）：

```bash
systemctl restart launcher
```

⚠️ 侧作用提醒：
- `launcher` 是 xcu 的主界面守护进程，重启后屏幕回到默认 WiFi 界面；
- 如果 `player.py` / 编排器正在跑，重启 launcher 会清掉当前画面，需要重新启动播放器；
- 建议每次调试结束都执行一次，避免屏幕被测试图片"锁死"。

---

## 4. 常用组合（速查）

| 目的 | 命令 |
|---|---|
| 加载环境 | `source /data/config/default/service_display/profile` |
| 推送单张图 | `./service_display -c --topic=display_show_file --sendmsg="{\"command\":\"setDisplayFile\",\"parameters\":{\"filePath\":\"/userdata/123.png\"}}"` |
| 恢复 WiFi 默认界面 | `systemctl restart launcher` |
| 播放表情动画 | 见 `DEPLOY.md`（`python3 player.py --bin ./service_display --frames /userdata/robot-display/frames_1080x1920 --fps 8`） |

---

## 5. 与本仓库的关系

```
对任何文件用 XCU_SERVICE_DISPLAY_手册.md 的方式手动上屏
        │
        └─ 想要 8 种情绪动画 → player.py（内部就是对同一 topic 逐帧调用）
                └─ 想要 表情+颈部动作 → orchestrator_lite.py（:8902 转发给 player）
```

- `player.py` 的 `_show()` 方法（见 `player.py` 顶部注释）内部封装的就是
  第 3 步那条命令，只是把 `filePath` 换成帧序列里的 png 并按 8fps 循环。
- 帧序列必须提前拷到 xcu（如 `/userdata/robot-display/frames_1080x1920/`），
  与第 2 步"图片必须先在 xcu 本机"是同一个道理。

## 6. 排障提示

- 命令无反应：确认先 `source` 了 profile；确认 `./service_display` 存在（可 `./service_display --help` 看用法）。
- 图片不显示：确认 `filePath` 是 **xcu 本机**存在的绝对路径，可先 `ls /userdata/123.png`。
- 屏幕黑屏/卡在测试图：`systemctl restart launcher` 恢复。
