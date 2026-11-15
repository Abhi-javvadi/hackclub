# Phoenix Run

Hack Haven NYC, November 2026. Theme: **Bounce Back**.

An endless runner where crashing never ends the run. You burn, respawn a few
seconds later smaller and faster, and rebuild your size by collecting embers.
Every rebirth makes the fire hotter.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Controls

- `↑` / `W` rise, `↓` / `S` dive
- `Space` start, `R` restart

## Mechanics

- Embers grow your size. Bigger phoenix scores more per ember but is a bigger target.
- Smaller phoenix is more agile.
- Crashing triggers a rebirth: size resets to 0.55x, world speed increases, comeback counter goes up.
