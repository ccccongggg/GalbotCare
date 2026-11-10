// ============================================================
// house.js — 数据驱动户型场景（数组定义 + 程序化生成）
// 坐标约定：米，XZ 平面为地面，Y 向上。户型 10m × 8m，中心在原点。
// V2：踢脚线 / 门扇 / 窗帘 / 吊灯暖光 / 家具细节 / 故事道具 / 可透视墙面
// ============================================================
import * as THREE from 'three';

// ── 户型数据：改这里即可改布局 ──────────────────────────────
export const ROOMS = [
  { name: '客厅',   x1: -5, z1: -4, x2: 1.2, z2: 1.2,  floor: 'wood', wall: '#e9e0d2', light: '#ffd9a0' },
  { name: '卧室',   x1: -5, z1: 1.2, x2: -0.5, z2: 4,   floor: 'wood', wall: '#e3ddda', light: '#ffd9a0' },
  { name: '卫生间', x1: -0.5, z1: 1.2, x2: 2, z2: 4,     floor: 'tile', wall: '#dfe8ea', light: '#eaf4ff' },
  { name: '餐厨',   x1: 1.2, z1: -4, x2: 5,  z2: 4,      floor: 'tile', wall: '#e5e2da', light: '#fff2d9' },
];

export const WALLS = [
  // 外墙
  { p1: [-5, -4], p2: [5, -4], openings: [
      { at: 1.5, w: 1.0, h: 2.1, type: 'door' },
      { at: 8.0, w: 1.6, h: 1.3, type: 'window', sill: 0.9 } ] },
  { p1: [-5, 4], p2: [5, 4], openings: [
      { at: 2.0, w: 2.0, h: 1.3, type: 'window', sill: 0.9 },
      { at: 7.5, w: 1.6, h: 1.3, type: 'window', sill: 0.9 } ] },
  { p1: [-5, -4], p2: [-5, 4], openings: [
      { at: 5.0, w: 1.8, h: 1.3, type: 'window', sill: 0.9 } ] },
  { p1: [5, -4], p2: [5, 4], openings: [
      { at: 3.5, w: 2.2, h: 1.3, type: 'window', sill: 0.9 } ] },
  // 内墙
  { p1: [-5, 1.2], p2: [1.2, 1.2], openings: [
      { at: 2.0, w: 0.9, h: 2.1, type: 'door' },
      { at: 5.9, w: 0.8, h: 2.1, type: 'door' } ] },
  { p1: [-0.5, 1.2], p2: [-0.5, 4], openings: [] },
  { p1: [1.2, -4], p2: [1.2, 4], openings: [
      { at: 2.2, w: 1.8, h: 2.2, type: 'pass' } ] },
];

// ── 程序化贴图（零外部图片） ────────────────────────────────
function canvasTex(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTex() {
  return canvasTex((g, w, h) => {
    g.fillStyle = '#b98d5f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgb(${168 + Math.random() * 24 | 0},${118 + Math.random() * 20 | 0},${70 + Math.random() * 18 | 0})`;
      g.fillRect(0, y, w, 30);
      g.strokeStyle = '#00000022'; g.strokeRect(0, y, w, 30);
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = `rgba(60,35,15,${0.04 + Math.random() * 0.08})`; g.beginPath();
        const yy = y + Math.random() * 30;
        g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + 3, w * .6, yy - 3, w, yy); g.stroke();
      }
    }
  });
}
function tileTex() {
  return canvasTex((g, w, h) => {
    g.fillStyle = '#cfd6d4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      g.fillStyle = Math.random() > .5 ? '#c9d2cf' : '#d4dcd9';
      g.fillRect(x + 2, y + 2, 60, 60);
      g.strokeStyle = '#00000018'; g.strokeRect(x + 2, y + 2, 60, 60);
    }
  });
}
function rugTex() {
  return canvasTex((g, w, h) => {
    g.fillStyle = '#a98f7d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a705c'; g.lineWidth = 10;
    g.strokeRect(10, 10, w - 20, h - 20); g.strokeRect(34, 34, w - 68, h - 68);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(255,240,220,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// ── 家具工厂（默认朝 +Z，可 yaw 旋转） ──────────────────────
const M = (color, rough = .8, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
function cushion(w, d, mat, x, y, z, squash = .5) {     // 圆角软垫（压扁的胶囊体）
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(Math.min(w, d) / 2, Math.abs(w - d) / 2, 4, 8), mat);
  m.rotation.x = Math.PI / 2; m.scale.set(1, 1, squash);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
export const FURNITURE = {
  bed: () => {
    const g = new THREE.Group();
    g.add(box(1.5, .28, 2.0, M('#8d6e63'), 0, .14, 0));
    g.add(box(1.44, .18, 1.9, M('#f5f1e8'), 0, .34, 0));                       // 床垫
    g.add(box(1.44, .14, 1.25, M('#c65f4e'), 0, .45, .3));                     // 毯子
    g.add(box(1.44, .05, .3, M('#b04f3f'), 0, .49, .82));                      // 毯子翻边
    g.add(box(.6, .12, .35, M('#fdfdf6'), -.35, .5, -.72));                    // 枕头
    g.add(box(.6, .12, .35, M('#fdfdf6'), .35, .5, -.72));
    g.add(box(1.5, .85, .1, M('#795548'), 0, .42, -1.02));                     // 床头板
    return g;
  },
  nightstand: () => { const g = new THREE.Group();
    g.add(box(.45, .5, .45, M('#8d6e63'), 0, .25, 0));
    g.add(box(.36, .12, .02, M('#a1887f'), 0, .32, .23));                      // 抽屉
    g.add(cyl(.015, .05, M('#d7ccc8'), 0, .32, .25));
    g.add(cyl(.12, .03, M('#ffee58'), 0, .53, 0));                             // 台灯座
    g.add(cyl(.09, .14, M('#fff3d6'), 0, .62, 0, 12));                         // 灯罩
    g.add(box(.12, .04, .08, M('#c62828'), .12, .53, .1));                     // 药盒
    return g; },
  wardrobe: () => { const g = new THREE.Group();
    g.add(box(1.6, 2.0, .55, M('#8d6e63'), 0, 1.0, 0));
    g.add(box(.02, 1.7, .03, M('#4e342e'), 0, 1.0, .29));
    g.add(cyl(.02, .18, M('#d7ccc8'), -.1, 1.0, .3)); g.add(cyl(.02, .18, M('#d7ccc8'), .1, 1.0, .3));
    return g; },
  sofa: () => { const g = new THREE.Group();
    g.add(box(1.9, .4, .85, M('#a1887f'), 0, .2, 0));
    g.add(box(1.9, .55, .22, M('#8d6e63'), 0, .6, -.32));
    g.add(box(.22, .28, .85, M('#8d6e63'), -.84, .52, 0));
    g.add(box(.22, .28, .85, M('#8d6e63'), .84, .52, 0));
    g.add(cushion(1.62, .62, M('#bcaaa4'), 0, .43, .05));                      // 坐垫
    g.add(cushion(.44, .16, M('#d7ccc8'), -.45, .72, -.18, .3));               // 靠枕
    g.add(cushion(.44, .16, M('#c17b5c'), .48, .72, -.14, .3));
    return g; },
  armchair: () => { const g = new THREE.Group();
    g.add(box(.68, .4, .7, M('#c17b5c'), 0, .2, 0));
    g.add(box(.68, .58, .2, M('#a5603f'), 0, .58, -.25));
    g.add(box(.14, .3, .7, M('#a5603f'), -.28, .53, 0));
    g.add(box(.14, .3, .7, M('#a5603f'), .28, .53, 0));
    g.add(cushion(.5, .5, M('#d99a72'), 0, .43, .02));
    return g; },
  cane: () => { const g = new THREE.Group();                                  // 拐杖
    const stick = cyl(.02, .95, M('#6d4c41'), 0, .475, 0);
    g.add(stick);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.07, .016, 8, 16, Math.PI), M('#5d4037'));
    handle.position.set(0, .95, 0); handle.rotation.z = Math.PI / 2; handle.castShadow = true;
    g.add(handle);
    g.add(cyl(.035, .02, M('#4e342e'), 0, .01, 0));                            // 防滑脚垫
    return g; },
  coffeeTable: () => { const g = new THREE.Group();
    g.add(box(1.0, .05, .55, M('#6d4c41'), 0, .38, 0));
    [[-.42, -.2], [.42, -.2], [-.42, .2], [.42, .2]].forEach(([x, z]) => g.add(box(.05, .38, .05, M('#5d4037'), x, .19, z)));
    g.add(cyl(.04, .07, M('#eceff1'), .2, .44, .05, 12));                      // 茶杯
    g.add(cyl(.045, .008, M('#78909c'), .2, .476, .05, 12));
    g.add(box(.16, .02, .1, M('#37474f'), -.25, .42, 0));                      // 遥控器
    return g; },
  tv: () => { const g = new THREE.Group();
    g.add(box(1.4, .45, .4, M('#5d4037'), 0, .22, 0));
    g.add(box(.02, .02, .02, M('#212121'), 0, .95, 0));
    const screenMat = new THREE.MeshStandardMaterial({ color: '#0d2137',
      emissive: '#4d8fd6', emissiveIntensity: .9, roughness: .3 });
    g.add(box(1.25, .72, .06, M('#111111'), 0, .95, 0));
    const scr = box(1.19, .66, .01, screenMat, 0, .95, .045); scr.castShadow = false;
    g.add(scr);
    return g; },
  diningTable: () => { const g = new THREE.Group();
    g.add(box(1.3, .06, .8, M('#8d6e63'), 0, .72, 0));
    [[-.55, -.3], [.55, -.3], [-.55, .3], [.55, .3]].forEach(([x, z]) => g.add(box(.06, .72, .06, M('#6d4c41'), x, .36, z)));
    g.add(cyl(.05, .09, M('#fafafa'), -.2, .79, .1, 12));                      // 碗
    g.add(cyl(.05, .09, M('#fafafa'), .15, .79, -.05, 12));
    return g; },
  chair: () => { const g = new THREE.Group();
    g.add(box(.44, .05, .44, M('#8d6e63'), 0, .45, 0));
    g.add(box(.44, .5, .05, M('#8d6e63'), 0, .7, -.2));
    [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]].forEach(([x, z]) => g.add(box(.05, .45, .05, M('#6d4c41'), x, .22, z)));
    return g; },
  counter: () => { const g = new THREE.Group();
    g.add(box(.62, .85, 3.2, M('#90a4ae'), 0, .43, 0));
    g.add(box(.68, .05, 3.26, M('#eceff1'), 0, .88, 0));
    g.add(box(.5, .35, .5, M('#607d8b'), 0, 1.35, -1.0));
    g.add(cyl(.08, .25, M('#b0bec5'), 0, 1.02, .8));
    return g; },
  fridge: () => { const g = new THREE.Group();
    g.add(box(.7, 1.7, .68, M('#cfd8dc'), 0, .85, 0));
    g.add(box(.03, .5, .04, M('#78909c'), .33, 1.2, .3));
    g.add(box(.5, .02, .02, M('#90a4ae'), 0, .8, .35));                        // 分缝
    return g; },
  toilet: () => { const g = new THREE.Group();
    g.add(box(.4, .42, .62, M('#fafafa'), 0, .21, .08));
    g.add(cyl(.2, .12, M('#fafafa'), 0, .46, .1));
    g.add(box(.42, .5, .18, M('#f5f5f5'), 0, .5, -.32));
    g.add(cyl(.03, .12, M('#b0bec5'), .1, .78, -.32));                         // 冲水钮
    return g; },
  sink: () => { const g = new THREE.Group();
    g.add(box(.5, .12, .4, M('#fafafa'), 0, .78, 0));
    g.add(cyl(.07, .2, M('#b0bec5'), 0, .92, -.12));
    g.add(box(.5, .6, .1, M('#e0e0e0'), 0, .45, -.2));
    g.add(cyl(.06, .02, M('#90caf9'), 0, .85, .05, 12));                       // 水盆
    return g; },
  grabBar: () => { const g = new THREE.Group();
    g.add(cyl(.02, .7, M('#ffb300'), 0, .8, 0)); g.children[0].rotation.z = Math.PI / 2;
    return g; },
  plant: () => { const g = new THREE.Group();
    g.add(cyl(.16, .3, M('#a1887f'), 0, .15, 0));
    g.add(cyl(.13, .04, M('#8d6e63'), 0, .31, 0));
    const leafMat = M('#3d8b40', .95);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.11 + Math.random() * .05, 8, 6), leafMat);
      leaf.position.set((Math.random() - .5) * .24, .5 + Math.random() * .3, (Math.random() - .5) * .24);
      leaf.scale.y = .75; leaf.castShadow = true; g.add(leaf);
    } return g; },
  rug: () => { const g = new THREE.Group();
    const t = rugTex(); t.repeat.set(1, 1);
    const m = box(2.2, .015, 1.6, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.castShadow = false; g.add(m);
    return g; },
  floorLamp: () => { const g = new THREE.Group();
    g.add(cyl(.15, .03, M('#5d4037'), 0, .015, 0));
    g.add(cyl(.02, 1.4, M('#8d6e63'), 0, .7, 0));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.18, .22, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: '#ffe0b2', side: THREE.DoubleSide, emissive: '#ffdf9e', emissiveIntensity: .35 }));
    shade.position.y = 1.48; g.add(shade);
    const light = new THREE.PointLight('#ffd28a', 5, 4); light.position.y = 1.4; g.add(light);
    return g; },
};

export const FURNITURE_LIST = [
  // 客厅（x -5..1.2, z -4..1.2）
  { type: 'rug',         x: -2.6, z: -0.9, yaw: 0 },
  { type: 'sofa',        x: -4.35, z: -1.4, yaw: 90 },   // 背靠西墙，面朝东
  { type: 'coffeeTable', x: -3.15, z: -1.4, yaw: 90 },
  { type: 'tv',          x: -3.4, z: 0.82, yaw: 180 },   // 靠内墙，屏幕朝客厅
  { type: 'armchair',    x: -1.7, z: -2.3, yaw: 215 },   // 老人椅：面朝东南（与老人朝向一致）
  { type: 'cane',        x: -1.15, z: -1.75, yaw: 20 },
  { type: 'plant',       x: -4.55, z: -3.5, yaw: 0 },
  { type: 'plant',       x: 0.6,  z: -3.5, yaw: 0 },
  { type: 'floorLamp',   x: -4.5, z: 0.4, yaw: 0 },
  // 卧室（x -5..-0.5, z 1.2..4）
  { type: 'bed',         x: -4.1, z: 2.95, yaw: 0 },     // 长边沿 Z，床头靠南内墙，不穿西墙
  { type: 'nightstand',  x: -4.55, z: 1.62, yaw: 0 },
  { type: 'wardrobe',    x: -2.6, z: 3.6, yaw: 180 },
  // 卫生间（x -0.5..2, z 1.2..4）
  { type: 'toilet',      x: 1.4,  z: 3.3, yaw: 180 },
  { type: 'sink',        x: 0.15, z: 3.55, yaw: 180 },
  { type: 'grabBar',     x: 0.75, z: 3.8, yaw: 90 },
  // 餐厨（x 1.2..5, z -4..4）
  { type: 'counter',     x: 4.62, z: -2.2, yaw: 0 },     // 长边沿 Z 贴东墙（原 -90 横穿墙 1.26m）
  { type: 'fridge',      x: 4.55, z: 0.6, yaw: -90 },
  { type: 'diningTable', x: 3.0,  z: -2.4, yaw: 0 },
  { type: 'chair',       x: 2.6,  z: -1.7, yaw: 180 },
  { type: 'chair',       x: 3.4,  z: -3.1, yaw: 0 },
];

// ── 物理碰撞（2D 拦截层）────────────────────────────────────
// 机器人移动是确定性动画，不接物理引擎；navigate/moveRel 位移前按本表做
// 圆(机器人半径≈0.28m)-AABB 检测，被阻挡时分轴滑动/止步——与真机避障行为一致，
// 防止穿墙穿家具。改家具布局后 COLLIDERS 自动跟随 FURNITURE_LIST/WALLS。
const FURN_SOLID = {                                          // 阻挡性家具 footprint（局部 w×d）
  sofa:[1.9,.85], bed:[1.5,2.0], wardrobe:[1.6,.55], counter:[.68,3.2], fridge:[.7,.68],
  diningTable:[1.3,.8], coffeeTable:[1.0,.55], tv:[1.4,.4], armchair:[.68,.7],
  chair:[.44,.44], toilet:[.42,.62], sink:[.5,.4], plant:[.36,.36], floorLamp:[.3,.3],
  nightstand:[.45,.45],
};
export function buildColliders() {
  const cols = [];                                            // {x1,z1,x2,z2}
  const addAABB = (cx, cz, w, d) => cols.push({ x1: cx-w/2, x2: cx+w/2, z1: cz-d/2, z2: cz+d/2 });
  for (const f of FURNITURE_LIST) {
    const fp = FURN_SOLID[f.type]; if (!fp) continue;
    const a = THREE.MathUtils.degToRad(f.yaw || 0);
    const w = Math.abs(fp[0]*Math.cos(a)) + Math.abs(fp[1]*Math.sin(a));
    const d = Math.abs(fp[0]*Math.sin(a)) + Math.abs(fp[1]*Math.cos(a));
    addAABB(f.x, f.z, w + .06, d + .06);                      // 略膨胀防贴边穿模
  }
  for (const w of WALLS) {                                    // 墙按通行开口切分（door/pass 豁口，
    const [ax, az] = w.p1, [bx, bz] = w.p2;                   // 窗=实墙不可穿越）
    const horiz = az === bz, T = .2;
    const L = Math.hypot(bx-ax, bz-az);
    const doors = (w.openings||[]).filter(o=>o.type==='door'||o.type==='pass').map(o=>[
      ax + (bx-ax)*(o.at-o.w/2)/L, az + (bz-az)*(o.at-o.w/2)/L,
      ax + (bx-ax)*(o.at+o.w/2)/L, az + (bz-az)*(o.at+o.w/2)/L ])
      .sort((a,b)=> horiz ? a[0]-b[0] : a[1]-b[1]);
    let sx = ax, sz = az;
    const segs = [];
    for (const [dx1,dz1,dx2,dz2] of doors) { segs.push([sx,sz,dx1,dz1]); sx=dx2; sz=dz2; }
    segs.push([sx,sz,bx,bz]);
    for (const [x1,z1,x2,z2] of segs) {
      const cx=(x1+x2)/2, cz=(z1+z2)/2, len=Math.hypot(x2-x1,z2-z1);
      if (len < .05) continue;
      if (horiz) addAABB(cx, cz, len, T); else addAABB(cx, cz, T, len);
    }
  }
  return cols;
}
export const COLLIDERS = buildColliders();

// ── 场景构建 ────────────────────────────────────────────────
export function buildHouse(scene) {
  const house = new THREE.Group(); scene.add(house);
  const wood = woodTex(), tile = tileTex();
  const fadeMeshes = [];                     // 可透视墙面（近景自动淡化）
  const tags = [];

  for (const r of ROOMS) {
    const w = r.x2 - r.x1, d = r.z2 - r.z1;
    const tex = (r.floor === 'wood' ? wood : tile).clone();
    tex.needsUpdate = true; tex.repeat.set(w / .8, d / .8);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tex, roughness: .85 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((r.x1 + r.x2) / 2, 0, (r.z1 + r.z2) / 2);
    f.receiveShadow = true; house.add(f);
    tags.push({ name: r.name, x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2 });

    // 吊灯（可见灯具 + 分区暖光）
    const lampY = 2.15;
    const rod = cyl(.015, .22, M('#4e4a44', .5, .6), (r.x1 + r.x2) / 2, 2.29, (r.z1 + r.z2) / 2, 8);
    house.add(rod);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.16, .14, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: '#f3e2c2', side: THREE.DoubleSide, emissive: r.light, emissiveIntensity: .5 }));
    shade.position.set((r.x1 + r.x2) / 2, lampY, (r.z1 + r.z2) / 2); house.add(shade);
    const pl = new THREE.PointLight(r.light, 14, 7.5, 1.6);
    pl.position.set((r.x1 + r.x2) / 2, 2.05, (r.z1 + r.z2) / 2);
    house.add(pl);
  }

  // 墙体（自动开洞 + 踢脚线 + 门扇 + 窗帘）
  const H = 2.4, T = .12;
  const wallMat = M('#e8e2d8', .92);
  const skMat = M('#c9b8a0', .9);
  const doorMat = M('#a9795a', .8);
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#aee2ff', transparent: true, opacity: .3, roughness: .1 });
  const curtainMat = new THREE.MeshStandardMaterial({ color: '#e8d8c0', roughness: 1, side: THREE.DoubleSide });

  for (const w of WALLS) {
    const [x1, z1] = w.p1, [x2, z2] = w.p2;
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    const yaw = -Math.atan2(dx, dz) + Math.PI / 2;
    const openings = [...w.openings].sort((a, b) => a.at - b.at);
    let cursor = 0;
    // ⚠ 轴向约定（曾全部错 90°）：yaw 使局部 +X 对准墙方向 (dx,dz)（东西墙 yaw=0），
    //   因此一切"沿墙长条"必须建模为 box(L, h, T)——长轴在局部 X，厚度在局部 Z。
    //   原先写成 box(T, h, L)（长轴沿 Z）导致每面墙横着甩出户型边界。
    const seg = (from, to, y0, hh, fade = true) => {
      const L = to - from; if (L <= .01 || hh <= .01) return;
      const cx = x1 + dx * ((from + to) / 2 / len), cz = z1 + dz * ((from + to) / 2 / len);
      const m = box(L, hh, T, wallMat);
      m.position.set(cx, y0 + hh / 2, cz); m.rotation.y = yaw;
      if (fade) { m.material = wallMat.clone(); m.material.transparent = true; fadeMeshes.push(m); }
      house.add(m);
      if (y0 === 0) {                                     // 踢脚线
        const sk = box(L, .09, T + .05, skMat);
        sk.position.set(cx, .045, cz); sk.rotation.y = yaw; sk.castShadow = false;
        house.add(sk);
      }
    };
    const placeAt = (at, obj, off = 0) => {               // 沿墙放物体（obj 局部 +Z 朝墙内）
      const cx = x1 + dx * (at / len), cz = z1 + dz * (at / len);
      obj.position.set(cx + dz / len * off, obj.position.y, cz - dx / len * off);
      obj.rotation.y = yaw; house.add(obj);
    };
    for (const o of openings) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2;
      seg(cursor, a, 0, H);
      seg(a, b, o.h, H - o.h);
      if (o.type === 'window') {
        const cx = x1 + dx * (o.at / len), cz = z1 + dz * (o.at / len);
        const g = box(o.w, o.h, T * .3, glassMat);
        g.position.set(cx, (o.sill || .9) + o.h / 2, cz); g.rotation.y = yaw; g.castShadow = false;
        house.add(g);
        const sill = box(o.w + .1, .05, T + .08, M('#d7ccc8'));
        sill.position.set(cx, o.sill || .9, cz); sill.rotation.y = yaw; house.add(sill);
        // 窗框
        const fr = box(.06, o.h + .06, T * .5, M('#efe7d8'));
        fr.position.set(cx, (o.sill || .9) + o.h / 2, cz); fr.rotation.y = yaw; house.add(fr);
        // 窗帘（两侧短帘 + 帘杆）——全部挂屋内侧：帘片沿墙方向分挂帘杆两端，
        // 法向偏移取指向户型中心的墙法线（原实现沿法向 ±0.88m，一半甩出墙外）
        const rodL = o.w / 2 + .18;
        let nx = dz / len, nz = -dx / len;                  // 墙法线（任一方向）
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        if ((0 - mx) * nx + (0 - mz) * nz < 0) { nx = -nx; nz = -nz; }   // 统一指向屋内
        const rod = box(rodL * 2, .03, .03, M('#6d4c41'));
        rod.position.set(cx + nx * .1, (o.sill || .9) + o.h + .1, cz + nz * .1); rod.rotation.y = yaw; house.add(rod);
        for (const s of [-1, 1]) {
          const cur = box(.32, o.h * .8, .05, curtainMat);
          const along = (rodL - .1) * s;
          cur.position.set(cx + dx / len * along + nx * .12, (o.sill || .9) + o.h - o.h * .4 + .05, cz + dz / len * along + nz * .12);
          cur.rotation.y = yaw; cur.castShadow = false; house.add(cur);
        }
      }
      if (o.type === 'door') {                            // 门扇（半开）+ 门框 + 把手
        const leafW = o.w - .08;
        const leaf = new THREE.Group();
        leaf.add(box(leafW, o.h - .06, .05, doorMat));
        leaf.add(cyl(.02, .1, M('#d7ccc8'), leafW / 2 - .1, (o.h - .06) / 2 * .8, .06, 8));
        const cx = x1 + dx * (o.at / len), cz = z1 + dz * (o.at / len);
        leaf.position.set(cx - dx / len * (o.w / 2 - .04) + dz / len * .04, 0, cz - dz / len * (o.w / 2 - .04) - dx / len * .04);
        leaf.rotation.y = yaw - 0.7;                      // 开着约 40°（负=朝屋内开，正会甩出墙外）
        house.add(leaf);
        const jamb = box(.08, o.h + .05, T + .06, M('#8a6a4d'));
        jamb.position.set(cx, o.h / 2, cz); jamb.rotation.y = yaw; house.add(jamb);
      }
      cursor = b;
    }
    seg(cursor, len, 0, H);
  }

  // 家具
  for (const f of FURNITURE_LIST) {
    const g = FURNITURE[f.type]?.(); if (!g) continue;
    g.position.set(f.x, 0, f.z); g.rotation.y = THREE.MathUtils.degToRad(f.yaw || 0);
    house.add(g);
  }
  return { house, tags, fadeMeshes };
}
