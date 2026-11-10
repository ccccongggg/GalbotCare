// ============================================================
// robot.js — 虚拟 Galbot G1（官方 URDF + urdf-loader）
// 官方模型：github.com/GalaxyGeneralRobotics/galbot_one_golf_description (Apache-2.0)
// URDF 约定：+Y 为正前方，Z 轴向上（通过 tilt 组转到 three.js 的 Y-up）
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLLIDERS } from './house.js';                       // 2D 碰撞体（墙+家具，见 house.js）

const D2R = THREE.MathUtils.degToRad, R2D = THREE.MathUtils.radToDeg;
// SDK 物理常量（与《动作编排.md》§〇 对齐）
const LEG_STROKE = { min: 0.96, max: 1.54 };           // set_leg_height 行程（米）：1.54=站立（全伸）、0.96=蹲（全收）
// 剪叉升降的**调平路径**：leg_joint1=θ、leg_joint2=2θ、leg_joint3=θ。
// 依据（URDF 前向运动学复算，torso_base 的 +Y 才是身体上方向，勿用 +Z）：
//   ① j3 = j2 − j1 时躯干倾角**恒为 0°**（scissor 平行条件）；
//   ② 取对称解 j1 = j3 = θ ⇒ j2 = 2θ，折叠角均分，符合连杆实际运动；
//   ③ 该路径头高 0.771 → 1.352（URDF 原始单位）单调，与真机行程 0.96–1.54m 同比。
// ⚠ 旧实现让三个关节各按自身量程比例给角（0.8×limit）→ 躯干前倾 31°（截图实锤）。
//   "三关节同时到极限" ≠ "平台水平"。改这里之前先复算倾角。
const LEG_THETA_MAX = 0.9374;                                   // leg_joint1 上限（rad）
const LEG_PATH = th => ({ leg_joint1: th, leg_joint2: 2 * th, leg_joint3: th });
const GRIP_RANGE = { widthM: 0.12, rad: 1.703 };       // 夹爪 0–0.12m ↔ 关节行程
const M = (color, rough = .8, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; return m;
}

// ── 动作预设（度；真机标定后更新这里） ──────────────────────
// 关节轴（数学扫描确定，见 .tmp 扫描记录）：
//   j1 = 臂轴自转（夹爪薄片竖立/横躺）  j2 = 肩俯仰（**左右镜像安装**）
//   TCP 实测复核（肩高 y≈1.04，机器人总高≈1.6m）：j2=0 → TCP y=1.04（水平 T-pose）；
//   垂臂：left=-90 / right=+90；举过头：left=+90 / right=-90。两肩挂载位置前后不对称，
//   目测截图极易误判，一律以 gripper_base_link 世界 y 值为准（垂下≈0.42）。
export const POSES = {
  home: {},                                                   // 机械零位（T-pose）
  arms_home: {                                                // M-14 双臂归位（自然下垂）：
                                                              // j1=∓25 侧摆补偿（实测 j2 单独下垂外张 27°，见踩坑 #19）
    left_arm_joint1: 25, left_arm_joint2: -90,
    right_arm_joint1: -25, right_arm_joint2: 90,
  },
  wave: {  // M-13 摆手 / C-3 安抚挥手：抬臂至身侧前下方约 30°，小臂摆动。
           // ⚠ 镜像安装：右侧 j2/j4 与左侧同值反号（垂下 right=+90 / left=-90），
           //   误用左侧值（-60/-50）会把手举到头顶反向（TCP 实测 y=+0.6）
    right_arm_joint2: 60, right_arm_joint4: 50, right_arm_joint6: 0,
  },
  point: {  // M-15 指物（左夹爪臂）：自下垂抬臂约 55°（前伸略偏上）
    left_arm_joint2: -35, left_arm_joint4: -5,
  },
};
export const GESTURES = ['home', 'arms_home', 'wave', 'point', 'nod', 'shake', 'grip_open', 'grip_close'];

export const ROBOT_JS_VER = '20261110-v5';
export class Robot {
  constructor(scene, cssRoot) {
    this.scene = scene;
    this.pos = new THREE.Vector3(-3.8, 0, -3.55);  // 初始站位（客厅西南角，远离老人椅与沙发）
    this.yaw = 0;
    this.onEvent = () => {};
    this._osc = null;                              // 当前振荡 {joint, amp, freq, center}
    this._navToken = 0;                            // 导航取消令牌（M-01 急停用）
    this._legFrac = 1;                             // 升降归一化行程：1=站立(全伸)、0=蹲(全收)
    this._legCurve = null;                         // 头高标定曲线（URDF 原始单位 5 点，ready 后异步生成）
    this._staticGrid = null;                       // A* 栅格（静态障碍，首次导航时构建）
    this._cssRoot = cssRoot;                       // CSS2D 容器（_load 内 _makeEmote 需要）
    this._bubble = this._makeEl(cssRoot, 'bubble');
    this.ready = this._load();
    this.ready.then(() => this._calibrateLeg());   // 标定剪叉曲线（虚实一致的 setLegHeight 依赖它）
  }

  // ── URDF 加载（UMD 构建：先挂 window.THREE 再动态插脚本） ──
  async _load() {
    window.THREE = THREE;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = './lib/urdf-loader.js'; s.onload = res; s.onerror = () => rej(new Error('urdf-loader 加载失败'));
      document.head.appendChild(s);
    });
    const loader = new window.URDFLoader();
    const manager = new THREE.LoadingManager();
    loader.manager = manager;

    // 官方 URDF 含空 <axis/> 标签（urdf-spec 默认轴，但 urdf-loader 会崩）→ 预处理补默认轴
    const URDF_URL = '/robot/urdf/galbot_one_golf_fixed_base.urdf';
    const raw = await (await fetch(URDF_URL)).text();
    const patched = raw.replace(/<axis\s*\/>/g, '<axis xyz="1 0 0"/>');
    const blobUrl = URL.createObjectURL(new Blob([patched], { type: 'application/xml' }));

    // 自定义网格加载：跳过 collision；mesh 相对路径统一重写到 /robot/meshes/
    loader.loadMeshCb = (path, mgr, done) => {
      if (path.includes('collision')) { done(new THREE.Group()); return; }
      const m = path.match(/meshes\/(.+)$/);
      new GLTFLoader(mgr).load(m ? `/robot/meshes/${m[1]}` : path,
        gltf => done(gltf.scene), undefined, () => done(new THREE.Mesh()));
    };
    this.robot = await new Promise((res, rej) =>
      loader.load(blobUrl, res, undefined,
        e => { console.error('[robot] URDF 加载失败', e); rej(e); }));
    URL.revokeObjectURL(blobUrl);

    // load 回调可能早于全部 glb 网格挂载 → 轮询直到包围盒连续多次稳定
    await new Promise(res => {
      let prev = 0, stable = 0;
      const check = () => {
        const b = new THREE.Box3().setFromObject(this.robot);
        const h = isFinite(b.max.z) ? b.max.z - b.min.z : 0;
        if (h > .3 && Math.abs(h - prev) < .005) { if (++stable >= 3) return res(); }
        else stable = 0;
        prev = h; setTimeout(check, 150);
      };
      check();
    });
    this.robot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

    // 坐标转换链：wrapper(平面移动/朝向) → tilt(URDF z-up → three y-up)
    this.tilt = new THREE.Group(); this.tilt.rotation.x = -Math.PI / 2;
    this.tilt.add(this.robot);
    this.wrapper = new THREE.Group();
    this.wrapper.position.copy(this.pos);
    this.wrapper.rotation.y = this.yaw;
    this.wrapper.add(this.tilt);
    this.scene.add(this.wrapper);

    // 按包围盒归一化身高（glb 网格单位与 URDF 可能不一致，自动矫正）
    // 定标基准 = **剪叉全伸姿态总高 1.6m**（真机 set_leg_height 1.54 = 站立）。
    // 旧代码硬编码"原始头高 1.345→2.124"，那是按错误的腿部路径实测的，路径修正后失效 →
    // 改为现测：全收 / 全伸两处包围盒高度，用全伸 = 1.6m 定标（自校准，换模型不用改常量）。
    const rawH = () => {                                 // 从 tilt 强制刷新整棵子树的世界矩阵
      this.tilt.updateMatrixWorld(true);                 // （只刷 robot 会用到上一帧的父级矩阵，轴会错）
      return new THREE.Box3().setFromObject(this.robot).getSize(new THREE.Vector3()).z;
    };
    this._setLegFrac(0); const hFold = rawH();
    this._setLegFrac(1); const hStand = rawH();
    this.modelH = hStand;                                  // URDF 原始单位（气泡定位用）
    const SCALE = 1.6 / Math.max(.1, hStand);              // 目标：全伸姿态总高 1.6m
    this.tilt.scale.setScalar(SCALE);
    this._legFrac = 1;

    // 胸屏：模型自带（M_torso 躯干贴图上已有屏幕图案），**不再自建屏幕 mesh**（曾重复悬挂）。
    // screen.show 的表情/状态改为头顶 emote 气泡呈现（SDK 命令流不变，真机由胸屏显示）
    this._makeEmote(this._cssRoot);
    // 语音气泡（CSS2D，所有视角可读）
    this._bubble.position.set(0, 0, this.modelH * 1.12);
    this._bubble.visible = false;     // CSS2D 隐藏只能走 visible（见 say()）
    this.tilt.add(this._bubble);

    // 关节清单（调试面板用）
    this.revolute = Object.entries(this.robot.joints)
      .filter(([, j]) => j.jointType === 'revolute')
      .map(([name, j]) => ({ name, min: R2D(j.limit.lower), max: R2D(j.limit.upper) }));
    this._applyPose(POSES.arms_home);                   // 初始即自然下垂（T-pose 会穿家具）
    this._setLegFrac(1);                                // 初始 = 站立全伸（躯干竖直，见 LEG_PATH）
    console.log(`[robot] 剪叉高 ${hFold.toFixed(2)}→${hStand.toFixed(2)}（URDF 单位），缩放 ${SCALE.toFixed(3)}`);
    return this;
  }

  _makeEl(cssRoot, cls) {
    const div = document.createElement('div');
    div.className = cls;
    cssRoot.appendChild(div);
    return new CSS2DObject(div);
  }

  // 头顶 emote 气泡（screen.show 的孪生呈现；屏幕位置高于语音气泡避免重叠）
  _makeEmote(cssRoot) {
    const div = document.createElement('div');
    div.className = 'bubble emote';
    cssRoot.appendChild(div);
    this._emote = new CSS2DObject(div);
    this._emote.position.set(0, 0, this.modelH * 1.32);
    this._emote.visible = false;
    this.tilt.add(this._emote);
  }

  // ── 关节 ────────────────────────────────────────────────
  setJointDeg(name, deg) {
    const j = this.robot?.joints[name];
    if (!j) return false;
    if (!Number.isFinite(deg)) return false;   // 防线：NaN/对象串接等非有限值拒绝写入（一旦写入关节永久污染）
    j.setJointValue(D2R(THREE.MathUtils.clamp(deg, R2D(j.limit.lower), R2D(j.limit.upper))));
    return true;
  }
  _applyPose(poseDeg, durationMs = 500) {
    return new Promise(res => {
      const entries = Object.entries(poseDeg);
      if (!entries.length) {                                    // 归零
        for (const { name } of this.revolute) this.setJointDeg(name, 0);
        return res();
      }
      const starts = entries.map(([n]) => {
        const j = this.robot.joints[n];
        const v = j ? j.angle ?? j.jointValue ?? 0 : 0;
        return Number.isFinite(v) ? v : 0;      // 已污染(NaN)关节按 0 处理，防插值传染
      });
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / durationMs);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOut
        entries.forEach(([n, target], i) => this.setJointDeg(n, starts[i] + (target - starts[i]) * e));
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  // ── 手势（语义动作） ─────────────────────────────────────
  async gesture(name, durationMs = 2500) {
    this._osc = null;
    switch (name) {
      case 'wave':                                          // 摆手（M-13 / C-3 安抚）
        await this._applyPose(POSES.wave);
        this._osc = { joints: { right_arm_joint4: 18, right_arm_joint6: 14 }, freq: 2.2, dur: durationMs };
        await new Promise(r => setTimeout(r, durationMs));
        this._osc = null; await this._applyPose(POSES.arms_home);
        break;
      case 'point':                                         // 指物（M-15）
        await this._applyPose(POSES.point);
        await new Promise(r => setTimeout(r, durationMs));
        await this._applyPose(POSES.arms_home);
        break;
      case 'nod':                                           // 点头（负值=低头，同 M-02 低头 -12 约定；中心 0 会往抬头方向摆，视觉上像没动）
        this._osc = { joints: { head_joint2: 6 }, freq: 1.6, dur: durationMs, center: -6 };
        await new Promise(r => setTimeout(r, durationMs));
        this._osc = null; this.setJointDeg('head_joint2', 0);
        break;
      case 'shake':                                         // 摇头
        this._osc = { joints: { head_joint1: 18 }, freq: 1.6, dur: durationMs, center: 0 };
        await new Promise(r => setTimeout(r, durationMs));
        this._osc = null; this.setJointDeg('head_joint1', 0);
        break;
      case 'grip_open': case 'grip_close': {                // 夹爪
        const val = name === 'grip_open' ? 70 : 8;
        const names = Object.keys(this.robot.joints).filter(n => n.includes('gripper') && n.includes('finger') || n.includes('knuckle'));
        for (const n of names) this.setJointDeg(n, val);
        await new Promise(r => setTimeout(r, 400));
        break;
      }
      default:                                              // home / arms_home
        await this._applyPose(POSES[name] || POSES.home);
    }
    this.onEvent({ type: 'gesture_done', name });
  }

  // 头部看向世界坐标点（眼睛先到，指物锚定）
  lookAt(x, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const world = Math.atan2(-dz, dx);                      // 面向 (dx,dz) 的 yaw（见 navigate 注释）
    let local = world - this.yaw;
    while (local > Math.PI) local -= 2 * Math.PI;
    while (local < -Math.PI) local += 2 * Math.PI;
    this.setJointDeg('head_joint1', THREE.MathUtils.clamp(R2D(local), -60, 60));
    this.setJointDeg('head_joint2', -12);
  }

  // ── SDK 级原语（与真机 Galbot SDK 一一对应，见《动作编排.md》） ──

  // M-11 set_leg_height(z, duration)：0.96–1.54m，剪叉升降 leg_joint1..3（走调平路径 LEG_PATH）
  // 剪叉"关节角→高度"非线性，故行程系数用标定曲线反插值（_calibrateLeg），保证 z 线性对应
  // 真机行程（虚实一致），勿回退为线性公式。
  setLegHeight(z, durationMs = 3500) {
    const f = this._legFofZ(z);
    const from = this._legFrac, t0 = performance.now();
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / durationMs);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this._setLegFrac(from + (f - from) * e);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  // 行程系数 f∈[0,1] → 三个剪叉关节角（唯一入口，任何地方都不许单独改 leg_joint*）
  _setLegFrac(f) {
    const frac = THREE.MathUtils.clamp(f, 0, 1);
    const th = frac * LEG_THETA_MAX;
    for (const [n, deg] of Object.entries(LEG_PATH(th))) this.setJointDeg(n, R2D(deg));
    this._legFrac = frac;
  }

  // z(0.96..1.54 线性) → 行程系数 f∈[0,1]。依据 ready 后的实测标定曲线 _legCurve
  // （URDF 原始单位头高，f=0/.25/.5/.75/1 五点）；未标定完成时退化为线性。
  _legFofZ(z) {
    const frac = THREE.MathUtils.clamp((z - LEG_STROKE.min) / (LEG_STROKE.max - LEG_STROKE.min), 0, 1);
    const c = this._legCurve;
    if (!c || !(c[4] - c[0] > .01)) return frac;        // 未标定/标定异常 → 退化线性（防除零 NaN）
    const target = c[0] + frac * (c[4] - c[0]);          // 目标原始头高（线性于 z）
    for (let i = 0; i < 4; i++) {
      if (target <= c[i + 1] || i === 3) {
        const t = THREE.MathUtils.clamp((target - c[i]) / (c[i + 1] - c[i]), 0, 1);
        return (i + t) * 0.25;
      }
    }
    return frac;
  }

  // ready 后异步标定头高曲线：5 个采样点读 head_link1 世界高度（除以 SCALE 存原始单位），
  // 结束后回到站立。标定期间 ~0.6s，若用户先操作了腿，以最后状态为准。
  async _calibrateLeg() {
    if (!this.robot) return;
    const pts = [];
    for (const f of [0, .25, .5, .75, 1]) {
      this._setLegFrac(f);
      await new Promise(r => setTimeout(r, 120));
      const h = this.robot.links['head_link1'];
      h.updateWorldMatrix(true, false);
      const v = h.getWorldPosition(new THREE.Vector3());
      pts.push(v.y / this.tilt.scale.x);
    }
    this._legCurve = pts;
    this._setLegFrac(1);                                 // 回站立
    // 自检：躯干上方向（torso_base → head_base 连线）与竖直夹角，正常应 <1°。
    // 若这里报 >5°，说明 LEG_PATH 被改坏（= 截图里"弯着腰"的状态又回来了）。
    this.tilt.updateWorldMatrix(true, true);
    const lp = o => this.tilt.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const up = lp(this.robot.links['head_base_link']).sub(lp(this.robot.links['torso_base_link'])).normalize();
    console.log(`[robot] 躯干倾角 ${(Math.acos(THREE.MathUtils.clamp(up.z, -1, 1)) * 180 / Math.PI).toFixed(2)}°（应≈0）`);
  }

  // M-05 set_base_pose(0,0,Δyaw, frame_id="rel(0)")：原地闭环转向
  turnRel(dyawDeg, durationMs) {
    const dur = durationMs ?? Math.abs(dyawDeg) / 70 * 1000;   // ~70°/s 上限
    const from = this.yaw, delta = D2R(dyawDeg), t0 = performance.now();
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.wrapper.rotation.y = from + delta * e;
        if (t < 1) requestAnimationFrame(step);
        else { this.yaw = from + delta; this.wrapper.rotation.y = this.yaw; res(); }
      };
      requestAnimationFrame(step);
    });
  }

  // M-06/M-07 相对移动（正=前进，负=后退），沿当前朝向且保持朝向不变。
  // ⚠ 后退**不能**走 navigate：A* 跟随会先转身朝目标→后退变"掉头走"，违反"后退不转身"。
  //   故前进走导航（可绕障），后退走 _translate（朝向锁死、纯平移、碰撞拦截）。
  moveRel(distM, speed = 0.4) {
    const dir = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));  // 面朝方向（头相机实测，见 navigate 注释）
    if (distM < 0) return this._translate(distM, speed);
    const to = this.pos.clone().addScaledVector(dir, distM);
    const face = this.pos.clone().addScaledVector(dir, 5);
    return this.navigate(to.x, to.z, { speed, face: { x: face.x, z: face.z } });
  }

  // 沿当前朝向平移（dist<0 = 后退），**朝向与转身全程不变**，分轴碰撞拦截，M-01 可中断
  _translate(dist, speed = .4) {
    const token = this._navToken, sign = Math.sign(dist) || 1;
    let remain = Math.abs(dist), last = performance.now();
    return new Promise(res => {
      const step = now => {
        if (token !== this._navToken) return res();
        const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now;
        const len = Math.min(remain, speed * dt);
        const ox = this.pos.x, oz = this.pos.z;
        this._tryMove(Math.cos(this.yaw) * sign * len, -Math.sin(this.yaw) * sign * len);
        this.wrapper.position.copy(this.pos);
        const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        remain -= moved;
        if (remain > 1e-3 && moved > 1e-4) requestAnimationFrame(step);
        else res();                                   // 走完或被挡死 → 停在原地（不瞬移补位）
      };
      requestAnimationFrame(step);
    });
  }

  // M-01 急停：停底 + 停臂（导航循环与振荡立即取消）
  stopAll() {
    this._navToken++; this._osc = null;
    return Promise.resolve();
  }

  // M-15 set_gripper_command(name, width, ...)：宽度 0–0.12m → 关节角
  setGripper(name = 'left_gripper', widthM = 0.005) {
    const deg = R2D(THREE.MathUtils.clamp(widthM / GRIP_RANGE.widthM, 0, 1) * GRIP_RANGE.rad);
    const prefix = name === 'left_gripper' ? 'left_gripper' : 'right_gripper';
    const names = Object.keys(this.robot.joints).filter(n => n.startsWith(prefix));
    for (const n of names) this.setJointDeg(n, deg);
    return new Promise(r => setTimeout(r, 300));
  }

  // ── 碰撞检测（2D 圆-AABB）：真机底盘有避障，孪生同步拦截防穿墙穿家具压人 ──
  // 调试台（lab.html）是空摄影棚，没有户型 → 置 noColliders=true 关闭碰撞层与 A*，
  // 否则舞台中心会落在户型某面墙里，前进/后退会被"规划"到莫名其妙的位置。
  _blockedStatic(x, z, r = 0.28) {
    if (this.noColliders) return false;
    for (const c of COLLIDERS) {
      const nx = Math.max(c.x1, Math.min(x, c.x2)), nz = Math.max(c.z1, Math.min(z, c.z2));
      const dx = x - nx, dz = z - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  blocked(x, z, r = 0.28) {
    if (this._blockedStatic(x, z, r)) return true;
    if (this._dyn) for (const c of this._dyn.occupancy()) {   // 动态实体（老人）：圆-圆
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }
  // 分轴滑动：整体被堵时先试只走 x、再只走 z（沿障碍滑行），防卡死
  _tryMove(dx, dz) {
    if (!this.blocked(this.pos.x + dx, this.pos.z + dz)) {
      this.pos.x += dx; this.pos.z += dz; return;
    }
    if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
  }

  _wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ── 路径规划（A* 栅格）────────────────────────────────────
  // 真机底盘由 nav2/避障模块规划绕行路径；孪生若走直线，会在墙边滑行、到点再瞬移到目标
  //（= "穿墙 + 瞬间移动" 观感根因）。这里用同一张 COLLIDERS 表建 0.1m 栅格，A* 出折线
  // 路径后平滑跟随：位移全程连续、不跳变、不切墙角。静态障碍建一次缓存。
  _grid() {
    if (this._staticGrid) return this._staticGrid;
    const step = .1, x1 = -5.3, z1 = -4.3, nx = 107, nz = 87;
    const occ = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (this.noColliders) break;                       // 空舞台：全自由
      if (i === 0 || k === 0 || i === nx - 1 || k === nz - 1 ||
          this._blockedStatic(x1 + i * step, z1 + k * step, .3)) occ[i * nz + k] = 1;
    }
    return (this._staticGrid = { step, x1, z1, nx, nz, occ });
  }
  _cellOf(g, x, z) {
    const i = Math.round((x - g.x1) / g.step), k = Math.round((z - g.z1) / g.step);
    return (i < 0 || k < 0 || i >= g.nx || k >= g.nz) ? null : [i, k];
  }
  _freeNear(g, ci, ck, rad = 6) {                 // 起点/终点落在障碍内时就近取自由格
    if (ci == null || ck == null) return null;
    if (!g.occ[ci * g.nz + ck]) return [ci, ck];
    for (let r = 1; r <= rad; r++)
      for (let di = -r; di <= r; di++)
        for (let dk = -r; dk <= r; dk++) {
          const i = ci + di, k = ck + dk;
          if (i < 0 || k < 0 || i >= g.nx || k >= g.nz) continue;
          if (!g.occ[i * g.nz + k]) return [i, k];
        }
    return null;
  }
  _plan(sx, sz, tx, tz) {
    const g = this._grid(), { nx, nz, occ, step } = g, idx = (i, k) => i * nz + k;
    const sc = this._cellOf(g, sx, sz), tc = this._cellOf(g, tx, tz);
    if (!sc || !tc) return null;
    const s = this._freeNear(g, sc[0], sc[1]), t = this._freeNear(g, tc[0], tc[1]);
    if (!s || !t) return null;
    const N = nx * nz;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const open = [idx(s[0], s[1])], seen = new Uint8Array(N);
    gs[open[0]] = 0; seen[open[0]] = 1;
    const goalId = idx(t[0], t[1]), hcost = id => Math.hypot((id / nz | 0) - t[0], (id % nz) - t[1]);
    let goal = -1, guard = 0;
    while (open.length && guard++ < 30000) {
      let bi = 0, bf = Infinity;                    // 取 f 最小（开放集小，线性扫描足够）
      for (let q = 0; q < open.length; q++) {
        const f = gs[open[q]] + hcost(open[q]);
        if (f < bf) { bf = f; bi = q; }
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === goalId) { goal = cur; break; }
      const ci = (cur / nz) | 0, ck = cur % nz;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const i = ci + di, k = ck + dk;
        if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
        const id = idx(i, k);
        if (occ[id]) continue;
        if (di && dk && (occ[idx(ci + di, ck)] || occ[idx(ci, ck + dk)])) continue;   // 不切墙角
        const ng = gs[cur] + (di && dk ? 1.414 : 1);
        if (ng + 1e-6 < gs[id]) {
          gs[id] = ng; from[id] = cur;
          if (!seen[id]) { seen[id] = 1; open.push(id); }
        }
      }
    }
    if (goal < 0) return null;
    const pts = [];
    for (let c = goal; c !== -1; c = from[c]) {
      pts.push({ x: g.x1 + ((c / nz) | 0) * step, z: g.z1 + (c % nz) * step });
      if (c === idx(s[0], s[1])) break;
    }
    pts.reverse();
    // 视线简化（string pulling）：能直连就跳过中间格点，避免 0.1m 台阶式抖动
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) if (this._clearLine(pts[i], pts[j])) break;
      out.push(pts[j]); i = j;
    }
    if (out.length > 1) out.shift();               // 起点即机器人所在，不必作为航点
    return out.length ? out : [{ x: tx, z: tz }];
  }
  // 两点之间是否全程无静态障碍（半径留 0.28，与底盘一致）
  _clearLine(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L / .08));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this._blockedStatic(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, .28)) return false;
    }
    return true;
  }

  // ── 底盘导航（A* 路径 + 平滑转向 + 匀速移动；M-01 可中断） ──
  // 朝向换算（**头相机实测**，勿改符号）：head_link2.glb 中摄像头材质零件位于头部 +X 面
  //（摄像头必朝外）→ 头挂载 rpy(-90°,-90°,0) 映射 → 正前 = torso +Z → 站立姿态下
  // torso Z→URDF +X → tilt(-90°X) → **yaw=0 时正面朝世界 +X**。
  // 故面朝向量 f(yaw)=(cos yaw, 0, -sin yaw)，面向方向 d 的 yaw = atan2(-dz, dx)。
  // ⚠ 旧版 f=(sin,0,cos)（朝 +Z）是**机器人左右轴** → 前进后退全变"侧着走"（用户实锤）。
  // ⚠ 到达时**只允许原地落位（<12cm）**，绝不从远处瞬移到目标——旧实现结尾无条件
  //   pos.set(tx,tz)，路径被墙挡住时就是"贴墙滑行 → 瞬移穿墙"的观感。
  navigate(x, z, { face = null, speed = 0.75 } = {}) {
    // 终点在障碍体内（贴着墙/家具，如 M-06 靠近老人椅）：沿来向回退到最近可达点
    // ——真机语义 = "停到障碍前"
    let tx = x, tz = z;
    if (this._blockedStatic(tx, tz)) {
      for (let s = 1; s <= 40; s++) {
        const fx = x - (x - this.pos.x) * s / 40, fz = z - (z - this.pos.z) * s / 40;
        if (!this._blockedStatic(fx, fz)) { tx = fx; tz = fz; break; }
      }
    }
    const token = this._navToken;
    let path = this._plan(this.pos.x, this.pos.z, tx, tz);
    if (!path || !path.length) path = [{ x: tx, z: tz }];
    return new Promise(res => {
      let wi = 0, last = performance.now(), stall = 0, replans = 0;
      const finish = () => {
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < .12 && !this.blocked(tx, tz)) {
          this.pos.set(tx, 0, tz); this.wrapper.position.copy(this.pos);
        }
        if (!face) return res();
        this._turnTo(face.x, face.z, token).then(res);        // 停下后面向 face 点（按实际到达点）
      };
      const step = now => {
        if (token !== this._navToken) return res();           // M-01 急停中断
        const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now;
        if (wi >= path.length) return finish();
        const wp = path[wi];
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dist = Math.hypot(dx, dz);
        if (dist < .06) { wi++; return requestAnimationFrame(step); }
        const dirYaw = Math.atan2(-dz, dx);
        const dYaw = this._wrap(dirYaw - this.yaw);
        const yawStep = 1.8 * dt;                             // 转向 1.8 rad/s
        this.yaw = Math.abs(dYaw) <= yawStep ? dirYaw : this.yaw + Math.sign(dYaw) * yawStep;
        this.yaw = this._wrap(this.yaw);
        this.wrapper.rotation.y = this.yaw;
        if (Math.abs(dYaw) < .5) {                            // 朝向大致对齐才前进（差速底盘观感）
          const len = Math.min(dist, speed * dt);
          const ox = this.pos.x, oz = this.pos.z;
          this._tryMove(dx / dist * len, dz / dist * len);     // 碰撞拦截：分轴滑动
          this.wrapper.position.copy(this.pos);
          const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
          stall = moved < len * .3 ? stall + dt : 0;
          if (stall > 1.2) {                                  // 被动态障碍堵死：重规划一次，否则停住
            stall = 0;
            if (replans++ === 0) { path = this._plan(this.pos.x, this.pos.z, tx, tz) || []; wi = 0; }
            else return finish();
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // 平滑转身面向世界点（收尾"面对面"，M-01 可中断）
  _turnTo(x, z, token) {
    const ty = Math.atan2(-(z - this.pos.z), x - this.pos.x);
    return new Promise(res => {
      const step = () => {
        if (token !== this._navToken) return res();
        const d = this._wrap(ty - this.yaw), s = 1.2 / 60;    // 1.2 rad/s
        if (Math.abs(d) <= s) { this.yaw = ty; this.wrapper.rotation.y = ty; return res(); }
        this.yaw = this._wrap(this.yaw + Math.sign(d) * s);
        this.wrapper.rotation.y = this.yaw;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ── 屏幕与语音 ──────────────────────────────────────────
  say(text, durationMs = 3000) {
    // 隐藏必须走 _bubble.visible（CSS2DRenderer 每帧按 visible 重写 element.style.display，
    // 直接改 display 会被覆盖回显 → 气泡永不消失）
    const el = this._bubble.element;
    el.textContent = text;
    this._bubble.visible = true;
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => { this._bubble.visible = false; }, durationMs);
  }
  // screen.show → 头顶 emote 气泡（模型自带胸屏贴图不可控，孪生近似；命令流不变）
  screen(text, level = 'info') {
    if (!this._emote) return;
    const el = this._emote.element;
    el.textContent = text || '';
    el.dataset.level = level;
    this._emote.visible = !!text;     // CSS2D 隐藏只能走 visible（见 say() 注释）
    clearTimeout(this._screenTimer);
    if (text) this._screenTimer = setTimeout(() => { this._emote.visible = false; }, 8000);
  }

  // 硬复位（复位按钮 / 单段演示起点）：位置直接回初始位（切场语义）
  reset() {
    this._osc = null; this._navToken++;
    this.pos.set(-3.8, 0, -3.55); this.yaw = 0;
    this.wrapper.position.copy(this.pos); this.wrapper.rotation.y = this.yaw;
    const zero = {};                                    // 全关节归零：夹爪张开、
    for (const { name } of this.revolute) zero[name] = 0;   // 臂/头归零（T-pose 由下一步覆盖）
    this._applyPose(zero, 400);
    this._setLegFrac(1);                                // 站立全伸 = 躯干竖直（z=1.54）
    this._applyPose(POSES.arms_home, 400);              // 双臂自然下垂
    this.screen(''); this.say('');
  }

  // 软复位（链内段间衔接）：**只回姿态和升降，不搬位置**——位置跳变就是"瞬间移动/穿墙"
  // 的来源（整链连跑时每段开头都 reset 的实锤）。位置交给该段 preset 的 navigate 平滑走。
  async softReset() {
    this._osc = null; this._navToken++;
    this.screen(''); this.say('');
    this._applyPose(POSES.arms_home, 500);
    this.setJointDeg('head_joint1', 0); this.setJointDeg('head_joint2', 0);
    if (this._legFrac < .99) await this.setLegHeight(LEG_STROKE.max, 900);
  }

  update(dt) {
    if (this._osc) {                                        // 振荡型手势
      const { joints, freq, dur } = this._osc;
      this._osc._t = (this._osc._t || 0) + dt;
      const phase = Math.sin(this._osc._t * freq * 2 * Math.PI);
      for (const [n, amp] of Object.entries(joints)) {
        // center 三种形态：数字（gesture nod/shake 传 0）、{关节:值} 对象（primitives oscillate）、
        // 无（gesture wave）——按关节取值；**旧实现直接拿对象做加法 → "[object Object]0.4"
        // 字符串 → NaN → 关节永久污染手臂消失（M-13 摆手 bug 实锤）**
        const c0 = this._osc.center;
        const center = typeof c0 === 'number' ? c0 : (c0?.[n] ?? POSES.wave[n] ?? 0);
        this.setJointDeg(n, center + amp * phase);
      }
      if (this._osc && this._osc._t > dur / 1000) this._osc = null;
    }
  }
}
