// AshboelPunks — the gta6-01 entry program (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js and
// the Anton font vendored under game/vendor/, no network request at all).
// This program hands the game in: it copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, using the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// AshboelPunks: Solmar Bay, an original open-world crime game. The program
// itself is just the handoff — the game lives in game/ and screenshots/.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 262144;
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 50331648;
const MAX_GAME_PATH_BYTES = 1000;
const TEXT_MAX_BYTES = 163840;

// The scorer refuses more than 4 screenshots or one over 256 KiB, so check
// the set before copying: a bad screenshot is a failed entry, not a warning.
function listShots() {
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) return [];
  return readdirSync(shotsDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

function validateShots(files) {
  if (files.length > MAX_SHOTS) {
    throw new Error(`too many screenshots: ${files.length} (max ${MAX_SHOTS})`);
  }
  for (const file of files) {
    const bytes = statSync(join(here, 'screenshots', file)).size;
    if (bytes > MAX_SHOT_BYTES) {
      throw new Error(`screenshot ${file} is ${bytes} bytes (max ${MAX_SHOT_BYTES})`);
    }
  }
}

// Fail fast with a clear message when the game entry point is missing,
// instead of copying a broken game/ and failing at the grader.
for (const required of ['game/index.html', 'game/src/main.js']) {
  if (!existsSync(join(here, required))) {
    throw new Error(`missing required file: ${required}`);
  }
}

const shotFiles = listShots();
validateShots(shotFiles);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
console.log(`AshboelPunks -> ${out}: game/ copied, ${shotFiles.length} screenshot(s) (${shotFiles.join(', ') || 'none'})`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all, or a path under game/ over 1000 bytes: game/
// counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: MAX_SHOTS, max_bytes: MAX_SHOT_BYTES },
    game_max_files: MAX_GAME_FILES,
    game_max_bytes: MAX_GAME_BYTES,
    game_path_max_bytes: MAX_GAME_PATH_BYTES,
  }),
);
