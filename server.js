const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/healthz') return res.end('ok');
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});

// ---- マップ (中心x,z, 幅, 奥行) ----
const MAP = {
  half: 40,
  walls: [[-20,-20,16,2],[20,-20,16,2],[0,-10,2,14],[-25,0,2,20],[25,0,2,20],[-10,8,12,2],[10,8,12,2],
          [0,22,20,2],[-30,-30,2,10],[30,-30,2,10],[-12,-32,2,8],[12,-32,2,8],[-32,14,6,2],[32,14,6,2]],
  gens: [[-34,-26],[34,-26],[-32,24],[32,24],[0,-24]],
  exit: [0, -37],
  spawnK: [0, 32],
};
const NEED_GENS = 4, GEN_TIME = 10, ROUND_TIME = 420;

const wss = new WebSocketServer({ server });
const players = new Map();
let nid = 1, phase = 'wait', T = 0, msg = '', gens = MAP.gens.map(() => 0), exitOpen = false, playT = 0;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const joined = () => [...players.values()].filter(p => p.joined);

wss.on('connection', ws => {
  const p = { id: nid++, ws, name: 'Player', joined: false, role: 'spec', state: 'dead', x: 0, z: 0, yaw: 0,
              hp: 100, stam: 100, atkCd: 0, hurt: 0, inp: { mx: 0, mz: 0, sprint: false, act: false } };
  players.set(p.id, p);
  send(ws, { t: 'hello', id: p.id, map: MAP });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && !p.joined) {
      p.name = String(m.name || 'Player').replace(/[<>]/g, '').slice(0, 12) || 'Player';
      p.joined = true;
      if (phase === 'play') { p.role = 'spec'; p.state = 'dead'; }
      else toLobby(p);
    } else if (m.t === 'in' && p.joined) {
      let mx = +m.mx || 0, mz = +m.mz || 0; const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      p.inp = { mx, mz, sprint: !!m.sprint, act: !!m.act };
      if (isFinite(m.yaw)) p.yaw = +m.yaw;
    } else if (m.t === 'atk' && p.role === 'killer' && p.state === 'alive' && p.atkCd <= 0 && phase === 'play') attack(p);
  });
  ws.on('close', () => players.delete(p.id));
});

function toLobby(p) {
  p.role = 'lobby'; p.state = 'alive'; p.hp = 100; p.stam = 100; p.hurt = 0;
  p.x = (Math.random() - .5) * 10; p.z = 4 + Math.random() * 6;
}
function attack(k) {
  k.atkCd = 1.6;
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  for (const s of joined()) {
    if (s.role !== 'survivor' || s.state !== 'alive') continue;
    const dx = s.x - k.x, dz = s.z - k.z, d = Math.hypot(dx, dz);
    if (d < 3.2 && d > 0 && (dx * fx + dz * fz) / d > 0.3) {
      s.hp -= 34; s.hurt = 1.5;
      if (s.hp <= 0) { s.hp = 0; s.state = 'dead'; }
    }
  }
}
function collide(p) {
  const r = 0.5, h = MAP.half - r;
  p.x = Math.max(-h, Math.min(h, p.x)); p.z = Math.max(-h, Math.min(h, p.z));
  for (const [cx, cz, w, d] of MAP.walls) {
    const hx = w / 2, hz = d / 2;
    const nx = Math.max(cx - hx, Math.min(p.x, cx + hx)), nz = Math.max(cz - hz, Math.min(p.z, cz + hz));
    const dx = p.x - nx, dz = p.z - nz, dist = Math.hypot(dx, dz);
    if (dist < r) {
      if (dist > 1e-6) { p.x += dx / dist * (r - dist); p.z += dz / dist * (r - dist); }
      else p.x = cx + hx + r;
    }
  }
}
function startRound() {
  const js = joined(); const k = js[Math.random() * js.length | 0];
  gens = MAP.gens.map(() => 0); exitOpen = false; playT = 0; phase = 'play';
  js.forEach((p, i) => {
    p.role = p === k ? 'killer' : 'survivor'; p.state = 'alive'; p.hp = 100; p.stam = 100; p.atkCd = 3; p.hurt = 0;
    if (p === k) { p.x = MAP.spawnK[0]; p.z = MAP.spawnK[1]; }
    else { p.x = -4 + (i % 5) * 2; p.z = 2 + ((i / 5) | 0) * 2; }
  });
}
function endRound(text) { phase = 'end'; T = 8; msg = text; }

function tick(dt) {
  const js = joined();
  if (phase === 'wait') {
    msg = `プレイヤー待機中 (${js.length}/2人以上で開始)`;
    if (js.length >= 2) { phase = 'count'; T = 8; }
  } else if (phase === 'count') {
    if (js.length < 2) phase = 'wait';
    else { T -= dt; msg = `開始まで ${Math.ceil(T)}`; if (T <= 0) startRound(); }
  } else if (phase === 'end') {
    T -= dt;
    if (T <= 0) { js.forEach(toLobby); phase = 'wait'; }
  }
  // 移動
  for (const p of js) {
    p.atkCd = Math.max(0, p.atkCd - dt); p.hurt = Math.max(0, p.hurt - dt);
    if (p.state !== 'alive') continue;
    let sp = p.role === 'killer' ? 6.2 : 5;
    if (p.role !== 'killer') {
      if (p.inp.sprint && p.stam > 5 && (p.inp.mx || p.inp.mz)) { sp = 8; p.stam = Math.max(0, p.stam - 20 * dt); }
      else p.stam = Math.min(100, p.stam + 12 * dt);
      if (p.hurt > 0) sp *= 1.35;
    }
    p.x += p.inp.mx * sp * dt; p.z += p.inp.mz * sp * dt; collide(p);
  }
  if (phase === 'play') {
    playT += dt; msg = '';
    const surv = js.filter(p => p.role === 'survivor');
    for (const s of surv) {
      if (s.state !== 'alive') continue;
      if (s.inp.act) MAP.gens.forEach(([gx, gz], i) => {
        if (gens[i] < 1 && Math.hypot(s.x - gx, s.z - gz) < 2.5) gens[i] = Math.min(1, gens[i] + dt / GEN_TIME);
      });
      if (exitOpen && Math.hypot(s.x - MAP.exit[0], s.z - MAP.exit[1]) < 3) s.state = 'escaped';
    }
    if (!exitOpen && gens.filter(g => g >= 1).length >= NEED_GENS) exitOpen = true;
    const alive = surv.filter(s => s.state === 'alive').length;
    const esc = surv.filter(s => s.state === 'escaped').length;
    if (!js.some(p => p.role === 'killer')) endRound('キラーが退出 - サバイバーの勝利!');
    else if (alive === 0) endRound(esc > 0 ? `サバイバーの勝利! (${esc}人脱出)` : 'キラーの勝利!');
    else if (playT > ROUND_TIME) endRound('時間切れ - キラーの勝利!');
  }
  const r = n => Math.round(n * 100) / 100;
  const snap = JSON.stringify({
    t: 's', ph: phase, T: Math.ceil(phase === 'play' ? ROUND_TIME - playT : T), msg, exit: exitOpen, need: NEED_GENS,
    gens: gens.map(r),
    p: js.map(p => [p.id, p.name, p.role, r(p.x), r(p.z), r(p.yaw), p.hp, p.state, Math.round(p.stam), r(p.atkCd)]),
  });
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(snap);
}
let last = Date.now();
setInterval(() => { const n = Date.now(); tick(Math.min(0.1, (n - last) / 1000)); last = n; }, 1000 / 30);
server.listen(PORT, () => console.log('listening on', PORT));
