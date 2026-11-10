// ============================================================
// lab.js — 动作调试台：机器人单独界面，逐个模块演示
// 每个动作 = motions.json 的原语序列 = 真机 SDK 调用（同源同序）
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Robot } from './robot.js';
import { runMotion } from './primitives.js';

const app = document.getElementById('app');
const labels = document.getElementById('labels');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1117');
scene.fog = new THREE.Fog('#0d1117', 8, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);
const css2d = new CSS2DRenderer({ element: labels });
css2d.setSize(innerWidth, innerHeight);

// ── 摄影棚舞台：地面 + 网格 + 三点布光 ─────────────────────
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: '#1a1f28', roughness: .9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(12, 24, '#2a3040', '#1c2230');
grid.position.y = .005; scene.add(grid);

scene.add(new THREE.AmbientLight('#cfd8e8', .35));
const key = new THREE.DirectionalLight('#fff2dd', 1.6);
key.position.set(3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = .02;
scene.add(key);
const rim = new THREE.DirectionalLight('#7fb3ff', .5); rim.position.set(-4, 3, -4); scene.add(rim);

// ── 机器人（只有它） ───────────────────────────────────────
const robot = new Robot(scene, labels);
robot.noColliders = true;        // 空摄影棚无户型：关闭户型碰撞层与 A*（否则前进/后退被"规划"跑偏）
robot.pos.set(0, 0, 0); // 舞台中心（加载后 wrapper 建好时生效）

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .05, 60);
camera.position.set(2.4, 1.7, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, .8, 0);
controls.enableDamping = true; controls.dampingFactor = .08;

const pill = document.getElementById('status-pill');
const setStatus = (lv, t) => { pill.className = lv; pill.textContent = t; };
const sdkList = document.getElementById('sdkList');
function log(level, text) {
  const d = document.createElement('div');
  d.className = `item ${level}`; d.textContent = text;
  sdkList.prepend(d);
  while (sdkList.children.length > 120) sdkList.lastChild.remove();
}

// 机器人加载完成后再定舞台位置（wrapper 建于 _load 内）
robot.ready.then(async () => {
  robot.pos.set(0, 0, 0); robot.yaw = THREE.MathUtils.degToRad(20);
  robot.wrapper.position.copy(robot.pos);
  robot.wrapper.rotation.y = robot.yaw;
  await robot._applyPose(robot.POSES?.arms_home || { left_arm_joint2: -90, right_arm_joint2: 90 }, 800);
  setStatus('info', '待命 — 点左侧模块执行');
  log('ok', 'URDF 就绪：33 个可动关节，调试台可跑全部模块');
});

// ── 模块列表 ───────────────────────────────────────────────
let busy = false, runningBtn = null;
const list = document.getElementById('motionList');
const detail = document.getElementById('detail');
const MOTIONS = new Map();

fetch('./shared/motions.json').then(r => r.json()).then(d => {
  let lastGroup = '';
  for (const m of d.motions) {
    MOTIONS.set(m.id, m);
    if (m.group !== lastGroup) {
      const h = document.createElement('h4');
      h.textContent = m.group === 'module' ? '── 动作模块 ──' : '── 说话体态 ──';
      list.appendChild(h); lastGroup = m.group;
    }
    const b = document.createElement('button');
    b.className = 'mbtn' + (m.disabled ? ' disabled' : '');
    b.innerHTML = `<b>${m.id}</b> ${m.name}<small>${m.duration || ''}${m.disabled ? ' ｜ ' + m.desc.slice(0, 18) : ''}</small>`;
    b.onclick = () => runOne(m, b);
    b.onmouseenter = () => showDetail(m);
    list.appendChild(b);
  }
  log('info', `已加载 ${d.motions.length} 个模块定义（shared/motions.json）`);
});

function showDetail(m) {
  document.getElementById('dTitle').textContent = `${m.id} ${m.name}`;
  document.getElementById('dDesc').textContent = m.desc;
  document.getElementById('dSdk').textContent = m.sdk;
  detail.classList.add('show');
}

const ctx = { robot, elderly: null, flyTo: null, status: setStatus, log };
window.__lab = { robot, camera, controls };   // 调试句柄

async function runOne(m, btn) {
  if (busy) return;
  if (m.disabled) { log('warn', `${m.id} ${m.disabled ? '默认关闭/已取消' : ''} — ${m.desc}`); return; }
  busy = true; runningBtn = btn; btn.classList.add('running');
  setStatus('info', `执行中：${m.id} ${m.name}`);
  try {
    await runMotion(m, ctx);
    setStatus('ok', `完成：${m.id} ${m.name}`);
    log('ok', `${m.id} 执行完毕`);
  } catch (e) {
    setStatus('warn', `异常：${e.message}`);
    log('warn', `${m.id} 异常: ${e.message}`);
  }
  btn.classList.remove('running');
  busy = false; runningBtn = null;
}

document.getElementById('btnStop').onclick = () => {
  robot.stopAll();
  setStatus('warn', 'M-01 急停已执行');
  log('warn', 'stop_base() + stop_navigation() + stop_trajectory_execution()');
};
document.getElementById('btnReset').onclick = () => {
  robot.stopAll();
  robot.reset();
  robot.pos.set(0, 0, 0); robot.yaw = THREE.MathUtils.degToRad(20);
  robot.wrapper.position.copy(robot.pos); robot.wrapper.rotation.y = robot.yaw;
  setStatus('info', '待命'); log('info', '已复位（关节归零、位置回舞台中心）');
};

// ── 渲染循环 ────────────────────────────────────────────────
const clock = new THREE.Clock();
(function tick() {
  requestAnimationFrame(tick);
  robot.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
  css2d.render(scene, camera);
})();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  css2d.setSize(innerWidth, innerHeight);
});
