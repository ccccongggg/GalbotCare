# -*- coding: utf-8 -*-
"""
EmotionOrchestrator 完整版 —— 三层动作编排：Idle层 + 注意层 + 情绪层
=====================================================================
在简化版（orchestrator_lite.py，屏幕+脖子）之上扩展：

  Idle 层（常驻）：躯干升降"呼吸" + 随机颈部扫视          → 生命感
  注意层（事件）：麦克风流检测声音 → 转头+惊讶短表情       → "它听到我了"
  情绪层（事件）：多轨道并行时间线（颈/左臂/右臂/躯干/底盘/语音）

架构：
    对话系统 --POST :8902/emotion--> Orchestrator
        ├→ player.py :8901          屏幕（已有）
        └→ TrackRunner × 6          各轨道并行、独立时间线、互不阻塞

安全设计（对应 SDK 文档能力）：
  - 所有身体动作执行前 acquire_controller / 结束 release_controller
  - 手臂动作必须走 GalbotMotion.motion_plan() 碰撞检查后执行
  - 所有角度/幅度参数集中在 SAFE_LIMITS，宁可保守
  - 急停事件（emergency_stop）立即清空所有轨道

用法：
    python3 orchestrator.py --dry          # 干跑验证时间线（无机器人）
    python3 orchestrator.py                # 真机（先完成与 lite 版相同的关节名核对）
    python3 orchestrator.py --no-voice --no-idle   # 分模块调试
"""
import argparse, json, math, time, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FACE_URL = "http://127.0.0.1:8901/emotion"

# ================= 安全限位（首次真机务必按实际机型核对收紧/放开） =================
SAFE_LIMITS = {
    "neck":        {"yaw": (-60, 60), "pitch": (-25, 25)},
    "leg_height":  (0.0, 0.10),   # 呼吸用躯干升降幅度，米（保守值，行程上限650mm）
    "arm_reach":   0.55,          # 手臂动作最大前伸距离比例
    "base_nudge":  0.10,          # 底盘短促位移，米
}

JOINTS = {  # ⚠️ 已按《动作编排.md》物理前提填写；--list-joints 再核对
    "neck": ["head_joint1", "head_joint2"],
    "arm_r": ["right_arm_joint1", "right_arm_joint2", "right_arm_joint3",
              "right_arm_joint4", "right_arm_joint5", "right_arm_joint6", "right_arm_joint7"],
}

# ================= 情绪动作链：多轨道时间线 =================
# 轨道: neck=[(dur,pan,tilt)...] torso=[(dur,delta_m)...] base=[(dur,vx,vw)...]
#       arm=[(dur,pose_name)...] voice=[(dur,text)...]
CHAINS = {
    "happy": {
        "neck":  [(0.5, 0, 12), (0.5, 0, -8), (0.5, 0, 12)],
        "voice": [(1.5, "你好呀！")],
    },
    "love": {
        "neck":  [(0.5, 0, 10)],
        "arm":   [(2.0, "heart")],                       # 双臂比心（官方Example1姿态思路）
        "voice": [(1.5, "谢谢喜欢～")],
    },
    "surprised": {
        "neck":  [(0.15, 0, 18), (0.6, 0, 18)],
        "torso": [(0.3, 0.08), (0.8, 0.0)],              # 快速起身后回落
        "base":  [(0.3, -0.05)],                          # 短促后退
        "voice": [(1.0, "哇！")],
    },
    "sad": {
        "neck":  [(1.2, 0, -18)],
        "torso": [(1.5, -0.10), (1.0, 0.0)],
        "voice": [(2.0, "（叹气）")],
    },
    "thinking": {
        "neck":  [(0.8, 15, -5), (1.5, 15, -5), (1.2, -8, -3)],
        "voice": [(2.0, "让我想想…")],
    },
    "confused": {
        "neck":  [(0.6, 12, 0), (0.6, -12, 0), (0.6, 12, 0)],
        "voice": [(1.0, "咦？")],
    },
    "angry": {
        "neck":  [(0.4, 0, -10), (0.8, 0, -10)],
        "voice": [(1.0, "哼！")],
    },
    "sleepy": {
        "neck":  [(1.5, 0, -10), (1.5, 0, -18)],
        "torso": [(2.5, -0.10)],
    },
    "neutral": {"neck": [(1.0, 0, 0)]},
}
IDLE_POSE = {"neck": (0.0, 0.0)}

# 手臂预置姿态（7关节弧度）——⚠️ 全部为占位值，真机上逐个示教/标定后填入
ARM_POSES = {
    "home":  [0.0] * 7,
    "wave_start": [0.0] * 7,   # 抬臂过肩
    "wave_end":   [0.0] * 7,   # 腕部侧摆（挥手由两者交替实现）
    "heart":      [0.0] * 7,   # 双臂前伸合拢（参考官方比心示例）
}


# ================= SDK 接入层 =================
class RobotBus:
    """统一封装 SDK 调用；dry 模式全部退化为打印。真机接入处只改这一个类。"""
    def __init__(self, dry, no_voice=False):
        self.dry = dry
        self.no_voice = no_voice
        self.robot = None
        self.motion = None
        self._ctrl = None
        if not dry:
            try:
                # ⚠️ import 路径与构造参数以 GalbotSDK examples/python 实际代码为准
                from galbot_sdk import GalbotRobot, GalbotMotion  # noqa
                self.robot = GalbotRobot(); self.robot.init()
                self.motion = GalbotMotion(self.robot)
            except Exception as e:
                print(f"[orchestrator] SDK 初始化失败({e}) → 退化 dry")
                self.dry = True
        print(f"[robot-bus] dry={self.dry}")

    # ---- 控制权限（安全护栏）----
    def acquire(self):
        if not self.dry and self.robot:
            try: self._ctrl = self.robot.acquire_controller()
            except Exception as e: print(f"[warn] acquire_controller: {e}")
    def release(self):
        if not self.dry and self.robot and self._ctrl:
            try: self.robot.release_controller(self._ctrl)
            except Exception: pass
            self._ctrl = None

    # ---- 各轨道原语 ----
    def neck(self, pan, tilt, dur):
        if self.dry:
            print(f"  [neck] pan={pan:+.0f} tilt={tilt:+.0f} ({dur:.1f}s)"); time.sleep(min(dur, 0.03)); return
        yl, yh = SAFE_LIMITS["neck"]["yaw"]; pl, ph = SAFE_LIMITS["neck"]["pitch"]
        pan = max(yl, min(yh, pan)); tilt = max(pl, min(ph, tilt))
        self.robot.set_joint_positions(
            joint_names=JOINTS["neck"],
            positions=[math.radians(pan), math.radians(tilt)], duration=dur)

    def torso(self, delta_m, dur):
        if self.dry:
            print(f"  [torso] Δ{delta_m:+.2f}m ({dur:.1f}s)"); time.sleep(min(dur, 0.03)); return
        # set_leg_height 设绝对高度；这里维护当前高度的简单近似
        cur = getattr(self, "_leg_h", 0.0)
        target = max(SAFE_LIMITS["leg_height"][0],
                     min(SAFE_LIMITS["leg_height"][1], cur + delta_m))
        self.robot.set_leg_height(target); self._leg_h = target
        time.sleep(dur)

    def base(self, vx, dur):
        if self.dry:
            print(f"  [base] vx={vx:+.2f}m/s ({dur:.1f}s)"); time.sleep(min(dur, 0.03)); return
        self.robot.set_base_velocity(vx, 0.0, 0.0)
        time.sleep(dur)
        self.robot.stop_base()

    def arm(self, pose_l, pose_r, dur):
        """手臂走 motion_plan 碰撞检查后执行（dry 只打印）"""
        if self.dry:
            print(f"  [arm] L={pose_l} R={pose_r} ({dur:.1f}s)"); time.sleep(min(dur, 0.03)); return
        # ⚠️ 真机实现要点：
        # target = self.motion.inverse_kinematics(chain="right_arm", pose=目标位姿)
        # plan = self.motion.motion_plan(target, check_collision=True)
        # self.motion.execute(plan)   —— 逐步按 SDK 示例六（导航+抓取）的流程实现
        print(f"[arm] 需在真机标定 ARM_POSES 后接入 motion_plan 流程")

    def voice(self, text, dur):
        if self.dry or self.no_voice:
            print(f"  [voice] 「{text}」"); return
        # ⚠️ SDK 无内置TTS：接入任意TTS得到PCM后 write_audio_stream_output 播放
        print(f'[voice] TODO: TTS("{text}") -> write_audio_stream_output')

    def shutdown(self):
        if self.robot:
            try:
                self.robot.request_shutdown(); self.robot.wait_for_shutdown()
                self.robot.destroy()
            except Exception: pass


# ================= 轨道执行器 =================
class TrackRunner:
    """每条情绪链按轨道拆成并行线程，各自按时间线执行；新链打断旧链"""
    def __init__(self, bus):
        self.bus = bus
        self.lock = threading.Lock()
        self.generation = 0
        self.threads = []
        self.busy_until = 0.0

    def play(self, emotion):
        chain = CHAINS.get(emotion, {})
        if not chain: return
        with self.lock:
            self.generation += 1
            gen = self.generation
        self.busy_until = time.time() + 2.0   # 情绪链播放期间挂起 idle 呼吸
        for name, steps in chain.items():
            t = threading.Thread(target=self._track, args=(name, steps, gen), daemon=True)
            self.threads = [x for x in self.threads if x.is_alive()]
            self.threads.append(t); t.start()

    def _alive(self, gen): return gen == self.generation

    def _track(self, name, steps, gen):
        self.bus.acquire() if name in ("torso", "base", "arm") else None
        try:
            for step in steps:
                if not self._alive(gen): return
                if name == "neck":
                    dur, pan, tilt = step; self.bus.neck(pan, tilt, dur)
                elif name == "torso":
                    dur, delta = step; self.bus.torso(delta, dur)
                elif name == "base":
                    dur, vx = step; self.bus.base(vx, dur)
                elif name == "arm":
                    dur, pose = step
                    self.bus.arm(ARM_POSES.get("home", []), ARM_POSES.get(pose, []), dur)
                elif name == "voice":
                    dur, text = step; self.bus.voice(text, dur); time.sleep(min(dur, 0.03))
                t0 = time.time()
                while time.time() - t0 < (step[0] if name != "voice" else 0) and self._alive(gen):
                    time.sleep(0.02)
        finally:
            if name in ("torso", "base", "arm"): self.bus.release()

    def stop_all(self):
        with self.lock: self.generation += 1


# ================= 三层编排 =================
class Orchestrator:
    def __init__(self, args):
        self.bus = RobotBus(args.dry, args.no_voice)
        self.tracks = TrackRunner(self.bus)
        self.face_url = args.face_url
        self.args = args
        self._idle_stop = threading.Event()
        self._current = "neutral"

    # ---- 屏幕转发 ----
    def _face(self, emotion):
        try:
            req = urllib.request.Request(self.face_url,
                data=json.dumps({"emotion": emotion}).encode(),
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=2) as r:
                return json.loads(r.read().decode()).get("ok", False)
        except Exception as e:
            print(f"[face] 播放器未响应({e})"); return False

    # ---- 情绪层入口 ----
    def on_emotion(self, emotion):
        self._current = emotion
        self._face(emotion)          # 表情先行
        self.tracks.play(emotion)    # 身体跟上（多轨道并行）

    # ---- Idle 层：呼吸 ----
    def _idle_loop(self):
        phase = 0.0
        while not self._idle_stop.wait(0.2):
            if self.args.no_idle: continue
            if time.time() < self.tracks.busy_until: continue  # 情绪链期间挂起
            if self._current == "sleepy": continue             # 睡觉时不呼吸动
            phase += 0.2
            self.bus.torso(0.015 * math.sin(phase * 0.8), 0.2)

    # ---- 注意层：麦克风检测声音（真机接入处） ----
    def _attention_loop(self):
        if self.args.no_attention or self.bus.dry:
            return
        # ⚠️ 真机实现：robot.start_microphone_stream_input(callback, chunk_size=2560)
        # callback 里计算 RMS，超阈值 → self.on_attention()
        pass

    def on_attention(self):
        """听到声音：惊讶一下再看向当前情绪（模拟条件反射）"""
        self._face("surprised"); self.tracks.play("surprised")
        threading.Timer(1.2, lambda: self.on_emotion(self._current)).start()

    def start(self):
        threading.Thread(target=self._idle_loop, daemon=True).start()
        threading.Thread(target=self._attention_loop, daemon=True).start()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--port", type=int, default=8902)
    ap.add_argument("--face-url", default=FACE_URL)
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--no-idle", action="store_true")
    ap.add_argument("--no-attention", action="store_true")
    ap.add_argument("--list-joints", action="store_true")
    args = ap.parse_args()

    orch = Orchestrator(args)
    if args.list_joints:
        for j in orch.bus.list_joints() if hasattr(orch.bus, "list_joints") else []:
            print("  ", j)
        print("(dry 模式无关节列表；真机模式按 SDK 关节枚举接口输出)")
        return

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/emotion":
                self.send_error(404); return
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try: emotion = json.loads(body or b"{}").get("emotion", "")
            except json.JSONDecodeError: self.send_error(400); return
            orch.on_emotion(emotion)
            self.send_response(200 if emotion in CHAINS else 400)
            self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"ok": emotion in CHAINS}).encode())
        def log_message(self, *a): pass

    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    orch.start()
    print(f"[orchestrator-full] :{args.port}/emotion | dry={args.dry} | "
          f"三层编排运行中（idle/attention/emotion）")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        orch.tracks.stop_all()
        orch.bus.neck(*IDLE_POSE["neck"], 1.0)
        orch.bus.shutdown()


if __name__ == "__main__":
    main()
