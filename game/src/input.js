// Keyboard and mouse input for the 3D game.
// Held keys are read every frame; one-shot presses (enter car, punch, shoot,
// pause, confirm) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_WEAPON = 32;
export const ACTION_JUMP = 64;
export const ACTION_RADIO = 128;
export const ACTION_HORN = 256;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  // Mouse: drag orbits the camera, click shoots / punches. Vertical drag
  // tilts the camera pitch (see player.updateCamera).
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') actions |= ACTION_JUMP;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER_CAR;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyQ') actions |= ACTION_WEAPON;
    else if (event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyR') actions |= ACTION_RADIO;
    else if (event.code === 'KeyH') actions |= ACTION_HORN;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false;
  });

  // Listen on the window, not the canvas: the title / pause / game-over
  // screens cover the canvas, and a click anywhere must reach the game
  // (start on the title screen, shoot while playing).
  window.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.button === 0) actions |= ACTION_SHOOT;
    if (event.button === 2) actions |= ACTION_PUNCH;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.clientX - lastX;
    dragY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  function held(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** -1..1 forward/back, -1..1 left/right, from the held movement keys. */
    move() {
      const f = (held(FORWARD) ? 1 : 0) - (held(BACK) ? 1 : 0);
      const s = (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0);
      return { forward: f, strafe: s, run: held(RUN) };
    },
    /** Mouse drag since the last call, in pixels, for the camera orbit. */
    takeDrag() {
      const d = dragX;
      dragX = 0;
      return d;
    },
    /** Vertical mouse drag since the last call, for the camera pitch. */
    takeDragY() {
      const d = dragY;
      dragY = 0;
      return d;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
