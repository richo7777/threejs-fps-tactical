// input.js — keyboard + mouse state, pointer-lock helpers (Dustline).
// No imports; main.js wires this into the player / arsenal / match.

export function createInput() {
  const keys = new Set();
  const input = {
    keys,
    mouseDX: 0,
    mouseDY: 0,
    firing: false,

    get locked() { return document.pointerLockElement != null; },

    down(code) { return keys.has(code); },

    // Returns accumulated look deltas since last call, then zeroes them.
    consumeLook() {
      const dx = input.mouseDX, dy = input.mouseDY;
      input.mouseDX = 0; input.mouseDY = 0;
      return { dx, dy };
    },

    lock(el) {
      const target = el || document.body;
      if (document.pointerLockElement !== target) target.requestPointerLock();
    },

    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },

    // Crouch held: C or either Ctrl. Jump held: Space.
    get crouchHeld() { return keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight'); },
    get jumpHeld() { return keys.has('Space'); },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    },
  };

  function onKeyDown(e) {
    // Ignore repeats and typing into form fields.
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!input.locked) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button === 0 && input.locked) input.firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) input.firing = false;
  }
  function onBlur() {
    keys.clear();
    input.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  return input;
}
