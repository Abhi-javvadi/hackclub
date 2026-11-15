// Phoenix Run — Hack Haven NYC 2026 — theme: Bounce Back
// Single-canvas endless flyer. Crashing never ends the run; you are reborn smaller, faster, hotter.

(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const CFG = {
    runSeconds: 90,
    finaleSeconds: 10,      // last stretch: obstacles stop, the dragon arrives
    lives: 5,               // run ends when these are gone, whatever the clock says
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
    heatPerRebirth: 0.5,    // Heat multiplier grows by this per rebirth
    rebirthDelay: 1.5,
    graceSeconds: 2.5,      // invulnerable + double coins after rebirth
    distancePerPx: 0.1,
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, GROUND = H - 70;

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), score: $('hud-score'), embers: $('hud-embers'), rebirths: $('hud-rebirths'),
    time: $('hud-time'), timerFill: $('timer-fill'), hearts: [...document.querySelectorAll('#hud-lives .heart')],
    resHeading: $('res-heading'),
    title: $('title'), results: $('results'), paused: $('paused'), bestLine: $('best-line'),
    startBtn: $('start-btn'), againBtn: $('again-btn'),
    resScore: $('res-score'), resBest: $('res-best'), resDist: $('res-dist'), resEmbers: $('res-embers'),
    resRebirths: $('res-rebirths'), resSize: $('res-size'), resStreak: $('res-streak'), resTitle: $('res-title'),
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

  // Cave backdrop: "Parallax Backgrounds: Caves" by Admurin (itch.io). Free for any project, credit appreciated.
  // Seven 384x216 layers. layer7 is the back wall, layer1 the nearest rocks. Each scales to exactly 1280x720.
  const CAVE = { layers: [], loaded: 0, get ready() { return this.loaded === 7; } };
  // [file index, scroll speed as a fraction of world speed]
  const CAVE_PLAN = [[7, 0.02], [6, 0.06], [5, 0.11], [4, 0.18], [3, 0.3], [2, 0.5], [1, 0.75]];
  for (const [n, frac] of CAVE_PLAN) {
    const im = new Image(); im.onload = () => { CAVE.loaded++; }; im.src = `assets/cave/layer${n}.png`;
    CAVE.layers.push({ im, frac, n });
  }
  function drawCaveLayer(layer, off) {
    const shift = Math.floor((off * layer.frac) % W);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer.im, -shift, 0, W, H);
    ctx.drawImage(layer.im, W - shift, 0, W, H);
  }

  // Obstacles: "2d obstacle collection" by Game Developer Studio (Robert Brooks), CC-BY 4.0, OpenGameArt.
  // Hanging spike blocks, a swinging crescent blade, a spiked log on two chains, saw blades on posts,
  // and free saw blades. Every chain is the pack's single chain piece drawn scaled to the needed length.
  const TRAPS = { names: ['block_1', 'block_2', 'chain', 'blade_1', 'blade_2', 'blade_3', 'swing_blade', 'spike_stick', 'post_med', 'post_small', 'nut'], img: {}, loaded: 0,
    get ready() { return this.loaded === this.names.length; } };
  for (const n of TRAPS.names) { const im = new Image(); im.onload = () => { TRAPS.loaded++; }; im.src = `assets/traps/${n}.png`; TRAPS.img[n] = im; }
  function drawChain(x, y0, len, cw) {
    // one chain piece, resized to exactly the chain length (no tiling, no new art)
    ctx.drawImage(TRAPS.img.chain, x - cw / 2, y0, cw, len);
  }

  // Lava floor: "animated lava 16x32" (CC0, OpenGameArt). Eight 16x32 frames in one 128x32 strip,
  // tiled along the bottom of the screen at 3x and scrolled with the world.
  const LAVA = { img: new Image(), ready: false, fw: 16, fh: 32, frames: 8, scale: 3, fps: 8 };
  LAVA.img.onload = () => { LAVA.ready = true; };
  LAVA.img.src = 'assets/lava/lava_strip8.png';
  function drawLava(off, t) {
    if (!LAVA.ready) return;
    const tw = LAVA.fw * LAVA.scale, th = LAVA.fh * LAVA.scale, frame = Math.floor(t * LAVA.fps) % LAVA.frames;
    const y = H - th + 6, shift = Math.floor(off % tw);
    ctx.imageSmoothingEnabled = false;
    for (let x = -shift - tw; x < W + tw; x += tw) ctx.drawImage(LAVA.img, frame * LAVA.fw, 0, LAVA.fw, LAVA.fh, x, y, tw, th);
  }

  // Bottom eruptions: "Free Flame Effects Sprite Pack" by CraftPix.net (freebie license: free for
  // personal and commercial games, modification allowed, credit appreciated). Effect flame8, 34 frames:
  // a flame that rises and splits into two tongues. Cropped to the shared bounding box, downscaled to 192 wide.
  const ERUPTION = { frames: [], fps: 20, ready: false, loaded: 0, count: 34, timer: 2 + Math.random() * 3 };
  for (let i = 0; i < ERUPTION.count; i++) {
    const im = new Image();
    im.onload = () => { if (++ERUPTION.loaded === ERUPTION.count) ERUPTION.ready = true; };
    im.src = `assets/eruption/${String(i).padStart(2, '0')}.png`;
    ERUPTION.frames.push(im);
  }
  function spawnEruption() {
    if (!ERUPTION.ready || ERUPTION.frames.length === 0) return;
    const im = ERUPTION.frames[0], scale = 0.8 + Math.random() * 0.35;   // small bursts, under a quarter of screen height
    const w = im.width * scale, h = im.height * scale;
    game.eruptions.push({ x: W / 2 + (Math.random() - 0.5) * (W - 200), w, h, t: 0, dur: ERUPTION.frames.length / ERUPTION.fps });
  }
  function updateEruptions(dt, travelled) {
    const g = game;
    ERUPTION.timer -= dt;
    if (ERUPTION.timer <= 0) { spawnEruption(); ERUPTION.timer = 1.4 + Math.random() * 2.6; }
    for (const e of g.eruptions) { e.t += dt; e.x -= travelled * 0.75; }
    g.eruptions = g.eruptions.filter(e => e.t < e.dur);
  }
  function drawEruptions() {
    if (!ERUPTION.ready) return;
    for (const e of game.eruptions) {
      const idx = Math.min(ERUPTION.frames.length - 1, Math.floor(e.t / e.dur * ERUPTION.frames.length));
      // anchored at the lava surface so the burst rises out of the bottom of the screen
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ERUPTION.frames[idx], e.x - e.w / 2, H - 14 - e.h, e.w, e.h);
    }
  }

  // Coins: "Pixel Coins" by TotusLotus (itch.io), coin2 strip, fourteen 16x16 frames of a spinning bronze coin.
  const COIN = { img: new Image(), ready: false, fw: 16, fh: 16, frames: 14, fps: 14 };
  COIN.img.onload = () => { COIN.ready = true; };
  COIN.img.src = 'assets/coins/coin_16x16.png';
  function drawCoin(x, y, size, t, phase) {
    const f = Math.floor(t * COIN.fps + phase * 2) % COIN.frames;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(COIN.img, f * COIN.fw, 0, COIN.fw, COIN.fh, x - size / 2, y - size / 2, size, size);
  }

  // Finale boss: "Shadow Demon Dragon" by Vinzes (itch.io), free for commercial use, credit appreciated.
  // Frames cropped from the Idle_Left and Attack_Left sheets and scaled to 506x256. It arrives for the
  // last stretch of the run; its projectiles are added separately.
  const DRAGON = {
    idle: [], attack: [], loaded: 0, total: 20, scale: 1.35,   // draw scale only; frames are the pack's own
    get ready() { return this.loaded === this.total; },
  };
  ['idle', 'attack'].forEach(name => {
    for (let i = 0; i < 10; i++) {
      const im = new Image(); im.onload = () => { DRAGON.loaded++; };
      im.src = `assets/dragon/${name}_${String(i).padStart(2, '0')}.png`;
      DRAGON[name].push(im);
    }
  });
  const roarEl = new window.Audio('assets/dragon/roar.mp3'); roarEl.volume = 0.6;

  // Dragon projectile: "Fireball Effect" by NYKNCK (itch.io), five 64x32 frames, drawn as shipped and
  // rotated in code to face its direction of travel.
  const FIREBALL = { frames: [], loaded: 0, fps: 14, scale: 1.7, get ready() { return this.loaded === 5; } };
  for (let i = 1; i <= 5; i++) { const im = new Image(); im.onload = () => { FIREBALL.loaded++; }; im.src = `assets/fireball/fb_0${i}.png`; FIREBALL.frames.push(im); }

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
      roar() { if (muted) return; try { roarEl.currentTime = 0; roarEl.play().catch(() => {}); } catch {} },
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
  function startRun() {
    game = {
      phase: 'running', t: 0, timeLeft: CFG.runSeconds, lastTick: -1,
      score: 0, embers: 0, dist: 0, rebirths: 0, lives: CFG.lives, over: false,
      finale: false, dragon: { x: W + 400, y: 0, anim: 0, attackT: -1, bob: 0, nextAttack: 0.3 }, shots: [], heat: 1, streak: 0, bestStreak: 0, peakSize: CFG.startSize, peakHeat: 1,
      speed: CFG.worldSpeed,
      bird: { x: CFG.birdX, y: H / 2, vy: 0, size: CFG.startSize, alive: true, deadTimer: 0, grace: 0, anim: 0, reborn: 0 },
      obstacles: [], pickups: [], particles: [], floaters: [], eruptions: [],
      stars: makeStars(60), ridgeOff: 0,
      spawnTimer: 1.2, emberTimer: 0.4, shake: 0, flash: 0, flashColor: '255,140,40',
    };
    ui.title.hidden = true; ui.results.hidden = true; ui.paused.hidden = true; ui.hud.hidden = false;
    last = performance.now();
  }

  // ---------------------------------------------------------------- spawning
  const birdRadius = () => CFG.baseRadius * game.bird.size;

  function spawnObstacle() {
    const g = game, r = Math.random(), tier = Math.min(1, g.t / 60);
    const chainLen = () => 40 + Math.random() * (130 + tier * 50);
    if (r < 0.26) {
      // spike block hanging from the ceiling
      const variant = Math.random() < 0.5 ? 'block_1' : 'block_2';
      const bw = 92 + Math.random() * 56, bh = bw * (variant === 'block_1' ? 320 / 284 : 320 / 267), chain = chainLen();
      g.obstacles.push({ type: 'hang', variant, x: W + 80, y: 0, w: bw, h: chain + bh, bw, bh, chain, cw: Math.max(26, bw * 0.24),
        phase: Math.random() * 6.28, sway: 0.08 + Math.random() * 0.08, cx: 0, cy: 0 });
    } else if (r < 0.44) {
      // swinging crescent blade: wider swing, lethal part is the blade below the hook
      const bw = 150 + Math.random() * 70, bh = bw * 249 / 320, chain = chainLen();
      g.obstacles.push({ type: 'swing', variant: 'swing_blade', x: W + 80, y: 0, w: bw, h: chain + bh, bw, bh, chain, cw: Math.max(26, bw * 0.16),
        phase: Math.random() * 6.28, sway: 0.28 + Math.random() * 0.18, cx: 0, cy: 0 });
    } else if (r < 0.6) {
      // spiked log hung level from two chains
      const sw = 230 + Math.random() * 110, sh = sw * 111 / 480, chain = chainLen();
      g.obstacles.push({ type: 'log', variant: 'spike_stick', x: W + 80, y: 0, w: sw, h: chain + sh, sw, sh, chain, cw: Math.max(22, sw * 0.08) });
    } else if (r < 0.8) {
      // saw blade on a wooden post rising from the floor
      const post = Math.random() < 0.5 ? 'post_med' : 'post_small';
      const pw = 46 + Math.random() * 16, ph = pw * (post === 'post_med' ? 400 / 84 : 260 / 116) * (0.8 + Math.random() * 0.5 + tier * 0.3);
      const bs = 110 + Math.random() * 50;
      g.obstacles.push({ type: 'post', variant: post, blade: 'blade_' + (1 + Math.floor(Math.random() * 3)), x: W + 80, y: GROUND - ph, w: Math.max(pw, bs), h: ph, pw, ph, bs,
        spin: Math.random() * 6.28, spinV: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3) });
    } else {
      // free rotating saw blade
      const s = 76 + Math.random() * 60;
      g.obstacles.push({ type: 'blade', variant: 'blade_' + (1 + Math.floor(Math.random() * 3)), x: W + 80, y: 110 + Math.random() * (GROUND - 220 - s), w: s, h: s,
        spin: Math.random() * 6.28, spinV: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3) });
    }
  }
  function spawnEmber() {
    const g = game, gold = false;   // single coin type
    // sometimes spawn a short arc of coins to encourage a path
    if (Math.random() < 0.3) {
      const y0 = 120 + Math.random() * (GROUND - 260), dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 5; i++) g.pickups.push({ x: W + 40 + i * 46, y: y0 + Math.sin(i * 0.7) * 60 * dir, r: 11, gold: false, phase: i * 0.5 });
    } else {
      g.pickups.push({ x: W + 40, y: 90 + Math.random() * (GROUND - 180), r: 11, gold, phase: Math.random() * 6.28 });
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
    updateEruptions(dt, travelled);

    for (const st of g.stars) { st.x -= st.s * dt; if (st.x < 0) { st.x = W; st.y = Math.random() * GROUND; } }

    if (!g.finale && g.timeLeft <= CFG.finaleSeconds) startFinale();
    if (g.finale) updateDragon(dt);
    else {
      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) { spawnObstacle(); g.spawnTimer = Math.max(0.5, 1.45 - g.speed / 1000) + Math.random() * 0.45; }
    }
    g.emberTimer -= dt;
    if (g.emberTimer <= 0) { spawnEmber(); g.emberTimer = 0.5 + Math.random() * 0.55; }

    for (const o of g.obstacles) {
      o.x -= (g.speed + (o.extraSpeed || 0)) * dt;
      if (o.type === 'blade' || o.type === 'post') o.spin += o.spinV * dt;
      if (o.type === 'hang' || o.type === 'swing') {
        o.phase += dt * (o.type === 'swing' ? 1.3 : 1.7);
        const ang = Math.sin(o.phase) * o.sway, len = o.chain + o.bh * (o.type === 'swing' ? 0.62 : 0.5);
        o.cx = o.x + o.w / 2 + Math.sin(ang) * len; o.cy = Math.cos(ang) * len; o.ang = ang;
      }
    }
    for (const p of g.pickups) p.x -= g.speed * dt;
    g.obstacles = g.obstacles.filter(o => o.x + o.w > -40);
    g.pickups = g.pickups.filter(p => p.x > -40);

    const radius = birdRadius();
    if (b.alive) {
      b.grace = Math.max(0, b.grace - dt);
      // Smaller is nimbler, bigger is heavier, but never helpless: the old formula reached zero
      // thrust at 2.25x size. Now it slopes gently and floors at 85% control.
      const agility = Math.max(0.85, Math.min(1.3, 1 + (1 - b.size) * 0.25));
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
      // pickups
      for (let i = g.pickups.length - 1; i >= 0; i--) {
        const p = g.pickups[i], d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < radius + p.r) {
          g.pickups.splice(i, 1);
          collect(p);
        }
      }

      // crash
      const hb = radius * 0.78;
      if (b.grace <= 0) {
        for (const o of g.obstacles) {
          let hit = false;
          if (o.type === 'hang') {
            hit = Math.hypot(o.cx - b.x, o.cy - b.y) < hb + o.bw * 0.44;   // the block is lethal, the chain is not
          } else if (o.type === 'swing') {
            hit = Math.hypot(o.cx - b.x, o.cy - b.y) < hb + o.bw * 0.4;
          } else if (o.type === 'log') {
            const x0 = o.x + o.sw * 0.06, x1 = o.x + o.sw * 0.94, y0 = o.chain + o.sh * 0.2, y1 = o.chain + o.sh * 0.8;
            const cx = Math.max(x0, Math.min(b.x, x1)), cy = Math.max(y0, Math.min(b.y, y1));
            hit = Math.hypot(cx - b.x, cy - b.y) < hb;
          } else if (o.type === 'post') {
            const px = o.x + o.w / 2, top = o.y;
            const bladeHit = Math.hypot(px - b.x, top - b.y) < hb + o.bs / 2 * 0.86;
            const cx = Math.max(px - o.pw * 0.4, Math.min(b.x, px + o.pw * 0.4)), cy = Math.max(top, Math.min(b.y, GROUND));
            hit = bladeHit || Math.hypot(cx - b.x, cy - b.y) < hb;
          } else {
            const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
            hit = Math.hypot(cx - b.x, cy - b.y) < hb + o.w / 2 * 0.86;
          }
          if (hit) { crash(); break; }
        }
      }
    } else {
      b.deadTimer -= dt;
      b.y = Math.min(GROUND - 10, b.y + 120 * dt);
      if (Math.random() < 0.5) g.particles.push({ x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 30, vx: -g.speed * 0.3, vy: -40 - Math.random() * 60, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, c: ash() });
      if (b.deadTimer <= 0) { if (g.lives > 0) rebirth(); else return finishRun('lives'); }
    }

    for (const p of g.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
    g.particles = g.particles.filter(p => p.life > 0);
    for (const f of g.floaters) { f.life -= dt; f.y += f.vy * dt; }
    g.floaters = g.floaters.filter(f => f.life > 0);
    g.shake = Math.max(0, g.shake - dt * 30);
    g.flash = Math.max(0, g.flash - dt * 2);

    updateHud();
  }

  function startFinale() {
    const g = game;
    g.finale = true;
    g.obstacles.length = 0;                     // the cave clears for the boss
    g.dragon.x = W + 400; g.dragon.y = H * 0.42;
    Audio.roar();
  }
  function updateDragon(dt) {
    const g = game, d = g.dragon, b = g.bird;
    d.anim += dt * 8; d.bob += dt;
    d.x = Math.max(W - 340, d.x - 520 * dt);     // sweeps in from the right in about 1.4 s, then holds position
    // tracks the phoenix vertically, with a little lag so it can be outmanoeuvred
    const h = 256 * DRAGON.scale, target = Math.max(h * 0.5 + 30, Math.min(GROUND - h * 0.5 + 20, b.y));
    d.y += (target - d.y) * Math.min(1, dt * 2.2) + Math.sin(d.bob * 1.4) * 0.4;
    if (d.attackT >= 0) { d.attackT += dt; if (d.attackT > 1.1) d.attackT = -1; }
    if (d.x <= W - 340) {
      // the shot timer runs whether or not the attack animation is still playing
      d.nextAttack -= dt;
      if (d.nextAttack <= 0) {
        d.attackT = 0;
        // 1.4 s between shots at the 10 s mark, tightening to about 0.4 s at the end
        const frac = Math.max(0, Math.min(1, g.timeLeft / CFG.finaleSeconds));
        d.nextAttack = 0.4 + frac * 1.0 + Math.random() * 0.15;
        dragonFire();
      }
    }
    // projectiles
    for (const sh of g.shots) { sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.t += dt; }
    g.shots = g.shots.filter(sh => sh.x > -80 && sh.x < W + 80 && sh.y > -80 && sh.y < H + 80);
    if (b.alive && b.grace <= 0) {
      const hb = birdRadius() * 0.78;
      for (const sh of g.shots) {
        if (Math.hypot(sh.x - b.x, sh.y - b.y) < hb + 15) { g.shots = g.shots.filter(o => o !== sh); crash(); break; }
      }
    }
  }
  function dragonFire() {
    const g = game, d = g.dragon, b = g.bird;
    const w = 506 * DRAGON.scale, h = 256 * DRAGON.scale;
    const mx = d.x - w * 0.36, my = d.y - h * 0.2;          // the dragon's mouth, on its left-facing head
    const ang = Math.atan2(b.y - my, b.x - mx);               // aimed at where the phoenix is right now
    const speed = 380 + (CFG.finaleSeconds - Math.max(0, g.timeLeft)) * 22;
    g.shots.push({ x: mx, y: my, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ang, t: Math.random() });
  }
  function drawShots() {
    if (!FIREBALL.ready) return;
    const fw = 64 * FIREBALL.scale, fh = 32 * FIREBALL.scale;
    for (const sh of game.shots) {
      const im = FIREBALL.frames[Math.floor(sh.t * FIREBALL.fps) % 5];
      ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang); ctx.scale(1, -1);   // sprite faces right; rotate to travel direction, unflip
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, -fw * 0.62, -fh / 2, fw, fh);   // core sits near the front of the sprite
      ctx.restore();
    }
  }

  function collect(p) {
    const g = game, b = g.bird;
    g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak);
    const graceMult = b.grace > 0 ? 2 : 1;
    const base = CFG.emberValue;
    const gain = Math.round(base * b.size * g.heat * graceMult);
    g.score += gain; g.embers++;
    b.size = Math.min(CFG.maxSize, b.size + CFG.emberGrow);
    g.peakSize = Math.max(g.peakSize, b.size);
    Audio.ember(g.streak);
  }

  function crash() {
    const g = game, b = g.bird;
    g.lives--;
    b.alive = false; b.deadTimer = CFG.rebirthDelay;
    g.streak = 0;
    g.shake = 18; g.flash = 1; g.flashColor = '255,80,20';
    burst(b.x, b.y, Math.round(60 * b.size), 420, fire, 1.1);
    burst(b.x, b.y, 30, 200, ash, 1.6);
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
    floater('REBORN', b.x + 40, b.y - 70, '#ffe08a', 30);
    Audio.rebirth();
  }

  function finishRun(reason = 'time') {
    const g = game;
    g.phase = 'results';
    g.over = reason === 'lives';
    ui.resHeading.textContent = g.over ? 'OUT OF LIVES' : 'RUN COMPLETE';
    const score = Math.round(g.score), best = loadBest();
    const isBest = score > best;
    if (isBest) saveBest(score);
    ui.resScore.textContent = score.toLocaleString();
    ui.resBest.textContent = isBest ? 'NEW BEST!' : 'Best ' + best.toLocaleString();
    ui.resDist.textContent = Math.round(g.dist).toLocaleString() + ' m';
    ui.resEmbers.textContent = g.embers;
    ui.resRebirths.textContent = g.rebirths;
    ui.resSize.textContent = g.peakSize.toFixed(1) + 'x';
    ui.resStreak.textContent = g.bestStreak;
    ui.resTitle.textContent = rankTitle(g);
    ui.results.hidden = false; ui.hud.hidden = true;
    Audio.finish();
  }
  function rankTitle(g) {
    if (g.over) return 'BURNED OUT. Five falls is all the cave allows.';
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
    ui.rebirths.textContent = g.rebirths;
    ui.hearts.forEach((el, i) => el.classList.toggle('lost', i >= g.lives));
    const tl = Math.max(0, g.timeLeft);
    ui.time.textContent = Math.ceil(tl);
    ui.time.classList.toggle('urgent', tl <= 10);
    ui.timerFill.style.width = (tl / CFG.runSeconds * 100) + '%';
  }

  // ---------------------------------------------------------------- draw
  function drawBird(b) {
    const r = CFG.baseRadius * b.size, t = game.t;
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

  function drawDragon() {
    if (!DRAGON.ready) return;
    const d = game.dragon, attacking = d.attackT >= 0;
    const frames = attacking ? DRAGON.attack : DRAGON.idle;
    const idx = attacking ? Math.min(9, Math.floor(d.attackT / 1.1 * 10)) : Math.floor(d.anim) % 10;
    const im = frames[idx], w = im.width * DRAGON.scale, h = im.height * DRAGON.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, d.x - w / 2 + (attacking ? -30 * Math.sin(Math.min(1, d.attackT) * Math.PI) : 0), d.y - h / 2, w, h);
  }

  function draw() {
    const g = game;
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);

    if (CAVE.ready) {
      // Admurin's layers drawn as shipped, back wall to near rocks, nothing composited on top
      for (const layer of CAVE.layers) drawCaveLayer(layer, g.ridgeOff);
      drawLava(g.ridgeOff, g.t);
      drawEruptions();
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0b0a1a'); sky.addColorStop(1, '#2a0f1e');
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = '#1a0c14'; ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
    }

    for (const o of g.obstacles) {
      if (o.type === 'hang' || o.type === 'swing') {
        ctx.save(); ctx.translate(o.x + o.w / 2, 0); ctx.rotate(o.ang || 0);
        if (TRAPS.ready) {
          ctx.imageSmoothingEnabled = true;
          drawChain(0, -4, o.chain + 6, o.cw);
          ctx.drawImage(TRAPS.img[o.variant], -o.bw / 2, o.chain - 2, o.bw, o.bh);
        } else { ctx.fillStyle = '#4a2a35'; ctx.fillRect(-3, 0, 6, o.chain); ctx.fillRect(-o.bw / 2, o.chain, o.bw, o.bh); }
        ctx.restore();
      } else if (o.type === 'log') {
        if (TRAPS.ready) {
          ctx.imageSmoothingEnabled = true;
          // the log's two rings sit at about 31% and 65% of its width
          drawChain(o.x + o.sw * 0.31, -4, o.chain + 10, o.cw);
          drawChain(o.x + o.sw * 0.65, -4, o.chain + 10, o.cw);
          ctx.drawImage(TRAPS.img[o.variant], o.x, o.chain, o.sw, o.sh);
        } else { ctx.fillStyle = '#4a2a35'; ctx.fillRect(o.x, o.chain, o.sw, o.sh); }
      } else if (o.type === 'post') {
        const px = o.x + o.w / 2;
        if (TRAPS.ready) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(TRAPS.img[o.variant], px - o.pw / 2, o.y, o.pw, o.ph + 8);
          ctx.save(); ctx.translate(px, o.y); ctx.rotate(o.spin);
          ctx.drawImage(TRAPS.img[o.blade], -o.bs / 2, -o.bs / 2, o.bs, o.bs);
          ctx.restore();
          ctx.drawImage(TRAPS.img.nut, px - o.bs * 0.11, o.y - o.bs * 0.11, o.bs * 0.22, o.bs * 0.22);
        } else { ctx.fillStyle = '#4a2a35'; ctx.fillRect(px - o.pw / 2, o.y, o.pw, o.ph); }
      } else if (o.type === 'blade') {
        ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate(o.spin);
        if (TRAPS.ready) { ctx.imageSmoothingEnabled = true; ctx.drawImage(TRAPS.img[o.variant], -o.w / 2, -o.h / 2, o.w, o.h); }
        else { ctx.fillStyle = '#9aa3a8'; ctx.beginPath(); ctx.arc(0, 0, o.w / 2, 0, 6.28); ctx.fill(); }
        ctx.restore();
      }
    }

    for (const p of g.pickups) {
      if (COIN.ready) drawCoin(p.x, p.y, p.r * 2.9, g.t, p.phase);
      else { ctx.fillStyle = '#d98c3a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
    }

    if (g.finale) { drawDragon(); drawShots(); }

    for (const p of g.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life / p.max), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    if (g.bird.alive) drawBird(g.bird);
    else if (g.phase === 'running' || g.phase === 'paused') {
      if (SPRITE.ready) {
        const b = g.bird, prog = 1 - b.deadTimer / CFG.rebirthDelay;
        drawFrame('death', Math.min(5, Math.floor(prog * 6)), b.x, b.y, CFG.baseRadius * b.size * 3.2, CFG.baseRadius * b.size * 3.2);
      }
      ctx.textAlign = 'center';
      if (g.lives > 0) {
        ctx.fillStyle = '#ffb347'; ctx.font = 'bold 44px system-ui'; ctx.fillText('REBIRTH IN ' + (Math.ceil(g.bird.deadTimer * 10) / 10).toFixed(1), W / 2, H / 2 - 40);
        ctx.fillStyle = '#ffe9c7'; ctx.font = '22px system-ui'; ctx.fillText('Smaller. Faster. Hotter.', W / 2, H / 2);
      } else {
        ctx.fillStyle = '#ff6b4d'; ctx.font = 'bold 44px system-ui'; ctx.fillText('BURNED OUT', W / 2, H / 2 - 40);
        ctx.fillStyle = '#ffe9c7'; ctx.font = '22px system-ui'; ctx.fillText('No lives left.', W / 2, H / 2);
      }
    }

    for (const f of g.floaters) { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color; ctx.font = `bold ${f.size}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;

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
  window.__phoenixStep = (dt, n = 1) => { for (let i = 0; i < n && game.phase === 'running'; i++) update(dt); }; // debug: advance the sim without waiting on frames
})();
