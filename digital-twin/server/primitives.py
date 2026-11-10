# primitives.py — SDK 原语执行器（真机侧骨架 + 数字孪生侧桥接）
#
# 设计：motions.json / chains.json 是唯一动作定义源（见 web/shared/）。
#   - 数字孪生：web/js/primitives.js 解释同一份 JSON → 虚拟机器人执行
#   - 真机：本文件解释同一份 JSON → Galbot SDK 调用（接口名与《动作编排.md》一致）
#
# 真机 SDK 尚未接入（赛期才看机标定），SDK 调用点全部走 stub：
#   默认打印调用（可接日志/仿真器）；上真机时把 REAL 换成 galbot SDK 实现即可。
#
# 用法（数字孪生模式）：
#   python run_motion.py M-13          # 单模块演示（发到浏览器虚拟机器人）
#   python run_chain.py c1 2           # 跌倒安抚链 第②段
import json
import pathlib
import sys
import time

# Windows 控制台 GBK 兼容：动作名/SDK 文本含特殊字符
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SHARED = pathlib.Path(__file__).resolve().parents[1] / "web" / "shared"


def load_motions() -> dict:
    return {m["id"]: m for m in json.loads((SHARED / "motions.json").read_text("utf-8"))["motions"]}


def load_chains() -> dict:
    return {c["id"]: c for c in json.loads((SHARED / "chains.json").read_text("utf-8"))["chains"]}


# ── 编组展开（单源规则与 web/js/sdk-text.js 的 expandJoints 一致，校验器逐条 diff） ──
def expand_joints(cmd: dict) -> dict:
    joints = {**(cmd.get("joints") or {})}
    for g, v in (cmd.get("groups") or {}).items():
        if v == "down":
            # 镜像安装：j2=∓90 下转 + j1=∓25 侧摆补偿（j2 单独下垂手臂外张 27°，
            # 与 web/js/sdk-text.js 的 GROUP_PRESETS.down 同规则，校验器核对）
            side = -1 if g.startswith("left") else 1
            joints[f"{g}_joint1"] = -25 * side      # left=+25 / right=-25
            joints[f"{g}_joint2"] = 90 * side       # left=-90 / right=+90
        else:                                # 数值 = 全 7 关节同值
            for i in range(1, 8):
                joints[f"{g}_joint{i}"] = v
    return joints


# ── SDK 调用文本（与 web/js/sdk-text.js 的 sdkText 同源：verify_consistency.py 逐条 diff） ──
import json as _json


def sdk_text(c: dict) -> str:
    p = c["prim"]
    def js_num(v):
        # JS 数字→字符串会去掉整数的 .0（-3.0 → "-3"），py 侧对齐
        return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)

    def js_json(obj):
        # JS JSON.stringify 无空格；数组内数字同样走 js_num（2.0 → 2）
        def conv(v):
            if isinstance(v, list):
                return [conv(x) for x in v]
            return int(v) if isinstance(v, float) and v.is_integer() else v
        return _json.dumps(conv(obj), ensure_ascii=False, separators=(",", ":"))

    if p == "set_joint_positions":
        parts = []
        if c.get("groups"):
            for g, v in c["groups"].items():
                parts.append(f'"{g}"→{v}(×7关节)')
        if c.get("joints"):
            for n, v in c["joints"].items():
                parts.append(f'"{n}"→{v}°')
        return f"set_joint_positions([{', '.join(parts)}], speed=0.3)"
    if p == "set_leg_height":
        return f"set_leg_height({c['z']}, duration={(c.get('durationMs', 3500) / 1000):.1f})"
    if p == "set_base_pose":
        return f'set_base_pose(0, 0, {c["dyaw"]}°, frame_id="rel(0)")'
    if p == "face_point":
        return f'set_base_pose(0, 0, Δyaw(→{js_num(c["x"])},{js_num(c["z"])}), frame_id="rel(0)")'
    if p == "navigate_to_goal":
        return f"navigate_to_goal({js_num(c['x'])}, {js_num(c['z'])}, omni_plan=True, timeout=8)"
    if p == "move_rel":
        d = "前进" if c["forward"] > 0 else "后退"
        return f"navigate_to_goal(相对: {d} {js_num(abs(c['forward']))}m, omni_plan=True)"
    if p == "set_gripper_command":
        return f'set_gripper_command("{c["name"]}", {c["width"]}, 0.03, 5)'
    if p == "oscillate":
        return f"set_joint_positions(预设角A↔B 交替 {c['cycles']} 回, period={c['periodMs']}ms)"
    if p == "stop_all":
        return "stop_base() + stop_navigation() + stop_trajectory_execution()"
    if p == "say":
        return f'tts.play("{c["text"]}")'
    if p == "screen":
        return f'screen.show("{c["text"]}", "{c.get("level", "info")}")'
    if p == "head_look":
        return f'set_joint_positions(["head"], [Δyaw(→{js_num(c["x"])},{js_num(c["z"])}), pitch], speed=0.3)'
    if p == "wait":
        return f"sleep({c.get('ms', 500)})"
    if p == "elderly.act":
        return f'[场景] elderly.act("{c["name"]}")'
    if p == "elderly.walk":
        return f'[场景] elderly.walkTo({js_num(c["x"])}, {js_num(c["z"])})'
    if p == "elderly.say":
        return f'[场景] elderly.say("{c["text"]}")'
    if p == "cam.fly":
        return f"[运镜] flyTo({js_json(c['pos'])}, {js_json(c['target'])})"
    if p == "status":
        return f'[UI] status("{c["level"]}", "{c["text"]}")'
    if p == "log":
        return f'[UI] log("{c.get("level", "info")}", "{c["text"]}")'
    if p == "robot.nav":
        return f"navigate_to_goal({js_num(c['x'])}, {js_num(c['z'])}, omni_plan=True)"
    if p == "robot.pose":
        return f"set_joint_positions({js_json(c.get('joints') or {})})"
    if p == "robot.leg":
        return f"set_leg_height({c['z']})"
    if p == "robot.look":
        return f'set_joint_positions(["head"], [Δyaw(→{js_num(c["x"])},{js_num(c["z"])})])'
    if p == "robot.gripper":
        return f'set_gripper_command("{c["name"]}", {c["width"]})'
    return f"[未知原语] {p}"


# ── 真机 SDK 骨架（stub：上真机时替换为 galbot SDK 实际调用） ──
class RealRobot:
    """每个方法对应一个 SDK 原语。stub 模式只打印；接入真机后实现方法体。"""

    def set_joint_positions(self, joints: dict, speed: float = 0.3):
        pass  # stub：接入真机后调 galbot SDK

    def set_leg_height(self, z: float, duration: float = 3.5):
        pass

    def set_base_pose(self, dyaw_deg: float):
        pass

    def navigate_to_goal(self, x: float, z: float, speed: float = 0.4):
        pass

    def set_gripper_command(self, name: str, width: float):
        pass

    def stop_all(self):
        pass

    def say(self, text: str):
        pass


def exec_prim_real(cmd: dict, rr: RealRobot):
    """真机模式：把原语翻译成 SDK 调用。日志文本 = sdk_text(cmd)，
    与调试台"SDK 调用日志"逐行可对照（verify_consistency.py 保证两侧文本一致）。"""
    p = cmd["prim"]
    print(f"  {sdk_text(cmd)}")
    if p in ("set_joint_positions", "robot.pose"):
        rr.set_joint_positions(expand_joints(cmd))
    elif p in ("set_leg_height", "robot.leg"):
        rr.set_leg_height(cmd["z"], cmd.get("durationMs", 3500) / 1000)
    elif p in ("set_base_pose", "face_point"):
        rr.set_base_pose(cmd.get("dyaw", 0))          # face_point 的 Δyaw 真机上由检测算出
    elif p in ("navigate_to_goal", "robot.nav"):
        rr.navigate_to_goal(cmd["x"], cmd["z"], cmd.get("speed", 0.4))
    elif p == "move_rel":
        rr.navigate_to_goal(cmd["forward"], 0, cmd.get("speed", 0.4))   # 真机按相对目标发
    elif p in ("set_gripper_command", "robot.gripper"):
        rr.set_gripper_command(cmd["name"], cmd["width"])
    elif p == "oscillate":
        pass                                           # 真机由 SDK 预设角实现（文本已打印）
    elif p in ("stop_all",):
        rr.stop_all()
    elif p in ("say",):
        rr.say(cmd["text"])
    elif p == "head_look" or p == "robot.look":
        rr.set_joint_positions({"head_joint1": 0})     # Δyaw 真机上由视觉检测算出
    elif p == "wait":
        time.sleep(cmd.get("ms", 500) / 1000)
    elif p.startswith(("elderly.", "cam.", "status", "log")):
        print("    （场景/运镜原语，仅数字孪生执行）")
    elif p == "screen":
        print("    （胸屏 SDK 接入后生效）")
    else:
        print(f"    [警告] 真机未实现原语 {p}")


def run_steps(steps: list, sink, rr: RealRobot | None = None, params: dict | None = None):
    """执行一段 steps。sink=ctx（数字孪生）或 None（真机走 rr）。
    返回每步的 SDK 文本（供日志/回放）。"""
    def _resolve(v):
        if isinstance(v, str) and v.startswith("$"):
            return (params or {})[v[1:]]
        return v

    sdk_calls = []
    for step in steps or []:
        if "cmds" not in step and "prim" in step:      # 兼容裸原语（chains.json preset）
            step = {"cmds": [step]}
        if step.get("note"):
            if rr is None and sink:
                sink.log(step["note"])
            else:
                print(f"· {step['note']}")
        for raw in step.get("cmds", []):
            cmd = {k: (_resolve(v) if not isinstance(v, dict) else
                       {k2: _resolve(v2) for k2, v2 in v.items()})
                   for k, v in raw.items()}
            sdk_calls.append(cmd)
            if rr is not None:
                exec_prim_real(cmd, rr)
            # sink 模式：由 seq.run 经 WebSocket 交给前端 primitives.js 执行
    return sdk_calls
