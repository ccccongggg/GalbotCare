# Galbot 亲情陪护控制台 — 真机部署指南

面向家属的移动端机器人远程看护应用（PWA），同时保留完整的开发者控制台。
本指南面向拿到部署包、要在真机上跑起来的同学。

---

## 一、包内容

```
galbot-sdk-web-console/
├── src/galbot_sdk_web_console/     # 后端（FastAPI 网关 + Galbot SDK 适配层）
│   ├── gateway/                    # HTTP/WebSocket API、访问码鉴权
│   ├── services/                   # robot / navigation / motion / recording 服务
│   └── sdk/platforms/              # g1 / s1 / g3 机型适配（GalbotRobot/GalbotNavigation 初始化）
├── frontend/
│   ├── care.html                   # ★ 亲情陪护 APP（移动端，本包主打功能）
│   ├── features/care/              # 陪护页逻辑：相机流解码、摇杆、编排
│   ├── console.html / config.html / recording.html   # 开发者控制台（保留）
│   └── manifest.json               # PWA 清单（手机"添加到主屏幕"全屏运行）
├── assets/                         # 机器人 3D 模型（GLB/URDF）
├── pyproject.toml                  # 依赖清单（uv 管理）
└── DEPLOY_CARE.md                  # 本文档
```

陪护 APP 功能：实时视频（头部/左臂/右臂三路切换）、虚拟摇杆遥控（限速）、
拍照存档、常用地点一键导航、记录当前位置、急停、多指并行操作（边开边拍）、
横屏游戏手柄 HUD + 竖屏自动旋转、PWA 全屏。

---

## 二、环境要求

| 项目 | 要求 |
|---|---|
| 部署机 | 机器人本体电脑，或与机器人同网段的电脑（需能连通机器人） |
| Python | ≥ 3.10 |
| 包管理 | [uv](https://docs.astral.sh/uv/)（推荐）或 pip |
| Galbot SDK | `galbot_sdk` Python 包（厂商提供，需已在部署环境安装并能连上机器人） |
| 网络 | 手机与部署机同一局域网；机器人已完成建图（导航可用） |

---

## 三、安装

```bash
cd galbot-sdk-web-console

# 安装 uv（如果没有）
pip install uv

# 同步依赖（创建 .venv）
uv sync
```

> 注意：`uv sync` 只安装 Web 控制台自身的依赖。连接真机还需要 `galbot_sdk`
> 厂商包，请按厂商文档在同一个虚拟环境中安装（`uv pip install galbot_sdk` 或等效方式）。

---

## 四、启动与连接机器人

### 第 1 步：脱机自测（不接机器人，验证部署是否成功）

```bash
.venv/bin/galbot-sdk-web-console --port 8080        # Linux/Mac
.venv\Scripts\galbot-sdk-web-console --port 8080    # Windows
```

启动日志第一行会打印访问码：

```
Galbot SDK Web Console access code: MKDUV6E2
Galbot SDK Web Console is ready: http://<本机局域网IP>:8080
```

浏览器打开 `http://localhost:8080/frontend/care.html`，输入访问码能看到界面
（顶部显示"脱机预览"，视频区无画面属正常）。自测通过再进行下一步。

### 第 2 步：连接真机（live 模式）

```bash
# Linux/Mac
GALBOT_ACCESS_CODE=你的固定码 .venv/bin/galbot-sdk-web-console --live --robot-model g1 --port 8080

# Windows PowerShell
$env:GALBOT_ACCESS_CODE="你的固定码"; .venv\Scripts\galbot-sdk-web-console --live --robot-model g1 --port 8080
```

**参数说明：**

| 参数 | 作用 |
|---|---|
| `--live` | 初始化 Galbot SDK：创建 `GalbotRobot`（含双臂 RGB/深度、头部相机、底盘激光、IMU 传感器配置）和 `GalbotNavigation` 并连接机器人。**不加此参数就是脱机模拟，不碰真机** |
| `--robot-model` | `g1` / `s1` / `g3`，按实际机型选择 |
| `GALBOT_ACCESS_CODE` | （可选）固定访问码，≥4 位；不设则每次启动随机生成（看日志第一行） |

**真机前置检查清单：**

1. `galbot_sdk` 已安装且 SDK 自身能连上机器人（先用厂商工具验证）
2. 机器人上电、急停未锁死、站立状态
3. 导航服务可用：机器人已在现场完成建图（`/var/maps/cur/global_cloud_cleaned.pcd` 存在）
4. 部署机防火墙放行 8080 端口（见第七节）

**连接成功的标志**：陪护页顶栏显示"**已连接**"+ 机型（如 G1），视频区出现实时画面。

---

## 五、手机连接与操作

1. 手机与部署机连**同一个 Wi-Fi**
2. 浏览器打开 `http://<部署机IP>:8080/frontend/care.html`，输入访问码
3. 建议点"分享 → 添加到主屏幕"，之后从桌面图标打开即全屏 APP 体验

**操作方式（横屏游戏手柄式）：**

| 操作 | 方法 |
|---|---|
| 移动 | 左下摇杆（推杆即走，松手即停） |
| 转向 | 右侧"左转/右转"按住持续转 |
| 拍照 | 右下角大绿圆，照片自动下载到手机 |
| 切换视角 | "视角·头部"键循环：头部→左臂→右臂 |
| 一键去点位 | 顶部地点条（首次用"＋ 记录当前位置"把机器人开到位后保存） |
| 急停 | 扇形上方红色大键（按下立即停止 + 发送急停指令） |
| 边走边拍 | 摇杆和右侧按键支持双手多指同时操作 |

竖屏打开时界面自动旋转 90° 呈现完整横屏布局，转过来手机即可。

---

## 六、内置安全机制（远端家庭场景）

- 遥控限速：线速度 ≤ 0.4 m/s、角速度 ≤ 0.6 rad/s
- 四重停车：松手零速 / 页面切后台停车 / 页面关闭兜底零速 / 急停按钮
- 点位导航强制开启碰撞检查，速度同样收紧
- 全部 API 需访问码登录（Cookie 会话），未认证请求一律 401

---

## 七、常见问题

**手机打不开页面**
- Windows：管理员运行
  `netsh advfirewall firewall add rule name="Galbot Web Console 8080" dir=in action=allow protocol=TCP localport=8080 profile=any`
- 确认手机与部署机同一网段（手机 Wi-Fi 详情里的 IP 应与部署机 IP 前三段一致）
- 若同网段仍不通，多半是路由器开了 **AP 隔离**，到路由器后台关闭

**视频区一直"正在连接摄像头"**
- live 模式下说明相机流未建立：确认传感器初始化日志无报错、机型相机正常
- 脱机模式下无画面属正常

**顶栏显示"脱机预览"**
- 启动时没加 `--live`，或 `galbot_sdk` 未安装/初始化失败（看启动日志报错）

**访问码每次都变**
- 用环境变量 `GALBOT_ACCESS_CODE` 固定（见第四节），演示前设好即可

**访问码忘记了**
- 看启动日志第一行，或重启服务重新生成

---

## 八、远程（公网）访问方案简述

局域网演示无需任何额外配置。若家属需在外网访问家里机器人：

```
[子女手机/4G] ──HTTPS──> [公网 VPS/隧道] <──主动出站隧道── [家中部署机:8080]
```

- 用 frp（国内 VPS，低延迟）或 Cloudflare Tunnel（免运维）；部署机**主动外连**，家中无需开端口映射
- 必须上 HTTPS（浏览器安全上下文要求，PWA 与摄像头能力依赖它；前端已自动适配 wss）
- 公网暴露时建议：固定强访问码 + 反向代理层限速防爆破

---

## 九、页面入口

| 页面 | 路径 | 用途 |
|---|---|---|
| **亲情陪护（移动端）** | `/frontend/care.html` | ★ 家属看护 APP |
| Console 工作区 | `/frontend/console.html` | 开发者控制台（Robot/Motion/Navigation） |
| Config | `/frontend/config.html` | 参数配置 |
| Recording | `/frontend/recording.html` | 数据录制与回放 |
