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

// One-shot keys: code -> action flag, looked up in the keydown handler.
const ACTION_KEYS = {
  Space: ACTION_JUMP,
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_PUNCH,
  KeyQ: ACTION_WEAPON,
  Enter: ACTION_CONFIRM,
  KeyR: ACTION_RADIO,
  KeyH: ACTION_HORN,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
};

// Held movement keys, grouped by direction so WASD and arrows agree.
const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

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

  function heldAny(codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const flag = ACTION_KEYS[event.code];
    if (flag) actions |= flag;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    // A press queued before the blur must not fire after refocus.
    actions = 0;
    dragX = 0;
    dragY = 0;
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

  return {
    /** -1..1 forward/back, -1..1 left/right, from the held movement keys. */
    move() {
      const forward = (heldAny(MOVE_KEYS.forward) ? 1 : 0) - (heldAny(MOVE_KEYS.back) ? 1 : 0);
      const strafe = (heldAny(MOVE_KEYS.right) ? 1 : 0) - (heldAny(MOVE_KEYS.left) ? 1 : 0);
      return { forward, strafe, run: heldAny(MOVE_KEYS.run) };
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
