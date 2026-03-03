# SPEC-13: Complete Configuration Reference

All values from the `CONFIG` object. These are the authoritative values for reimplementation.

## 1. Terrain

| Parameter | Value | Description |
|-----------|-------|-------------|
| CHUNK_SIZE | 32 | Meters per chunk side |
| CHUNK_SEGMENTS | 63 | Vertices per side - 1 (64×64 grid) |
| CHUNK_SEGMENTS_LOD | 31 | Reduced for distant VR chunks |
| LOAD_RADIUS | 5 | Chunks to load around player |
| UNLOAD_RADIUS | 7 | Chunks beyond this recycled |
| MAX_CHUNKS_PER_FRAME | 2 | Staggered loading (1 in VR) |
| TERRAIN_SCALE | 0.008 | Base noise frequency |
| TERRAIN_OCTAVES | 4 | fBm octave count |
| TERRAIN_PERSISTENCE | 0.45 | Amplitude decay per octave |
| TERRAIN_LACUNARITY | 2.2 | Frequency multiplier per octave |
| TERRAIN_HEIGHT | 8 | Max height displacement (meters) |
| TERRAIN_SEED | 42 | Master PRNG seed |

## 2. Valley Carving

| Parameter | Value | Description |
|-----------|-------|-------------|
| VALLEY_SCALE | 0.009 | Noise frequency for valleys |
| VALLEY_DEPTH | 6.0 | Max carving depth (m) |
| VALLEY_WARP | 22 | Domain warp amount |
| VALLEY_SHARPNESS | 2 | Power exponent (higher = narrower) |

## 3. Mountains

| Parameter | Value | Description |
|-----------|-------|-------------|
| MOUNTAIN_SCALE | 0.003 | Ridge noise frequency |
| MOUNTAIN_HEIGHT | 45 | Max additive height (m) |
| MOUNTAIN_WARP | 35 | Domain warp amount |
| MOUNTAIN_SHARPNESS | 1.0 | Ridge sharpness |
| MOUNTAIN_THRESHOLD | 0.25 | Minimum ridge value |
| MOUNTAIN_VALLEY_DEPTH | 5 | Depression between ridges (m) |
| FOOTHILL_HEIGHT | 6 | Max foothill height (m) |
| FOOTHILL_SCALE | 0.008 | Foothill noise frequency |

## 4. Rivers (Currently Disabled)

| Parameter | Value | Description |
|-----------|-------|-------------|
| RIVER_SOURCE_SPACING | 64 | Source grid (m) |
| RIVER_SOURCE_MIN_ALT | 12 | Min source altitude |
| RIVER_STEP_SIZE | 4.0 | Trace step (m) |
| RIVER_GRAD_EPS | 2.0 | Gradient epsilon (m) |
| RIVER_MAX_STEPS | 500 | Max steps per river |
| RIVER_MOMENTUM | 0.3 | Direction momentum |
| RIVER_MERGE_DIST | 6.0 | Confluence radius (m) |
| RIVER_HASH_CELL | 8 | Spatial hash cell (m) |
| RIVER_MIN_HALFWIDTH | 0.02 | Narrowest halfwidth |
| RIVER_WIDTH_SCALE | 0.2 | halfwidth = min + scale × √flow |
| RIVER_MAX_HALFWIDTH | 2.8 | Widest halfwidth |
| RIVER_CARVE_SCALE | 0.4 | Carve = scale × √flow |
| RIVER_MAX_CARVE | 5.0 | Max carve depth (m) |
| RIVER_BANK_WIDTH | 1.5 | Bank transition width (m) |
| RIVER_TRACE_RADIUS | 800 | Trace radius from player (m) |
| RIVER_RETRACE_DIST | 200 | Re-trace trigger distance (m) |
| RIVER_SOURCE_VALLEY_RADIUS | 24 | Valley check radius (m) |
| RIVER_SOURCE_VALLEY_DROP | 0.0 | Required drop for source |
| RIVER_PIT_SEARCH_RADIUS | 120 | Escape search radius (m) |
| RIVER_PIT_SEARCH_STEP | 8 | Escape ring spacing (m) |
| RIVER_PIT_MAX_BREAKS | 8 | Max pit breaks per river |
| RIVER_PIT_STUCK_INTERVAL | 20 | Check descent every N steps |
| RIVER_PIT_MIN_DESCENT | 0.3 | Min descent over interval |

## 5. Altitude Zones

| Parameter | Value | Description |
|-----------|-------|-------------|
| SUBALPINE_START | 10 | Dark forest zone (m) |
| TREELINE_START | 16 | Tussock zone begins (m) |
| ALPINE_START | 20 | Exposed rock (m) |
| SNOWLINE_START | 20 | Snow accumulation (m) |
| TREELINE_SCALE_MIN | 0.3 | Tree scale fraction at treeline |

## 6. Trees

| Parameter | Value | Description |
|-----------|-------|-------------|
| TREE_DENSITY_SCALE | 0.05 | Noise scale for density |
| TREE_DENSITY_THRESHOLD | 0.15 | Noise > this = tree |
| TREE_GRID_SPACING | 3 | Meters between grid positions |
| TREE_JITTER | 1.2 | Random offset from grid |
| TREE_MIN_HEIGHT | 2.5 | Minimum tree scale |
| TREE_MAX_HEIGHT | 6 | Maximum tree scale |
| TREE_TYPES | 4 | Number of tree types |
| TREE_COLLISION_RADIUS | 0.4 | Trunk collision (m) |

## 7. Vegetation

| Parameter | Value | Description |
|-----------|-------|-------------|
| VEG_GRID_SPACING | 1.3 | Grid spacing (m) |
| VEG_DENSITY_THRESHOLD | -0.15 | Density cutoff |
| VEG_GRASS_SCALE | 0.55 | Grass tuft scale |
| VEG_ROCK_SCALE | 0.3 | Rock scale |
| VEG_FERN_SCALE | 1.2 | Fern scale |
| ROCK_GRID_SPACING | 5 | Rock grid (m) |
| ROCK_DENSITY_THRESHOLD | 0.45 | Rock density cutoff |
| ROCK_COLLISION_RADII | [0.35, 0.7, 1.4] | Per size index |
| FLOWER_DENSITY_THRESHOLD | 0.55 | Flower cutoff |
| FLOWER_GRID_SPACING | 2.0 | Flower grid (m) |
| FLOWER_SCALE | 0.55 | Flower scale |

## 8. Logs & Stumps

| Parameter | Value | Description |
|-----------|-------|-------------|
| LOG_GRID_SPACING | 8 | Grid spacing (m) |
| LOG_DENSITY_THRESHOLD | 0.55 | Density cutoff |
| LOG_JITTER | 2.0 | Jitter amount |
| LOG_MIN_LENGTH | 1.5 | Shortest log (m) |
| LOG_MAX_LENGTH | 4.0 | Longest log (m) |
| LOG_RADIUS_MIN | 0.1 | Thinnest log radius (m) |
| LOG_RADIUS_MAX | 0.18 | Thickest log radius (m) |
| STUMP_RADIUS_MIN | 0.15 | Smallest stump (m) |
| STUMP_RADIUS_MAX | 0.25 | Largest stump (m) |
| STUMP_HEIGHT_MIN | 0.15 | Shortest stump (m) |
| STUMP_HEIGHT_MAX | 0.4 | Tallest stump (m) |

## 9. Cottages

| Parameter | Value | Description |
|-----------|-------|-------------|
| COTTAGE_GRID_SPACING | 16 | Grid spacing (m) |
| COTTAGE_DENSITY_THRESHOLD | 0.45 | Density cutoff |
| COTTAGE_CLEARING_RADIUS | 10 | No trees/veg radius (m) |
| COTTAGE_MIN_TREE_DENSITY | 0.0 | Relaxed placement |
| COTTAGE_MAX_SLOPE | 0.3 | Max terrain slope |
| COTTAGE_COLLISION_RADIUS | 2.0 | Player collision (m) |
| COTTAGE_GARDEN_COLOR | {r:0.38, g:0.30, b:0.16} | Garden soil |
| SMOKE_PARTICLES_PER_COTTAGE | 20 | Smoke sprites |
| SMOKE_LIFETIME | 7.0 | Particle life (s) |
| SMOKE_RISE_SPEED | 2.2 | Rise speed (m/s) |
| SMOKE_DRIFT_SPEED | 0.5 | Wind drift (m/s) |
| SMOKE_START_SIZE | 0.4 | Initial size (m) |
| SMOKE_END_SIZE | 3.5 | Final size (m) |
| SMOKE_COLOR | {r:0.55, g:0.55, b:0.58} | Grey wisps |

## 10. Movement

| Parameter | Value | Description |
|-----------|-------|-------------|
| MOVE_SPEED | 3.0 | Walk speed (m/s) |
| SPRINT_SPEED | 7.0 | Sprint speed (m/s) |
| SNAP_TURN_ANGLE | 30 | Degrees per snap |
| SNAP_TURN_DEADZONE | 0.5 | Stick threshold |
| SNAP_TURN_COOLDOWN | 0.3 | Seconds between snaps |
| THUMBSTICK_DEADZONE | 0.15 | Input deadzone |
| TERRAIN_FOLLOW_OFFSET | 1.6 | Eye height (m) |
| JUMP_VELOCITY | 4.0 | Initial upward (m/s) |
| GRAVITY | 9.8 | Downward accel (m/s²) |
| WALK_BOB_SPEED | 2.2 | Bob frequency (Hz) |
| WALK_BOB_AMOUNT | 0.025 | Bob amplitude (m) |

## 11. Water & Shore

| Parameter | Value | Description |
|-----------|-------|-------------|
| WATER_LEVEL | -3.5 | Sea level Y |
| SHORE_LEVEL | -2.8 | Sandy shore Y |
| SHORE_COLOR | {r:0.85, g:0.75, b:0.55} | Sandy beige |
| WATER_COLOR | {r:0.05, g:0.15, b:0.28} | Dark water |
| SWIM_DEPTH_THRESHOLD | 1.2 | Swim trigger depth (m) |
| SWIM_SPEED | 1.8 | Swim speed (m/s) |
| SWIM_BOB_SPEED | 0.6 | Swim bob (Hz) |
| SWIM_BOB_AMOUNT | 0.025 | Swim bob (m) |
| SWIM_EYE_ABOVE_WATER | 0.45 | Eye peek height (m) |
| FOAM_GRID_SPACING | 1.5 | Marching squares step (m) |
| FOAM_SHORE_WIDTH | 0.6 | Shore offset (m) |
| FOAM_WATER_WIDTH | 0.8 | Water offset (m) |

## 12. Atmosphere

| Parameter | Value | Description |
|-----------|-------|-------------|
| FOG_NEAR | 50 | Fog start (m) |
| FOG_FAR | 130 | Fog end (m) |
| SKY_RADIUS | 200 | Sky dome radius (m) |
| AMBIENT_VOLUME | 0.3 | Master audio gain |
| SUN_VISUAL_RADIUS | 14 | Sun disc size |
| SUN_DISTANCE | 150 | Sun distance (m) |
| MOON_VISUAL_RADIUS | 1.75 | Moon disc size |
| MOON_DISTANCE | 135 | Moon distance (m) |
| PLANET_DISTANCE | 140 | Planet distance (m) |
| PLANET_VISUAL_RADIUS | 0.6 | Base planet size |
| CLOUD_COUNT | 20 | Cloud groups |
| CLOUD_MIN_RADIUS | 35 | Inner ring (m) |
| CLOUD_MAX_RADIUS | 200 | Outer ring (m) |
| CLOUD_HEIGHT_MIN | 55 | Lowest cloud (m) |
| CLOUD_HEIGHT_MAX | 115 | Highest cloud (m) |
| CLOUD_SCALE_MIN | 25 | Smallest cloud |
| CLOUD_SCALE_MAX | 65 | Largest cloud |
| DEFAULT_LATITUDE | -36.85 | Auckland fallback |
| DEFAULT_LONGITUDE | 174.76 | Auckland fallback |

## 13. Weather

| Parameter | Value | Description |
|-----------|-------|-------------|
| WEATHER_TRANSITION_RATE | 0.0083 | Units/sec (~2 min/unit) |
| WEATHER_HOLD_MIN | 180 | Hold minimum (s) |
| WEATHER_HOLD_MAX | 480 | Hold maximum (s) |
| WEATHER_STORM_CLOUD_COLOR | 0x303038 | Storm cloud hex |
| RAIN_PARTICLE_COUNT | 5000 | Max rain drops |
| RAIN_RADIUS | 25 | Cylinder radius (m) |
| RAIN_HEIGHT | 20 | Cylinder height (m) |
| RAIN_SPEED_MIN | 11 | Min fall speed (m/s) |
| RAIN_SPEED_MAX | 16 | Max fall speed (m/s) |
| RAIN_WIND_INFLUENCE | 0.3 | Wind push factor |
| THUNDER_INTERVAL_MIN | 6 | Min flash interval (s) |
| THUNDER_INTERVAL_MAX | 18 | Max flash interval (s) |
| LIGHTNING_FLASH_DECAY | 0.2 | Flash decay time (s) |
| LIGHTNING_BOLT_MIN_DIST | 60 | Min bolt distance (m) |
| LIGHTNING_BOLT_MAX_DIST | 200 | Max bolt distance (m) |
| WETNESS_WET_RATE | 0.0083 | Wetting rate (/s) |
| WETNESS_DRY_RATE | 0.0042 | Drying rate (/s) |

## 14. Audio -- Footsteps

| Parameter | Value | Description |
|-----------|-------|-------------|
| FOOTSTEP_VOLUME | 0.12 | Base step volume |
| FOOTSTEP_GRASS_LP_FREQ | 600 | Grass lowpass (Hz) |
| FOOTSTEP_GRASS_HP_FREQ | 3000 | Grass highpass (Hz) |
| FOOTSTEP_ROCK_BP_FREQ | 1800 | Rock bandpass (Hz) |
| FOOTSTEP_ROCK_PING_FREQ | 3200 | Rock ping (Hz) |
| FOOTSTEP_PITCH_VARIATION | 0.15 | Random pitch shift |

## 15. Audio -- Crickets

| Parameter | Value | Description |
|-----------|-------|-------------|
| CRICKET_VOLUME | 0.06 | Cricket volume |
| CRICKET_VOICES | 4 | Simultaneous voices |
| CRICKET_FREQ_MIN | 4200 | Lowest voice (Hz) |
| CRICKET_FREQ_MAX | 5400 | Highest voice (Hz) |
| CRICKET_SUN_FADE_IN | -0.05 | Start fading in |
| CRICKET_SUN_FADE_OUT | 0.05 | Fully faded out |
| CRICKET_CHIRP_RATE_MIN | 12 | Min pulses/sec |
| CRICKET_CHIRP_RATE_MAX | 20 | Max pulses/sec |

## 16. Audio -- Leaves & Water

| Parameter | Value | Description |
|-----------|-------|-------------|
| RUSTLE_VOLUME | 0.12 | Leaf rustle volume |
| RUSTLE_TRIGGER_DIST | 5 | Trigger distance (m) |
| RUSTLE_COOLDOWN | 0.3 | Between rustles (s) |
| RUSTLE_MAX_CONCURRENT | 3 | Max simultaneous |
| SPATIAL_REF_DISTANCE | 10 | HRTF ref distance |
| SPATIAL_MAX_DISTANCE | 60 | HRTF max distance |
| SPATIAL_ROLLOFF | 0.8 | HRTF rolloff factor |

## 17. Audio -- Rain

| Parameter | Value | Description |
|-----------|-------|-------------|
| RAIN_PATTER_FREQ | 3200 | Patter center (Hz) |
| RAIN_PATTER_Q | 0.6 | Patter Q |
| RAIN_WASH_FREQ | 800 | Wash center (Hz) |
| RAIN_WASH_Q | 0.4 | Wash Q |
| THUNDER_FREQ_MIN | 150 | Thunder low (Hz) |
| THUNDER_FREQ_MAX | 250 | Thunder high (Hz) |
| THUNDER_DECAY | 7 | Thunder decay (s) |

## 18. Collectibles

| Parameter | Value | Description |
|-----------|-------|-------------|
| COLLECTIBLE_GRID_SPACING | 12 | Grid spacing (m) |
| COLLECTIBLE_DENSITY_THRESHOLD | 0.55 | Density cutoff |
| COLLECTIBLE_COLLISION_RADIUS | 1.2 | Pickup distance (m) |
| COLLECTIBLE_BOB_SPEED | 1.5 | Bob frequency (Hz) |
| COLLECTIBLE_BOB_AMOUNT | 0.08 | Bob amplitude (m) |
| COLLECTIBLE_SPIN_SPEED | 1.8 | Spin (rad/s) |
| COLLECTIBLE_GLOW_COLOR | 0x66ffcc | Glow shell color |
| COLLECTIBLE_CORE_COLOR | 0xaaffee | Core color |
| COLLECTIBLE_ORB_RADIUS | 0.08 | Core radius (m) |
| COLLECTIBLE_GLOW_RADIUS | 0.2 | Glow radius (m) |
| COLLECTIBLE_SCORE_VALUE | 1 | Points per orb |
| COLLECTIBLE_CHIME_VOLUME | 0.18 | Chime volume |
| COLLECTIBLE_CHIME_FREQ | 880 | Base chime (Hz) |
| COLLECTIBLE_MAX_INSTANCES | 500 | Instance cap |

## 19. Ground Colors

| Parameter | Value (RGB) | Description |
|-----------|-------------|-------------|
| GROUND_LOW_COLOR | (0.13, 0.24, 0.06) | Dark green, near shore |
| GROUND_MID_COLOR | (0.28, 0.45, 0.12) | Mid green |
| GROUND_HIGH_COLOR | (0.35, 0.50, 0.18) | Light green, high |
| GROUND_DIRT_COLOR | (0.40, 0.30, 0.18) | Dirt brown |
| GROUND_DIRT_DARK | (0.30, 0.22, 0.12) | Dark dirt |
| GROUND_DIRT_SCALE | 0.03 | Dirt noise frequency |
| GROUND_DIRT_THRESHOLD | 0.5 | Dirt noise cutoff |
| GROUND_TEX_REPEAT | 6 | Texture tiles per chunk |
| SUBALPINE_COLOR | (0.15, 0.28, 0.08) | Dark forest green |
| TUSSOCK_COLOR | (0.55, 0.50, 0.30) | Tan/olive |
| ALPINE_ROCK_COLOR | (0.45, 0.42, 0.38) | Grey-brown rock |
| SNOW_COLOR | (1.4, 1.42, 1.5) | Bright (>1 for glow) |
| STEEP_ROCK_COLOR | (0.28, 0.27, 0.26) | Dark grey rock |

## 20. Object Colors

| Parameter | Value | Description |
|-----------|-------|-------------|
| TRUNK_COLOR | 0x5c3a1e | Default bark |
| CANOPY_COLORS | [0x2d5a1e, 0x3a6b2a, 0x1e4a12] | Canopy palette |
| GRASS_COLOR | 0x4a7a2e | Grass tufts |
| ROCK_COLOR | 0x888888 | Default rock |
| FERN_COLOR | 0x4a8040 | Fern fronds |
| FLOWER_COLORS | [0xff4da6, 0xffe040, 0x8b6cf7, 0xff80b0, 0xffee55, 0xff6060] | 6 flower colors |
| ROCK_COLORS | [0x504d4a, 0x5a5652, 0x464442, 0x625e5a, 0x3e3c3a] | 5 rock colors |
| SHORE_COLOR | {r:0.85, g:0.75, b:0.55} | Sandy beige |
