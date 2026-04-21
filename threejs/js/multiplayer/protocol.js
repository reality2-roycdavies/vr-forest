// Binary frame layout (little-endian):
//   0..31   sender public key (32 bytes)
//   32      frame type
//   33..44  head position x,y,z (3 × float32)
//   45..60  head quaternion x,y,z,w (4 × float32)
// Total: 61 bytes.

import { MP_CONFIG } from './config.js';

const FRAME_SIZE = 61;

export function encodePose(senderPkBytes, headPos, headQuat) {
  const buf = new ArrayBuffer(FRAME_SIZE);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set(senderPkBytes, 0);
  dv.setUint8(32, MP_CONFIG.FRAME_TYPE_POSE);
  dv.setFloat32(33, headPos.x, true);
  dv.setFloat32(37, headPos.y, true);
  dv.setFloat32(41, headPos.z, true);
  dv.setFloat32(45, headQuat.x, true);
  dv.setFloat32(49, headQuat.y, true);
  dv.setFloat32(53, headQuat.z, true);
  dv.setFloat32(57, headQuat.w, true);
  return u8;
}

export function decodePose(bytes) {
  if (bytes.length < FRAME_SIZE) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint8(32) !== MP_CONFIG.FRAME_TYPE_POSE) return null;
  const senderPk = bytes.slice(0, 32);
  let senderHex = '';
  for (const b of senderPk) senderHex += b.toString(16).padStart(2, '0');
  return {
    senderPk,
    senderHex,
    head: {
      pos:  { x: dv.getFloat32(33, true), y: dv.getFloat32(37, true), z: dv.getFloat32(41, true) },
      quat: { x: dv.getFloat32(45, true), y: dv.getFloat32(49, true), z: dv.getFloat32(53, true), w: dv.getFloat32(57, true) },
    },
  };
}
