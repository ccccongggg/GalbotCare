// ============================================================
// main.js — 数字孪生主程序：场景 / 双视角 / 近景透视 / 演示链 C-3
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildHouse } from './house.js';
import { Robot } from './robot.js';
import { Elderly } from './elderly.js';
import { Bridge } from './protocol.js';
import { runSegment } from './primitives.js';

// ── 渲染器与色调映射（真实感核心） ──────────────────────────
const app = document.getElementById('app');
const labels = document.getElementById('labels');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#12161d');
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: '#33383f', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
scene.add(ground);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 电影感色调映射
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const css2d = new CSS2DRenderer({ element: labels });
css2d.setSize(innerWidth, innerHeight);

// ── 灯光：弱环境光 + 分区吊灯（house.js 内） + 暖色阳光 ──────
scene.add(new THREE.AmbientLight('#cfd8e8', .22));
const hemi = new THREE.HemisphereLight('#fff4e0', '#3a3f4a', .3); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe8c4', 1.2);
sun.position.set(6, 9, 4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
scene.add(sun);

// ── 户型 + 角色 ─────────────────────────────────────────────
const { tags, fadeMeshes } = buildHouse(scene);
const tagObjs = tags.map(t => {
  const div = document.createElement('div');
  div.className = 'room-tag'; div.textContent = t.name;
  const o = new CSS2DObject(div);
  o.position.set(t.x, 2.55, t.z); scene.add(o);
  return o;
});

const robot = new Robot(scene, labels);
const elderly = new Elderly(scene, labels);
robot._dyn = elderly;                     // 动态碰撞实体：导航拦截含老人占位（见 robot.blocked）

// ── 双相机（3D 透视 / 顶视正交，切换带平滑过渡） ────────────
let mode = '3d';
const cam3d = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 100);
cam3d.position.set(7.5, 7.5, 9); cam3d.lookAt(0, 0, 0);
const camTop = new THREE.OrthographicCamera(-6.4, 6.4, 5.2, -5.2, .1, 50);
camTop.position.set(0, 14, 0.001); camTop.up.set(0, 0, -1); camTop.lookAt(0, 0, 0);
let camera = cam3d;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.target.set(0, .6, 0);

const OVERVIEW = { pos: [7.5, 7.5, 9], target: [0, .6, 0] };

// ── 双人跟随：始终把机器人与老人同时框进画面 ────────────────
// 视线中心 = 两者连线中点；距离 = 按两人间距自动放大/缩小；俯角不足时抬高相机。
// flyTo 运镜期间（controls.enabled=false）暂停，落定后平滑接管。
let followBoth = true;
const btnFollow = document.getElementById('btnFollow');
btnFollow.onclick = () => {
  followBoth = !followBoth;
  btnFollow.textContent = `双人跟随 ${followBoth ? '开' : '关'}`;
};
const _fA = new THREE.Vector3(), _fB = new THREE.Vector3();
function updateFollow(dt) {
  if (!followBoth || mode !== '3d' || !controls.enabled) return;
  _fA.set(robot.pos.x, .9, robot.pos.z);                 // 机器人胸口高度
  _fB.set(elderly.pos.x, .9, elderly.pos.z);
  const mid = _fA.clone().add(_fB).multiplyScalar(.5);
  const span = _fA.distanceTo(_fB);
  const need = THREE.MathUtils.clamp(                   // 容纳两人所需的取景距离
    span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.4 + 1.8,
    2.6, 12);
  const k = Math.min(1, dt * 2.5);                      // 平滑跟随，不抢运镜
  controls.target.lerp(mid, k);
  const toCam = camera.position.clone().sub(controls.target);
  const dist = toCam.length();
  if (dist < need - .25 || dist > need + 2) {
    toCam.setLength(THREE.MathUtils.clamp(THREE.MathUtils.lerp(dist, need, k), 2.2, 13));
    camera.position.copy(controls.target).add(toCam);
  }
  const minY = toCam.length() * .42 + .7;               // 保证俯视角，避免贴地平视被墙挡
  if (camera.position.y < minY) camera.position.y += (minY - camera.position.y) * k;
}

// ── 运镜：统一缓动飞行（期间锁定轨道控制） ──────────────────
function flyTo(pos, target, ms = 1500) {
  const done = new Promise(res => {
    const c0 = camera.position.clone(), t0 = controls.target.clone();
    const c1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / ms);
      const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(c0, c1, e);
      controls.target.lerpVectors(t0, t1, e);
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  controls.autoRotate = false;
  return done;
}

// ── HUD：状态 / 日志 / 开关 ─────────────────────────────────
const pill = document.getElementById('status-pill');
const logList = document.getElementById('logList');
function setStatus(level, text) { pill.className = level; pill.textContent = text; }
function log(level, text) {
  const d = document.createElement('div');
  d.className = `item ${level}`; d.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logList.prepend(d);
  while (logList.children.length > 60) logList.lastChild.remove();
}

let autoRotate = false;
const btnRotate = document.getElementById('btnRotate');
btnRotate.onclick = () => {
  autoRotate = !autoRotate;
  controls.autoRotate = mode === '3d' && autoRotate;   // 顶视图无旋转意义，切回 3D 时恢复
  controls.autoRotateSpeed = 1.0;
  btnRotate.textContent = `自动旋转 ${autoRotate ? '开' : '关'}`;
};
const btnTags = document.getElementById('btnTags');
btnTags.onclick = () => {
  const show = !(tagObjs[0]?.visible ?? true);
  for (const t of tagObjs) t.visible = show;           // 全部房间标签，不能只切第一个
  btnTags.textContent = `标注 ${show ? '开' : '关'}`;
};

// ── 视角切换：先飞到正上方再切正交（无缝过渡） ──────────────
const btnView = document.getElementById('btnView');
btnView.onclick = async () => {
  controls.enabled = false;
  if (mode === '3d') {
    await flyTo([0.01, 16.5, 0.01], [0, 0, 0], 800);        // 透视先升到顶
    mode = 'top'; camera = camTop; controls.object = camera;
    controls.target.set(0, 0, 0);
    controls.autoRotate = false;                            // 顶视图不转（标志位保留）
    btnView.textContent = '切换 3D 视图';
  } else {
    camera = cam3d; controls.object = cam3d;                // 先对齐顶视，再飞回全景
    cam3d.position.set(0.01, 16.5, 0.01); controls.target.set(0, 0, 0);
    await flyTo(OVERVIEW.pos, OVERVIEW.target, 900);
    mode = '3d';
    controls.autoRotate = autoRotate;                       // 恢复用户设置的自动旋转
    btnView.textContent = '切换 顶视图';
  }
  controls.enabled = true;
};

// ── 近景透视：相机与注视点之间的墙自动淡化 ──────────────────
const raycaster = new THREE.Raycaster();
let fadeTimer = 0;
function updateWallFade(dt) {
  fadeTimer -= dt; if (fadeTimer > 0 || !fadeMeshes.length) return;
  fadeTimer = .12;
  if (mode !== '3d') { for (const m of fadeMeshes) m.material.opacity = 1; return; }
  const toTarget = controls.target.clone().sub(camera.position);
  const dist = toTarget.length();
  if (dist < 2.2) {                                          // 远景不透视
    for (const m of fadeMeshes) m.material.opacity = 1; return;
  }
  raycaster.set(camera.position, toTarget.normalize());
  raycaster.far = dist - .3;
  const hitSet = new Set(raycaster.intersectObjects(fadeMeshes, false).map(h => h.object));
  for (const m of fadeMeshes) {
    const goal = hitSet.has(m) ? .28 : 1;
    m.material.opacity += (goal - m.material.opacity) * .3;
  }
}

// ── 指令 API + 桥 ───────────────────────────────────────────
const api = {
  robot, elderly, status: setStatus, log, flyTo,
  reset: () => { robot.reset(); elderly.reset(); setStatus('info', '待命'); log('info', '场景已复位'); },
  // 段间软复位：不搬位置（位置跳变=瞬间移动/穿墙），只回姿态与升降
  softReset: () => robot.softReset(),
};
const bridge = new Bridge({
  conn: on => {
    document.getElementById('conn-dot').classList.toggle('on', on);
    document.getElementById('conn-text').textContent = on ? 'Python 已连接' : '未连接（本地演示可用）';
  },
  status: setStatus, log,
});
bridge.api = api;
window.__twin = { scene, robot, elderly, camera: () => camera, controls, flyTo };  // 调试句柄

// ── 关节调试面板 ────────────────────────────────────────────
const jp = document.getElementById('jointPanel');
const jrows = document.getElementById('jointRows');
const jjson = document.getElementById('jointJson');
document.getElementById('btnJoints').onclick = async () => {
  jp.classList.toggle('show');
  if (!jrows.children.length) {
    await robot.ready;
    for (const { name, min, max } of robot.revolute) {
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label'); lab.textContent = name; lab.title = name;
      const r = document.createElement('input');
      const cur = robot.robot.joints[name];
      const deg0 = Math.round(THREE.MathUtils.radToDeg(cur?.angle ?? cur?.jointValue ?? 0));
      r.type = 'range'; r.min = min; r.max = max; r.step = 1;
      r.value = THREE.MathUtils.clamp(deg0, min, max);       // 同步机器人当前姿态（垂臂等）
      const v = document.createElement('span'); v.className = 'val'; v.textContent = `${r.value}°`;
      r.oninput = () => {
        v.textContent = `${r.value}°`;
        robot.setJointDeg(name, +r.value);
        jjson.value = JSON.stringify(currentJoints(), null, 0);   // 拖动中实时更新
      };
      row.append(lab, r, v); jrows.appendChild(row);
    }
    jjson.value = JSON.stringify(currentJoints(), null, 0);
  }
};
function currentJoints() {
  const out = {};
  for (const row of jrows.children) {
    const [lab, r] = row.children;
    if (+r.value !== 0) out[lab.textContent] = +r.value;
  }
  return out;
}

// ── 演示统一入口（数据驱动：shared/chains.json） ─────────────
// 三级粒度：①单段（segBtns 按段跑）②整链 runChain ③全部任务连跑 runAll。
// 每段前 api.reset()+elderly.reset()，再由该段 preset 重建起点场景——确定性衔接。
async function runChain(c) {
  log('info', `—— 任务「${c.name}」开始（${c.segments.length} 段连续演示） ——`);
  // 链开始：老人回扶手椅。能走通就走回去（连续），跨墙才切场。
  // 最后 0.6m 不检查——椅子本体是障碍，坐姿点必然落在椅子 AABB 内。
  await elderly.home((x1, z1, x2, z2) => {
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(4, Math.ceil(L / .15));
    for (let i = 0; i <= n; i++) {
      const t = i / n * Math.max(0, 1 - .6 / Math.max(L, .6));
      if (robot._blockedStatic(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, .32)) return false;
    }
    return true;
  });
  for (const s of c.segments) {
    log('info', `▸ ${s.name}`);
    // 段间衔接**不搬位置**：旧实现每段 api.reset()/elderly.reset() 会把人和机器人
    // 直接瞬移回起点（隔着墙弹回去=穿墙观感）。改软复位：只回姿态，位置交给该段 preset 导航。
    await robot.softReset();
    await elderly.recover();               // 跌倒的就地起身（不搬位置）
    try { await runSegment(c, s, segCtx); }
    catch (e) { log('warn', `段执行异常: ${e.message}`); }
  }
  log('ok', `任务「${c.name}」演示完成`);
}
async function runAll() {
  log('info', `—— 全部 ${CHAINS.length} 个任务连续演示开始 ——`);
  for (const c of CHAINS) { chainSel.value = c.id; renderSegs(); await runChain(c); }
  log('ok', `全部 ${CHAINS.length} 个任务连续演示完成`);
}
document.getElementById('btnDemo').onclick = async () => {
  const c = CHAINS.find(x => x.id === chainSel.value);
  if (!c) return log('warn', '任务数据加载中，稍候再点');
  if (segBusy) return;
  if (mode !== '3d') { btnView.click(); await new Promise(r => setTimeout(r, 1900)); }
  segBusy = true; setSegUI(true);
  try { await runChain(c); setStatus('ok', '演示结束'); }
  finally { segBusy = false; setSegUI(false); }
};
document.getElementById('btnRunAll').onclick = async () => {
  if (segBusy || !CHAINS.length) return;
  if (mode !== '3d') { btnView.click(); await new Promise(r => setTimeout(r, 1900)); }
  segBusy = true; setSegUI(true);
  try { await runAll(); setStatus('ok', '演示结束'); }
  catch (e) { log('warn', `连跑异常: ${e.message}`); }
  finally { segBusy = false; setSegUI(false); }
};
document.getElementById('btnReset').onclick = api.reset;

// ── 任务段演示面板（长链分任务，数据：shared/chains.json） ──
let segBusy = false;
const chainSel = document.getElementById('chainSel');
const segBtns = document.getElementById('segBtns');
let CHAINS = [];
const segCtx = { robot, elderly, flyTo, status: setStatus, log };
fetch('./shared/chains.json').then(r => r.json()).then(d => {
  CHAINS = d.chains;
  chainSel.innerHTML = CHAINS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  renderSegs();
});
function setSegUI(busy) {
  segBtns.querySelectorAll('button').forEach(x => x.disabled = busy);
  document.getElementById('btnRunAll').disabled = busy;
  document.getElementById('btnDemo').disabled = busy;
}
function renderSegs() {
  const c = CHAINS.find(x => x.id === chainSel.value); if (!c) return;
  segBtns.innerHTML = '';
  const bc = document.createElement('button');        // 粒度②：当前任务整链连跑
  bc.className = 'btn primary';
  bc.textContent = `▶ 整链连跑（${c.segments.length} 段）`;
  bc.onclick = async () => {
    if (segBusy) return;
    if (mode !== '3d') { btnView.click(); await new Promise(r => setTimeout(r, 1900)); }
    segBusy = true; setSegUI(true);
    try { await runChain(c); setStatus('ok', '演示结束'); }
    finally { segBusy = false; setSegUI(false); }
  };
  segBtns.appendChild(bc);
  for (const s of c.segments) {                       // 粒度①：单段
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = s.name;
    b.onclick = async () => {
      if (segBusy) return;
      segBusy = true; setSegUI(true);
      try {
        api.reset(); elderly.reset();                 // 每段从干净场景开始
        await runSegment(c, s, segCtx);
      } catch (e) { log('warn', `段执行异常: ${e.message}`); }
      segBusy = false; setSegUI(false);
    };
    segBtns.appendChild(b);
  }
}
chainSel.onchange = renderSegs;

// ── 渲染循环 ────────────────────────────────────────────────
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  robot.update(dt);
  elderly.update(dt);
  controls.update();
  updateFollow(dt);
  updateWallFade(dt);
  renderer.render(scene, camera);
  css2d.render(scene, camera);
}
tick();
log('info', '数字孪生已就绪：点右上「演示链」或连接 Python 后端驱动');
addEventListener('resize', () => {
  cam3d.aspect = innerWidth / innerHeight; cam3d.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  css2d.setSize(innerWidth, innerHeight);
});
