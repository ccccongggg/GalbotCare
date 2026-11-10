// ============================================================
// primitives.js — SDK 原语解释器（数字孪生侧）
// motions.json / chains.json 里的每一步都是这里的原语，
// 原语与真机 Galbot SDK 调用一一对应（见各 prim 的 sdkText）。
// server/run_motion.py / run_chain.py 用同一份 JSON 驱动。
// ============================================================
import * as THREE from 'three';
import { POSES } from './robot.js';
import { sdkText, expandJoints } from './sdk-text.js';   // SDK 文本/编组展开单源（py 侧同步实现 + 校验器 diff）
export const PRIM_JS_VER = '20261109-v2';

const R2D = THREE.MathUtils.radToDeg;

// 原语 → 真机 SDK 调用文本（调试台"SDK 调用日志"用）：定义已抽至 sdk-text.js
const sdkTextRef = sdkText;
export { sdkTextRef as sdkText };

const _norm = d => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

async function execPrim(c, ctx) {
  const { robot, elderly, flyTo, status, log } = ctx;
  await robot.ready;
  switch (c.prim) {
    case 'set_joint_positions': {
      const joints = expandJoints(c);        // 编组展开单源（sdk-text.js，py 侧同规则）
      return robot._applyPose(joints, c.durationMs || 600);
    }
    case 'set_leg_height': return robot.setLegHeight(c.z, c.durationMs || 3500);
    case 'set_base_pose': return robot.turnRel(c.dyaw);
    case 'face_point': {
      const dx = c.x - robot.pos.x, dz = c.z - robot.pos.z;
      const target = Math.atan2(-dz, dx);  // 面向 (dx,dz) 的 yaw（头相机实测，见 robot.js navigate 注释）
      return robot.turnRel(_norm(R2D(target - robot.yaw)));
    }
    case 'navigate_to_goal':
      return robot.navigate(c.x, c.z, {
        speed: c.speed,
        face: c.faceX != null ? { x: c.faceX, z: c.faceZ } : null,
      });
    case 'move_rel': return robot.moveRel(c.forward, c.speed || 0.4);
    case 'set_gripper_command': return robot.setGripper(c.name, c.width);
    case 'oscillate': {
      const centers = {};
      for (const [n, amp] of Object.entries(c.joints)) {
        const j = robot.robot.joints[n];
        const base = c.presetPose && POSES[c.presetPose]?.[n];
        centers[n] = base ?? R2D(j?.angle ?? j?.jointValue ?? 0);
      }
      robot._osc = { joints: c.joints, freq: 1000 / c.periodMs, dur: c.periodMs * c.cycles, center: centers };
      await new Promise(r => setTimeout(r, c.periodMs * c.cycles + 100));
      robot._osc = null;
      return;
    }
    case 'stop_all': return robot.stopAll();
    case 'say': {
      // 真机 tts.play 阻塞至播完——孪生必须等同样的 durationMs（曾只显示气泡立即返回，
      // 连续演示时"问完即答、答完即走"节奏全乱；单段靠视觉掩盖未暴露）
      const ms = c.durationMs || 3000;
      robot.say(c.text, ms);
      await new Promise(r => setTimeout(r, ms));
      return;
    }
    case 'screen': return robot.screen(c.text, c.level || 'info');
    case 'head_look': robot.lookAt(c.x, c.z); await new Promise(r => setTimeout(r, 550)); return;
    case 'wait': return new Promise(r => setTimeout(r, c.ms || 500));
    case 'elderly.act': case 'elderly.walk': case 'elderly.say': {
      if (!elderly) { log('warn', '当前界面无老人角色，跳过该步'); return; }
      await elderly.ready;
      if (c.prim === 'elderly.act') return elderly.act(c.name);
      if (c.prim === 'elderly.walk') return elderly.walkTo(c.x, c.z, c.speed);
      const ems = c.durationMs || 2500;              // 同 say：等够时长（真机 tts 阻塞语义）
      elderly.say(c.text, ems);
      await new Promise(r => setTimeout(r, ems));
      return;
    }
    case 'cam.fly': return flyTo ? flyTo(c.pos, c.target, c.durationMs || 1500) : undefined;
    case 'status': return status(c.level || 'info', c.text || '');
    case 'log': return log(c.level || 'info', c.text || '');
    case 'robot.nav': return robot.navigate(c.x, c.z,
      { face: c.faceX != null ? { x: c.faceX, z: c.faceZ } : null });
    case 'robot.pose': return robot._applyPose(c.joints || {}, 400);
    case 'robot.leg': return robot.setLegHeight(c.z, 1200);
    case 'robot.look': robot.lookAt(c.x, c.z); await new Promise(r => setTimeout(r, 400)); return;
    case 'robot.gripper': return robot.setGripper(c.name, c.width);
    default: log('warn', `未知原语: ${c.prim}`);
  }
}

// "$名" 参数替换
function resolve(v, params) {
  if (typeof v === 'string' && v.startsWith('$')) {
    const k = v.slice(1);
    if (params && k in params) return params[k];
    throw new Error(`缺参数 ${k}`);
  }
  return v;
}
function resolveCmd(c, params) {
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'joints' && v && typeof v === 'object') {
      out.joints = {};
      for (const [n, d] of Object.entries(v)) out.joints[n] = resolve(d, params);
    } else out[k] = resolve(v, params);
  }
  return out;
}

// 执行一段 steps（步骤串行；同一步内 cmds 并行）
// 兼容两种写法：{note, cmds:[...]} 包装式 与 裸原语式（chains.json 的 preset）
export async function runSteps(steps, ctx, opts = {}) {
  const log = ctx.log || (() => {});
  for (const step of steps || []) {
    const norm = (step && step.cmds) ? step : { cmds: [step] };
    if (norm.note) log('info', norm.note);
    const cmds = (norm.cmds || []).map(c => resolveCmd(c, opts.params));
    for (const c of cmds) log('sdk', sdkText(c));
    await Promise.all(cmds.map(c => execPrim(c, ctx)));
  }
}

// 执行一个动作模块（motions.json 里的条目）
export async function runMotion(motion, ctx) {
  const log = ctx.log || (() => {});
  log('info', `—— ${motion.id} ${motion.name} ——`);
  return runSteps(motion.steps, ctx, { params: motion.params });
}

// 执行一个链段（chains.json 里的条目）：先预置场景，再跑动作序列
export async function runSegment(chain, seg, ctx) {
  const log = ctx.log || (() => {});
  log('info', `—— ${chain.name} · ${seg.name} ——`);
  if (seg.desc) log('info', seg.desc);
  await runSteps(seg.preset, ctx);
  await runSteps(seg.steps, ctx);
  log('ok', `段结束：${chain.name} · ${seg.name}`);
}
