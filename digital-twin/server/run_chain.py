# run_chain.py — 长链分任务段演示（数字孪生 / 真机 dry-run 两用）
# 用法：
#   python run_chain.py c1 2              # 跌倒安抚链 第②段（数字孪生演示）
#   python run_chain.py c1 all            # 整链连跑（段间自动复位）
#   python run_chain.py c2 2 --real       # 真机 dry-run：只打印 SDK 调用
# 链号：c1 跌倒安抚 / c2 认知训练 / c3 远程查看 / c4 守护跟随
import argparse
import sys
import time

from client import Twin
from primitives import RealRobot, load_chains, run_steps


def run_segment(twin, chain, seg, real=False):
    print(f"\n===== {chain['name']} · {seg['name']} =====")
    if seg.get("desc"):
        print(f"  说明: {seg['desc']}")
    if real:
        run_steps(seg["preset"], None, rr=RealRobot())
        run_steps(seg["steps"], None, rr=RealRobot())
        return
    twin.status("info", f"{chain['name']} · {seg['name']}")
    twin.reset()                                       # 每段从干净场景开始
    time.sleep(0.8)
    twin.run_seq(seg.get("preset", []))
    twin.run_seq(seg["steps"])
    print(f"段执行完毕：{seg['name']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chain_id", help="链号 c1/c2/c3/c4")
    ap.add_argument("seg", help="段序号（1 起）或 all")
    ap.add_argument("--real", action="store_true", help="真机 dry-run")
    args = ap.parse_args()

    chains = load_chains()
    if args.chain_id not in chains:
        sys.exit(f"未知链 {args.chain_id}，可用：{', '.join(chains)}")
    chain = chains[args.chain_id]

    if args.seg == "all":
        segs = chain["segments"]
    else:
        idx = int(args.seg) - 1
        if not 0 <= idx < len(chain["segments"]):
            sys.exit(f"{args.chain_id} 共 {len(chain['segments'])} 段")
        segs = [chain["segments"][idx]]

    if args.real:
        for s in segs:
            run_segment(None, chain, s, real=True)
        return

    with Twin() as twin:
        for i, s in enumerate(segs):
            run_segment(twin, chain, s)
            if i < len(segs) - 1:
                twin.reset()          # 段间复位，保证每段独立可演示
                time.sleep(1.2)
        twin.status("ok", "演示结束")


if __name__ == "__main__":
    main()
