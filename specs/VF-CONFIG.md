# VF-CONFIG — Configuration Reference

**Version:** 0.1 Draft  
**Date:** 2026-02-20  
**Status:** Draft  
**Purpose:** Complete table of ALL tunable configuration parameters (~170), organised by system. Every magic number in the experience lives here.  
**Dependencies:** None (this spec is referenced by all others)  

---

## Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

---

All parameters below are exported from a single `CONFIG` object (or equivalent). Implementations MUST use these exact values unless a spec amendment documents a change. All distances are in meters, all angles in radians (unless noted), all times in seconds.

---

## 1. Terrain

| Parameter | Value | Description |
|-----------|-------|-------------|
| `CHUNK_SIZE` | 32 | Meters per chunk side |
| `CHUNK_SEGMENTS` | 31 | Vertices per side (32×32 grid = 31×31 quads ≈ 2k triangles) |
| `LOAD_RADIUS` | 5 | Chunks to load in each direction around player |
| `UNLOAD_RADIUS` | 7 | Chunks beyond this distance get recycled |
| `MAX_CHUNKS_PER_FRAME` | 2 | Staggered loading cap per frame |
| `TERRAIN_SCALE` | 0.008 | Base noise frequency for fBm |
| `TERRAIN_OCTAVES` | 4 | Number of fBm octave layers |
| `TERRAIN_PERSISTENCE` | 0.45 | Amplitude decay per octave |
| `TERRAIN_LACUNARITY` | 2.2 | Frequency growth per octave |
| `TERRAIN_HEIGHT` | 8 | Max height displacement (m) |
| `TERRAIN_SEED` | 42 | Base seed for all 13 noise instances |

## 2. Streams & Mountains

| Parameter | Value | Description |
|-----------|-------|-------------|
| `STREAM_SCALE` | 0.009 | Stream noise frequency |
| `STREAM_DEPTH` | 6.0 | Carving depth (m) |
| `STREAM_WARP` | 22 | Domain warp amount |
| `STREAM_SHARPNESS` | 2 | Ridge sharpness exponent |
| `MOUNTAIN_SCALE` | 0.003 | Mountain noise frequency |
| `MOUNTAIN_HEIGHT` | 45 | Max additive mountain height (m) |
| `MOUNTAIN_WARP` | 35 | Domain warp amount |
| `MOUNTAIN_SHARPNESS` | 1.0 | Ridge sharpness exponent (parabolic) |
| `MOUNTAIN_THRESHOLD` | 0.25 | Ridge value below this = no mountain |
| `MOUNTAIN_VALLEY_DEPTH` | 5 | Valley depression depth (m) |
| `FOOTHILL_HEIGHT` | 6 | Max foothill height (m) |
| `FOOTHILL_SCALE` | 0.008 | Foothill noise frequency |

## 3. Altitude Zones

| Parameter | Value | Description |
|-----------|-------|-------------|
| `SUBALPINE_START` | 10 | Height where dark forest green begins |
| `TREELINE_START` | 16 | Height where trees start shrinking |
| `ALPINE_START` | 20 | Height where exposed rock begins |
| `SNOWLINE_START` | 24 | Height where snow begins |
| `TREELINE_SCALE_MIN` | 0.3 | Minimum tree scale at treeline |

## 4. Trees

| Parameter | Value | Description |
|-----------|-------|-------------|
| `TREE_DENSITY_SCALE` | 0.05 | Noise frequency for tree density |
| `TREE_DENSITY_THRESHOLD` | 0.15 | Noise value above this = tree placement |
| `TREE_GRID_SPACING` | 3 | Meters between potential tree positions |
| `TREE_JITTER` | 1.2 | Random offset from grid position (m) |
| `TREE_MIN_HEIGHT` | 2.5 | Minimum tree scale |
| `TREE_MAX_HEIGHT` | 6 | Maximum tree scale |
| `TREE_TYPES` | 3 | Number of tree species (pine, oak, birch) |
| `TREE_COLLISION_RADIUS` | 0.4 | Trunk collision radius (m) |

## 5. Vegetation

| Parameter | Value | Description |
|-----------|-------|-------------|
| `VEG_GRID_SPACING` | 1.3 | Grid spacing for grass/fern placement |
| `VEG_DENSITY_THRESHOLD` | -0.15 | Noise threshold for vegetation |
| `VEG_GRASS_SCALE` | 0.55 | Grass instance scale |
| `VEG_ROCK_SCALE` | 0.3 | Rock instance scale |
| `VEG_FERN_SCALE` | 1.2 | Fern instance scale |
| `FLOWER_GRID_SPACING` | 2.0 | Grid spacing for flower placement |
| `FLOWER_DENSITY_THRESHOLD` | 0.45 | Noise threshold for flowers |
| `FLOWER_SCALE` | 0.55 | Base flower scale |
| `ROCK_GRID_SPACING` | 5 | Grid spacing for rock placement |
| `ROCK_DENSITY_THRESHOLD` | 0.45 | Noise threshold for rocks |

## 6. Logs & Stumps

| Parameter | Value | Description |
|-----------|-------|-------------|
| `LOG_GRID_SPACING` | 8 | Grid spacing for log/stump placement |
| `LOG_DENSITY_THRESHOLD` | 0.55 | Noise threshold |
| `LOG_JITTER` | 2.0 | Random offset from grid (m) |
| `LOG_MIN_LENGTH` | 1.5 | Minimum fallen log length (m) |
| `LOG_MAX_LENGTH` | 4.0 | Maximum fallen log length (m) |
| `LOG_RADIUS_MIN` | 0.1 | Minimum log radius (m) |
| `LOG_RADIUS_MAX` | 0.18 | Maximum log radius (m) |
| `STUMP_RADIUS_MIN` | 0.15 | Minimum stump radius (m) |
| `STUMP_RADIUS_MAX` | 0.25 | Maximum stump radius (m) |
| `STUMP_HEIGHT_MIN` | 0.15 | Minimum stump height (m) |
| `STUMP_HEIGHT_MAX` | 0.4 | Maximum stump height (m) |

## 7. Movement

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MOVE_SPEED` | 3.0 | Walk speed (m/s) |
| `SPRINT_SPEED` | 7.0 | Sprint speed (m/s) |
| `SNAP_TURN_ANGLE` | 30 | Degrees per snap turn |
| `SNAP_TURN_DEADZONE` | 0.5 | Thumbstick threshold for snap turn |
| `SNAP_TURN_COOLDOWN` | 0.3 | Seconds between consecutive snap turns |
| `THUMBSTICK_DEADZONE` | 0.15 | General thumbstick deadzone |
| `TERRAIN_FOLLOW_OFFSET` | 1.6 | Player eye height above ground (m) |
| `JUMP_VELOCITY` | 4.0 | Initial upward velocity on jump (m/s) |
| `GRAVITY` | 9.8 | Downward acceleration (m/s²) |
| `WALK_BOB_SPEED` | 2.2 | Bob oscillations per second while moving |
| `WALK_BOB_AMOUNT` | 0.025 | Vertical bob amplitude (m) |
| `ROCK_COLLISION_RADII` | [0.15, 0.35, 0.7] | Collision radius per rock size index |

## 8. Water & Shore

| Parameter | Value | Description |
|-----------|-------|-------------|
| `WATER_LEVEL` | -3.5 | Y coordinate of water surface |
| `SHORE_LEVEL` | -2.8 | Y below this = sandy shore transition |
| `SHORE_COLOR` | (0.85, 0.75, 0.55) | Warm sandy beige colour |
| `WATER_COLOR` | (0.05, 0.15, 0.28) | Dark opaque water colour |
| `SWIM_DEPTH_THRESHOLD` | 1.2 | Water depth that triggers swimming (m) |
| `SWIM_SPEED` | 1.8 | Swimming movement speed (m/s) |
| `SWIM_BOB_SPEED` | 0.6 | Swim bob oscillation rate (Hz) |
| `SWIM_BOB_AMOUNT` | 0.025 | Swim bob amplitude (m) |
| `SWIM_EYE_ABOVE_WATER` | 0.45 | Eye height above water surface when swimming (m) |
| `FOAM_GRID_SPACING` | 0.6 | Marching-squares step for foam contour |
| `FOAM_SHORE_WIDTH` | 0.6 | Foam strip offset toward shore (m) |
| `FOAM_WATER_WIDTH` | 0.8 | Foam strip offset toward water (m) |

## 9. Weather

| Parameter | Value | Description |
|-----------|-------|-------------|
| `WEATHER_TRANSITION_RATE` | 0.0083 | Intensity change per second (~2 min per unit) |
| `WEATHER_HOLD_MIN` | 180 | Minimum hold time per weather state (s) = 3 min |
| `WEATHER_HOLD_MAX` | 480 | Maximum hold time per weather state (s) = 8 min |
| `RAIN_PARTICLE_COUNT` | 5000 | Maximum rain particles |
| `RAIN_RADIUS` | 25 | Rain cylinder radius around player (m) |
| `RAIN_HEIGHT` | 20 | Rain cylinder height (m) |
| `RAIN_SPEED_MIN` | 11 | Minimum particle fall speed (m/s) |
| `RAIN_SPEED_MAX` | 16 | Maximum particle fall speed (m/s) |
| `RAIN_WIND_INFLUENCE` | 0.3 | Wind push factor on rain particles |
| `THUNDER_INTERVAL_MIN` | 6 | Minimum seconds between lightning flashes (at full rain) |
| `THUNDER_INTERVAL_MAX` | 18 | Maximum seconds between lightning flashes |
| `LIGHTNING_FLASH_DECAY` | 0.2 | Flash fade-out time (s) |
| `LIGHTNING_BOLT_MIN_DIST` | 200 | Minimum lightning bolt distance from player (m) |
| `LIGHTNING_BOLT_MAX_DIST` | 900 | Maximum lightning bolt distance from player (m) |
| `WETNESS_WET_RATE` | 0.0083 | Ground wetting rate per second (~2 min to full wet) |
| `WETNESS_DRY_RATE` | 0.0042 | Ground drying rate per second (~4 min to full dry) |

## 10. Atmosphere

| Parameter | Value | Description |
|-----------|-------|-------------|
| `FOG_NEAR` | 50 | Base fog near distance (modified by weather) |
| `FOG_FAR` | 130 | Base fog far distance (modified by weather) |
| `SKY_RADIUS` | 200 | Sky dome sphere radius (m) |
| `AMBIENT_VOLUME` | 0.3 | Master audio gain |
| `SUN_VISUAL_RADIUS` | 14 | Sun disc visual size |
| `SUN_DISTANCE` | 150 | Sun sprite distance from player (m) |
| `CLOUD_COUNT` | 18 | Number of cloud groups |
| `CLOUD_MIN_RADIUS` | 40 | Cloud ring inner radius (m) |
| `CLOUD_MAX_RADIUS` | 180 | Cloud ring outer radius (m) |
| `DEFAULT_LATITUDE` | -36.85 | Fallback latitude (Auckland, NZ) |
| `DEFAULT_LONGITUDE` | 174.76 | Fallback longitude (Auckland, NZ) |
| `MOON_VISUAL_RADIUS` | 1.75 | Moon disc radius |
| `MOON_DISTANCE` | 135 | Moon sprite distance from player (m) |

## 11. Audio

| Parameter | Value | Description |
|-----------|-------|-------------|
| `FOOTSTEP_VOLUME` | 0.12 | Base footstep volume |
| `FOOTSTEP_GRASS_LP_FREQ` | 600 | Grass footstep lowpass cutoff (Hz) |
| `FOOTSTEP_GRASS_HP_FREQ` | 3000 | Grass footstep highpass cutoff (Hz) |
| `FOOTSTEP_ROCK_BP_FREQ` | 1800 | Rock footstep bandpass centre (Hz) |
| `FOOTSTEP_ROCK_PING_FREQ` | 3200 | Rock sine ping frequency (Hz) |
| `FOOTSTEP_PITCH_VARIATION` | 0.15 | ±random pitch variation per step |
| `CRICKET_VOLUME` | 0.06 | Cricket chirp volume |
| `CRICKET_VOICES` | 4 | Number of cricket oscillator voices |
| `CRICKET_FREQ_MIN` | 4200 | Lowest cricket frequency (Hz) |
| `CRICKET_FREQ_MAX` | 5400 | Highest cricket frequency (Hz) |
| `CRICKET_SUN_FADE_IN` | -0.05 | Sun elevation to start crickets (radians) |
| `CRICKET_SUN_FADE_OUT` | 0.05 | Sun elevation to stop crickets (radians) |
| `CRICKET_CHIRP_RATE_MIN` | 12 | Minimum cricket pulses per second |
| `CRICKET_CHIRP_RATE_MAX` | 20 | Maximum cricket pulses per second |
| `SPATIAL_REF_DISTANCE` | 10 | HRTF panner reference distance |
| `SPATIAL_MAX_DISTANCE` | 60 | HRTF panner maximum distance |
| `SPATIAL_ROLLOFF` | 0.8 | HRTF panner rolloff factor |

## 12. Wildlife

| Parameter | Value | Description |
|-----------|-------|-------------|
| Flock count | 5 | Number of bird flocks |
| Birds per flock | 8 | Birds in each flock |
| Flock altitude range | 15–35 | Flight altitude (m) |
| Minimum terrain clearance | 12 | Metres above terrain |
| Orbit speed | ~5 | Approximate m/s (0.7–1.3× variation) |
| Wing flap speed | 1.8 | Cycles per second |
| Bird active threshold | sun elevation > 0.02 | Birds hidden at night |
| Peek spawn interval | 12–37 | Seconds between peek encounters |
| Peek view distance | 5–30 | Distance from player (m) |
| Fadein duration | 0.8 | Seconds (easeOutCubic) |
| Showing duration | 2–6 | Seconds (breathing + head tilt) |
| Fadeout duration | 0.6 | Seconds (easeInCubic) |

## 13. Collectibles

| Parameter | Value | Description |
|-----------|-------|-------------|
| `COLLECTIBLE_GRID_SPACING` | 12 | Meters between potential orb positions |
| `COLLECTIBLE_DENSITY_THRESHOLD` | 0.55 | Noise value above this = orb placement |
| `COLLECTIBLE_COLLISION_RADIUS` | 1.2 | Pickup distance on XZ plane (m) |
| `COLLECTIBLE_BOB_SPEED` | 1.5 | Oscillations per second |
| `COLLECTIBLE_BOB_AMOUNT` | 0.08 | Vertical bob amplitude (m) |
| `COLLECTIBLE_SPIN_SPEED` | 1.8 | Spin rate (radians/s) |
| `COLLECTIBLE_ORB_RADIUS` | 0.08 | Core orb geometry radius |
| `COLLECTIBLE_GLOW_RADIUS` | 0.2 | Glow shell geometry radius |
| `COLLECTIBLE_SCORE_VALUE` | 1 | Points awarded per collected orb |
| `COLLECTIBLE_CHIME_VOLUME` | 0.18 | Collection chime volume |
| `COLLECTIBLE_CHIME_FREQ` | 880 | Base chime frequency (Hz) |
| `COLLECTIBLE_MAX_INSTANCES` | 500 | Maximum instanced mesh capacity |

## 14. Renderer

| Setting | Value | Description |
|---------|-------|-------------|
| Antialiasing | Enabled | Thin tree branches alias badly without it |
| Pixel ratio | min(devicePixelRatio, 2) | Beyond 2× is wasted on VR headsets |
| Colour space | sRGB | Must match sky shader's manual conversion |
| Shadow map type | PCFSoftShadowMap | Soft edges hide the low 2048 resolution |
| Shadow map size | 2048×2048 | Halved from 4096 for Quest performance |
| Shadow camera bounds | ±80m, near 0.5, far 250 | Covers the visible terrain |
| Shadow bias | -0.002 | Prevents shadow acne on terrain |
| Shadow normal bias | 0.03 | Prevents peter-panning on tree trunks |
| Camera FOV | 70° | Standard for non-VR; VR overrides |
| Camera near plane | 0.1m | Close enough for vegetation detail |
| Camera far plane | 250m | Matches fog far distance |
| XR reference space | `local-floor` | Player starts standing at ground level |
| Foveated rendering | Level 1 | Saves GPU on peripheral vision (Quest) |

## 15. Render Order

| Object | Render Order | Reason |
|--------|-------------|--------|
| Sky dome | -2 | Always behind everything |
| Water plane | -1 | Behind terrain/objects but in front of sky |
| Everything else | 0 (default) | Standard depth-tested rendering |
