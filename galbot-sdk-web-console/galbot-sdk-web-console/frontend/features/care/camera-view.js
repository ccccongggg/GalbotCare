const SOURCE_IDS = { left_rgb: 1, left_depth: 2, right_rgb: 3, right_depth: 4, head_fisheye: 5 };

export class CameraView {
  /** Single-source live camera view over the binary /api/robot/camera-stream WebSocket. */
  constructor({ image, empty, status, fps = 10, stallMs = 6000 }) {
    this.image = image;
    this.empty = empty;
    this.status = status;
    this.fps = fps;
    this.stallMs = stallMs;
    this.source = null;
    this.socket = null;
    this.ready = false;
    this.active = false;
    this.lastBlob = null;
    this.lastFrameAt = 0;
    this.objectUrl = '';
    this.watchdog = null;
    document.addEventListener('visibilitychange', () => (document.hidden ? this.suspend() : this.resume()));
    window.addEventListener('pagehide', () => this.stop());
  }

  setSource(source) {
    if (this.source === source) return;
    const wanted = this.source;
    this.source = source;
    this.lastBlob = null;
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = ''; }
    this.image.removeAttribute('src');
    this.renderWaiting();
    if (this.ready) this.refresh(wanted, source);
    else if (this.active) this.connect();
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.connect();
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => this.checkStalled(), 3000);
  }

  stop() {
    this.active = false;
    clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.socket) { this.socket.close(); this.socket = null; }
    this.ready = false;
  }

  suspend() {
    if (this.socket) { this.socket.close(); this.socket = null; }
    this.ready = false;
  }

  resume() {
    if (this.active && !document.hidden) this.connect();
  }

  snapshot() {
    return this.lastBlob;
  }

  connect() {
    if (!this.active || !this.source) return;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/api/robot/camera-stream`);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.ready = true;
      this.refresh(null, this.source);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data === 'string') this.handleError(JSON.parse(event.data));
      else this.handleFrame(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      if (this.active && !document.hidden) setTimeout(() => this.connect(), 1000);
    };
  }

  refresh(previous, current) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (previous) this.socket.send(JSON.stringify({ op: 'unsubscribe', source: previous }));
    if (current) {
      this.socket.send(JSON.stringify({ op: 'subscribe', source: current, fps: this.fps }));
      this.lastFrameAt = Date.now();
    }
  }

  handleFrame(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 26 || String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'GBC1') return;
    const sourceId = view.getUint8(4);
    const isDepth = view.getUint8(5) === 1;
    const source = Object.entries(SOURCE_IDS).find(([, id]) => id === sourceId)?.[0];
    if (!source || source !== this.source || isDepth) return;
    const data = new Uint8Array(buffer, 26);
    const blob = new Blob([data], { type: 'image/jpeg' });
    this.lastBlob = blob;
    this.lastFrameAt = Date.now();
    const url = URL.createObjectURL(blob);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = url;
    this.image.src = url;
    this.empty.hidden = true;
    this.status.textContent = '实时画面';
    this.status.classList.remove('error');
  }

  handleError(message) {
    if (message.source && message.source !== this.source) return;
    this.renderWaiting(message.detail || '相机暂不可用', '无数据');
  }

  checkStalled() {
    if (!this.active || !this.source) return;
    if (this.ready && Date.now() - this.lastFrameAt > this.stallMs) {
      this.renderWaiting('画面中断，正在重连…');
      if (this.socket) { this.socket.close(); this.socket = null; }
      this.ready = false;
      this.connect();
    }
  }

  renderWaiting(message = '正在连接摄像头…', statusText = '未连接') {
    this.empty.hidden = false;
    this.empty.textContent = message;
    this.status.textContent = statusText;
    this.status.classList.add('error');
  }
}
