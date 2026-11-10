# client.py — 数字孪生控制客户端（给所有业务模块用）
# 用法：
#   from client import Twin
#   twin = Twin()                     # 默认连 ws://localhost:8765/ws
#   twin.nav(x=0.9, z=-0.9, face_x=0.9, face_z=0.35)
#   twin.gesture("wave"); twin.say("爷爷，您没事吧？")
#   twin.close()                      # 或用 with Twin() as twin:
import json
import time

from websockets.sync.client import connect


class Twin:
    def __init__(self, url: str = "ws://127.0.0.1:8766/ws"):
        self.ws = connect(url)
        self._seq_id = 0
        self._inbox: list[dict] = []

    # ── 基础 ──
    def _send(self, payload: dict):
        self.ws.send(json.dumps(payload, ensure_ascii=False))

    def _drain(self, timeout: float = 120):
        """阻塞直到浏览器回执 seq.done（数字孪生执行完毕）。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                raw = self.ws.recv(timeout=min(2, max(0.1, deadline - time.time())))
            except Exception:
                continue
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("cmd") == "seq.done":
                return msg
            self._inbox.append(msg)
        raise TimeoutError("等待 seq.done 超时")

    def run_seq(self, steps: list, params: dict | None = None):
        """发送一段原语序列并等待数字孪生执行完毕（同步）。"""
        self._seq_id += 1
        self._send({"cmd": "seq.run", "steps": steps, "params": params or {},
                    "id": self._seq_id})
        return self._drain()

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    # ── 状态与日志 ──
    def status(self, level: str, text: str):
        self._send({"cmd": "status", "level": level, "text": text})

    def log(self, text: str, level: str = "info"):
        self._send({"cmd": "log", "level": level, "text": text})

    # ── 机器人 ──
    def nav(self, x: float, z: float, face_x: float | None = None,
            face_z: float | None = None, speed: float | None = None):
        p = {"cmd": "robot.nav", "x": x, "z": z}
        if face_x is not None:
            p.update(faceX=face_x, faceZ=face_z)
        if speed is not None:
            p["speed"] = speed
        self._send(p)

    def gesture(self, name: str, duration_ms: int | None = None):
        p = {"cmd": "robot.gesture", "name": name}
        if duration_ms is not None:
            p["durationMs"] = duration_ms
        self._send(p)

    def pose(self, joints: dict[str, float], duration_ms: int = 500):
        self._send({"cmd": "robot.pose", "joints": joints, "durationMs": duration_ms})

    def look(self, x: float, z: float):
        self._send({"cmd": "robot.look", "x": x, "z": z})

    def say(self, text: str, duration_ms: int = 4000):
        self._send({"cmd": "robot.say", "text": text, "durationMs": duration_ms})

    def screen(self, text: str, level: str = "info"):
        self._send({"cmd": "robot.screen", "text": text, "level": level})

    def fly(self, pos: tuple, target: tuple, duration_ms: int = 1500):
        """相机运镜：pos/target 为 [x, y, z]（米，y 向上）"""
        self._send({"cmd": "cam.fly", "pos": list(pos), "target": list(target),
                    "durationMs": duration_ms})

    # ── 虚拟老人 ──
    def elderly_act(self, name: str):
        self._send({"cmd": "elderly.act", "name": name})

    def elderly_walk(self, x: float, z: float, speed: float | None = None):
        p = {"cmd": "elderly.walk", "x": x, "z": z}
        if speed is not None:
            p["speed"] = speed
        self._send(p)

    def elderly_say(self, text: str, duration_ms: int = 4000):
        self._send({"cmd": "elderly.say", "text": text, "durationMs": duration_ms})

    def reset(self):
        self._send({"cmd": "reset"})
