# robot-expression-kit · 交接说明（给 Codex 队友）

本目录 = 机器人胸口屏幕表情显示方案（xcu 真机）。

## 先看这两个文档

| 文档 | 内容 |
|---|---|
| **[robot-display/XCU_SERVICE_DISPLAY_手册.md](./robot-display/XCU_SERVICE_DISPLAY_手册.md)** | ⭐ **最短路径**：手动推单张图上屏（如 `/userdata/123.png`）+ 测试后 `systemctl restart launcher` 恢复 WiFi 界面 |
| [robot-display/DEPLOY.md](./robot-display/DEPLOY.md) | 完整表情动画部署：player.py（8 种情绪帧动画）+ orchestrator（表情+颈部动作编排） |

## 三条命令速记（xcu shell 中）

```bash
# 1. 加载显示服务环境（每个新 shell 都要 source）
source /data/config/default/service_display/profile

# 2. 图片先拷到 xcu 本机，再推图上屏（示例 /userdata/123.png）
./service_display -c --topic=display_show_file \
  --sendmsg="{\"command\":\"setDisplayFile\", \"parameters\":{\"filePath\":\"/userdata/123.png\"}}"

# 3. 调试结束，恢复 WiFi 默认界面
systemctl restart launcher
```

> **屏幕规格（银河通用 G1）**：5.5 寸触摸屏，面板 1920×1080，位于胸口，**竖装使用**。
> 所有显示内容一律按 **竖屏 1080×1920**（宽1080 × 高1920）制作；
> 手动推图前先把图转成竖版，动画用 `frames_1080x1920/`。

详细说明、排障、与动画播放器的关系见 `robot-display/XCU_SERVICE_DISPLAY_手册.md`。
