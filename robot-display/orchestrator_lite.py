# -*- coding: utf-8 -*-
"""
EmotionOrchestrator 简化版 —— 最小闭环：情绪事件 → 屏幕表情 + 颈部动作
=====================================================================
目标：先打通整条链路（对话系统 → 编排器 → 屏幕 + 脖子），不做细节。

链路：
    对话系统 --POST /emotion {"emotion":"happy"}--> 本服务(:8902)
        ├→ 转发给表情播放器 player.py (:8901/emotion)   [屏幕]
        └→ 播放对应的颈部关键帧序列                        [脖子]

用法（xcu 上）：
    # 无机器人先干跑验证链路（只打日志不动关节）：
    python3 orchestrator_lite.py --dry

    # 真机模式：
    python3 orchestrator_lite.py

    测试：curl http://127.0.0.1:8902/emotion -X POST -d '{"emotion":"happy"}'

⚠️ 首次真机部署必做：
    1. 先跑 --list-joints 查看真实关节名，把下面 NECK_JOINTS 改成实际值
    2. 先用 --dry 看动作时间线是否符合预期
    3. 手放在急停按键旁再首次真机运行
"""
import argparse, json, math, time, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ============ 配置区（真机部署前核对） ============
FACE_URL = "http://127.0.0.1:8901/emotion"   # player.py 的表情接口
NECK_JOINTS = ["head_joint1", "head_joint2"]   # ⚠️ 已按《动作编排.md》物理前提填写；--list-joints 再核对
NECK_LIMIT_DEG = {"yaw": (-60, 60), "pitch": (-25, 25)}  # 首次真机先保守，确认限位后放开

# 颈部关键帧动作链：pan=左右(度,左正) tilt=上下(度,抬头正)
# 每条链自动在结尾回到 (0,0) 姿态
NECK_CHAINS = {
    "happy":     [(0.5, 0, 12), (0.5, 0, -8), (0.5, 0, 12)],          # 点头×2
    "surprised": [(0.15, 0, 18), (0.6, 0, 18)],                        # 快速抬头停住
    "sad":       [(1.2, 0, -18)],                                      # 缓慢低头
    "sleepy":    [(1.5, 0, -10), (1.5, 0, -18)],                       # 秤砣式点头
    "thinking":  [(0.8, 15, -5), (1.5, 15, -5)],                       # 歪头保持
    "confused":  [(0.6, 12, 0), (0.6, -12, 0), (0.6, 12, 0)],          # 左右歪头
    "angry":     [(0.4, 0, -10)],                                      # 前倾逼视
    "neutral":   [(1.0, 0, 0)],
    "love":      [(0.5, 0, 10)],                                       # 轻快点头
}
IDLE_POSE = (0.0, 0.0)

# ============ SDK 接入层（dry 模式下用 Mock） ============
class NeckDriver:
    def __init__(self, dry=False):
        self.dry = dry
        self.robot = None
        self.enabled = False
        if not dry:
            try:
                # ⚠️ import 路径以 SDK 包实际为准，参考 GalbotSDK examples/python
                from galbot_sdk import GalbotRobot  # noqa
                self.robot = GalbotRobot()
                self.robot.init()
                self.enabled = True
            except Exception as e:
                print(f"[orchestrator] SDK 初始化失败({e})，退化为 dry 模式")
                self.dry = True
        if self.dry:
            print("[orchestrator] DRY 模式：只打印动作，不驱动关节")

    def list_joints(self):
        if self.dry:
            return ["(dry模式无关节) 提示: 真机模式调用 robot 关节列表接口"]
        # ⚠️ 按实际 SDK 接口调整，通常是 get_joint_names / get_frame_names 类方法
        try:
            return self.robot.get_joint_names()
        except Exception as e:
            return [f"获取失败: {e}"]

    def move_neck(self, pan_deg, tilt_deg, duration):
        """在 duration 秒内把脖子平滑移到 (pan,tilt)。简化实现：单次目标+SDK插值"""
        if self.dry:
            print(f"[neck] -> pan={pan_deg:+.0f}° tilt={tilt_deg:+.0f}° ({duration:.1f}s)")
            time.sleep(min(duration, 0.05))  # dry 模式快速跑时间线
            return
        lo, hi = NECK_LIMIT_DEG["yaw"]
        pan = max(lo, min(hi, pan_deg))
        lo, hi = NECK_LIMIT_DEG["pitch"]
        tilt = max(lo, min(hi, tilt_deg))
        # ⚠️ 按实际 SDK 调整：两个颈部关节的目标弧度
        targets = [math.radians(pan), math.radians(tilt)]
        self.robot.set_joint_positions(
            joint_names=NECK_JOINTS, positions=targets, duration=duration)

    def shutdown(self):
        if self.robot:
            try:
                self.robot.request_shutdown(); self.robot.wait_for_shutdown()
                self.robot.destroy()
            except Exception:
                pass


class NeckAnimator:
    """颈部动作线程：任何时候只有一个动作链在跑，新请求打断旧链"""
    def __init__(self, driver):
        self.driver = driver
        self.lock = threading.Lock()
        self.generation = 0

    def play(self, emotion):
        chain = NECK_CHAINS.get(emotion)
        if not chain:
            return
        with self.lock:
            self.generation += 1
            gen = self.generation
        threading.Thread(target=self._run, args=(chain, gen), daemon=True).start()

    def _run(self, chain, gen):
        for duration, pan, tilt in chain:
            if gen != self.generation:   # 被新链打断
                return
            self.driver.move_neck(pan, tilt, duration)
            t0 = time.time()
            while time.time() - t0 < duration and gen == self.generation:
                time.sleep(0.02)
        if gen == self.generation:       # 链尾回正
            self.driver.move_neck(*IDLE_POSE, 0.8)


# ============ HTTP 服务 ============
class Orchestrator:
    def __init__(self, dry, face_url):
        self.driver = NeckDriver(dry)
        self.animator = NeckAnimator(self.driver)
        self.face_url = face_url

    def _forward_face(self, emotion):
        try:
            req = urllib.request.Request(
                self.face_url, data=json.dumps({"emotion": emotion}).encode(),
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=2) as r:
                return json.loads(r.read().decode()).get("ok", False)
        except Exception as e:
            print(f"[face] 表情播放器未响应({e})——屏幕表情跳过，脖子动作继续")
            return False

    def on_emotion(self, emotion):
        face_ok = self._forward_face(emotion)   # 表情先行
        self.animator.play(emotion)             # 身体跟上
        return face_ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="干跑：只打印动作时间线，不驱动关节")
    ap.add_argument("--port", type=int, default=8902)
    ap.add_argument("--face-url", default=FACE_URL)
    ap.add_argument("--list-joints", action="store_true", help="列出真实关节名后退出")
    args = ap.parse_args()

    orch = Orchestrator(args.dry, args.face_url)

    if args.list_joints:
        print("关节列表（把 NECK_JOINTS 改成其中颈部两个）:")
        for j in orch.driver.list_joints():
            print("  ", j)
        return

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/emotion":
                self.send_error(404); return
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                emotion = json.loads(body or b"{}").get("emotion", "")
            except json.JSONDecodeError:
                self.send_error(400); return
            face_ok = orch.on_emotion(emotion)
            self.send_response(200 if emotion in NECK_CHAINS else 400)
            self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps(
                {"face": face_ok, "neck": emotion in NECK_CHAINS}).encode())
        def log_message(self, *a): pass

    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"[orchestrator-lite] :{args.port}/emotion | dry={args.dry} | "
          f"neck_joints={NECK_JOINTS} | Ctrl+C 退出")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[orchestrator-lite] 回正并退出")
        orch.driver.move_neck(*IDLE_POSE, 1.0)
        orch.driver.shutdown()


if __name__ == "__main__":
    main()
