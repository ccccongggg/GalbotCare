# verify_consistency.py — 孪生↔真机一致性校验器
#
# 回答一个问题：聊出来的动作链（motions.json / chains.json），
# 调试台怎么演、真机就怎么动，逐条可对照。校验四层：
#   1) 原语覆盖：JSON 用到的每个 prim，js 与 py 两侧都必须实现
#   2) SDK 文本：对 JSON 里每条命令，web/js/sdk-text.js 与 server/primitives.py
#      生成的调用文本必须逐字一致（node 子进程 vs python，diff=0 才通过）
#      → 保证调试台"SDK 调用日志" = 真机 dry-run 打印
#   3) 关节名：展开后的每个关节名必须存在于 URDF
#   4) 关节限位：角度值（含编组预设展开）必须在 URDF limit 内（真机安全）
#
# 用法：
#   python verify_consistency.py            # 全量校验
#   python verify_consistency.py --quiet    # 只报问题
import json
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHARED = ROOT / "web" / "shared"
URDF = ROOT / "assets" / "galbot_one_golf_description" / "urdf" / "galbot_one_golf_fixed_base.urdf"
SDK_TEXT_JS = ROOT / "web" / "js" / "sdk-text.js"

# 真机侧不需要执行、但文本仍需一致的原语（场景/运镜/UI/胸屏）
SCENE_ONLY = {"elderly.act", "elderly.walk", "elderly.say", "cam.fly", "status", "log", "screen"}

errors: list[str] = []
warns: list[str] = []


def load_cmds() -> list[dict]:
    """收集 motions.json + chains.json 的所有命令（$参数用默认值具象化）。"""
    cmds: list[tuple[dict, str]] = []

    def resolve(v, params):
        if isinstance(v, str) and v.startswith("$"):
            return (params or {}).get(v[1:], v)
        return v

    def walk(steps, where, params):
        for step in steps or []:
            if "cmds" not in step and "prim" in step:   # 兼容裸原语（chains.json preset）
                step = {"cmds": [step]}
            for raw in step.get("cmds", []):
                cmd = {}
                for k, v in raw.items():
                    if isinstance(v, dict):
                        cmd[k] = {k2: resolve(v2, params) for k2, v2 in v.items()}
                    else:
                        cmd[k] = resolve(v, params)
                cmds.append((cmd, f"{where} · {step.get('note', '')[:24]}"))

    motions = json.loads((SHARED / "motions.json").read_text("utf-8"))["motions"]
    for m in motions:
        walk(m.get("steps"), m["id"], m.get("params"))
    chains = json.loads((SHARED / "chains.json").read_text("utf-8"))["chains"]
    for c in chains:
        for seg in c["segments"]:
            walk(seg.get("preset"), f"{c['id']}/{seg['name']}(preset)", None)
            walk(seg.get("steps"), f"{c['id']}/{seg['name']}", None)
    return cmds


def urdf_joints() -> dict[str, tuple[float, float]]:
    """URDF 关节名 → (lower_deg, upper_deg)。continuous/无限位返回 None。"""
    out = {}
    root = ET.parse(URDF).getroot()
    for j in root.iter("joint"):
        name, typ = j.get("name"), j.get("type")
        lim = j.find("limit")
        if typ == "continuous" or lim is None or lim.get("lower") is None:
            out[name] = None
        else:
            lo, up = float(lim.get("lower")), float(lim.get("upper"))
            if abs(lo) <= 0.02 and abs(up) <= 0.02:   # 空 <axis/> 兜底补丁产生的伪限位
                out[name] = None
            else:
                import math
                out[name] = (math.degrees(lo), math.degrees(up))
    return out


def py_expand_joints(cmd: dict) -> dict[str, float]:
    joints = {**(cmd.get("joints") or {})}
    for g, v in (cmd.get("groups") or {}).items():
        if v == "down":
            joints[f"{g}_joint2"] = -90 if g.startswith("left") else 90
        else:
            for i in range(1, 8):
                joints[f"{g}_joint{i}"] = v
    return joints


# js 侧文本：node 子进程执行 sdk-text.js（无依赖，可独立加载）
def node_sdk_text(cmds: list[dict]) -> list[str]:
    script = (SDK_TEXT_JS.read_text("utf-8")
              + "\nconst cmds=__CMDS__; console.log(JSON.stringify(cmds.map(sdkText)));")
    script = script.replace("__CMDS__", json.dumps(cmds, ensure_ascii=False))
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                       encoding="utf-8", timeout=20, cwd=str(SDK_TEXT_JS.parent))
    if r.returncode != 0:
        raise RuntimeError(f"node 执行 sdk-text.js 失败: {r.stderr[:400]}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def py_sdk_text(cmds: list[dict]) -> list[str]:
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    from primitives import sdk_text
    return [sdk_text(c) for c in cmds]


def main():
    cmds = load_cmds()
    with_src = [(c, src) for c, src in cmds]
    print(f"收集命令 {len(with_src)} 条（motions + chains 全量）\n")

    # ── 1) 原语覆盖 ──
    prims = sorted({c["prim"] for c, _ in with_src})
    js_src = SDK_TEXT_JS.read_text("utf-8")
    py_src = (pathlib.Path(__file__).parent / "primitives.py").read_text("utf-8")
    missing_py = [p for p in prims if p not in SCENE_ONLY and f'"{p}"' not in py_src and f"'{p}'" not in py_src]
    missing_js = [p for p in prims if f"case '{p}'" not in js_src and f'"{p}"' not in js_src]
    if missing_py:
        errors.append(f"原语真机侧未实现: {missing_py}")
    if missing_js:
        errors.append(f"原语孪生侧未实现: {missing_js}")
    scene_used = sorted({p for p in prims if p in SCENE_ONLY})
    print(f"① 原语覆盖: {len(prims)} 种 → {'通过' if not (missing_py or missing_js) else '失败'}"
          + (f"（场景专属 {scene_used}，真机跳过属预期）" if scene_used else ""))

    # ── 2) SDK 文本逐条 diff ──
    try:
        jst = node_sdk_text([c for c, _ in with_src])
        pyt = py_sdk_text([c for c, _ in with_src])
        diffs = []
        for (c, src), a, b in zip(with_src, jst, pyt):
            if a != b:
                diffs.append(f"  [{src}] {c['prim']}\n      js: {a}\n      py: {b}")
        if diffs:
            errors.append(f"SDK 文本不一致 {len(diffs)} 条:\n" + "\n".join(diffs[:8]))
        print(f"② SDK 文本 diff: {len(with_src)} 条 → {'全部一致' if not diffs else f'{len(diffs)} 条不一致'}")
    except RuntimeError as e:
        errors.append(str(e))
        print("② SDK 文本 diff: node 不可用，跳过（警告）")
        warns.append("node 不可用，文本层校验未执行")

    # ── 3) 关节名 + 4) 限位 ──
    uj = urdf_joints()
    bad_names, bad_limits = [], []
    for c, src in with_src:
        if c["prim"] in ("set_joint_positions", "robot.pose"):
            for name, deg in py_expand_joints(c).items():
                if name not in uj:
                    bad_names.append(f"  [{src}] {name}")
                elif uj[name] is not None and isinstance(deg, (int, float)):
                    lo, up = uj[name]
                    if not (lo - 0.5 <= deg <= up + 0.5):
                        bad_limits.append(f"  [{src}] {name}={deg}° 超限 [{lo:.1f}, {up:.1f}]")
        if c["prim"] in ("head_look", "robot.look", "face_point", "navigate_to_goal", "robot.nav"):
            for k in ("x", "z"):
                if k in c and not isinstance(c[k], (int, float)):
                    bad_names.append(f"  [{src}] 参数 ${c[k]} 未具象化（params 缺省）")
    if bad_names:
        errors.append("非法关节名/未具象化参数:\n" + "\n".join(sorted(set(bad_names))))
    if bad_limits:
        errors.append("关节角超 URDF 限位:\n" + "\n".join(sorted(set(bad_limits))))
    print(f"③ 关节名: {'通过' if not bad_names else f'{len(set(bad_names))} 个非法'}")
    print(f"④ URDF 限位: {'通过' if not bad_limits else f'{len(set(bad_limits))} 处越界'}")

    # ── 报告 ──
    print()
    if warns:
        for w in warns:
            print(f"警告: {w}")
    if errors:
        print(f"\n❌ 一致性校验失败 {len(errors)} 项：")
        for e in errors:
            print(e)
        sys.exit(1)
    print("✅ 孪生↔真机一致性校验全部通过（原语覆盖 / SDK 文本 / 关节名 / URDF 限位）")


if __name__ == "__main__":
    main()
