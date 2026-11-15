// Phoenix Run — Hack Haven NYC 2026 — theme: Bounce Back
// Single-canvas endless flyer. Crashing never ends the run; you are reborn smaller, faster, hotter.

(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const CFG = {
    runSeconds: 90,
    worldSpeed: 380,        // px/s at start
    speedRamp: 5,           // px/s gained per second
    rebirthSpeedBoost: 55,  // px/s gained per rebirth
    gravity: 720,
    thrust: 1500,
    maxVy: 520,
    birdX: 260,
    baseRadius: 22,
    startSize: 1.0,
    rebirthSize: 0.55,
    maxSize: 2.6,
    emberGrow: 0.07,
    emberValue: 10,         // × size × heat
    goldValue: 60,
    heatPerRebirth: 0.5,    // Heat multiplier grows by this per rebirth
    rebirthDelay: 1.5,
    graceSeconds: 2.5,      // invulnerable + magnet + double embers after rebirth
    distancePerPx: 0.1,
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, GROUND = H - 70;

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), score: $('hud-score'), embers: $('hud-embers'), heat: $('hud-heat'), rebirths: $('hud-rebirths'),
    time: $('hud-time'), timerFill: $('timer-fill'),
    title: $('title'), results: $('results'), paused: $('paused'), bestLine: $('best-line'),
    startBtn: $('start-btn'), againBtn: $('again-btn'),
    resScore: $('res-score'), resBest: $('res-best'), resDist: $('res-dist'), resEmbers: $('res-embers'),
    resRebirths: $('res-rebirths'), resSize: $('res-size'), resHeat: $('res-heat'), resStreak: $('res-streak'), resTitle: $('res-title'),
  };

  // ---------------------------------------------------------------- sprites
  // "Phoenix (reborn)" by Chasersgaming, CC0, https://opengameart.org/content/phoenix-reborn
  // 32x32 cells with a 1px box outline; we crop to the inner 30x30. Rows: 0 fly, 1 death, 2 reborn.
  const SPRITE = { img: new Image(), ready: false, cell: 32, inset: 1, frames: 6, rows: { fly: 0, death: 1, reborn: 2 } };
  SPRITE.img.onload = () => { SPRITE.ready = true; };
  SPRITE.img.src = 'assets/phoenix_sheet.png';
  function drawFrame(anim, frame, x, y, w, h, flipX = false) {
    const c = SPRITE.cell, i = SPRITE.inset, inner = c - i * 2;
    const sx = (frame % SPRITE.frames) * c + i, sy = SPRITE.rows[anim] * c + i;
    ctx.save(); ctx.translate(x, y); if (flipX) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SPRITE.img, sx, sy, inner, inner, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // ---------------------------------------------------------------- audio (synthesized, no files)
  const Audio = (() => {
    let ac = null, muted = false, master;
    function ensure() {
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    }
    function tone({ f = 440, f2 = f, type = 'sine', dur = 0.15, vol = 0.3, at = 0 }) {
      if (!ac || muted) return;
      const t = ac.currentTime + at;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise({ dur = 0.5, vol = 0.4, lowpass = 800 }) {
      if (!ac || muted) return;
      const t = ac.currentTime, len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const s = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = lowpass; s.buffer = buf; g.gain.value = vol;
      s.connect(lp); lp.connect(g); g.connect(master); s.start(t);
    }
    return {
      unlock() { ensure(); if (ac.state === 'suspended') ac.resume(); },
      toggleMute() { muted = !muted; return muted; },
      get muted() { return muted; },
      ember(streak) { tone({ f: 520 + Math.min(streak, 24) * 30, f2: 780 + Math.min(streak, 24) * 30, dur: 0.12, vol: 0.18, type: 'triangle' }); },
      gold() { [0, 0.07, 0.14].forEach((at, i) => tone({ f: 660 + i * 220, f2: 880 + i * 220, dur: 0.22, vol: 0.2, type: 'triangle', at })); },
      crash() { noise({ dur: 0.7, vol: 0.5, lowpass: 600 }); tone({ f: 180, f2: 40, dur: 0.5, vol: 0.35, type: 'sawtooth' }); },
      rebirth() { tone({ f: 200, f2: 1400, dur: 0.6, vol: 0.25, type: 'sawtooth' }); noise({ dur: 0.4, vol: 0.2, lowpass: 3000 }); },
      tick() { tone({ f: 1000, f2: 1000, dur: 0.06, vol: 0.12, type: 'square' }); },
      finish() { [0, 0.12, 0.24, 0.42].forEach((at, i) => tone({ f: [523, 659, 784, 1046][i], f2: [523, 659, 784, 1046][i], dur: 0.35, vol: 0.22, type: 'triangle', at })); },
    };
  })();

  // ---------------------------------------------------------------- input
  const input = { up: false, down: false, hold: false };
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  addEventListener('keydown', e => {
    if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) onPrimary(); }
    if (e.code === 'KeyP' && !e.repeat) togglePause();
    if (e.code === 'KeyM' && !e.repeat) Audio.toggleMute();
    if (e.code === 'KeyR' && !e.repeat && game.phase !== 'title') startRun();
  });
  addEventListener('keyup', e => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });
  const pointerDown = e => { if (e.target.tagName === 'BUTTON') return; input.hold = true; if (game.phase !== 'running') onPrimary(); };
  const pointerUp = () => { input.hold = false; };
  canvas.addEventListener('pointerdown', pointerDown);
  addEventListener('pointerup', pointerUp);
  addEventListener('pointercancel', pointerUp);
  ui.startBtn.addEventListener('click', onPrimary);
  ui.againBtn.addEventListener('click', onPrimary);
  addEventListener('blur', () => { if (game.phase === 'running') togglePause(true); });

  function onPrimary() {
    Audio.unlock();
    if (game.phase === 'title' || game.phase === 'results') startRun();
    else if (game.phase === 'paused') togglePause();
  }
  function togglePause(force) {
    if (game.phase === 'running' || force) { game.phase = 'paused'; ui.paused.hidden = false; }
    else if (game.phase === 'paused') { game.phase = 'running'; ui.paused.hidden = true; last = performance.now(); }
  }

  // ---------------------------------------------------------------- state
  const BEST_KEY = 'phoenix-run-best';
  const loadBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
  const saveBest = v => { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} };

  let game = { phase: 'title' };
  let last = performance.now();

  function makeStars(n) {
    return Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * GROUND, r: Math.random() * 1.6 + 0.3, s: Math.random() * 20 + 10 }));
  }
  function makeRidge(seed, count, base, amp) {
    const pts = [];
    for (let i = 0; i <= count; i++) pts.push(base - Math.abs(Math.sin(i * 1.3 + seed) * amp + Math.sin(i * 0.4 + seed * 2) * amp * 0.5));
    return pts;
  }

  function startRun() {
    game = {
      phase: 'running', t: 0, timeLeft: CFG.runSeconds, lastTick: -1,
      score: 0, embers: 0, dist: 0, rebirths: 0, heat: 1, streak: 0, bestStreak: 0, peakSize: CFG.startSize, peakHeat: 1,
      speed: CFG.worldSpeed,
      bird: { x: CFG.birdX, y: H / 2, vy: 0, size: CFG.startSize, alive: true, deadTimer: 0, grace: 0, trail: [], anim: 0, reborn: 0 },
      obstacles: [], pickups: [], particles: [], floaters: [],
      stars: makeStars(90), ridgeFar: makeRidge(1, 24, GROUND - 140, 120), ridgeNear: makeRidge(7, 16, GROUND - 60, 90), ridgeOff: 0,
      spawnTimer: 1.2, emberTimer: 0.4, shake: 0, flash: 0, flashColor: '255,140,40',
    };
    ui.title.hidden = true; ui.results.hidden = true; ui.paused.hidden = true; ui.hud.hidden = false;
    last = performance.now();
  }

  // ---------------------------------------------------------------- spawning
  const birdRadius = () => CFG.baseRadius * game.bird.size;

  function spawnObstacle() {
    const g = game, r = Math.random(), tier = Math.min(1, g.t / 60);
    if (r < 0.38) {
      const h = 110 + Math.random() * (240 + 80 * tier);
      g.obstacles.push({ type: 'spike', x: W + 80, y: GROUND - h, w: 64 + Math.random() * 40, h, up: true });
    } else if (r < 0.7) {
      const h = 110 + Math.random() * (240 + 80 * tier);
      g.obstacles.push({ type: 'spike', x: W + 80, y: 0, w: 64 + Math.random() * 40, h, up: false });
    } else if (r < 0.88) {
      const s = 64 + Math.random() * 56;
      g.obstacles.push({ type: 'boulder', x: W + 80, y: 110 + Math.random() * (GROUND - 220 - s), w: s, h: s, spin: Math.random() * 6.28, spinV: (Math.random() - 0.5) * 2 });
    } else {
      // storm crow: weaves vertically
      const s = 48;
      g.obstacles.push({ type: 'crow', x: W + 80, y: 140 + Math.random() * (GROUND - 320), w: s, h: s, baseY: 0, phase: Math.random() * 6.28, amp: 70 + Math.random() * 60, extraSpeed: 90 + tier * 80 });
      g.obstacles[g.obstacles.length - 1].baseY = g.obstacles[g.obstacles.length - 1].y;
    }
  }
  function spawnEmber() {
    const g = game, gold = Math.random() < 0.06;
    // sometimes spawn a short arc of embers to encourage a path
    if (!gold && Math.random() < 0.3) {
      const y0 = 120 + Math.random() * (GROUND - 260), dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 5; i++) g.pickups.push({ x: W + 40 + i * 46, y: y0 + Math.sin(i * 0.7) * 60 * dir, r: 11, gold: false, phase: i * 0.5 });
    } else {
      g.pickups.push({ x: W + 40, y: 90 + Math.random() * (GROUND - 180), r: gold ? 14 : 11, gold, phase: Math.random() * 6.28 });
    }
  }

  // ---------------------------------------------------------------- effects
  const fire = () => `hsl(${15 + Math.random() * 35}, 100%, ${50 + Math.random() * 25}%)`;
  const ash = () => `hsl(30, 10%, ${25 + Math.random() * 30}%)`;
  const goldC = () => `hsl(${45 + Math.random() * 10}, 100%, ${60 + Math.random() * 25}%)`;
  function burst(x, y, n, speed, colorFn, life = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
      game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life, max: life, r: 3 + Math.random() * 5, c: colorFn() });
    }
  }
  function floater(text, x, y, color = '#ffe9c7', size = 26) {
    game.floaters.push({ text, x, y, color, size, life: 1, vy: -70 });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    const g = game, b = g.bird;
    g.t += dt;
    g.timeLeft -= dt;
    if (g.timeLeft <= 0) return finishRun();
    if (g.timeLeft <= 5 && Math.ceil(g.timeLeft) !== g.lastTick) { g.lastTick = Math.ceil(g.timeLeft); Audio.tick(); }

    g.speed += CFG.speedRamp * dt;
    const travelled = g.speed * dt;
    g.dist += travelled * CFG.distancePerPx;
    g.score += travelled * CFG.distancePerPx * 0.5;          // distance is a slow trickle; embers are the real score
    g.ridgeOff += travelled;

    for (const st of g.stars) { st.x -= st.s * dt; if (st.x < 0) { st.x = W; st.y = Math.random() * GROUND; } }

    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) { spawnObstacle(); g.spawnTimer = Math.max(0.5, 1.45 - g.speed / 1000) + Math.random() * 0.45; }
    g.emberTimer -= dt;
    if (g.emberTimer <= 0) { spawnEmber(); g.emberTimer = 0.5 + Math.random() * 0.55; }

    for (const o of g.obstacles) {
      o.x -= (g.speed + (o.extraSpeed || 0)) * dt;
      if (o.type === 'crow') { o.phase += dt * 3; o.y = o.baseY + Math.sin(o.phase) * o.amp; }
      if (o.type === 'boulder') o.spin += o.spinV * dt;
    }
    for (const p of g.pickups) p.x -= g.speed * dt;
    g.obstacles = g.obstacles.filter(o => o.x + o.w > -40);
    g.pickups = g.pickups.filter(p => p.x > -40);

    const radius = birdRadius();
    if (b.alive) {
      b.grace = Math.max(0, b.grace - dt);
      const agility = 1 + (1 - b.size) * 0.8;
      const up = input.up || input.hold, down = input.down;
      if (up) b.vy -= CFG.thrust * agility * dt;
      if (down) b.vy += CFG.thrust * agility * dt;
      b.vy += CFG.gravity * dt;
      b.vy *= Math.pow(0.9, dt * 10);
      b.vy = Math.max(-CFG.maxVy * agility, Math.min(CFG.maxVy * agility, b.vy));
      b.y += b.vy * dt;
      if (b.y < radius) { b.y = radius; b.vy = Math.abs(b.vy) * 0.3; }
      if (b.y > GROUND - radius) { b.y = GROUND - radius; b.vy = -Math.abs(b.vy) * 0.3; }

      b.anim += dt * (12 + Math.abs(b.vy) / 60);   // flap faster when working hard
      b.reborn = Math.max(0, b.reborn - dt);
      b.trail.unshift({ x: b.x, y: b.y, r: radius });
      if (b.trail.length > 14) b.trail.pop();
      if (Math.random() < 0.7) g.particles.push({ x: b.x - radius, y: b.y + (Math.random() - 0.5) * radius, vx: -g.speed * 0.5, vy: (Math.random() - 0.5) * 80 - 40, life: 0.5, max: 0.5, r: 2 + Math.random() * 4 * b.size, c: b.grace > 0 ? goldC() : fire() });

      // pickups (magnet during grace)
      for (let i = g.pickups.length - 1; i >= 0; i--) {
        const p = g.pickups[i], d = Math.hypot(p.x - b.x, p.y - b.y);
        if (b.grace > 0 && d < 220) { p.x += (b.x - p.x) * 6 * dt; p.y += (b.y - p.y) * 6 * dt; }
        if (d < radius + p.r) {
          g.pickups.splice(i, 1);
          collect(p);
        }
      }

      // crash
      const hb = radius * 0.78;
      if (b.grace <= 0) {
        for (const o of g.obstacles) {
          let hit;
          if (o.type === 'spike') {
            // triangle approx: test against center line narrowing toward tip
            const cx = o.x + o.w / 2, tipY = o.up ? o.y : o.h, baseY = o.up ? GROUND : 0;
            const frac = Math.min(1, Math.max(0, (b.y - tipY) / (baseY - tipY)));
            const halfW = (o.w / 2) * frac;
            const within = o.up ? b.y + hb > tipY : b.y - hb < tipY;
            hit = within && Math.abs(b.x - cx) < halfW + hb * 0.8;
          } else {
            const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
            hit = Math.hypot(cx - b.x, cy - b.y) < hb + o.w / 2 * 0.9;
          }
          if (hit) { crash(); break; }
        }
      }
    } else {
      b.deadTimer -= dt;
      b.y = Math.min(GROUND - 10, b.y + 120 * dt);
      if (Math.random() < 0.5) g.particles.push({ x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 30, vx: -g.speed * 0.3, vy: -40 - Math.random() * 60, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, c: ash() });
      if (b.deadTimer <= 0) rebirth();
    }

    for (const p of g.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
    g.particles = g.particles.filter(p => p.life > 0);
    for (const f of g.floaters) { f.life -= dt; f.y += f.vy * dt; }
    g.floaters = g.floaters.filter(f => f.life > 0);
    g.shake = Math.max(0, g.shake - dt * 30);
    g.flash = Math.max(0, g.flash - dt * 2);

    updateHud();
  }

  function collect(p) {
    const g = game, b = g.bird;
    g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak);
    const graceMult = b.grace > 0 ? 2 : 1;
    const base = p.gold ? CFG.goldValue : CFG.emberValue;
    const gain = Math.round(base * b.size * g.heat * graceMult);
    g.score += gain; g.embers++;
    b.size = Math.min(CFG.maxSize, b.size + CFG.emberGrow * (p.gold ? 3 : 1));
    g.peakSize = Math.max(g.peakSize, b.size);
    burst(p.x, p.y, p.gold ? 24 : 10, p.gold ? 260 : 160, p.gold ? goldC : fire, 0.5);
    floater('+' + gain, p.x, p.y - 20, p.gold ? '#ffe08a' : '#ffb347', p.gold ? 30 : 20);
    if (p.gold) Audio.gold(); else Audio.ember(g.streak);
  }

  function crash() {
    const g = game, b = g.bird;
    b.alive = false; b.deadTimer = CFG.rebirthDelay;
    g.streak = 0;
    g.shake = 18; g.flash = 1; g.flashColor = '255,80,20';
    burst(b.x, b.y, Math.round(60 * b.size), 420, fire, 1.1);
    burst(b.x, b.y, 30, 200, ash, 1.6);
    b.trail = [];
    Audio.crash();
  }

  function rebirth() {
    const g = game, b = g.bird;
    g.rebirths++;
    g.heat = +(g.heat + CFG.heatPerRebirth).toFixed(2);
    g.peakHeat = Math.max(g.peakHeat, g.heat);
    b.alive = true; b.size = CFG.rebirthSize; b.y = H / 2; b.vy = 0; b.grace = CFG.graceSeconds; b.reborn = 0.6; b.anim = 0;
    g.speed += CFG.rebirthSpeedBoost;
    g.flash = 0.9; g.flashColor = '255,200,80';
    g.obstacles = g.obstacles.filter(o => o.x > b.x + 260 || o.x + o.w < b.x - 80);
    burst(b.x, b.y, 90, 340, goldC, 1.0);
    floater('REBORN  heat x' + g.heat.toFixed(1), b.x + 40, b.y - 70, '#ffe08a', 30);
    Audio.rebirth();
  }

  function finishRun() {
    const g = game;
    g.phase = 'results';
    const score = Math.round(g.score), best = loadBest();
    const isBest = score > best;
    if (isBest) saveBest(score);
    ui.resScore.textContent = score.toLocaleString();
    ui.resBest.textContent = isBest ? 'NEW BEST!' : 'Best ' + best.toLocaleString();
    ui.resDist.textContent = Math.round(g.dist).toLocaleString() + ' m';
    ui.resEmbers.textContent = g.embers;
    ui.resRebirths.textContent = g.rebirths;
    ui.resSize.textContent = g.peakSize.toFixed(1) + 'x';
    ui.resHeat.textContent = 'x' + g.peakHeat.toFixed(1);
    ui.resStreak.textContent = g.bestStreak;
    ui.resTitle.textContent = rankTitle(g);
    ui.results.hidden = false; ui.hud.hidden = true;
    Audio.finish();
  }
  function rankTitle(g) {
    if (g.rebirths === 0) return 'UNTOUCHED. But you never got hotter.';
    if (g.rebirths >= 8) return 'ETERNAL FLAME. Nothing keeps you down.';
    if (g.peakSize >= 2.2) return 'INFERNO. You grew into something huge.';
    if (g.bestStreak >= 25) return 'UNBROKEN STREAK. Precision flying.';
    if (g.rebirths >= 4) return 'PHOENIX. Every fall made you stronger.';
    return 'RISING. Keep coming back.';
  }

  function updateHud() {
    const g = game;
    ui.score.textContent = Math.round(g.score).toLocaleString();
    ui.embers.textContent = g.embers;
    ui.heat.textContent = 'x' + g.heat.toFixed(1);
    ui.rebirths.textContent = g.rebirths;
    const tl = Math.max(0, g.timeLeft);
    ui.time.textContent = Math.ceil(tl);
    ui.time.classList.toggle('urgent', tl <= 10);
    ui.timerFill.style.width = (tl / CFG.runSeconds * 100) + '%';
  }

  // ---------------------------------------------------------------- draw
  function drawBird(b) {
    const r = CFG.baseRadius * b.size, t = game.t;
    for (let i = b.trail.length - 1; i >= 0; i--) {
      const tr = b.trail[i], a = (1 - i / b.trail.length) * 0.35;
      ctx.fillStyle = b.grace > 0 ? `rgba(255,220,120,${a})` : `rgba(255,${120 + i * 6},40,${a})`;
      ctx.beginPath(); ctx.arc(tr.x - i * 6, tr.y, tr.r * (1 - i / b.trail.length) * 0.9, 0, 6.28); ctx.fill();
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.max(-0.5, Math.min(0.5, b.vy / 900)));
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * (b.grace > 0 ? 3 : 2.2));
    glow.addColorStop(0, b.grace > 0 ? 'rgba(255,230,140,0.7)' : 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, 6.28); ctx.fill();
    if (SPRITE.ready) {
      const px = r * 3.2;                                  // sprite box in world px
      const frame = b.reborn > 0 ? Math.min(5, Math.floor((0.6 - b.reborn) / 0.6 * 6)) : Math.floor(b.anim) % 6;
      if (b.grace > 0) { ctx.shadowColor = 'rgba(255,230,140,0.9)'; ctx.shadowBlur = 24; }
      drawFrame(b.reborn > 0 ? 'reborn' : 'fly', frame, 0, 0, px, px);
      ctx.shadowBlur = 0;
    } else {
      const flap = Math.sin(t * 18) * 0.6;
      ctx.fillStyle = '#ff7a1f';
      ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 1.3, -r * (1.4 + flap)); ctx.lineTo(r * 0.5, -r * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9f3d';
      ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 1.3, r * (1.2 - flap)); ctx.lineTo(r * 0.5, r * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5e00';
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 2.4, -r * 0.6); ctx.lineTo(-r * 2.0, 0); ctx.lineTo(-r * 2.4, r * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.grace > 0 ? '#fff1b8' : '#ffc247';
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.75, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(r * 0.85, -r * 0.25, r * 0.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(r * 1.3, -r * 0.3); ctx.lineTo(r * 1.75, -r * 0.15); ctx.lineTo(r * 1.3, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1200'; ctx.beginPath(); ctx.arc(r * 0.98, -r * 0.33, r * 0.11, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }

  function drawRidge(pts, off, speedFrac, color) {
    const seg = W / (pts.length - 1), shift = (off * speedFrac) % seg;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-seg, H);
    for (let i = 0; i < pts.length + 1; i++) {
      const idx = (i + Math.floor(off * speedFrac / seg)) % pts.length;
      ctx.lineTo(i * seg - shift, pts[idx]);
    }
    ctx.lineTo(W + seg, H); ctx.closePath(); ctx.fill();
  }

  function draw() {
    const g = game;
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const heatTint = Math.min(1, (g.heat - 1) / 4);
    sky.addColorStop(0, `rgb(${11 + heatTint * 30},10,${26 - heatTint * 10})`); sky.addColorStop(1, `rgb(${42 + heatTint * 60},${15 + heatTint * 10},30)`);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#fff';
    for (const st of g.stars) { ctx.globalAlpha = 0.4 + Math.sin(g.t * 2 + st.x) * 0.3; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    drawRidge(g.ridgeFar, g.ridgeOff, 0.15, '#180d1c');
    drawRidge(g.ridgeNear, g.ridgeOff, 0.35, '#230f1e');

    ctx.fillStyle = '#1a0c14'; ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
    ctx.fillStyle = '#3b1420'; ctx.fillRect(-20, GROUND, W + 40, 6);
    const lava = ctx.createLinearGradient(0, GROUND + 6, 0, H);
    lava.addColorStop(0, `rgba(255,90,0,${0.3 + heatTint * 0.3})`); lava.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = lava; ctx.fillRect(-20, GROUND + 6, W + 40, H - GROUND);

    for (const o of g.obstacles) {
      if (o.type === 'spike') {
        ctx.fillStyle = '#4a2a35'; ctx.beginPath();
        if (o.up) { ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + o.w, GROUND); ctx.lineTo(o.x + o.w / 2, o.y); }
        else { ctx.moveTo(o.x, 0); ctx.lineTo(o.x + o.w, 0); ctx.lineTo(o.x + o.w / 2, o.h); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7a4a5c'; ctx.lineWidth = 3; ctx.stroke();
      } else if (o.type === 'boulder') {
        ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate(o.spin);
        ctx.fillStyle = '#4a2a35'; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, rr = o.w / 2 * (0.85 + ((i * 7) % 3) * 0.07); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7a4a5c'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#6a3e4d'; ctx.beginPath(); ctx.arc(-o.w * 0.15, -o.h * 0.15, o.w * 0.14, 0, 6.28); ctx.fill();
        ctx.restore();
      } else {
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2, fl = Math.sin(o.phase * 4) * 10;
        ctx.fillStyle = '#2a1f3a';
        ctx.beginPath(); ctx.moveTo(cx + 22, cy); ctx.lineTo(cx - 20, cy - 8); ctx.lineTo(cx - 28, cy + 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 14, cy - 26 - fl); ctx.lineTo(cx + 10, cy - 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 14, cy + 26 + fl); ctx.lineTo(cx + 10, cy + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(cx + 14, cy - 3, 2.5, 0, 6.28); ctx.fill();
      }
    }

    for (const p of g.pickups) {
      const pulse = 1 + Math.sin(g.t * 6 + p.phase) * 0.2, rr = p.r * 2.4 * pulse;
      const gr = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, rr);
      if (p.gold) { gr.addColorStop(0, 'rgba(255,250,200,0.95)'); gr.addColorStop(0.4, 'rgba(255,215,80,0.7)'); gr.addColorStop(1, 'rgba(255,200,0,0)'); }
      else { gr.addColorStop(0, 'rgba(255,220,120,0.9)'); gr.addColorStop(0.4, 'rgba(255,140,40,0.6)'); gr.addColorStop(1, 'rgba(255,90,0,0)'); }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.28); ctx.fill();
      ctx.fillStyle = p.gold ? '#fff8d0' : '#ffe08a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6 * pulse, 0, 6.28); ctx.fill();
    }

    for (const p of g.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life / p.max), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    if (g.bird.alive) drawBird(g.bird);
    else if (g.phase === 'running' || g.phase === 'paused') {
      if (SPRITE.ready) {
        const b = g.bird, prog = 1 - b.deadTimer / CFG.rebirthDelay;
        drawFrame('death', Math.min(5, Math.floor(prog * 6)), b.x, b.y, CFG.baseRadius * b.size * 3.2, CFG.baseRadius * b.size * 3.2);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb347'; ctx.font = 'bold 44px system-ui'; ctx.fillText('REBIRTH IN ' + (Math.ceil(g.bird.deadTimer * 10) / 10).toFixed(1), W / 2, H / 2 - 40);
      ctx.fillStyle = '#ffe9c7'; ctx.font = '22px system-ui'; ctx.fillText('Smaller. Faster. Hotter.', W / 2, H / 2);
    }

    for (const f of g.floaters) { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color; ctx.font = `bold ${f.size}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;

    if (g.phase !== 'results' && g.bird.alive && g.bird.grace > 0) {
      ctx.fillStyle = 'rgba(255,230,140,0.9)'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('SECOND WIND  2x embers  ' + g.bird.grace.toFixed(1), W / 2, 110);
    }
    if (g.flash > 0) { ctx.fillStyle = `rgba(${g.flashColor},${g.flash * 0.35})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (game.phase === 'running') { update(dt); draw(); }
    else if (game.phase === 'paused' || game.phase === 'results') draw();
    requestAnimationFrame(frame);
  }

  // idle backdrop under the title
  (function boot() {
    startRun(); game.phase = 'title'; draw();
    ui.hud.hidden = true; ui.title.hidden = false;
    const best = loadBest(); ui.bestLine.textContent = best ? 'BEST ' + best.toLocaleString() : '';
    requestAnimationFrame(frame);
  })();

  window.__phoenix = () => game; // debug hook
})();
