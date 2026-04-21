// Multiplayer relay + room constants.
export const MP_CONFIG = {
  RELAY_URL: 'wss://relay.reality2.ai/r2',
  // 8-byte trust group = shared "room" for every VR-Forest client.
  TRUST_GROUP_HEX: 'd4f04e577b3ca9b1',
  POSE_TICK_HZ: 15,
  PEER_FADE_SECONDS: 2.0,
  PEER_REMOVE_SECONDS: 10.0,
  FRAME_TYPE_POSE: 1,
  FRAME_TYPE_WORLD_STATE: 2,
  WORLD_HEARTBEAT_SECONDS: 5.0,
  WORLD_BROADCAST_THROTTLE_SECONDS: 0.15,
};
