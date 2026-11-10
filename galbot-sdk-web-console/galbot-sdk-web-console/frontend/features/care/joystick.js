const DEADZONE = 0.04;
const EXPO = 0.75;

function shapeMagnitude(value) {
  if (value <= DEADZONE) return 0;
  const normalized = Math.min(1, (value - DEADZONE) / (1 - DEADZONE));
  return (1 - EXPO) * normalized + EXPO * normalized ** 2;
}

export class Joystick {
  /**
   * Touch joystick that continuously emits velocity commands while held.
   * `send({ vx, vy, wz })` is invoked on a fixed cadence and with zeros on release.
   */
  constructor({ pad, knob, maxLinear = 0.4, maxAngular = 0.6, send, onState, rotationQuery }) {
    this.pad = pad;
    this.knob = knob;
    this.maxLinear = maxLinear;
    this.maxAngular = maxAngular;
    this.send = send;
    this.onState = onState || (() => {});
    // MediaQueryList that matches while the whole UI is rotated 90deg (portrait mode).
    this.rotationQuery = rotationQuery || null;
    this.pointerId = null;
    this.timer = null;
    this.vx = 0;
    this.vy = 0;
    this.wz = 0;

    pad.addEventListener('pointerdown', (event) => {
      if (this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      try {
        pad.setPointerCapture(event.pointerId);
      } catch (_) { /* capture is best-effort; driving still works without it */ }
      this.update(event);
      this.startTimer();
    });
    pad.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.pointerId) this.update(event);
    });
    pad.addEventListener('pointerup', () => this.stop(true));
    pad.addEventListener('pointercancel', () => this.stop(true));
    window.addEventListener('blur', () => this.stop(true));
  }

  update(event) {
    const rect = this.pad.getBoundingClientRect();
    const max = rect.width * 0.36;
    let rawX = event.clientX - (rect.left + rect.width / 2);
    let rawY = event.clientY - (rect.top + rect.height / 2);
    if (this.rotationQuery?.matches) {
      // UI is rotated 90deg clockwise: map the viewport delta back into UI frame
      // so "push right in the rotated UI" still means forward.
      const x = rawX;
      rawX = rawY;
      rawY = -x;
    }
    const rawRadius = Math.hypot(rawX, rawY);
    const clampScale = rawRadius > max ? max / rawRadius : 1;
    const x = rawX * clampScale;
    const y = rawY * clampScale;
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    const magnitude = Math.hypot(x, y) / max;
    const speed = shapeMagnitude(magnitude) * this.maxLinear;
    this.vx = magnitude ? (-y / (magnitude * max)) * speed : 0;
    this.vy = magnitude ? (-x / (magnitude * max)) * speed : 0;
    this.onState(this);
  }

  setTurn(wz) {
    this.wz = wz;
    this.onState(this);
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.emit(), 100);
    this.emit();
  }

  emit() {
    this.send({ vx: this.vx, vy: this.vy, wz: this.wz });
  }

  isMoving() {
    return this.timer !== null || this.vx !== 0 || this.vy !== 0 || this.wz !== 0;
  }

  stop(sendZero = false) {
    const wasMoving = this.isMoving();
    clearInterval(this.timer);
    this.pointerId = null;
    this.timer = null;
    this.vx = 0;
    this.vy = 0;
    this.wz = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.onState(this);
    if (sendZero && wasMoving) this.send({ vx: 0, vy: 0, wz: 0 });
  }
}
