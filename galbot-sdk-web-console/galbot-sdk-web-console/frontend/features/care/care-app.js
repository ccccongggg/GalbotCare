import { ConsoleClient } from '../../api/console-client.js';
import { CameraView } from './camera-view.js';
import { Joystick } from './joystick.js';

const PLACES_KEY = 'galbot_care_places';
// Remote family operation keeps conservative speed caps for safety.
const MAX_LINEAR = 0.4;
const MAX_ANGULAR = 0.6;
const VIEW_ORDER = [
  ['head_fisheye', '头部'],
  ['left_rgb', '左臂'],
  ['right_rgb', '右臂'],
];

const $ = (id) => document.getElementById(id);

function quaternionYawFromPoseArray(values) {
  if (!Array.isArray(values) || values.length < 7) return values?.[2] ?? 0;
  const [, , , qx, qy, qz, qw] = values;
  return Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
}

function poseFromSnapshot(snapshot) {
  const pose = snapshot?.pose;
  if (!Array.isArray(pose) || pose.length < 2) return null;
  if (pose.length >= 7) return { x: pose[0], y: pose[1], yaw: quaternionYawFromPoseArray(pose) };
  return { x: pose[0], y: pose[1], yaw: pose.length >= 3 ? pose[2] : 0 };
}

export class CareApp {
  constructor() {
    this.client = new ConsoleClient();
    this.liveMode = false;
    this.navPollTimer = null;
    this.navActive = false;
  }

  async boot() {
    await this.authenticate();
    $('careApp').hidden = false;
    await this.loadCapabilities();
    this.setupCamera();
    this.setupControls();
    this.setupPlaces();
    this.subscribeEvents();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.joystick?.stop(true);
    });
    this.bindImmersive();
    window.addEventListener('pagehide', () => {
      this.joystick?.stop(true);
      this.client.request('/api/commands/robot/base_velocity', {
        method: 'POST', body: JSON.stringify({ linear: [0, 0, 0], angular: [0, 0, 0], duration: 0.0, confirmed: true }),
      }).catch(() => {});
    });
  }

  // ---------- immersive APP-like behavior ----------

  bindImmersive() {
    // Block iOS pinch/double-tap zoom and desktop double-click side effects.
    ['gesturestart', 'gesturechange'].forEach((type) => {
      document.addEventListener(type, (event) => event.preventDefault());
    });
    document.addEventListener('dblclick', (event) => event.preventDefault());
    $('btnFullscreen').onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (_) {
        this.toast('当前浏览器不支持网页全屏，添加到主屏幕后体验更佳');
      }
    };
  }

  // ---------- auth ----------

  async authenticate() {
    try {
      const status = await fetch('/api/auth/status', { cache: 'no-store', credentials: 'same-origin' }).then((r) => r.json());
      if (status.authenticated) return;
    } catch (_) { /* fall through to the gate */ }
    $('authGate').hidden = false;
    await new Promise((resolve) => {
      $('authForm').onsubmit = async (event) => {
        event.preventDefault();
        const submit = $('authSubmit');
        submit.disabled = true;
        $('authError').textContent = '正在连接…';
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ code: $('authCode').value.trim() }),
          });
          if (!response.ok) throw new Error('访问码错误，请重试');
          $('authGate').hidden = true;
          // Best-effort immersive: inside the login click gesture so browsers allow it.
          try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) { /* iOS Safari */ }
          resolve();
        } catch (error) {
          $('authError').textContent = error.message;
          $('authCode').select();
        } finally {
          submit.disabled = false;
        }
      };
    });
  }

  async loadCapabilities() {
    try {
      const capabilities = await this.client.getCapabilities();
      this.liveMode = Boolean(capabilities.live_mode);
      $('modelChip').textContent = (capabilities.model || 'unknown').toUpperCase();
      this.setConnection(this.liveMode ? '已连接' : '脱机预览', true);
    } catch (error) {
      this.setConnection('连接失败', false);
      this.toast(`状态读取失败：${error.message}`);
    }
  }

  setConnection(text, ok) {
    const chip = $('connChip');
    chip.textContent = text;
    chip.classList.toggle('ok', Boolean(ok));
    chip.classList.toggle('bad', !ok);
  }

  // ---------- camera ----------

  setupCamera() {
    this.camera = new CameraView({
      image: $('videoFrame'),
      empty: $('videoEmpty'),
      status: $('videoStatus'),
    });
    this.viewIndex = 0;
    const cycleButton = $('btnViewCycle');
    const applyLabel = () => { cycleButton.textContent = `视角·${VIEW_ORDER[this.viewIndex][1]}`; };
    this.bindPress(cycleButton, () => {
      this.viewIndex = (this.viewIndex + 1) % VIEW_ORDER.length;
      this.camera.setSource(VIEW_ORDER[this.viewIndex][0]);
      applyLabel();
    });
    applyLabel();
    this.camera.setSource(VIEW_ORDER[0][0]);
    this.camera.start();
    this.bindPress($('btnPhoto'), () => this.takePhoto());
  }

  // Buttons respond on pointer-down so they work while the other thumb is
  // holding the joystick (multi-touch driving), and faster for e-stop.
  bindPress(element, handler) {
    let lastFired = 0;
    const run = (event) => {
      const now = Date.now();
      if (now - lastFired < 600) return; // dedupe pointerdown + synthetic click
      lastFired = now;
      event.preventDefault();
      handler();
    };
    element.addEventListener('pointerdown', run);
    element.addEventListener('click', run);
  }

  takePhoto() {
    const blob = this.camera?.snapshot();
    if (!blob) {
      this.toast('还没有可用画面，稍等片刻再试');
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    anchor.href = url;
    anchor.download = `galbot-${stamp}.jpg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.toast('已保存照片');
  }

  // ---------- driving ----------

  setupControls() {
    this.joystick = new Joystick({
      pad: $('joyPad'),
      knob: $('joyKnob'),
      maxLinear: MAX_LINEAR,
      maxAngular: MAX_ANGULAR,
      // Matches the CSS media query that rotates the whole UI in portrait.
      rotationQuery: window.matchMedia('(orientation: portrait) and (max-width: 820px)'),
      send: ({ vx, vy, wz }) => {
        this.client.command('robot', 'base_velocity', {
          linear: [vx, vy, 0], angular: [0, 0, wz], duration: 0.0, confirmed: true,
        }).catch((error) => this.toast(`底盘控制失败：${error.message}`));
      },
      onState: (state) => this.renderJoystickSpeed(state),
    });
    const bindTurn = (element, wz) => {
      element.addEventListener('pointerdown', () => this.joystick.setTurn(wz));
      element.addEventListener('pointerup', () => this.joystick.stop(true));
      element.addEventListener('pointercancel', () => this.joystick.stop(true));
      element.addEventListener('pointerleave', () => { if (this.joystick.wz === wz) this.joystick.stop(true); });
    };
    bindTurn($('rotLeft'), MAX_ANGULAR);
    bindTurn($('rotRight'), -MAX_ANGULAR);
    this.bindPress($('btnEStop'), () => this.doEStop());
  }

  async doEStop() {
    this.joystick?.stop(true);
    try {
      await this.client.command('robot', 'emergency_stop', {});
      this.toast(this.liveMode ? '已急停' : '脱机预览：已模拟急停');
    } catch (error) {
      this.toast(`急停失败：${error.message}`);
    }
  }

  renderJoystickSpeed(state) {
    $('speedReadout').textContent = `${Math.hypot(state.vx, state.vy).toFixed(2)} m/s`;
  }

  // ---------- events / sensors ----------

  subscribeEvents() {
    this.client.subscribe((event) => {
      if (event.type === 'robot_sensors') this.renderBattery(event.data?.bms);
      if (event.type === 'connection') this.setConnection('连接中断', false);
      if (event.type === 'service_error') this.setConnection('SDK 异常', false);
    });
  }

  renderBattery(bms = {}) {
    const chip = $('batteryChip');
    const voltage = Number(bms.voltage);
    const charging = bms.charging_status;
    const text = [
      Number.isFinite(voltage) ? `${voltage.toFixed(1)} V` : '电量未知',
      charging === true ? '充电中' : '',
    ].filter(Boolean).join(' · ');
    chip.textContent = text;
    chip.classList.toggle('ok', charging === true);
  }

  // ---------- places ----------

  setupPlaces() {
    this.renderPlaces();
    $('btnAddPlace').onclick = () => {
      $('placeName').value = '';
      $('placeDialog').showModal();
    };
    $('placeCancel').onclick = () => $('placeDialog').close();
    $('placeSave').onclick = () => this.savePlaceFromDialog();
  }

  loadPlaces() {
    try {
      return JSON.parse(localStorage.getItem(PLACES_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  savePlaces(places) {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
    this.renderPlaces();
  }

  async savePlaceFromDialog() {
    const name = $('placeName').value.trim();
    if (!name) {
      $('placeName').focus();
      return;
    }
    const manual = this.readManualPose();
    let pose = null;
    let source = '';
    try {
      pose = poseFromSnapshot(await this.client.getState());
      if (pose) source = '机器人当前位置';
    } catch (_) { /* fall back to manual coordinates */ }
    if (!pose && manual) {
      pose = manual;
      source = '手动坐标';
    }
    if (!pose) {
      this.toast('无法获取机器人当前位置，可展开“手动填坐标”输入');
      return;
    }
    $('placeDialog').close();
    const places = this.loadPlaces().filter((place) => place.name !== name);
    places.push({ id: `place-${Date.now()}`, name, ...pose });
    this.savePlaces(places);
    this.toast(`已保存「${name}」（${source}）`);
  }

  readManualPose() {
    const x = Number($('placeX').value);
    const y = Number($('placeY').value);
    const yaw = Number($('placeYaw').value || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || $('placeX').value.trim() === '' || $('placeY').value.trim() === '') return null;
    return { x, y, yaw: Number.isFinite(yaw) ? yaw : 0 };
  }

  renderPlaces() {
    const row = $('placesRow');
    row.querySelectorAll('.place-chip').forEach((item) => item.remove());
    const add = $('btnAddPlace');
    this.loadPlaces().forEach((place) => {
      const chip = document.createElement('div');
      chip.className = 'place-chip';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'place-go';
      go.textContent = place.name;
      go.onclick = () => this.goToPlace(place);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'place-remove';
      remove.setAttribute('aria-label', `删除${place.name}`);
      remove.textContent = '×';
      remove.onclick = () => {
        this.savePlaces(this.loadPlaces().filter((item) => item.id !== place.id));
        this.toast(`已删除「${place.name}」`);
      };
      chip.append(go, remove);
      row.insertBefore(chip, add);
    });
  }

  async goToPlace(place) {
    const yaw = place.yaw ?? 0;
    try {
      const result = await this.client.command('navigation', 'navigate_to_goal_v2', {
        x: place.x, y: place.y, z: 0, qx: 0, qy: 0,
        qz: Math.sin(yaw / 2), qw: Math.cos(yaw / 2),
        frame_id: 'map',
        max_velocity: [0.3, 0.2, 0.5],
        collision_check: true,
        timeout: 120,
        omni_plan: true,
      });
      if (result?.dry_run) {
        this.toast(`脱机预览：已模拟前往「${place.name}」`);
        return;
      }
      this.toast(`正在前往「${place.name}」…`);
      this.startNavigationPolling();
    } catch (error) {
      this.toast(`导航失败：${error.message}`);
    }
  }

  // ---------- navigation status ----------

  startNavigationPolling() {
    this.navActive = true;
    this.renderNavStatus('导航中…');
    clearInterval(this.navPollTimer);
    this.navPollTimer = setInterval(() => this.pollNavigation(), 2000);
    this.pollNavigation();
  }

  async pollNavigation() {
    if (!this.navActive) return;
    let status = null;
    try {
      const snapshot = await this.client.getState();
      status = String(snapshot?.status || '').toUpperCase();
    } catch (_) {
      return; // transient failure: keep polling
    }
    if (status && status !== 'IDLE') {
      this.renderNavStatus(`导航中（${status}）`);
      return;
    }
    this.stopNavigationPolling();
    this.renderNavStatus('');
    this.toast('导航任务结束，机器人已到达目标附近');
  }

  stopNavigationPolling() {
    this.navActive = false;
    clearInterval(this.navPollTimer);
    this.navPollTimer = null;
  }

  renderNavStatus(text) {
    $('navStatus').textContent = text;
  }

  // ---------- toast ----------

  toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { element.hidden = true; }, 2600);
  }
}

