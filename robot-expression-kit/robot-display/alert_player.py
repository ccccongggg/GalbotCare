# -*- coding: utf-8 -*-
"""
跌倒警报专用播放器（在 xcu 上运行，依赖 service_display）
原理: 以 8fps 循环调用 service_display 的 display_show_file topic 推送
     frames_1080x1920/alert_loop/ 下的 12 张帧图, 人眼即看到动态红色感叹号警报。
用法:
    source /data/config/default/service_display/profile
    cd <service_display 所在目录>
    python3 alert_player.py --frames /userdata/robot-display/frames_1080x1920/alert_loop
    # 停止: Ctrl+C, 屏幕会停留在最后一帧, 恢复默认界面: systemctl restart launcher
"""
import argparse, glob, json, os, subprocess, sys, time

FPS = 8

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="/userdata/robot-display/frames_1080x1920/alert_loop",
                    help="alert_loop 帧目录(xcu 本机路径)")
    ap.add_argument("--bin", default="./service_display", help="service_display 路径")
    ap.add_argument("--cwd", default=".", help="service_display 工作目录(需先 source profile)")
    ap.add_argument("--fps", type=float, default=FPS)
    ap.add_argument("--times", type=float, default=0, help="播放秒数, 0=一直循环")
    args = ap.parse_args()

    frames = sorted(glob.glob(os.path.join(args.frames, "*.png")))
    if not frames:
        print(f"[error] 目录无帧图: {args.frames}")
        sys.exit(1)
    print(f"[alert-player] {len(frames)} 帧 @ {args.fps}fps, Ctrl+C 停止")
    dt = 1.0 / args.fps
    n, t0 = 0, time.time()
    try:
        while True:
            for f in frames:
                msg = json.dumps({"command": "setDisplayFile",
                                  "parameters": {"filePath": f.replace("\\", "/")}})
                subprocess.run([args.bin, "-c", "--topic=display_show_file", f"--sendmsg={msg}"],
                               cwd=args.cwd, check=False,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                n += 1
                if n % (args.fps * 30) == 0:
                    print(f"[stats] 已推 {n} 帧 | 平均 {1000*(time.time()-t0)/n:.0f}ms/帧")
                time.sleep(dt)
            if args.times and time.time() - t0 >= args.times:
                break
    except KeyboardInterrupt:
        print(f"\n[alert-player] 停止, 共推 {n} 帧。恢复 WiFi 界面: systemctl restart launcher")

if __name__ == "__main__":
    main()
