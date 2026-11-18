# AshboelPunks — Solmar Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Agusgarut/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Agusgarut/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the make.fun **gta6-01 "Make GTA 6"**
bounty. Everything is our own: the coastal city of Solmar Bay, the story of
courier Dani Reyes, the cars, the characters, the art, the sound and the
music. Nothing from any commercial game — no borrowed names, places, art or
audio.

## The game

Dani Reyes is a courier driver pulled into Solmar Bay's criminal underworld.
Explore a sun-soaked beachfront city on foot and by car, steal cars, outrun
the Solmar Bay Police Department, and work through 6 story missions.

- **Open world**: a full city grid — Downtown, Old Town, Marina, Industrial,
  Beachfront — with a beach, red-trunked palms, traffic and pedestrians.
- **Golden hour**: the game opens at sunset — warm light, long shadows, a
  low amber sun over the sea, neon signs and lit windows as dusk falls.
- **Beachfront drive**: Ocean boulevard runs right along the sand, palms on
  both sides, the pier and the ferris wheel ahead, umbrellas and strollers
  on the beach.
- **Driving**: arcade handling, carjacking (parked and occupied cars), nine
  car types (sedan, coupe, taxi, van, sport, muscle, pickup, convertible,
  box truck), police chases with a helicopter at 3+ stars and roadblocks at
  4 stars.
- **Wanted system**: 0–5 stars. Police cars ram you, foot officers chase
  you down, the helicopter circles overhead. Stay hidden and the heat cools
  off one star at a time.
- **Missions**: 6 jobs with briefings, a big mission banner, character
  dialogue, beacons, objectives and cash rewards — courier runs, a debt
  collection, a street race, a hot car, a warehouse shootout and one last
  escape.
- **Combat**: fists and a pistol, armed enemies, health + armor, ammo.
- **HUD, GTA-style**: health and armor bars, big money + clock + wanted
  stars top-right with weapon chips, an always-on mission tracker (chapter,
  timer, objective, STAGE bar, NEXT), a live police dispatch list, radio
  station + car card with a CONDITION bar, a big speed readout, a RESPECT
  meter under the minimap, and a live minimap with district labels — plus a
  full-screen city map on Tab.
- **Radio**: three procedural stations (SOLMAR FM 101.9, WAVE 88.1, BAY
  ROCK 94.5) — press R to change station.
- **Polish**: day/night cycle with sunsets, shadows, procedural WebAudio
  (engine, sirens, gunshots, music loop), save/load, pause and game over.

## Play

Open `game/index.html` in desktop Chrome (serve `game/` with any static
server, e.g. `node serve.ts` then http://localhost:8080). No network, no
build step — every file the game loads lives under `game/`, including the
Anton display font and Three.js.

| Key | Action |
| --- | --- |
| WASD | Walk / drive |
| Shift | Run / handbrake in a car |
| Space | Jump |
| E | Enter / exit car |
| M | Start next mission |
| Q | Switch weapon (fists / pistol) |
| F / right click | Punch |
| Left click | Shoot |
| R | Change radio station |
| H | Honk (in a car) |
| Tab | Full-screen city map |
| P | Pause |
| N | Mute |

## Screenshots

The four staged shots (`screenshots/`) are deterministic: run the game
with `?shot=start|drive|mission|chase&seed=7` and the same seed always
paints the same frame. The local test harness in `~/workspace/pwtest/`
(Playwright) re-takes them and checks for console errors and external
requests.

## Tech

Three.js (vendored under `game/vendor/`), plain ES modules, no build step.
The entry program `main.ts` (Node 22, standard library only) copies `game/`
and `screenshots/` to `/output` and writes `/output/dossier.json`.

## License

MIT — see [LICENSE](LICENSE). The Anton font is OFL (see the notices at
the top of LICENSE).
