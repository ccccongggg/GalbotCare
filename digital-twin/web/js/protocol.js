// ============================================================
// protocol.js — WebSocket 桥（Python 后端 ⇄ 数字孪生前端）
// 指令协议（JSON）：
//   {cmd:'status',  level:'info|ok|warn|alarm', text}
//   {cmd:'log',     level, text}
//   {cmd:'robot.nav',      x, z, faceX?, faceZ?, speed?}
//   {cmd:'robot.gesture',  name, durationMs?}
//   {cmd:'robot.pose',     joints:{名:度}, durationMs?}
//   {cmd:'robot.look',     x, z}
//   {cmd:'robot.say',      text, durationMs?}
//   {cmd:'robot.screen',   text, level?}
//   {cmd:'elderly.act',    name:'sit|stand|walk|fall|getup|wave|nod|shake|sad|dance'}
//   {cmd:'elderly.walk',   x, z, speed?}
//   {cmd:'elderly.say',    text, durationMs?}
//   {cmd:'reset'}
// ============================================================
import { runSteps } from './primitives.js';

export class Bridge {
  constructor(handlers) {
    this.handlers = handlers;         // {status, log} UI 回调
    this.onopen = () => {};
    this.ws = null;
    this._seqQ = Promise.resolve();   // seq.run 串行队列
    this._connect();
  }
  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.handlers.conn(true); this.onopen(); };
    ws.onclose = () => { this.handlers.conn(false); setTimeout(() => this._connect(), 2000); };
    ws.onmessage = ev => this.dispatch(JSON.parse(ev.data));
  }
  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  // 指令分发：api 提供 {robot, elderly, status, log, reset}
  async dispatch(msg) {
    const api = this.api; if (!api) return;
    const { cmd } = msg;
    try {
      if (cmd === 'status') return api.status(msg.level || 'info', msg.text || '');
      if (cmd === 'log') return api.log(msg.level || 'info', msg.text || '');
      if (cmd === 'reset') return api.reset();
      if (cmd === 'cam.fly') return api.flyTo(msg.pos, msg.target, msg.durationMs || 1500);
      if (cmd === 'seq.run') {                            // 串行队列：多段/预置不并发
        // 注意：必须 .catch 后再回执——否则任一步抛异常会毒化 _seqQ（rejected promise），
        // 后续所有 seq.run 永远不回执 seq.done，Python 侧 120s 超时（实测 c1 整链踩坑）
        this._seqQ = this._seqQ
          .then(() => runSteps(msg.steps, api, { params: msg.params }))
          .catch(e => api.log('warn', `序列执行异常: ${e.message}`))
          .then(() => {                                   // 回执：Python run_seq 同步等待用
            if (msg.id != null) {
              try { this.ws.send(JSON.stringify({ cmd: 'seq.done', id: msg.id })); } catch (e) {}
            }
          });
        return this._seqQ;
      }

      const [who, action] = cmd.split('.');
      if (who === 'robot') {
        switch (action) {
          case 'nav':
            await api.robot.ready;
            return api.robot.navigate(msg.x, msg.z,
              { speed: msg.speed, face: msg.faceX != null ? { x: msg.faceX, z: msg.faceZ } : null });
          case 'gesture':
            await api.robot.ready;
            return api.robot.gesture(msg.name, msg.durationMs);
          case 'pose':
            await api.robot.ready;
            return api.robot._applyPose(msg.joints || {}, msg.durationMs || 500);
          case 'look':
            await api.robot.ready;
            return api.robot.lookAt(msg.x, msg.z);
          case 'say': return api.robot.say(msg.text, msg.durationMs);
          case 'screen': return api.robot.screen(msg.text, msg.level);
        }
      }
      if (who === 'elderly') {
        await api.elderly.ready;
        switch (action) {
          case 'act': return api.elderly.act(msg.name);
          case 'walk': return api.elderly.walkTo(msg.x, msg.z, msg.speed);
          case 'say': return api.elderly.say(msg.text, msg.durationMs);
        }
      }
      api.log('warn', `未知指令: ${cmd}`);
    } catch (e) {
      api.log('warn', `指令执行异常: ${cmd} — ${e.message}`);
    }
  }
}
