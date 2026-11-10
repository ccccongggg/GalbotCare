# 陪一把 · 数字孪生演示环境（路线 A：轻量 Web 方案）

虚拟居家/养老院场景 + 虚拟老人 + 虚拟 Galbot G1，由 Python 后端驱动，
可作为真机演示的"数字影子"，也可独立跑演示链。

## 快速开始

```powershell
# 1. 安装 Python 依赖（业务侧，符合 R-01）
cd digital-twin/server
pip install -r requirements.txt

# 2. 启动桥接服务（同时托管前端页面）
python bridge.py

# 3. 浏览器打开 http://127.0.0.1:8766 （注意用 127.0.0.1，别用 localhost）
#    页面加载后，点左上「▶ 演示链 C-3 跌倒安抚」即可看效果（无需 Python）

# 4.（可选）用 Python 驱动同一套演示链（与真机动作模块同构）
python demo_c3.py
```

## 目录结构

```
digital-twin/
├─ web/                          # 前端（展示层，豁免 R-01）
│  ├─ index.html                 # HUD：演示按钮 / 双视角 / 标注 / 事件日志 / 关节调试
│  ├─ js/house.js                # 数据驱动户型：ROOMS/WALLS/FURNITURE 数组 + 程序化家具
│  ├─ js/robot.js                # 虚拟 G1：URDF 加载、导航、手势预设、胸屏/气泡
│  ├─ js/elderly.js              # 虚拟老人：glTF 动画状态机（站/坐/走/跌倒/起身/挥手）
│  ├─ js/protocol.js             # WebSocket 指令协议
│  ├─ js/main.js                 # 主程序 + 本地演示链 C-3
│  ├─ lib/                       # three.js 0.170 / urdf-loader（本地化，可离线）
│  └─ assets_elderly.glb         # 虚拟老人角色（V1 占位，见下"换装"）
├─ server/                       # Python 业务侧（R-01 范围内）
│  ├─ bridge.py                  # FastAPI：静态托管 + WS 广播 + REST /command
│  ├─ client.py                  # Twin 客户端（业务模块统一入口）
│  ├─ demo_c3.py                 # 演示链 C-3 的 Python 时序脚本
│  └─ requirements.txt
└─ assets/galbot_one_golf_description/   # Galbot G1 官方描述文件（URDF/MJCF/USD，Apache-2.0）
   来源：developer.galbot.com 平台"资源下载"
```

## 指令协议（Python → 前端）

见 `web/js/protocol.js` 头注释。常用：
`robot.nav / robot.gesture / robot.pose / robot.look / robot.say / robot.screen`、
`elderly.act / elderly.walk / elderly.say`、`status / log / reset`。

## 与真机动作模块的关系

`server/client.py` 的方法名与《动作编排.md》模块一一对应：
`gesture("wave")`=M-13，`gesture("point")`=M-15，`gesture("nod")`、
`nav(…, face_x, face_z)`=底盘+头对准。同一套 Python 调用既可发真机
（GalbotSDK）也可发数字孪生，实现"数字影子"演示。

## 两个界面

### 1. 数字孪生场景（`index.html`）— 户型 + 老人 + 机器人

- 左下「**任务段演示**」：四条链（跌倒安抚/认知训练/远程查看/守护跟随）× 分段，
  任选一段即独立完整演示该场景（自动复位 → 场景预置 → 动作序列）。
- 「演示链 C-3」按钮：整链自动运镜演示。
- 事件日志右侧同步显示每次 SDK 调用（蓝色等宽字）。

### 2. 动作调试台（`lab.html`）— 只有机器人

- 左侧模块库：M-01~M-15 + D 体态，点击即执行；悬停看模块说明与 SDK 签名。
- 右侧 SDK 调用日志：每一步原语对应的真机调用（数字孪生 = 真机同一份命令）。
- 急停（M-01）/ 复位按钮。
- 用途：逐个调动作模块（关节角标定后写回 `robot.js` 的 `POSES`），不用每次跑全链。

## Python 驱动（与浏览器共用同一份动作定义）

动作定义单源在 `web/shared/`（motions.json / chains.json），三条驱动方式：

```powershell
cd e:/JUNCTION_Hacthon/digital-twin/server
python run_motion.py M-13           # 单模块演示（数字孪生同步执行，等待完成回执）
python run_motion.py M-15 --real    # 真机 dry-run：只打印将发生的 SDK 调用
python run_chain.py c1 2            # 跌倒安抚链 第②段（数字孪生）
python run_chain.py c1 all          # 整链连跑（段间自动复位）
python run_chain.py c2 2 --real     # 真机 dry-run
```

> 上真机时：`server/primitives.py` 的 `RealRobot` 每个方法对应一个 SDK 原语，
> 把 stub 换成 Galbot SDK 实际调用即可——JSON 动作定义零改动。



- **手势校准**：页面右下「关节调试」拉滑条 → 复制 JSON → 填入
  `web/js/robot.js` 的 `POSES`（或经 `twin.pose()` 下发）。
- **虚拟老人模型（V2）**：Quaternius Universal Animation Library
  （CC0，46 动画，`web/assets_elderly/`），程序按骨骼权重给顶点染色
  （开衫/长裤/肤色），隐藏关节标记。要换真人老年形象：
  1. mixamo.com 选老年体型角色 + 动画（Idle/Walk/Fall/Sit/Wave），导出 FBX；
  2. 用 Blender 转 glTF，动画 clip 命名对应 `elderly.js` 里 `ACTION_NAMES`；
  3. 替换 `web/assets_elderly/` 下文件即可，代码零改动。
- **户型修改**：`web/js/house.js` 顶部三个数组（ROOMS/WALLS/FURNITURE_LIST）。

## V2 视觉升级要点

- ACES 色调映射 + 分区吊灯暖光（客厅/卧室/卫生间/餐厨独立光源与灯具模型）
- 墙体踢脚线、门扇（半开+把手）、窗框、窗帘、窗台
- 家具细节：坐垫/靠枕/毯子翻边/茶杯/遥控器/药盒/拐杖/绿植
- 近景自动透视：相机与注视点之间的墙自动淡化（顶视图关闭）
- 顶视图平滑过渡：先飞至正上方再切正交，回程反向
- 胸部屏幕改为 3D CanvasTexture 屏幕（近景不穿帮，含告警红框样式）
- **户型修改**：`web/js/house.js` 顶部三个数组（ROOMS/WALLS/FURNITURE_LIST）。

> 注：本机 8765 端口被其他进程占用，故使用 8766。

- 导航是直线插值，无避障（演示路径已手工避开家具）。
- 手势关节角为初始估计值，需在「关节调试」里目测校准。
- 老人"起身"用跌倒动画倒放实现；换 Mixamo 后可换专用 clip。
- 语音为文字气泡，接 TTS/ASR 后可换 `robot.say` 触发音频（T-16 对接点）。

## 版权

- Galbot G1 描述文件：GalaxyGeneralRobotics，Apache-2.0
- three.js：MIT；urdf-loader：MIT
- RobotExpressive.glb：three.js 示例资源（仅演示用途，答辩需署名）
