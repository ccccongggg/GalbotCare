# run_motion.py — 单模块演示（数字孪生 / 真机 dry-run 两用）
# 用法：
#   python run_motion.py M-13              # 数字孪生：浏览器虚拟机器人执行
#   python run_motion.py M-15 --real       # 真机 dry-run：只打印将发生的 SDK 调用
#   python run_motion.py D-4               # 说话体态演示
import argparse
import json
import sys

from client import Twin
from primitives import RealRobot, load_motions, run_steps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("motion_id", help="模块号，如 M-13 / D-4")
    ap.add_argument("--real", action="store_true", help="真机 dry-run（只打印 SDK 调用，不连孪生）")
    args = ap.parse_args()

    motions = load_motions()
    if args.motion_id not in motions:
        sys.exit(f"未知模块 {args.motion_id}，可用：{', '.join(sorted(motions))}")
    m = motions[args.motion_id]
    print(f"—— {m['id']} {m['name']} ——  SDK: {m['sdk']}")

    if args.real:
        run_steps(m["steps"], None, rr=RealRobot(), params=m.get("params"))
        return

    steps = run_steps(m["steps"], None, params=m.get("params"))
    with Twin() as twin:
        twin.status("info", f"执行模块 {m['id']} {m['name']}")
        twin.run_seq(m["steps"], m.get("params"))
        print("孪生执行完毕。")


if __name__ == "__main__":
    main()
