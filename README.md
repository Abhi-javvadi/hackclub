# Phoenix Run

Hack Haven NYC 2026. Theme: **Bounce Back**.

A 90-second canvas flyer where crashing never ends the run. You burn, rise
again smaller and faster, and every rebirth raises your Heat multiplier.
Plain HTML, CSS, and JavaScript. No build step, no dependencies.

## Run it

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Double-clicking `index.html` also works.

## Files

- `index.html` markup for the canvas, HUD, title, results, and pause screens
- `style.css` all styling
- `game.js` the whole game: config, audio, input, update loop, rendering
- `assets/` sprite sheet and credits
- `prototypes/` earlier throwaway builds (Phoenix v0 and the Knockdown idea)

## Controls

| Action | Keys |
| --- | --- |
| Rise | `↑` or `W`, or hold touch / mouse |
| Dive | `↓` or `S` |
| Start / play again | `Space`, tap, or the button |
| Pause | `P` |
| Mute | `M` |
| Restart mid-run | `R` |

## How scoring works

- Score comes mostly from embers. Each ember is worth `10 × size × heat`.
- Golden embers are rare and worth `60 × size × heat`, and grow you three times as much.
- Size grows with every ember up to 2.6x. Bigger means more points but a bigger hitbox and less agility.
- Distance adds a small trickle.
- Crashing resets size to 0.55x and starts a 1.5 second rebirth. On rebirth, Heat goes up by 0.5 and world speed increases.
- After rebirth you get 2.5 seconds of Second Wind: invulnerable, embers are pulled toward you, and embers pay double.
- Best score is saved in the browser.

## Tuning

Every number that matters is in the `CFG` object at the top of `game.js`.
Run length, speed ramp, gravity, ember values, heat per rebirth, and grace
time can all be changed there without touching game logic.

## Hazards

- Spike blocks hanging from the ceiling on swaying chains. The block is lethal, the chain is not.
- Rotating saw blades
- Storm crows that weave up and down and move faster than the world

## Credits

- Phoenix sprite: "Phoenix (reborn)" by Chasersgaming, CC0, from
  [OpenGameArt](https://opengameart.org/content/phoenix-reborn). See `assets/CREDITS.md`.
  The sheet has fly, death, and reborn rows, and the game uses all three.
- Cave backdrop: "Parallax Backgrounds: Caves" by Admurin, free for any project, from
  [itch.io](https://admurin.itch.io/parallax-backgrounds-caves). Seven layers scroll at different speeds.
- Obstacles: "2d obstacle collection" by Game Developer Studio, CC-BY 4.0, from
  [OpenGameArt](https://opengameart.org/content/2d-obstacle-collection). Chains are the pack's
  chain piece tiled at draw time.
- Lava floor: "animated lava 16x32", CC0, from
  [OpenGameArt](https://opengameart.org/content/animated-lava-16x32).
