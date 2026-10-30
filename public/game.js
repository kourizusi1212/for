import * as THREE from 'three';
const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0d14); scene.fog = new THREE.Fog(0x0b0d14, 15, 60);
const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight(0x8899cc, 0x222233, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(20, 40, 10); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x1d2230 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(80, 40, 0x333a55, 0x262b40); grid.position.y = 0.01; scene.add(grid);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });

let ws, myId = 0, map = null, genMeshes = [], gate = [], objs = new Map(), snap = null, joined = false;
let yaw = 0, pitch = 0.25, lastHp = 100;
const keys = {};
const wallMat = new THREE.MeshLambertMaterial({ color: 0x3a4058 });

function buildMap(m) {
  map = m;
  for (const [x, z, w, d] of m.walls) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wallMat); b.position.set(x, 2, z); scene.add(b); }
  const H = m.half;
  for (const [x, z, w, d] of [[0, -H, 2 * H, 1], [0, H, 2 * H, 1], [-H, 0, 1, 2 * H], [H, 0, 1, 2 * H]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), wallMat); b.position.set(x, 3, z); scene.add(b);
  }
  genMeshes = m.gens.map(([x, z]) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0x330000 }));
    g.position.set(x, 0.8, z); scene.add(g);
    const l = new THREE.PointLight(0xff3322, 1.5, 9); l.position.set(x, 2.5, z); scene.add(l); g.userData.l = l; return g;
  });
  gate = [-2.5, 2.5].map(dx => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x220000 }));
    p.position.set(m.exit[0] + dx, 2.5, m.exit[1]); scene.add(p); return p;
  });
}
function label(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 6;
  x.strokeText(text, 128, 44); x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(3, 0.75, 1); return s;
}
function makeObj(p) {
  const g = new THREE.Group(), killer = p[2] === 'killer';
  const col = killer ? 0xcc1111 : new THREE.Color().setHSL((p[0] * 0.37) % 1, 0.6, 0.55);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, killer ? 1.3 : 1.0, 4, 10), new THREE.MeshLambertMaterial({ color: col }));
  body.position.y = killer ? 1.1 : 0.95; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  nose.position.set(0, body.position.y + 0.5, 0.4); g.add(nose);
  const l = label(p[1]); l.position.y = killer ? 3 : 2.6; g.add(l);
  g.position.set(p[3], 0, p[4]); scene.add(g); return { g, role: p[2], body };
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'hello') { myId = m.id; if (!map) buildMap(m.map); }
    else if (m.t === 's') onSnap(m);
  };
  ws.onclose = () => { $('msg').textContent = '切断されました。再読み込みしてください'; };
}
function onSnap(m) {
  snap = m; const seen = new Set();
  for (const p of m.p) {
    seen.add(p[0]); let o = objs.get(p[0]);
    if (o && o.role !== p[2]) { scene.remove(o.g); objs.delete(p[0]); o = null; }
    if (!o) { o = makeObj(p); objs.set(p[0], o); }
    o.d = p;
    o.g.visible = !(p[2] === 'spec' || p[7] === 'escaped');
    o.g.rotation.z = p[7] === 'dead' ? Math.PI / 2 : 0;
    o.g.children[0].material.emissive?.setHex(p[8] !== undefined && p[2] === 'survivor' && p[6] < 100 ? 0x330000 : 0);
  }
  for (const [id, o] of objs) if (!seen.has(id)) { scene.remove(o.g); objs.delete(id); }
  const me = objs.get(myId)?.d;
  if (me && me[6] < lastHp) { $('flash').style.opacity = 1; setTimeout(() => $('flash').style.opacity = 0, 200); }
  if (me) lastHp = me[6];
  genMeshes.forEach((g, i) => {
    const v = m.gens[i], c = new THREE.Color().lerpColors(new THREE.Color(0xff2200), new THREE.Color(0x22ff44), v);
    g.material.emissive.copy(c).multiplyScalar(0.6); g.userData.l.color.copy(c);
  });
  gate.forEach(p => p.material.emissive.setHex(m.exit ? 0x22ff66 : 0x330000));
  hud(m, me);
}
function hud(m, me) {
  const done = m.gens.filter(g => g >= 1).length;
  $('top').textContent = m.ph === 'play' ? `発電機 ${done}/${m.need}  ${m.exit ? '出口が開いた!' : ''}  残り ${m.T}s` : '';
  $('msg').textContent = m.msg || '';
  if (!me) return;
  const role = { killer: '🔪 あなたはキラー', survivor: '🏃 あなたはサバイバー', lobby: 'ロビー', spec: '観戦中(次のラウンドから参加)' }[me[2]];
  $('role').textContent = role + (me[7] === 'dead' ? ' (死亡)' : me[7] === 'escaped' ? ' (脱出!)' : '');
  $('hp').firstChild.style.width = me[6] + '%'; $('st').firstChild.style.width = me[8] + '%';
  $('hp').style.display = $('st').style.display = me[2] === 'survivor' ? '' : 'none';
  let pr = '', gp = null;
  if (me[2] === 'survivor' && me[7] === 'alive') {
    map.gens.forEach(([x, z], i) => { if (m.gens[i] < 1 && Math.hypot(me[3] - x, me[4] - z) < 2.5) { pr = 'Eを長押しで修理'; gp = m.gens[i]; } });
  }
  if (me[2] === 'killer') pr = me[9] > 0 ? '攻撃クールダウン…' : 'クリックで攻撃';
  $('prompt').textContent = pr;
  $('gp').style.display = gp === null ? 'none' : ''; if (gp !== null) $('gp').firstChild.style.width = gp * 100 + '%';
}

$('play').onclick = () => {
  connect(); joined = true;
  const j = () => ws.readyState === 1 ? ws.send(JSON.stringify({ t: 'join', name: $('name').value || 'Player' })) : setTimeout(j, 100); j();
  $('lobby').style.display = 'none'; $('hud').style.display = 'block'; renderer.domElement.requestPointerLock();
};
renderer.domElement.addEventListener('click', () => {
  if (!joined) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'atk' }));
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0025; pitch = Math.max(-0.3, Math.min(1, pitch + e.movementY * 0.002));
});
addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);

let sendAcc = 0, prev = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  if (joined && ws?.readyState === 1 && (sendAcc += dt) > 0.033) {
    sendAcc = 0;
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    ws.send(JSON.stringify({ t: 'in', mx: fx * f + rx * r, mz: fz * f + rz * r, yaw, sprint: !!keys.ShiftLeft, act: !!keys.KeyE }));
  }
  const k = 1 - Math.exp(-dt * 18);
  for (const [id, o] of objs) {
    if (!o.d) continue;
    o.g.position.x += (o.d[3] - o.g.position.x) * k; o.g.position.z += (o.d[4] - o.g.position.z) * k;
    const ty = id === myId ? yaw : o.d[5];
    const d = ((ty - o.g.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    o.g.rotation.y += d * Math.min(1, dt * 15);
  }
  let t = objs.get(myId);
  if (t?.d?.[7] !== 'alive' && snap) { const a = snap.p.find(p => p[7] === 'alive' && p[2] !== 'lobby'); if (a && objs.get(a[0])) t = objs.get(a[0]); }
  if (t) {
    const p = t.g.position, c = Math.cos(pitch);
    cam.position.set(p.x - Math.sin(yaw) * 5 * c, Math.max(0.6, 1.8 + Math.sin(pitch) * 5), p.z - Math.cos(yaw) * 5 * c);
    cam.lookAt(p.x, 1.5, p.z);
  } else { cam.position.set(0, 30, 40); cam.lookAt(0, 0, 0); }
  renderer.render(scene, cam);
}
requestAnimationFrame(loop);
