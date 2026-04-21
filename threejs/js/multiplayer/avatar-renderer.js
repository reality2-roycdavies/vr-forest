// Ghostly remote avatar: translucent pale head + tapering body, gentle drift.
// One Group per peer, identified by the sender's public key hex.

import * as THREE from 'three';
import { MP_CONFIG } from './config.js';
import { decodePose } from './protocol.js';

const HEAD_RADIUS = 0.13;
const BODY_TOP_R = 0.16;
const BODY_BOT_R = 0.28;
const BODY_HEIGHT = 1.35;
const BODY_OFFSET_Y = -(HEAD_RADIUS + BODY_HEIGHT * 0.5 - 0.02);
const GHOST_COLOR = new THREE.Color(0.75, 0.92, 1.0);
const LERP_RATE = 12.0;    // head pos/quat follow speed
const BOB_HZ = 0.35;
const BOB_AMP = 0.04;

function buildAvatar() {
  const group = new THREE.Group();
  group.frustumCulled = false;

  const headGeom = new THREE.SphereGeometry(HEAD_RADIUS, 14, 10);
  const bodyGeom = new THREE.CylinderGeometry(BODY_TOP_R, BODY_BOT_R, BODY_HEIGHT, 12, 1, true);

  const mat = new THREE.MeshBasicMaterial({
    color: GHOST_COLOR,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });

  const head = new THREE.Mesh(headGeom, mat);
  head.renderOrder = 10;
  group.add(head);

  const body = new THREE.Mesh(bodyGeom, mat);
  body.position.y = BODY_OFFSET_Y;
  body.renderOrder = 10;
  group.add(body);

  return { group, mat };
}

export class AvatarRenderer {
  constructor(scene, selfPubKeyHex = '') {
    this.scene = scene;
    this.selfHex = selfPubKeyHex;
    this.peers = new Map(); // senderHex -> peer record
    this._now = 0;
    this._tmpQ = new THREE.Quaternion();
    this._tmpE = new THREE.Euler();
  }

  onFrame(bytes) {
    const decoded = decodePose(bytes);
    if (!decoded) return;
    if (decoded.senderHex === this.selfHex) return;

    let peer = this.peers.get(decoded.senderHex);
    if (!peer) {
      const { group, mat } = buildAvatar();
      this.scene.add(group);
      peer = {
        group, mat,
        smoothPos: new THREE.Vector3(decoded.head.pos.x, decoded.head.pos.y, decoded.head.pos.z),
        target: { pos: new THREE.Vector3(), yaw: 0 },
        phase: Math.random() * Math.PI * 2,
        lastSeen: this._now,
        baseOpacity: mat.opacity,
      };
      group.position.copy(peer.smoothPos);
      this.peers.set(decoded.senderHex, peer);
    }

    peer.target.pos.set(decoded.head.pos.x, decoded.head.pos.y, decoded.head.pos.z);
    this._tmpQ.set(decoded.head.quat.x, decoded.head.quat.y, decoded.head.quat.z, decoded.head.quat.w);
    this._tmpE.setFromQuaternion(this._tmpQ, 'YXZ');
    peer.target.yaw = this._tmpE.y;
    peer.lastSeen = this._now;
  }

  update(delta) {
    this._now += delta;
    const k = 1.0 - Math.exp(-LERP_RATE * delta);

    for (const [hex, peer] of this.peers) {
      const age = this._now - peer.lastSeen;

      if (age > MP_CONFIG.PEER_REMOVE_SECONDS) {
        this.scene.remove(peer.group);
        peer.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        this.peers.delete(hex);
        continue;
      }

      peer.smoothPos.lerp(peer.target.pos, k);
      const bob = Math.sin(this._now * Math.PI * 2 * BOB_HZ + peer.phase) * BOB_AMP;
      peer.group.position.set(peer.smoothPos.x, peer.smoothPos.y + bob, peer.smoothPos.z);

      const curYaw = peer.group.rotation.y;
      let dy = peer.target.yaw - curYaw;
      while (dy >  Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      peer.group.rotation.y = curYaw + dy * k;

      const fade = age < MP_CONFIG.PEER_FADE_SECONDS
        ? 1.0
        : Math.max(0, 1.0 - (age - MP_CONFIG.PEER_FADE_SECONDS) / (MP_CONFIG.PEER_REMOVE_SECONDS - MP_CONFIG.PEER_FADE_SECONDS));
      peer.mat.opacity = peer.baseOpacity * fade;
    }
  }

  get peerCount() {
    return this.peers.size;
  }
}
