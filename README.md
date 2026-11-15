# Phoenix Run

Hack Haven NYC 2026. Theme: **Bounce Back**.

A 90-second canvas flyer with five lives. Crash and you burn, then rise again
smaller and faster, and every rebirth raises your Heat multiplier. Lose all
five lives and the run ends early.
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

- Score comes mostly from bronze coins. Each coin is worth `10 × size × heat`.
- Size grows with every coin up to 2.6x. Bigger means more points but a bigger hitbox and less agility.
- Distance adds a small trickle.
- You start with 5 lives. Each crash costs one. At zero the run ends, whatever the timer says.
- Crashing resets size to 0.55x and starts a 1.5 second rebirth. On rebirth, Heat goes up by 0.5 and world speed increases.
- After rebirth you get 2.5 seconds of Second Wind: invulnerable, and coins pay double.
- Best score is saved in the browser.

## Tuning

Every number that matters is in the `CFG` object at the top of `game.js`.
Run length, speed ramp, gravity, ember values, heat per rebirth, and grace
time can all be changed there without touching game logic.

## Finale

For the last 10 seconds all hazards stop spawning and any on screen are cleared.
The shadow dragon sweeps in from the right, tracks the phoenix vertically, and
fires bursts of NYKNCK's fireball at the phoenix's current position. Bursts grow
from two to four shots, come more often, and fly faster as the clock runs down. A fireball hit costs a life like any hazard.

## Hazards

- Spike blocks hanging from the ceiling on swaying chains. The block is lethal, the chain is not.
- A swinging crescent blade on a chain, with a wide arc
- A spiked log hung level from two chains
- Saw blades mounted on wooden posts rising from the floor
- Free rotating saw blades

## Credits

- Phoenix sprite: "Phoenix (reborn)" by Chasersgaming, CC0, from
  [OpenGameArt](https://opengameart.org/content/phoenix-reborn). See `assets/CREDITS.md`.
  The sheet has fly, death, and reborn rows, and the game uses all three.
- Cave backdrop: "Parallax Backgrounds: Caves" by Admurin, free for any project, from
  [itch.io](https://admurin.itch.io/parallax-backgrounds-caves). Seven layers scroll at different speeds.
- Obstacles: "2d obstacle collection" by Game Developer Studio, CC-BY 4.0, from
  [OpenGameArt](https://opengameart.org/content/2d-obstacle-collection). Chains are the pack's
  chain piece resized to length at draw time.
- Lava floor: "animated lava 16x32", CC0, from
  [OpenGameArt](https://opengameart.org/content/animated-lava-16x32).
- Lava eruptions: "Free Flame Effects Sprite Pack" by CraftPix.net, freebie license, from
  [CraftPix](https://craftpix.net/freebies/free-flame-effects-sprite-pack/).
- Coins: "Pixel Coins" by TotusLotus, free for personal and commercial use, from
  [itch.io](https://totuslotus.itch.io/pixel-coins).
- Hearts: "2D Heart Assets" by AXIALE, free to use, from
  [itch.io](https://axiale.itch.io/2d-heart-assets).
- Finale dragon: "Shadow Demon Dragon" by Vinzes, free for commercial use, from
  [itch.io](https://vinzes.itch.io/epic-2d-pixel-art-shadow-demon-dragon-with-10-animations-sfx).
- Fireball: "Fireball Effect" by NYKNCK, from [itch.io](https://nyknck.itch.io/pixelarteffectfx017).
