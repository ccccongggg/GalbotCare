// ============================================================
// elderly.js — 虚拟老人角色（Quaternius 通用骨架 + 顶点染色）
// 模型：Universal Animation Library（CC0，46 个动画，单文件骨骼兼容）
// 外观：素色 Mannequin → 按骨骼权重给顶点染"服装/肤色"，隐藏关节标记，
//       呈现低多边形老人形象；后续可无损替换 Mixamo 老年角色（改 clip 映射即可）。
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// 语义动作 → 模型 clip 名（换模型时只改这张表）
const ACTION_NAMES = {
  idle:  ['Idle_Loop'],
  walk:  ['Walk_Loop'],
  run:   ['Jog_Fwd_Loop'],
  sit:   ['Sitting_Idle_Loop'],
  fall:  ['Death01'],              // 跌倒（单次）
  wave:  ['Interact'],             // 抬手回应（单次）
  talk:  ['Idle_Talking_Loop'],    // 说话体态（循环）
  dance: ['Dance_Loop'],
};

// 骨骼 → 身体部位颜色（老人：开衫 + 深色长裤 + 肤色头手）
const PART_COLORS = [
  [/^(DEF-head|DEF-neck)$/,            '#d9a678'],  // 肤色
  [/^DEF-hand/,                        '#d9a678'],  // 手
  [/^(DEF-shoulder|DEF-upper_arm|DEF-forearm)$/, '#8a7a63'], // 开衫袖
  [/^DEF-spine/,                       '#93866f'],  // 开衫躯干
  [/^DEF-hips$/,                       '#6a6257'],  // 腰带
  [/^(DEF-thigh|DEF-shin)$/,           '#565d66'],  // 长裤
  [/^DEF-foot/,                        '#3a3f45'],  // 鞋
  [/.*/,                               '#8a8a8a'],  // 兜底
];

function colorizeByBones(skinJoints, geometry) {
  const skin = geometry.attributes.skinIndex, w = geometry.attributes.skinWeight;
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (w.getComponent(i, k) > bw) { bw = w.getComponent(i, k); best = skin.getComponent(i, k); }
    const boneName = skinJoints[best] || '';
    for (const [re, hex] of PART_COLORS) if (re.test(boneName)) { c.set(hex).multiplyScalar(.82); break; }
    const j = 0.94 + Math.random() * 0.06;           // 布料噪点
    colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// 落座锚点（实测：坐姿动画臀部在模型原点上方 0.489m、正后方 0.299m，坐垫顶约 0.47m）。
// 因此原点放在坐垫中心沿面朝方向前移 0.30m，臀部刚好落坐垫、腿自然垂在椅前。
const SEAT = { chair: { x: -1.7, z: -2.3 }, yawDeg: 215, forward: 0.30 };

export class Elderly {
  constructor(scene, cssRoot) {
    this.scene = scene;
    this.yawOffset = 0;            // 模型正面朝局部 +Z（实测坐姿骨骼位置确认），无需补偿
    this.seatYaw = THREE.MathUtils.degToRad(SEAT.yawDeg);
    this.pos = this._seatPos();
    this.yaw = this.seatYaw;
    this.onEvent = () => {};
    this._bubble = this._makeBubble(cssRoot);
    this.ready = new Promise((res, rej) => {
      new GLTFLoader().load('./assets_elderly/elderly.gltf',
        async g => { await this._setup(g); res(this); },
        undefined, rej);
    });
  }

  // 坐姿原点 = 椅子中心沿椅子朝向前移 forward
  _seatPos() {
    const fwd = SEAT.forward;
    return new THREE.Vector3(
      SEAT.chair.x + Math.sin(this.seatYaw) * fwd, 0,
      SEAT.chair.z + Math.cos(this.seatYaw) * fwd);
  }

  async _setup(gltf) {
    this.model = gltf.scene;
    const clips = gltf.animations;
    const findClip = names => clips.find(c => names.some(n => c.name.toLowerCase() === n.toLowerCase()));

    gltf.scene.traverse(o => {
      if (o.isSkinnedMesh || o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m.name === 'M_Joints') o.visible = false; });   // 隐藏关节标记
      }
    });
    // 顶点染色（按蒙皮骨骼权重判断身体部位；骨骼名从 skeleton 取）
    gltf.scene.traverse(o => {
      if (o.isSkinnedMesh && o.geometry.attributes.skinIndex && o.geometry.attributes.skinWeight) {
        const jointNames = o.skeleton.bones.map(b => b.name);
        colorizeByBones(jointNames, o.geometry);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.name === 'M_Main' || (!m.name && m.isMeshStandardMaterial)) {
            m.vertexColors = true; m.color.set('#ffffff'); m.roughness = .9;
          }
        });
      }
    });

    // 原始模型单位不一，按包围盒归一化到 1.65m 身高。
    // glb 网格是异步流式挂载的，必须等包围盒"连续多次稳定"再定比例，
    // 否则 early-return 时包围盒极小 → 缩放爆炸成巨人。
    await new Promise(res => {
      let prev = 0, stable = 0;
      const check = () => {
        const b = new THREE.Box3().setFromObject(this.model);
        const h = isFinite(b.max.y) ? b.max.y - b.min.y : 0;
        if (h > .3 && Math.abs(h - prev) < .005) { if (++stable >= 3) return res(); }
        else stable = 0;
        prev = h; setTimeout(check, 150);
      };
      check();
    });
    const bb = new THREE.Box3().setFromObject(this.model);
    this.model.scale.setScalar(1.65 / Math.max(.01, bb.max.y - bb.min.y));
    // 蒙皮模型缩放后骨骼包围球不自动更新，强制刷新避免动画投影/裁剪异常
    this.model.traverse(o => {
      if (o.isSkinnedMesh) { o.computeBoundingSphere?.(); o.geometry.computeBoundingSphere(); }
    });

    // wrapper 负责平面位置与朝向，模型本体只管动画
    this.wrapper = new THREE.Group();
    this.wrapper.position.copy(this.pos);
    this.wrapper.rotation.y = this.yaw + this.yawOffset;
    this.wrapper.add(this.model);
    this.scene.add(this.wrapper);
    this._bubble.position.set(0, 1.75, 0);
    this.wrapper.add(this._bubble);

    // 动画
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, names] of Object.entries(ACTION_NAMES)) {
      const clip = findClip(names);
      if (clip) {
        const a = this.mixer.clipAction(clip);
        if (key === 'fall' || key === 'wave') { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
        this.actions[key] = a;
      }
    }
    // 单次动作播完自动回 idle；跌倒保持躺地
    this.mixer.addEventListener('finished', e => {
      const name = Object.keys(this.actions).find(k => this.actions[k] === e.action);
      if (name === 'fall') { this._fallen = true; return; }
      if (name === 'wave') this.play('idle');
    });
    this.play('sit');                               // 初始坐在扶手椅上
  }

  _makeBubble(cssRoot) {
    const div = document.createElement('div');
    div.className = 'bubble elderly';
    cssRoot.appendChild(div);
    const o = new CSS2DObject(div);
    o.visible = false;                // 初始隐藏必须走 visible（display 会被 renderer 覆盖）
    return o;
  }

  play(name, opts = {}) {
    const next = this.actions[name]; if (!next) return;
    if (this._current === next && !opts.restart) return;
    if (next.timeScale < 0) next.timeScale = 1;
    if (this._current) this._current.fadeOut(.25);
    next.reset();
    next.fadeIn(.25).play();
    this._current = next;
    if (name !== 'fall') this._fallen = false;
  }

  // 语义动作：fall = 跌倒并保持躺地；getup = 倒放 fall 实现起身
  act(name) {
    if (name === 'fall') { this.play('fall', { restart: true }); this.onEvent({ type: 'elderly_fell' }); return; }
    if (name === 'getup') {
      const a = this.actions.fall;
      if (a) { a.paused = false; a.timeScale = -1; a.reset(); a.time = a.getClip().duration; a.play(); this._current = a; }
      this._fallen = false;
      this.onEvent({ type: 'elderly_getup' }); return;
    }
    if (this._fallen && ['wave', 'nod', 'shake', 'talk'].includes(name)) return;  // 躺地时不播全身动作
    if (name === 'talk') { this.play('talk'); return; }
    if (['wave', 'nod', 'shake'].includes(name)) { this.play('wave', { restart: true }); return; }
    this.play(name);
  }

  // 移动到目标点（米/秒），返回 Promise
  walkTo(x, z, speed = 0.9) {
    return new Promise(res => {
      if (!this.actions.walk) { this.pos.set(x, 0, z); return res(); }
      this.play('walk');
      const from = this.pos.clone();
      const dir = new THREE.Vector3(x - from.x, 0, z - from.z);
      const dist = dir.length();
      if (dist < .05) { this.play('idle'); return res(); }
      dir.normalize();
      const targetYaw = Math.atan2(dir.x, dir.z) + this.yawOffset;
      const dur = dist / speed * 1000;
      const start = performance.now();
      const yaw0 = this.wrapper.rotation.y;
      let dYaw = targetYaw - yaw0;
      while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
      while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
      const step = now => {
        const t = Math.min(1, (now - start) / dur);
        this.wrapper.rotation.y = yaw0 + dYaw * Math.min(1, t * 4);   // 前 1/4 完成转身
        this.pos.lerpVectors(from, new THREE.Vector3(x, 0, z), t);
        this.wrapper.position.copy(this.pos);
        if (t < 1) requestAnimationFrame(step);
        else { this.play('idle'); res(); }
      };
      requestAnimationFrame(step);
    });
  }

  say(text, durationMs = 4000) {
    // 隐藏走 _bubble.visible（CSS2DRenderer 每帧按 visible 重写 display，改 display 会被覆盖）
    const el = this._bubble.element;
    el.textContent = text;
    this._bubble.visible = true;
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => { this._bubble.visible = false; }, durationMs);
  }

  reset() {
    this._fallen = false;
    this.pos = this._seatPos(); this.yaw = this.seatYaw;
    if (this.wrapper) { this.wrapper.position.copy(this.pos); this.wrapper.rotation.y = this.yaw + this.yawOffset; }
    this._bubble.visible = false;
    this.play('sit');
  }

  // 段间恢复（链内衔接）：**不搬位置**——旧实现每段 reset() 把人瞬移回椅子（=人物瞬移）。
  // 只做一件事：躺地的就地站起来（倒放跌倒动画），位置留给该段 preset 的 walk 决定。
  async recover() {
    this._bubble.visible = false;
    if (!this.wrapper || !this._fallen) return;
    this.act('getup');
    await new Promise(r => setTimeout(r, 1200));
  }

  // 链开始复位：回扶手椅坐下。能走通（pathFree 给出的墙/家具检查通过）→ 走过去坐下（连续）；
  // 走不通才切场（老人没有碰撞层，放任走会穿墙——宁可切场也不穿模）。
  // pathFree(x1,z1,x2,z2) 由 main.js 注入（复用 robot._blockedStatic 的墙体/家具真值）。
  async home(pathFree) {
    const seat = this._seatPos();
    const d = Math.hypot(seat.x - this.pos.x, seat.z - this.pos.z);
    this._bubble.visible = false;
    if (!this.wrapper) return;
    const canWalk = pathFree ? pathFree(this.pos.x, this.pos.z, seat.x, seat.z) : d < 2.2;
    if (!canWalk) return this.reset();
    if (this._fallen) { this.act('getup'); await new Promise(r => setTimeout(r, 1200)); }
    await this.walkTo(seat.x, seat.z, 0.9);
    this.play('sit');
  }

  update(dt) { this.mixer?.update(dt); }

  // 动态碰撞占位（robot.blocked 每帧并入，防机器人穿人/压身——实锤过倒地身体
  // 延伸 0.5m+ 会进入机器人底盘范围）：站/坐=半径 0.4 圆；倒地=半径 0.9 保守圆
  // （实测倒地 AABB 1.73×1.04，倒向随走路朝向变化，圆比旋转 AABB 可靠）
  occupancy() {
    return [{ x: this.pos.x, z: this.pos.z, r: this._fallen ? 0.9 : 0.4 }];
  }
}
