# Hack Haven NYC 2026

Theme: **Bounce Back**. Two browser game prototypes, each a single HTML file with
no dependencies.

## Run

```bash
python3 -m http.server 8000
```

- Phoenix Run: http://localhost:8000/index.html
- Knockdown: http://localhost:8000/knockdown.html

Or double-click either file to open it directly.

## Phoenix Run (`index.html`)

Endless runner where crashing never ends the run. You burn, respawn seconds
later smaller and faster, and rebuild your size by collecting embers.

- `↑` / `W` rise, `↓` / `S` dive. `Space` start, `R` restart.
- Embers grow you. Bigger scores more per ember but is a bigger target.
- Each rebirth resets size to 0.55x, speeds up the world, and counts a comeback.

## Knockdown (`knockdown.html`)

Arena brawler where every enemy hit floors you. The fight is getting back up.

- `A` / `D` move. `Space` punch, and `Space` again to get up when down.
- When floored, a marker sweeps a bar. Press in the green zone for a Perfect
  Rise: a shockwave knocks enemies back and you get 3.5 seconds of rage.
  Press outside the zone and you still get up, just slower.
- Every comeback raises Grit. Grit increases damage, reach, speed, and get-up
  speed. The marker gets faster each knockdown so timing gets harder.
- Enemies stomp you while down, draining Resolve. Resolve at zero ends the run.
- Rounds grow in size. Purple heavies appear from round 3.
