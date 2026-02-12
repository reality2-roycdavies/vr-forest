// All tunable constants for VR Endless Forest

export const CONFIG = {
  // Terrain
  CHUNK_SIZE: 32,           // meters per chunk side
  CHUNK_SEGMENTS: 95,       // vertices per side (96x96 grid = 95x95 quads ≈ 18k tris)
  LOAD_RADIUS: 5,           // chunks to load around player
  UNLOAD_RADIUS: 7,         // chunks beyond this get recycled
  MAX_CHUNKS_PER_FRAME: 2,  // staggered loading

  // Terrain noise
  TERRAIN_SCALE: 0.008,     // base frequency
  TERRAIN_OCTAVES: 4,
  TERRAIN_PERSISTENCE: 0.45,
  TERRAIN_LACUNARITY: 2.2,
  TERRAIN_HEIGHT: 8,        // max height displacement
  TERRAIN_SEED: 42,

  // Trees
  TREE_DENSITY_SCALE: 0.05,     // noise scale for density
  TREE_DENSITY_THRESHOLD: 0.15, // noise > this = tree
  TREE_GRID_SPACING: 3,         // meters between potential tree positions
  TREE_JITTER: 1.2,             // random offset from grid
  TREE_MIN_HEIGHT: 2.5,
  TREE_MAX_HEIGHT: 6,
  TREE_TYPES: 3,
  TREE_COLLISION_RADIUS: 0.4,  // trunk collision radius in meters

  // Vegetation
  VEG_GRID_SPACING: 1.3,
  VEG_DENSITY_THRESHOLD: -0.15,
  VEG_GRASS_SCALE: 0.55,
  VEG_ROCK_SCALE: 0.3,
  VEG_FERN_SCALE: 1.2,

  // Movement
  MOVE_SPEED: 3.0,            // m/s
  SPRINT_SPEED: 7.0,          // m/s (costs 1 point per second)
  SNAP_TURN_ANGLE: 30,        // degrees
  SNAP_TURN_DEADZONE: 0.5,    // thumbstick threshold
  SNAP_TURN_COOLDOWN: 0.3,    // seconds between snaps
  THUMBSTICK_DEADZONE: 0.15,
  TERRAIN_FOLLOW_OFFSET: 1.6, // player eye height above terrain
  JUMP_VELOCITY: 4.0,          // m/s initial upward velocity
  GRAVITY: 9.8,                // m/s^2
  WALK_BOB_SPEED: 2.2,         // oscillations per second while moving (≈ footstep rate)
  WALK_BOB_AMOUNT: 0.025,      // meters of vertical bob
  ROCK_COLLISION_RADII: [0.15, 0.35, 0.7], // per size index

  // Atmosphere
  FOG_NEAR: 50,
  FOG_FAR: 130,
  SKY_RADIUS: 200,
  AMBIENT_VOLUME: 0.3,
  SUN_VISUAL_RADIUS: 5,        // visual sun disc size
  SUN_DISTANCE: 150,           // distance from player (within camera far plane)
  CLOUD_COUNT: 30,             // number of cloud puffs
  CLOUD_MIN_RADIUS: 40,        // cloud ring inner radius
  CLOUD_MAX_RADIUS: 180,       // cloud ring outer radius
  CLOUD_HEIGHT_MIN: 60,
  CLOUD_HEIGHT_MAX: 110,
  CLOUD_SCALE_MIN: 25,
  CLOUD_SCALE_MAX: 60,

  // Default location for sun/moon calculation (overridden by geolocation)
  DEFAULT_LATITUDE: -36.85,    // Auckland fallback
  DEFAULT_LONGITUDE: 174.76,   // Auckland fallback

  // Moon
  MOON_VISUAL_RADIUS: 3.5,    // SUN_VISUAL_RADIUS * 0.7
  MOON_DISTANCE: 135,         // SUN_DISTANCE * 0.9

  // Ground surface
  GROUND_DIRT_SCALE: 0.03,       // noise frequency for dirt patches
  GROUND_DIRT_THRESHOLD: 0.5,    // noise > this = dirt (higher = less dirt)
  GROUND_TEX_REPEAT: 6,         // texture tiles per chunk

  // Rocks
  ROCK_GRID_SPACING: 5,         // spacing for larger scattered rocks
  ROCK_DENSITY_THRESHOLD: 0.45, // noise threshold for rock placement
  ROCK_COLORS: [0x787878, 0x8a8580, 0x6e6e6e, 0x959085],

  // Water / shore
  WATER_LEVEL: -3.5,          // Y at or below = water (flattened to this Y)
  SHORE_LEVEL: -2.8,          // Y below this = sandy shore (no vegetation)
  SHORE_COLOR: { r: 0.85, g: 0.75, b: 0.55 },   // warm sandy beige
  WATER_COLOR: { r: 0.05, g: 0.15, b: 0.28 },   // dark opaque water
  SWIM_DEPTH_THRESHOLD: 1.2,  // water deeper than this triggers swimming
  SWIM_SPEED: 1.8,            // m/s (slower than walking)
  SWIM_BOB_SPEED: 0.6,        // slow undulating bob
  SWIM_BOB_AMOUNT: 0.025,     // gentle subtle sway
  SWIM_EYE_ABOVE_WATER: 0.45, // how far eyes peek above water surface

  // Shore foam meshes
  FOAM_GRID_SPACING: 0.6,         // marching-squares grid step for waterline contour
  FOAM_SHORE_WIDTH: 0.6,         // strip offset toward shore
  FOAM_WATER_WIDTH: 0.8,         // strip offset toward water

  // Stream channels (ridge noise carving)
  STREAM_SCALE: 0.009,        // lower frequency = longer continuous channels
  STREAM_DEPTH: 6.0,          // deeper carving to push more below water level
  STREAM_WARP: 22,            // more meander
  STREAM_SHARPNESS: 2,        // wider channels (lower = broader)

  // Colors
  GROUND_LOW_COLOR: { r: 0.13, g: 0.24, b: 0.06 },   // dark green (low, near-shore)
  GROUND_MID_COLOR: { r: 0.28, g: 0.45, b: 0.12 },   // mid green
  GROUND_HIGH_COLOR: { r: 0.35, g: 0.50, b: 0.18 },   // light green (high)
  GROUND_DIRT_COLOR: { r: 0.40, g: 0.30, b: 0.18 },   // dirt brown
  GROUND_DIRT_DARK:  { r: 0.30, g: 0.22, b: 0.12 },   // dark dirt
  TRUNK_COLOR: 0x5c3a1e,
  CANOPY_COLORS: [0x2d5a1e, 0x3a6b2a, 0x1e4a12],
  GRASS_COLOR: 0x4a7a2e,
  ROCK_COLOR: 0x888888,
  FERN_COLOR: 0x4a8040,
  FLOWER_COLORS: [0xff4da6, 0xffe040, 0x8b6cf7, 0xff80b0, 0xffee55, 0xff6060],
  FLOWER_DENSITY_THRESHOLD: 0.45,
  FLOWER_GRID_SPACING: 2.0,
  FLOWER_SCALE: 0.55,

  // Footsteps
  FOOTSTEP_VOLUME: 0.12,
  FOOTSTEP_GRASS_LP_FREQ: 600,       // lowpass cutoff for grass thud
  FOOTSTEP_GRASS_HP_FREQ: 3000,      // highpass cutoff for grass swish
  FOOTSTEP_ROCK_BP_FREQ: 1800,       // bandpass center for rock tap
  FOOTSTEP_ROCK_PING_FREQ: 3200,     // sine ping for rock click
  FOOTSTEP_PITCH_VARIATION: 0.15,    // +/- random pitch shift per step

  // Crickets
  CRICKET_VOLUME: 0.06,
  CRICKET_VOICES: 4,
  CRICKET_FREQ_MIN: 4200,
  CRICKET_FREQ_MAX: 5400,
  CRICKET_SUN_FADE_IN: -0.05,        // sun elevation to start fading in
  CRICKET_SUN_FADE_OUT: 0.05,        // sun elevation to fully fade out
  CRICKET_CHIRP_RATE_MIN: 12,        // pulses per second
  CRICKET_CHIRP_RATE_MAX: 20,

  // Rustling leaves
  RUSTLE_VOLUME: 0.12,
  RUSTLE_TRIGGER_DIST: 5,            // meters to trigger rustle
  RUSTLE_COOLDOWN: 0.3,              // seconds between rustles
  RUSTLE_MAX_CONCURRENT: 3,

  // Collectibles
  COLLECTIBLE_GRID_SPACING: 12,          // meters between potential positions
  COLLECTIBLE_DENSITY_THRESHOLD: 0.55,   // noise > this = collectible
  COLLECTIBLE_COLLISION_RADIUS: 1.2,     // pickup distance in meters
  COLLECTIBLE_BOB_SPEED: 1.5,            // oscillations per second
  COLLECTIBLE_BOB_AMOUNT: 0.08,           // meters of vertical bob
  COLLECTIBLE_SPIN_SPEED: 1.8,           // radians per second
  COLLECTIBLE_GLOW_COLOR: 0x66ffcc,      // teal-green glow shell
  COLLECTIBLE_CORE_COLOR: 0xaaffee,      // bright teal core
  COLLECTIBLE_ORB_RADIUS: 0.08,           // core orb radius
  COLLECTIBLE_GLOW_RADIUS: 0.2,          // glow shell radius
  COLLECTIBLE_SCORE_VALUE: 1,            // points per orb
  COLLECTIBLE_CHIME_VOLUME: 0.18,        // collection chime volume
  COLLECTIBLE_CHIME_FREQ: 880,           // base chime frequency
  COLLECTIBLE_MAX_INSTANCES: 500,        // instanced mesh cap

  // Spatial audio
  SPATIAL_REF_DISTANCE: 10,
  SPATIAL_MAX_DISTANCE: 60,
  SPATIAL_ROLLOFF: 0.8,
};
