# AshboelPunks — Solmar Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Agusgarut/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Agusgarut/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the make.fun **gta6-01 "Make GTA 6"**
bounty. Everything is our own: the city of Solmar Bay, the story of Dani
Reyes, the cars, the characters, the art, the sound and the music. Nothing
from any commercial game.

## The game

Dani Reyes is a courier driver pulled into Solmar Bay's criminal underworld.
Explore a sun-soaked coastal city on foot and by car, steal cars, outrun the
police, and work through 6 story missions.

- **Open world**: a full city grid — Downtown, Old Town, Marina, Industrial,
  Beachfront — with a beach, palms, traffic and pedestrians.
- **Driving**: arcade handling, carjacking (parked and occupied cars),
  several car types, police chases.
- **Wanted system**: 0–5 stars. Police cars ram you, foot officers chase
  you down. Stay hidden and the heat cools off.
- **Missions**: 6 jobs with briefings, beacons, objectives and cash rewards —
  courier runs, a debt collection, a street race, a hot car, a warehouse
  shootout and one last escape.
- **Combat**: fists and a pistol, armed enemies, health and ammo.
- **HUD + minimap**: health, money, wanted stars, speed, clock, district,
  mission objective and a live minimap.
- **Polish**: day/night cycle with sunsets, shadows, procedural WebAudio
  (engine, sirens, gunshots, music loop), save/load, pause and game over.

## Play

Open `game/index.html` in desktop Chrome (serve `game/` with any static
server, e.g. `node serve.ts` then http://localhost:8080). No network, no
build step — every file the game loads lives under `game/`.

| Key | Action |
| --- | --- |
| WASD | Walk / drive |
| Shift | Run |
| Space | Jump |
| E | Enter / exit car |
| M | Start next mission |
| Q | Switch weapon (fists / pistol) |
| F / right click | Punch |
| Left click | Shoot |
| P | Pause |
| N | Mute |

## Tech

Three.js (vendored under `game/vendor/`), plain ES modules, no build step.
The entry program `main.ts` (Node 22, standard library only) copies `game/`
and `screenshots/` to `/output` and writes `/output/dossier.json`.

## License

MIT — see [LICENSE](LICENSE).
