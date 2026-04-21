// Last-writer-wins sync for time-of-day scrub offset + weather target intensity.
// TOD is broadcast as an offset in hours from real-world-local time, so each
// client's astronomy (sun azimuth, stars, constellations) stays correct for
// their own location — only the scrub dial is shared.
//
// Frame layout (after 32-byte sender pubkey + 1-byte type at offset 32):
//   33..40  lww_ts_ms (u64 LE)
//   41..44  tod_offset_hours (f32 LE)
//   45..48  weather_intensity (f32 LE)
// Total: 49 bytes.

import { MP_CONFIG } from './config.js';

const FRAME_SIZE = 49;

function encode(senderPk, tsMs, todOffset, weatherIntensity) {
  const buf = new ArrayBuffer(FRAME_SIZE);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set(senderPk, 0);
  dv.setUint8(32, MP_CONFIG.FRAME_TYPE_WORLD_STATE);
  dv.setBigUint64(33, BigInt(tsMs), true);
  dv.setFloat32(41, todOffset, true);
  dv.setFloat32(45, weatherIntensity, true);
  return u8;
}

function decode(bytes) {
  if (bytes.length < FRAME_SIZE) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint8(32) !== MP_CONFIG.FRAME_TYPE_WORLD_STATE) return null;
  return {
    tsMs: Number(dv.getBigUint64(33, true)),
    todOffset: dv.getFloat32(41, true),
    weatherIntensity: dv.getFloat32(45, true),
  };
}

export class WorldStateSync {
  constructor({ relay, identity, dayNight, weather }) {
    this.relay = relay;
    this.identity = identity;
    this.dayNight = dayNight;
    this.weather = weather;
    this.lwwTs = 0;
    this._prevTod = dayNight.timeOffset;
    this._prevWeather = weather.targetIntensity;
    this._heartbeatAccum = 0;
    this._throttle = 0;
    this._dirty = false;
    this._applyingRemote = false;
  }

  onFrame(bytes) {
    const d = decode(bytes);
    if (!d) return;
    if (d.tsMs <= this.lwwTs) return;
    this.lwwTs = d.tsMs;

    this._applyingRemote = true;
    this.dayNight.timeOffset = Math.max(-12, Math.min(12, d.todOffset));
    this.weather.setTarget(d.weatherIntensity);
    this._prevTod = this.dayNight.timeOffset;
    this._prevWeather = this.weather.targetIntensity;
    this._applyingRemote = false;
  }

  update(delta) {
    if (!this._applyingRemote) {
      const todChanged = Math.abs(this.dayNight.timeOffset - this._prevTod) > 0.001;
      const weatherChanged = Math.abs(this.weather.targetIntensity - this._prevWeather) > 0.001;
      if (todChanged || weatherChanged) {
        this._prevTod = this.dayNight.timeOffset;
        this._prevWeather = this.weather.targetIntensity;
        this.lwwTs = Date.now();
        this._dirty = true;
      }
    }

    this._throttle -= delta;
    this._heartbeatAccum += delta;

    if (this._dirty && this._throttle <= 0) {
      this._send();
      this._throttle = MP_CONFIG.WORLD_BROADCAST_THROTTLE_SECONDS;
      this._heartbeatAccum = 0;
      this._dirty = false;
    } else if (this._heartbeatAccum >= MP_CONFIG.WORLD_HEARTBEAT_SECONDS && this.lwwTs > 0) {
      this._send();
      this._heartbeatAccum = 0;
    }
  }

  _send() {
    if (!this.relay.connected || this.lwwTs === 0) return;
    const frame = encode(
      this.identity.publicKeyBytes,
      this.lwwTs,
      this.dayNight.timeOffset,
      this.weather.targetIntensity,
    );
    this.relay.send(frame);
  }
}
