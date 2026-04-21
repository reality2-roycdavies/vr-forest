// Broadcasts the local player head pose over the relay at a fixed rate.

import * as THREE from 'three';
import { MP_CONFIG } from './config.js';
import { encodePose } from './protocol.js';

export class AvatarSender {
  constructor({ relay, identity, camera }) {
    this.relay = relay;
    this.identity = identity;
    this.camera = camera;
    this._interval = 1.0 / MP_CONFIG.POSE_TICK_HZ;
    this._accum = 0;
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  update(delta) {
    this._accum += delta;
    if (this._accum < this._interval) return;
    this._accum = 0;
    if (!this.relay.connected) return;

    this.camera.getWorldPosition(this._pos);
    this.camera.getWorldQuaternion(this._quat);
    const frame = encodePose(this.identity.publicKeyBytes, this._pos, this._quat);
    this.relay.send(frame);
  }
}
