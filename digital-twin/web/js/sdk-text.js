// ============================================================
// sdk-text.js — SDK 调用文本的唯一格式源（无任何依赖，ES module）
// 调试台"SDK 调用日志"与真机 dry-run 打印都必须用它，
// server/verify_consistency.py 会逐条 diff 两侧文本，不一致即构建失败。
// groups 编组展开规则也在此单源定义（镜像安装：垂下 left=-90 / right=+90，
// 由 TCP 世界坐标标定，见任务卡 T-19 踩坑 #2/#10）。
// ============================================================

// 编组预设值（js/py 两侧禁止各自硬编码，只允许 import / 复制本表并经校验器核对）
// down：j2=∓90（从 T-pose 下转）+ j1=∓25 侧摆补偿——实测 j2 单独下垂时手臂外张 27°
// （TCP 侧偏 0.35m），呈"八字"而非自然贴身；加 j1 补偿后侧偏 0.05m（踩坑 #19）
export const GROUP_PRESETS = {
  down: g => ({ joint1: g.startsWith('left') ? 25 : -25, joint2: g.startsWith('left') ? -90 : 90 }),
};

export const SDK_TEXT_VER = '20261110-v1';

export function expandJoints(c) {
  const joints = { ...(c.joints || {}) };
  for (const [g, v] of Object.entries(c.groups || {})) {
    if (typeof v === 'string' && GROUP_PRESETS[v]) {
      const preset = GROUP_PRESETS[v](g);
      for (const [k, val] of Object.entries(preset)) joints[`${g}_${k}`] = val;
    } else {
      for (let i = 1; i <= 7; i++) joints[`${g}_joint${i}`] = v;
    }
  }
  return joints;
}

// 真机 SDK 调用文本（与《动作编排.md》签名一致）
export function sdkText(c) {
  switch (c.prim) {
    case 'set_joint_positions': {
      const parts = [];
      if (c.groups) for (const [g, v] of Object.entries(c.groups))
        parts.push(`"${g}"→${v}(×7关节)`);
      if (c.joints) for (const [n, v] of Object.entries(c.joints)) parts.push(`"${n}"→${v}°`);
      return `set_joint_positions([${parts.join(', ')}], speed=0.3)`;
    }
    case 'set_leg_height': return `set_leg_height(${c.z}, duration=${((c.durationMs || 3500) / 1000).toFixed(1)})`;
    case 'set_base_pose': return `set_base_pose(0, 0, ${c.dyaw}°, frame_id="rel(0)")`;
    case 'face_point': return `set_base_pose(0, 0, Δyaw(→${c.x},${c.z}), frame_id="rel(0)")`;
    case 'navigate_to_goal': return `navigate_to_goal(${c.x}, ${c.z}, omni_plan=True, timeout=8)`;
    case 'move_rel': return `navigate_to_goal(相对: ${c.forward > 0 ? '前进' : '后退'} ${Math.abs(c.forward)}m, omni_plan=True)`;
    case 'set_gripper_command': return `set_gripper_command("${c.name}", ${c.width}, 0.03, 5)`;
    case 'oscillate': return `set_joint_positions(预设角A↔B 交替 ${c.cycles} 回, period=${c.periodMs}ms)`;
    case 'stop_all': return 'stop_base() + stop_navigation() + stop_trajectory_execution()';
    case 'say': return `tts.play("${c.text}")`;
    case 'screen': return `screen.show("${c.text}", "${c.level || 'info'}")`;
    case 'head_look': return `set_joint_positions(["head"], [Δyaw(→${c.x},${c.z}), pitch], speed=0.3)`;
    case 'wait': return `sleep(${c.ms})`;
    case 'elderly.act': return `[场景] elderly.act("${c.name}")`;
    case 'elderly.walk': return `[场景] elderly.walkTo(${c.x}, ${c.z})`;
    case 'elderly.say': return `[场景] elderly.say("${c.text}")`;
    case 'cam.fly': return `[运镜] flyTo(${JSON.stringify(c.pos)}, ${JSON.stringify(c.target)})`;
    case 'status': return `[UI] status("${c.level}", "${c.text}")`;
    case 'log': return `[UI] log("${c.level || 'info'}", "${c.text}")`;
    case 'robot.nav': return `navigate_to_goal(${c.x}, ${c.z}, omni_plan=True)`;
    case 'robot.pose': return `set_joint_positions(${JSON.stringify(c.joints)})`;
    case 'robot.leg': return `set_leg_height(${c.z})`;
    case 'robot.look': return `set_joint_positions(["head"], [Δyaw(→${c.x},${c.z})])`;
    case 'robot.gripper': return `set_gripper_command("${c.name}", ${c.width})`;
    default: return `[未知原语] ${c.prim}`;
  }
}
