# demo_c3.py — 演示链 C-3「跌倒安抚」数字孪生版
# 时序依据《任务队列/动作编排.md》：声先到 → 靠近 1.0–1.5m → 摆手询问 → 确认告警
# 运行：先启动 bridge.py 并打开浏览器页面，再运行本脚本
import time

from client import Twin

CHAIR = (-1.7, -2.3)      # 老人扶手椅
FALL = (0.9, 0.35)        # 跌倒点（卫生间门口）


def main():
    with Twin() as twin:
        twin.log("—— 演示链 C-3 跌倒安抚（Python 驱动）开始 ——")

        # 1. 老人起身活动，走到卫生间门口
        twin.status("info", "演示中：老人起身活动")
        twin.fly((-1.0, 2.6, 0.8), (-1.4, 0.5, -2.0), 1800)   # 跟拍老人起身
        twin.elderly_walk(0.0, -1.6)
        time.sleep(2.6)
        twin.elderly_walk(*FALL)
        time.sleep(2.4)

        # 2. 疑似跌倒（声先到，身未确认）
        twin.status("warn", "检测到疑似跌倒（声先到）")
        twin.elderly_act("fall")
        twin.elderly_say("哎哟——！")
        time.sleep(1.6)

        # 3. 机器人前往查看（守护距离 1.0–1.5m，视线先到）
        twin.status("info", "机器人前往查看")
        twin.nav(FALL[0], FALL[1] - 1.25, face_x=FALL[0], face_z=FALL[1])
        time.sleep(3.2)
        twin.fly((2.4, 1.5, -1.6), (FALL[0], 0.7, FALL[1]), 1600)   # 切交互特写
        twin.look(*FALL)
        twin.screen("检测到跌倒，正在确认…")
        time.sleep(0.8)
        twin.say("爷爷，您没事吧？请不要乱动，我来看看。")
        twin.elderly_say("哎哟…爬不起来了…")
        time.sleep(2.0)

        # 4. 摆手询问（M-13）
        twin.gesture("wave", 2200)
        time.sleep(1.2)
        twin.elderly_act("shake")          # 老人确认无法起身
        time.sleep(1.6)

        # 5. 确认告警升级 + 持续安抚
        twin.status("alarm", "确认跌倒！已通知家属与值班台")
        twin.screen("跌倒告警已升级：家属/值班台", "alarm")
        twin.say("已通知您的家人和值班台，请保持不动，我在这里陪您。")
        time.sleep(3.0)
        twin.screen("语音安抚中…")
        twin.fly((7.5, 7.5, 9.0), (0, 0.6, 0), 2000)                # 收尾回全景
        twin.log("演示链 C-3 完成：确认告警 + 安抚就位", level="ok")
        twin.status("ok", "演示结束（告警保持中）")


if __name__ == "__main__":
    main()
