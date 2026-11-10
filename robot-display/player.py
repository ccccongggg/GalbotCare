# -*- coding: utf-8 -*-
"""
表情播放器守护进程（在 xcu 上运行）
- 循环播放当前情绪的帧序列，期间自动插入眨眼
- 收到情绪指令后：播过渡帧(to_xxx) -> 循环该情绪
- 对外提供 HTTP 接口(:8901) 供对话系统推送情绪，也可用 stdin 手动测试

首次部署:
    1) 开发PC: python render_frames.py --size 480x272 --out frames
    2) 把 frames/ 整个目录拷到 xcu /userdata/frames/
    3) xcu 上: python3 player.py --bin ./service_display --frames /userdata/frames

测试:
    curl http://127.0.0.1:8901/emotion -X POST -d '{"emotion":"happy"}'
    或运行后直接输入: happy / angry / sad / blink / quit
"""
import argparse, collections, json, os, subprocess, sys, threading, time, random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

EMOTIONS = ["neutral", "happy", "angry", "sad", "surprised", "thinking", "sleepy", "love"]


class FacePlayer:
    def __init__(self, frames_dir, bin_path, fps, cwd, debounce=0.25, use_transition=False):
        self.dir = frames_dir
        self.bin = os.path.abspath(bin_path)
        self.cwd = cwd
        self.dt = 1.0 / fps
        self.debounce = debounce            # 切换去抖：请求安静该时长后才真正切，取最后一次
        self.use_transition = use_transition  # False=直接切换（默认），True=播过渡帧
        self.lock = threading.Lock()
        # 加载所有序列的文件路径
        self.seqs = {}
        for name in sorted(os.listdir(frames_dir)):
            p = os.path.join(frames_dir, name)
            if os.path.isdir(p):
                fs = sorted(f for f in os.listdir(p) if f.endswith(".png"))
                if fs:
                    self.seqs[name] = [os.path.join(p, f) for f in fs]
        missing = [e for e in EMOTIONS if f"{e}_loop" not in self.seqs]
        if missing:
            print(f"[warn] 缺少序列: {missing}")
        self.current = "neutral"
        self.pending = None        # 待切换情绪（由发送线程串行消费）
        self.pending_at = 0.0      # 最近一次切换请求时间（去抖用）
        self.stop_flag = False
        self.latency = collections.deque(maxlen=30)  # 近30帧发送延迟
        self.frames_sent = 0
        self.slow_frames = 0
        self._show(self.seqs["neutral_loop"][0])  # 开机先亮出眼睛
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _show(self, path):
        """调 service_display 推一帧（同步等待返回，并统计延迟用于自适应监控）"""
        msg = json.dumps({"command": "setDisplayFile",
                          "parameters": {"filePath": path.replace("\\", "/")}})
        t0 = time.time()
        try:
            subprocess.run([self.bin, "-c", "--topic=display_show_file", f"--sendmsg={msg}"],
                           cwd=self.cwd, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as e:
            print(f"[error] 调用失败: {e}")
            return
        lat = time.time() - t0
        self.latency.append(lat)
        self.frames_sent += 1
        # 监控：单帧延迟超过目标帧间隔时告警（这是闪屏/卡顿的主要信号）
        if lat > self.dt:
            self.slow_frames += 1
            if self.slow_frames % 20 == 1:
                avg = sum(self.latency) / len(self.latency)
                print(f"[warn] 第{self.frames_sent}帧发送耗时 {lat*1000:.0f}ms > 帧间隔 {self.dt*1000:.0f}ms"
                      f"（近30帧均值 {avg*1000:.0f}ms）→ 显示服务跟不上，建议降低 --fps")

    def _play(self, name, times=1, interruptible=False):
        seq = self.seqs.get(name)
        if not seq:
            return
        for _ in range(times):
            for f in seq:
                # 循环帧可被"已到期的切换请求"打断，保证切换及时、不播完整个旧循环
                if interruptible and self._switch_ready():
                    return
                self._show(f)
                # 自适应节流：睡眠时间扣除发送本身耗时，避免积压导致闪屏
                overhead = sum(self.latency) / max(1, len(self.latency))
                time.sleep(max(0.005, self.dt - overhead))

    def _switch_ready(self):
        """去抖判断：存在待切情绪、与当前不同、且已安静超过 debounce 时长"""
        with self.lock:
            if self.pending is None or self.pending == self.current:
                return False
            return time.time() - self.pending_at >= self.debounce

    def _run(self):
        """唯一发送线程：严格串行出帧。切换 = 去抖后直接切目标情绪（默认无过渡帧，不来回闪）"""
        next_blink = time.time() + random.uniform(2, 5)
        next_report = time.time() + 30
        while not self.stop_flag:
            if self._switch_ready():
                with self.lock:
                    pend, self.pending = self.pending, None
                self.current = pend
                if self.use_transition and pend != "neutral":
                    self._play(f"to_{pend}")
            if time.time() >= next_report:
                avg = sum(self.latency) / max(1, len(self.latency)) * 1000
                print(f"[stats] 已发 {self.frames_sent} 帧 | 单帧延迟均值 {avg:.0f}ms | "
                      f"慢帧 {self.slow_frames} | 目标fps {1/self.dt:.0f}")
                next_report = time.time() + 30
            if time.time() >= next_blink and self.current not in ("sleepy",):
                next_blink = time.time() + random.uniform(2.5, 6)
                self._play("blink")
            self._play(f"{self.current}_loop", interruptible=True)

    def set_emotion(self, emo):
        if emo not in EMOTIONS:
            return False, f"unknown emotion: {emo}"
        with self.lock:
            if emo == self.current and self.pending is None:
                return True, f"already {emo} (ignored)"  # 同表情重复请求直接忽略，杜绝来回闪
            self.pending = emo
            self.pending_at = time.time()  # 去抖起点：安静 debounce 秒后才真正切换，取最后一次
        return True, f"emotion -> {emo} (debounce {self.debounce:.2f}s)"

    def stop(self):
        self.stop_flag = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", default="./service_display", help="service_display 可执行文件路径")
    ap.add_argument("--frames", default="/userdata/frames", help="帧序列目录")
    ap.add_argument("--fps", type=float, default=8, help="播放帧率（实测可调，5~10）")
    ap.add_argument("--cwd", default=".", help="service_display 的工作目录（需先 source profile）")
    ap.add_argument("--port", type=int, default=8901)
    ap.add_argument("--debounce", type=float, default=0.25,
                    help="切换去抖秒数：连续多个请求只执行最后一个，防止来回闪")
    ap.add_argument("--transition", action="store_true",
                    help="启用过渡帧动画（默认关闭=直接切换，可消除切换闪动）")
    args = ap.parse_args()

    player = FacePlayer(args.frames, args.bin, args.fps, args.cwd,
                        debounce=args.debounce, use_transition=args.transition)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/emotion":
                self.send_error(404); return
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                data = json.loads(body or b"{}")
            except json.JSONDecodeError:
                self.send_error(400); return
            ok, msg = player.set_emotion(data.get("emotion", ""))
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": ok, "msg": msg}, ensure_ascii=False).encode())
        def log_message(self, *a):  # 静音访问日志
            pass

    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"[face-player] 运行中: 序列{len(player.seqs)}组 | HTTP :{args.port}/emotion | stdin 可直接输情绪名")

    # stdin 交互：happy / blink / quit
    for line in sys.stdin:
        cmd = line.strip().lower()
        if cmd == "quit":
            break
        if cmd == "blink":
            threading.Thread(target=player._play, args=("blink",), daemon=True).start()
        elif cmd:
            ok, msg = player.set_emotion(cmd)
            print(msg)
    player.stop()
    httpd.shutdown()


if __name__ == "__main__":
    main()
