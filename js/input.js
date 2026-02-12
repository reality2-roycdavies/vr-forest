// Controller thumbstick + button polling + desktop mouse look
import { CONFIG } from './config.js';

const MOUSE_SENSITIVITY = 0.002;
const PITCH_LIMIT = Math.PI * 0.45; // ~81 degrees up/down

export class InputManager {
  constructor(vrSetup) {
    this.vrSetup = vrSetup;
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };
    this.jumpPressed = false;
    this.timeAdjust = 0; // -1..1 for time scrubbing
    this.rightGrip = false;
    this.leftGrip = false;
    this.sprintPressed = false;
    this.weatherCycle = 0; // +1 to cycle forward, -1 backward

    // Mouse look state (desktop only)
    this.mouseYaw = 0;    // accumulated yaw (applied to dolly)
    this.mousePitch = 0;  // accumulated pitch (applied to camera)
    this.mouseDX = 0;     // delta this frame
    this.mouseDY = 0;
    this.pointerLocked = false;

    // Desktop keyboard
    this.keys = {};
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Pointer lock for mouse look
    const canvas = vrSetup.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.vrSetup.isInVR() && !this.pointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  update() {
    this.leftStick.x = 0;
    this.leftStick.y = 0;
    this.rightStick.x = 0;
    this.rightStick.y = 0;
    this.jumpPressed = false;
    this.timeAdjust = 0;
    this.rightGrip = false;
    this.leftGrip = false;
    this.sprintPressed = false;
    this.weatherCycle = 0;

    if (this.vrSetup.isInVR()) {
      this._pollGamepads();
      // Right grip + right stick Y = time scrub
      if (this.rightGrip && Math.abs(this.rightStick.y) > 0) {
        this.timeAdjust = -this.rightStick.y; // push forward = advance time
      }
    } else {
      this._pollKeyboard();
      this._processMouseLook();
      // [ and ] keys for desktop time adjustment
      if (this.keys['BracketLeft']) this.timeAdjust = -1;
      else if (this.keys['BracketRight']) this.timeAdjust = 1;
      // 1/2/3 keys for weather control (edge-triggered via _weatherKeyLast)
      const wk = this.keys['Digit1'] ? 1 : this.keys['Digit2'] ? 2 : this.keys['Digit3'] ? 3 : 0;
      if (wk !== 0 && wk !== this._weatherKeyLast) this.weatherCycle = wk;
      this._weatherKeyLast = wk;
    }
  }

  _processMouseLook() {
    if (this.mouseDX === 0 && this.mouseDY === 0) return;

    this.mouseYaw -= this.mouseDX * MOUSE_SENSITIVITY;
    this.mousePitch -= this.mouseDY * MOUSE_SENSITIVITY;
    this.mousePitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.mousePitch));

    // Reset deltas
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /**
   * Apply mouse look to dolly (yaw) and camera (pitch).
   * Called from movement system after it has the dolly/camera refs.
   */
  applyMouseLook(dolly, camera) {
    if (this.vrSetup.isInVR()) return;

    dolly.rotation.y = this.mouseYaw;
    camera.rotation.x = this.mousePitch;
  }

  _pollGamepads() {
    // Try session.inputSources first, fall back to renderer's getController approach
    const session = this.vrSetup.renderer.xr.getSession();
    if (!session) return;

    const sources = session.inputSources;
    if (!sources || sources.length === 0) return;

    for (const source of sources) {
      if (!source.gamepad) continue;
      const axes = source.gamepad.axes;
      const buttons = source.gamepad.buttons;

      // Quest controllers: thumbstick on axes 2,3; fallback to 0,1
      const sx = axes.length > 2 ? (axes[2] ?? 0) : (axes[0] ?? 0);
      const sy = axes.length > 3 ? (axes[3] ?? 0) : (axes[1] ?? 0);

      if (source.handedness === 'left') {
        this.leftStick.x = Math.abs(sx) > CONFIG.THUMBSTICK_DEADZONE ? sx : 0;
        this.leftStick.y = Math.abs(sy) > CONFIG.THUMBSTICK_DEADZONE ? sy : 0;
        if ((buttons[4] && buttons[4].pressed) || (buttons[3] && buttons[3].pressed)) {
          this.jumpPressed = true;
        }
        // Left grip = button 1
        this.leftGrip = buttons[1] && buttons[1].pressed;
        if (this.leftGrip) this.sprintPressed = true;
        // Left trigger = weather cycle (edge-triggered)
        const leftTrigger = buttons[0] && buttons[0].pressed;
        if (leftTrigger && !this._lastLeftTrigger) this.weatherCycle = -1; // cycle: next state
        this._lastLeftTrigger = leftTrigger;
      } else if (source.handedness === 'right') {
        this.rightStick.x = Math.abs(sx) > CONFIG.THUMBSTICK_DEADZONE ? sx : 0;
        this.rightStick.y = Math.abs(sy) > CONFIG.THUMBSTICK_DEADZONE ? sy : 0;
        if ((buttons[4] && buttons[4].pressed) || (buttons[3] && buttons[3].pressed)) {
          this.jumpPressed = true;
        }
        // Right grip = button 1
        this.rightGrip = buttons[1] && buttons[1].pressed;
      }
    }
  }

  _pollKeyboard() {
    if (this.keys['KeyW']) this.leftStick.y = -1;
    if (this.keys['KeyS']) this.leftStick.y = 1;
    if (this.keys['KeyA']) this.leftStick.x = -1;
    if (this.keys['KeyD']) this.leftStick.x = 1;
    if (this.keys['KeyQ']) this.rightStick.x = -1;
    if (this.keys['KeyE']) this.rightStick.x = 1;
    if (this.keys['Space']) this.jumpPressed = true;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) this.sprintPressed = true;
  }
}
