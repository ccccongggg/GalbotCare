# GalbotCare · 陪一把 —— 认知症老人陪伴看护机器人

> JUNCTION CHINA 2026 黑客松 · 具身智能机器人赛道（GALBOT G1）
> 赛事窗口：2026-11-06 19:00 → 2026-11-08 16:30
> 一句话成果：在 42 小时内独立完成「需求拆解 → 数字孪生 → 动作调试台 → 虚实一致性校验 → 真机 dry-run 清单 → 答辩材料」的全链路工程闭环。

---

## 项目简介

「陪一把」面向认知症老人的日常陪伴与安全看护，基于 GALBOT G1 人形机器人，围绕四大演示场景构建：

- **c1 跌倒安抚**：检测老人跌倒 → 机器人靠近 → 安抚对话
- **c2 认知训练**：引导式认知互动训练
- **c3 远程查看**：家人远程查看老人状态
- **c4 守护跟随**：机器人跟随守护，防走失/防碰撞

核心工程资产是一套**虚实一致性体系**：孪生环境与真机共用同一份动作定义（`motions.json` / `chains.json`）与原语解释器（`primitives.js` / `primitives.py`），并用四层校验器（`verify_consistency.py`）堵死「孪生能演、真机被拒」的出入。

---

## 目录结构

| 目录 / 文件 | 说明 |
|---|---|
| `digital-twin/` | Web 轻量数字孪生演示环境（Three.js 前端 + Python FastAPI 桥）。启动：`python bridge.py` → `http://127.0.0.1:8766`。含 `web/`（户型/虚拟老人/G1 机器人/导航/A*）、`motions.json`、`chains.json`、`primitives.js/py`、`lab.html` 动作调试台、`verify_consistency.py` 四层一致性校验器。 |
| `galbot-sdk-web-console/` | GALBOT SDK Web 控制台（含 `DEPLOY_CARE.md` 部署说明、`frontend/`、`assets/`、`docs/`）。 |
| `robot-display/` | 机器人表情显示素材与组件。 |
| `robot-expression-kit/` | 表情套件（表情 PNG 资源 + 脚本）。 |
| `robot-face-demo/` | 机器人脸部表情演示（HTML）。 |
| `music/` | 项目相关音频 / 音乐素材与说明。 |
| `交付包/` | 答辩与提交材料（PPT、说明文档、脚本、打包文件）。 |
| `任务队列/` | 任务拆解与派工卡（`动作编排.md`、`G1能力核对.md`、T-16/T-03/T-05/T-06/T-07 任务卡）。 |
| `规范/` | 项目规范文档。 |
| `资料文件/` | 参考资料（PDF 等）。 |
| `需求文档_老年陪伴看护机器人_V1.0.md` | 赛题需求拆解（评分表 / FR-01~07 / 硬约束 C-1~C-7 / 排期）。 |
| `项目进度.md` | 项目唯一进度事实源（任务表 T-01~T-19 + 变更日志）。 |
| `项目总结.md` | 个人工作总结与成果清单。 |
| `gate.yaml` | 项目配置。 |
| `GalbotSDK_src/` | **git 子模块**，指向 `GalaxyGeneralRobotics/GalbotSDK`。**不会随本仓库下载实体**，需按下方步骤初始化。 |

---

## 子模块（重要）

`GalbotSDK_src` 是 git 子模块，仓库只记录其 commit 指针，**不包含 SDK 源码实体**。克隆后必须初始化：

```bash
git clone https://github.com/ccccongggg/GalbotCare.git
cd GalbotCare
git submodule update --init --recursive
```

---

## 本地运行（数字孪生演示）

```bash
cd digital-twin
python bridge.py          # 启动 FastAPI 桥 + 静态服务
# 浏览器打开 http://127.0.0.1:8766
```

动作调试台 `lab.html` 提供单段 / 整链 / 全部任务三级演示粒度，含 SDK 调用日志、急停/复位与关节调试面板。

---

## 技术栈

- **前端**：Three.js（数字孪生 / 动作调试台）、原生 JS/HTML
- **后端**：Python（FastAPI / WebSocket / REST 桥）
- **校验**：Python 四层一致性校验器（原语覆盖 → SDK 文本 diff → 关节名对照 → 角度限位对照）
- **机器人 SDK**：GALBOT SDK（子模块 `GalbotSDK_src`）
- **交付**：Python 生成 PPT、Markdown 文档

---

## 文档入口

- 需求拆解：`需求文档_老年陪伴看护机器人_V1.0.md`
- 进度跟踪：`项目进度.md`
- 成果总结：`项目总结.md`
- 任务拆解：`任务队列/`
- 部署说明：`galbot-sdk-web-console/DEPLOY_CARE.md`

---

© JUNCTION CHINA 2026 黑客松参赛作品。
