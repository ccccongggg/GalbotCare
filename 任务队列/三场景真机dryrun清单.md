# 三场景真机 dry-run 清单（c1 跌倒安抚 / c2 认知训练 / c5 对话肢体语言）

> 生成时间：2026-11-10 07:35（含 M-03/D-3 点头低头方向修正）· 生成命令：python3 run_chain.py {c1|c2|c5} all --real · 动作定义单源 digital-twin/web/shared/{motions,chains}.json
> 每行 = 真机上一条 Galbot SDK 调用（与孪生调试台 SDK 日志逐字一致，verify_consistency.py 保证）


===== 跌倒安抚 · ① 声先到 · 转向靠近 =====
  说明: 评分硬指标：2s 内必须出声。声音先稳住老人，身体跟过去（M-01→播报→M-05→M-06）。
  [UI] log("info", "场景：老人起身走向餐厨，途中跌倒")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-1.2,1.9,-0.6], [0.28,0.5,0.35])
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.walkTo(0, -1.6)
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.walkTo(0.9, 0.35)
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.act("fall")
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.say("哎哟——！")
    （场景/运镜原语，仅数字孪生执行）
· M-01 停底停臂
  stop_base() + stop_navigation() + stop_trajectory_execution()
· 0.3s 出声（预缓存）
  tts.play("奶奶，您先别动。")
· M-05 闭环转向老人
  set_base_pose(0, 0, Δyaw(→0.9,0.35), frame_id="rel(0)")
· M-06 靠近至 1.0–1.5m 守护距离（老人身体侧面面对面，避内墙豁口/防轴线透视重叠，见 main.js demoC3）
  navigate_to_goal(-0.35, 0.35, omni_plan=True, timeout=8)

===== 跌倒安抚 · ② 降身 + 摆手询问 =====
  说明: 腿慢降、臂慢摆全项目唯一并行对：机器人蹲下来的同时在安慰您。
  [UI] log("info", "场景：老人已跌倒，机器人已到 1.2m 处")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([2.3,1.4,-1.8], [0.9,0.5,0.3])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-0.35, 0.35, omni_plan=True)
  [场景] elderly.walkTo(0.9, 0.35)
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.act("fall")
    （场景/运镜原语，仅数字孪生执行）
· M-02 低头，视线落到地上的老人
  set_joint_positions(["head_joint1"→0°, "head_joint2"→-12°], speed=0.3)
· M-13 预设角 A：右臂抬至身前（镜像：j2=+60/j4=+50，见 motions.json M-13）
  set_joint_positions(["right_arm_joint2"→60°, "right_arm_joint4"→50°], speed=0.3)
· 并行：腿慢降 + 臂慢摆（腿组与臂组不同链，都慢）
  set_leg_height(1.34, duration=3.2)
  set_joint_positions(预设角A↔B 交替 2 回, period=800ms)
  tts.play("您怎么样？")
· 降身到位（约 1.34m，接近蹲下）
  sleep(800)
· 保持，不动手
  tts.play("哪儿疼吗？能动吗？")
  tts.play("要我扶您吗？")
· M-14 双臂下垂
  set_joint_positions(["left_arm"→down(×7关节), "right_arm"→down(×7关节)], speed=0.3)

===== 跌倒安抚 · ③ 确认告警 · 安抚收场 =====
  说明: 老人确认无法起身 → 告警升级通知家属/值班台 → D-4 安抚 → M-10 回正。
  [UI] log("info", "场景：机器人已降身询问，老人回应")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([2.3,1.4,-1.8], [0.9,0.5,0.3])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-0.35, 0.35, omni_plan=True)
  set_joint_positions({"head_joint2":-12})
  set_leg_height(1.34)
  [场景] elderly.walkTo(0.9, 0.35)
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.act("fall")
    （场景/运镜原语，仅数字孪生执行）
  [场景] elderly.say("哎哟…爬不起来了…")
    （场景/运镜原语，仅数字孪生执行）
· 老人摇头示意起不来
  [场景] elderly.act("shake")
    （场景/运镜原语，仅数字孪生执行）
· 确认告警升级
  screen.show("跌倒告警已升级：家属/值班台", "alarm")
    （胸屏 SDK 接入后生效）
  [UI] status("alarm", "确认跌倒！已通知家属与值班台")
    （场景/运镜原语，仅数字孪生执行）
  tts.play("已通知您的家人和值班台，请保持不动，我在这里陪您。")
· D-4 安抚体态
  set_joint_positions(["head_joint1"→6°, "right_arm_joint4"→8°], speed=0.3)
  tts.play("没事，救援马上就到。")
· M-14 + M-10 收场
  set_joint_positions(["left_arm"→down(×7关节), "right_arm"→down(×7关节)], speed=0.3)
  set_joint_positions(["head_joint1"→0°, "head_joint2"→0°], speed=0.3)
  [运镜] flyTo([7.5,7.5,9], [0,0.6,0])
    （场景/运镜原语，仅数字孪生执行）

===== 认知训练 · ① 进入 · 降身平视 =====
  说明: 转向老人 → M-14 归位 → M-11 降身 20cm（坐着聊天唯一能'不俯视'的办法）→ D-2 开场。
  [UI] log("info", "场景：老人坐在扶手椅上")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-0.6,1.5,-0.9], [-1.7,0.7,-2.3])
    （场景/运镜原语，仅数字孪生执行）
· M-05 转向老人
  set_base_pose(0, 0, Δyaw(→-1.7,-2.3), frame_id="rel(0)")
· M-14 双臂归位
  set_joint_positions(["left_arm"→down(×7关节), "right_arm"→down(×7关节)], speed=0.3)
· M-11 降身 20cm
  set_leg_height(1.34, duration=3.2)
· D-2 开场提问体态
  set_joint_positions(["head_joint1"→0°, "head_joint2"→-4°], speed=0.3)
  tts.play("爷爷，我们来玩个小游戏吧。")

===== 认知训练 · ② 指向提问 =====
  说明: 头先转目标（0.5s）→ M-15 指物 + 夹爪闭合成薄片 → 停稳提问 → 指住不放直到判等结束。
  [UI] log("info", "场景：机器人已降身，目标=茶几上的水杯")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-1.9,1.6,-0.1], [-2.35,0.5,-2.55])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-3, -2.8, omni_plan=True)
  set_leg_height(1.34)
· M-02 头先转向目标
  set_joint_positions(["head"], [Δyaw(→-2.95,-1.35), pitch], speed=0.3)
· M-15 POSE_POINT（左夹爪臂）起手 + 另一臂 POSE_DOWN
  set_joint_positions(["left_arm_joint2"→-35°, "left_arm_joint4"→-5°], speed=0.3)
  set_joint_positions(["right_arm"→down(×7关节)], speed=0.3)
· 夹爪闭合 0.005m（薄片竖立，张着=要抓）
  set_gripper_command("left_gripper", 0.005, 0.03, 5)
· 停稳提问，臂与头都不动，指住直到判等结束
  tts.play("您看，这个叫什么呀？")
  sleep(1200)

===== 认知训练 · ③ 反馈 · 收场 =====
  说明: 答对：M-03+D-3 点头；再演示答错分支：保持指向提示 → M-14+M-04 收手侧头；收场 M-10。
  [UI] log("info", "场景：机器人正指着水杯提问")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-1.9,1.6,-0.1], [-2.35,0.5,-2.55])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-3, -2.8, omni_plan=True)
  set_leg_height(1.34)
  set_joint_positions(["head"], [Δyaw(→-2.95,-1.35)])
  set_joint_positions({"left_arm_joint2":-35,"left_arm_joint4":-5})
  set_gripper_command("left_gripper", 0.005)
· 答对：M-03 点头 + D-3 小臂轻抬（整题只点头 1 次）
  set_joint_positions(["head_joint2"→-8°, "left_arm_joint4"→5°], speed=0.3)
  tts.play("对啦，就是杯子。")
  set_joint_positions(["head_joint2"→0°], speed=0.3)
· 答错分支演示：M-14 收手 + M-04 侧头（不指了，别压着老人）
  set_joint_positions(["left_arm"→down(×7关节)], speed=0.3)
  set_gripper_command("left_gripper", 0.06, 0.03, 5)
  set_joint_positions(["head_joint1"→6°], speed=0.3)
  tts.play("没事，这个是水杯，记住啦。")
· 收场 2s：M-14 → M-10
  set_joint_positions(["head_joint1"→0°], speed=0.3)
  [运镜] flyTo([7.5,7.5,9], [0,0.6,0])
    （场景/运镜原语，仅数字孪生执行）

===== 对话肢体语言 · ① 老人问 · D-1 回答 =====
  说明: D-1 回答体态：头正向平视（句首 pitch −2°）+ M-14 双臂下垂不做手势；头先 0.2s 到位，与语音同起；说完 0.3s 回位。
  [UI] log("info", "场景：客厅闲聊，老人坐在扶手椅上")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-5.2,1.8,-0.6], [-2.3,0.75,-2.3])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-3, -2.5, omni_plan=True)
· 老人提问（老人说话时底盘不动）
  [场景] elderly.say("小一，今天外面冷不冷呀？")
    （场景/运镜原语，仅数字孪生执行）
· D-1：头先 0.2s 到位 + M-14 双臂下垂（一句话一个体态）
  set_joint_positions(["head_joint1"→0°, "head_joint2"→-2°], speed=0.3)
  set_joint_positions(["left_arm"→down(×7关节), "right_arm"→down(×7关节)], speed=0.3)
· 与语音同起，回答（回答类不做手势）
  tts.play("不冷，屋里开着暖气呢，您坐着别动。")
· 说完 0.3s 内回位（头回正向）
  set_joint_positions(["head_joint2"→0°], speed=0.3)

===== 对话肢体语言 · ② 机器人问 · D-2 提问 =====
  说明: D-2 提问体态：头略低 pitch −4°；臂保持 M-14；说完保持 1s 不动（这是「我在等您」）。
  [UI] log("info", "场景：机器人主动发起提问")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-5.2,1.8,-0.6], [-2.3,0.75,-2.3])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-3, -2.5, omni_plan=True)
  set_joint_positions({"head_joint2":0})
· D-2：头略低 −4°，臂保持下垂
  set_joint_positions(["head_joint2"→-4°], speed=0.3)
· 提问（口头提问不出手，出手是认知链指物专属）
  tts.play("爷爷，您今天下午的降压药吃了吗？")
· 说完保持 1s 不动 = 我在等您
  sleep(1000)
· 老人回应（坐姿只用气泡，wave 片段是站姿会穿帮）
  [场景] elderly.say("吃了吃了，饭后就吃了。")
    （场景/运镜原语，仅数字孪生执行）

===== 对话肢体语言 · ③ 答对 D-3 · 答错 D-4 · 收场 =====
  说明: 答对：M-03 点头 1 次 + 小臂轻抬（与「对啦」同起）；答错：M-04 侧头 1 次 + 小臂掌心向上小幅前伸（代替摇头）；收场 M-14 → M-10。
  [UI] log("info", "场景：问答小游戏，检验 D-3 / D-4 两类体态")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([-5.2,1.8,-0.6], [-2.3,0.75,-2.3])
    （场景/运镜原语，仅数字孪生执行）
  navigate_to_goal(-3, -2.5, omni_plan=True)
  set_joint_positions({"head_joint2":0})
· D-2 提问
  set_joint_positions(["head_joint2"→-4°], speed=0.3)
  tts.play("那您说说，早上我们喝的水装在杯子里还是碗里呀？")
· 老人答对
  [场景] elderly.say("杯子里的水！")
    （场景/运镜原语，仅数字孪生执行）
· 答对 → D-3：M-03 点头 1 次 + 小臂轻抬（与「对啦」同起，整题只点 1 次）
  set_joint_positions(["head_joint2"→-8°, "left_arm_joint4"→6°], speed=0.3)
  tts.play("对啦，就是杯子。您记性真好。")
· 说完 0.3s 收回（头回 0 + 臂回 M-14，头先动手后动）
  set_joint_positions(["head_joint2"→0°], speed=0.3)
  set_joint_positions(["left_arm"→down(×7关节)], speed=0.3)
· 第二问（继续 D-2）
  set_joint_positions(["head_joint2"→-4°], speed=0.3)
  tts.play("那晚饭想吃软一点的面条还是米饭呀？")
· 老人答错
  [场景] elderly.say("呃……米饭？")
    （场景/运镜原语，仅数字孪生执行）
· 答错 → D-4：M-04 侧头 1 次（代替摇头）+ 小臂掌心向上小幅前伸 ~10cm
  set_joint_positions(["head_joint1"→6°, "left_arm_joint2"→-82°, "left_arm_joint4"→-8°], speed=0.3)
  tts.play("没事，记不住也正常。今晚吃面条，软和，好消化。")
· 收场：M-14 双臂下垂 → M-10 头回正
  set_joint_positions(["left_arm"→down(×7关节), "right_arm"→down(×7关节)], speed=0.3)
  set_joint_positions(["head_joint1"→0°, "head_joint2"→0°], speed=0.3)
· 四类体态演示完毕
  [UI] status("ok", "对话肢体语言演示完成：D-1 回答 / D-2 提问 / D-3 肯定 / D-4 安慰")
    （场景/运镜原语，仅数字孪生执行）
  [运镜] flyTo([7.5,7.5,9], [0,0.6,0])
    （场景/运镜原语，仅数字孪生执行）
