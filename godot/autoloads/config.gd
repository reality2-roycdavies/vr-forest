extends Node
## Global configuration singleton — full port of threejs/js/config.js
## All 280+ constants from the Three.js implementation, converted to GDScript typed constants.
## Access from any script: Config.CHUNK_SIZE, Config.TERRAIN_SEED, etc.

# =============================================================================
# Terrain
# =============================================================================

const CHUNK_SIZE := 32              ## meters per chunk side
const CHUNK_SEGMENTS := 63          ## vertices per side (64x64 grid = 63x63 quads ≈ 8k tris)
const CHUNK_SEGMENTS_LOD := 31      ## reduced segments for distant chunks in VR
const LOAD_RADIUS := 5              ## chunks to load around player
const UNLOAD_RADIUS := 7            ## chunks beyond this get recycled
const MAX_CHUNKS_PER_FRAME := 2     ## staggered loading

# =============================================================================
# Terrain noise
# =============================================================================

const TERRAIN_SCALE := 0.008        ## base frequency
const TERRAIN_OCTAVES := 4
const TERRAIN_PERSISTENCE := 0.45
const TERRAIN_LACUNARITY := 2.2
const TERRAIN_HEIGHT := 8           ## max height displacement
const TERRAIN_SEED := 42

# =============================================================================
# Trees
# =============================================================================

const TREE_DENSITY_SCALE := 0.05        ## noise scale for density
const TREE_DENSITY_THRESHOLD := 0.15    ## noise > this = tree
const TREE_GRID_SPACING := 3            ## meters between potential tree positions
const TREE_JITTER := 1.2                ## random offset from grid
const TREE_MIN_HEIGHT := 2.5
const TREE_MAX_HEIGHT := 6
const TREE_TYPES := 4
const TREE_COLLISION_RADIUS := 0.4      ## trunk collision radius in meters

# =============================================================================
# Vegetation
# =============================================================================

const VEG_GRID_SPACING := 1.3
const VEG_DENSITY_THRESHOLD := -0.15
const VEG_GRASS_SCALE := 0.55
const VEG_ROCK_SCALE := 0.3
const VEG_FERN_SCALE := 1.2

# =============================================================================
# Movement
# =============================================================================

const MOVE_SPEED := 3.0             ## m/s
const SPRINT_SPEED := 7.0           ## m/s (costs 1 point per second)
const SNAP_TURN_ANGLE := 30         ## degrees
const SNAP_TURN_DEADZONE := 0.5     ## thumbstick threshold
const SNAP_TURN_COOLDOWN := 0.3     ## seconds between snaps
const THUMBSTICK_DEADZONE := 0.15
const TERRAIN_FOLLOW_OFFSET := 1.6  ## player eye height above terrain
const JUMP_VELOCITY := 4.0          ## m/s initial upward velocity
const GRAVITY := 9.8                ## m/s^2
const WALK_BOB_SPEED := 2.2         ## oscillations per second while moving
const WALK_BOB_AMOUNT := 0.025      ## meters of vertical bob
const ROCK_COLLISION_RADII: Array[float] = [0.35, 0.7, 1.4]

# =============================================================================
# Atmosphere
# =============================================================================

const FOG_NEAR := 50
const FOG_FAR := 130
const SKY_RADIUS := 200
const AMBIENT_VOLUME := 0.3
const SUN_VISUAL_RADIUS := 14          ## visual sun disc size
const SUN_DISTANCE := 150              ## distance from player (within camera far plane)
const CLOUD_COUNT := 20                ## number of cloud groups
const CLOUD_MIN_RADIUS := 35           ## cloud ring inner radius
const CLOUD_MAX_RADIUS := 200          ## cloud ring outer radius
const CLOUD_HEIGHT_MIN := 55
const CLOUD_HEIGHT_MAX := 115
const CLOUD_SCALE_MIN := 25
const CLOUD_SCALE_MAX := 65

# =============================================================================
# Default location for sun/moon calculation
# =============================================================================

const DEFAULT_LATITUDE := -36.85       ## Auckland fallback
const DEFAULT_LONGITUDE := 174.76      ## Auckland fallback

# =============================================================================
# Moon
# =============================================================================

const MOON_VISUAL_RADIUS := 1.75       ## half previous size
const MOON_DISTANCE := 135             ## SUN_DISTANCE * 0.9
const PLANET_DISTANCE := 140           ## between moon (135) and sun (150)
const PLANET_VISUAL_RADIUS := 0.6      ## base size, scaled by magnitude

# =============================================================================
# Ground surface
# =============================================================================

const GROUND_DIRT_SCALE := 0.03        ## noise frequency for dirt patches
const GROUND_DIRT_THRESHOLD := 0.5     ## noise > this = dirt
const GROUND_TEX_REPEAT := 6          ## texture tiles per chunk

# =============================================================================
# Rocks
# =============================================================================

const ROCK_GRID_SPACING := 5           ## spacing for larger scattered rocks
const ROCK_DENSITY_THRESHOLD := 0.45   ## noise threshold for rock placement
const ROCK_COLORS: Array[Color] = [
	Color(0x50 / 255.0, 0x4d / 255.0, 0x4a / 255.0),
	Color(0x5a / 255.0, 0x56 / 255.0, 0x52 / 255.0),
	Color(0x46 / 255.0, 0x44 / 255.0, 0x42 / 255.0),
	Color(0x62 / 255.0, 0x5e / 255.0, 0x5a / 255.0),
	Color(0x3e / 255.0, 0x3c / 255.0, 0x3a / 255.0),
]

# =============================================================================
# Fallen logs & stumps
# =============================================================================

const LOG_GRID_SPACING := 8
const LOG_DENSITY_THRESHOLD := 0.55
const LOG_JITTER := 2.0
const LOG_MIN_LENGTH := 1.5
const LOG_MAX_LENGTH := 4.0
const LOG_RADIUS_MIN := 0.1
const LOG_RADIUS_MAX := 0.18
const STUMP_RADIUS_MIN := 0.15
const STUMP_RADIUS_MAX := 0.25
const STUMP_HEIGHT_MIN := 0.15
const STUMP_HEIGHT_MAX := 0.4

# =============================================================================
# Water / shore
# =============================================================================

const WATER_LEVEL := -3.5              ## Y at or below = water
const SHORE_LEVEL := -2.8              ## Y below this = sandy shore (no vegetation)
const SHORE_COLOR := Color(0.85, 0.75, 0.55)      ## warm sandy beige
const WATER_COLOR := Color(0.05, 0.15, 0.28)      ## dark opaque water
const SWIM_DEPTH_THRESHOLD := 1.2      ## water deeper than this triggers swimming
const SWIM_SPEED := 1.8               ## m/s (slower than walking)
const SWIM_BOB_SPEED := 0.6           ## slow undulating bob
const SWIM_BOB_AMOUNT := 0.025        ## gentle subtle sway
const SWIM_EYE_ABOVE_WATER := 0.45    ## how far eyes peek above water surface

# =============================================================================
# Shore foam meshes
# =============================================================================

const FOAM_GRID_SPACING := 1.5         ## marching-squares grid step
const FOAM_SHORE_WIDTH := 0.6         ## strip offset toward shore
const FOAM_WATER_WIDTH := 0.8         ## strip offset toward water

# =============================================================================
# Valley carving
# =============================================================================

const VALLEY_SCALE := 0.009            ## noise frequency for valley lines
const VALLEY_DEPTH := 6.0              ## max carving depth
const VALLEY_WARP := 22               ## domain warp for meander
const VALLEY_SHARPNESS := 2           ## power exponent

# =============================================================================
# Rivers
# =============================================================================

const RIVER_SOURCE_SPACING := 64       ## source candidate grid (meters)
const RIVER_SOURCE_MIN_ALT := 12       ## min base terrain height for sources
const RIVER_STEP_SIZE := 4.0           ## trace step (meters)
const RIVER_GRAD_EPS := 2.0            ## gradient central-difference epsilon
const RIVER_MAX_STEPS := 500           ## max steps per river
const RIVER_MOMENTUM := 0.3            ## blend previous dir
const RIVER_MERGE_DIST := 6.0          ## confluence detection radius (meters)
const RIVER_HASH_CELL := 8            ## spatial hash cell size (meters)
const RIVER_MIN_HALFWIDTH := 0.02      ## narrowest stream halfwidth
const RIVER_WIDTH_SCALE := 0.2         ## halfwidth = MIN + SCALE * sqrt(flow)
const RIVER_MAX_HALFWIDTH := 2.8       ## widest river halfwidth
const RIVER_CARVE_SCALE := 0.4         ## carve depth = SCALE * sqrt(flow)
const RIVER_MAX_CARVE := 5.0           ## max carve depth
const RIVER_BANK_WIDTH := 1.5          ## soft bank transition width
const RIVER_TRACE_RADIUS := 800        ## trace radius from player (meters)
const RIVER_RETRACE_DIST := 200        ## re-trace trigger distance
const RIVER_SOURCE_VALLEY_RADIUS := 24 ## ring sample radius for valley check
const RIVER_SOURCE_VALLEY_DROP := 0.0  ## source must be at/below surrounding avg
const RIVER_PIT_SEARCH_RADIUS := 120   ## max search radius for escape point
const RIVER_PIT_SEARCH_STEP := 8       ## ring spacing in escape search
const RIVER_PIT_MAX_BREAKS := 8        ## max pit-breaks per river
const RIVER_PIT_STUCK_INTERVAL := 20   ## check descent every N steps
const RIVER_PIT_MIN_DESCENT := 0.3     ## min height drop over stuck interval

# =============================================================================
# Mountain chains
# =============================================================================

const MOUNTAIN_SCALE := 0.003          ## lower freq than streams = broader chains
const MOUNTAIN_HEIGHT := 45            ## max additive height
const MOUNTAIN_WARP := 35              ## domain warp amount
const MOUNTAIN_SHARPNESS := 1.0        ## ridge sharpness
const MOUNTAIN_THRESHOLD := 0.25       ## ridge value below this = no mountain
const MOUNTAIN_VALLEY_DEPTH := 5       ## valley depression between ridges
const FOOTHILL_HEIGHT := 6             ## max foothill height
const FOOTHILL_SCALE := 0.008          ## higher freq = smaller hills

# =============================================================================
# Altitude zones
# =============================================================================

const SUBALPINE_START := 10
const TREELINE_START := 16
const ALPINE_START := 20
const SNOWLINE_START := 20
const TREELINE_SCALE_MIN := 0.3        ## tree scale at treeline

# =============================================================================
# Mountain ground colors
# =============================================================================

const SUBALPINE_COLOR := Color(0.15, 0.28, 0.08)      ## dark forest green
const TUSSOCK_COLOR := Color(0.55, 0.50, 0.30)         ## tan/olive
const ALPINE_ROCK_COLOR := Color(0.45, 0.42, 0.38)     ## grey-brown rock
const SNOW_COLOR := Color(1.4, 1.42, 1.5)               ## bright glowing snow (>1.0 for emissive bloom)

# =============================================================================
# Steep slope bare rock
# =============================================================================

const STEEP_ROCK_COLOR := Color(0.28, 0.27, 0.26)      ## dark grey rock

# =============================================================================
# Colors
# =============================================================================

const GROUND_LOW_COLOR := Color(0.13, 0.24, 0.06)      ## dark green (low, near-shore)
const GROUND_MID_COLOR := Color(0.28, 0.45, 0.12)      ## mid green
const GROUND_HIGH_COLOR := Color(0.35, 0.50, 0.18)     ## light green (high)
const GROUND_DIRT_COLOR := Color(0.40, 0.30, 0.18)     ## dirt brown
const GROUND_DIRT_DARK := Color(0.30, 0.22, 0.12)      ## dark dirt
const TRUNK_COLOR := Color(0x5c / 255.0, 0x3a / 255.0, 0x1e / 255.0)
const CANOPY_COLORS: Array[Color] = [
	Color(0x2d / 255.0, 0x5a / 255.0, 0x1e / 255.0),
	Color(0x3a / 255.0, 0x6b / 255.0, 0x2a / 255.0),
	Color(0x1e / 255.0, 0x4a / 255.0, 0x12 / 255.0),
]
const GRASS_COLOR := Color(0x4a / 255.0, 0x7a / 255.0, 0x2e / 255.0)
const ROCK_COLOR := Color(0x88 / 255.0, 0x88 / 255.0, 0x88 / 255.0)
const FERN_COLOR := Color(0x4a / 255.0, 0x80 / 255.0, 0x40 / 255.0)
const FLOWER_COLORS: Array[Color] = [
	Color(0xff / 255.0, 0x4d / 255.0, 0xa6 / 255.0),
	Color(0xff / 255.0, 0xe0 / 255.0, 0x40 / 255.0),
	Color(0x8b / 255.0, 0x6c / 255.0, 0xf7 / 255.0),
	Color(0xff / 255.0, 0x80 / 255.0, 0xb0 / 255.0),
	Color(0xff / 255.0, 0xee / 255.0, 0x55 / 255.0),
	Color(0xff / 255.0, 0x60 / 255.0, 0x60 / 255.0),
]
const FLOWER_DENSITY_THRESHOLD := 0.55
const FLOWER_GRID_SPACING := 2.0
const FLOWER_SCALE := 0.55

# =============================================================================
# Footsteps
# =============================================================================

const FOOTSTEP_VOLUME := 0.12
const FOOTSTEP_GRASS_LP_FREQ := 600        ## lowpass cutoff for grass thud
const FOOTSTEP_GRASS_HP_FREQ := 3000       ## highpass cutoff for grass swish
const FOOTSTEP_ROCK_BP_FREQ := 1800        ## bandpass center for rock tap
const FOOTSTEP_ROCK_PING_FREQ := 3200      ## sine ping for rock click
const FOOTSTEP_PITCH_VARIATION := 0.15     ## +/- random pitch shift per step

# =============================================================================
# Crickets
# =============================================================================

const CRICKET_VOLUME := 0.06
const CRICKET_VOICES := 4
const CRICKET_FREQ_MIN := 4200
const CRICKET_FREQ_MAX := 5400
const CRICKET_SUN_FADE_IN := -0.05         ## sun elevation to start fading in
const CRICKET_SUN_FADE_OUT := 0.05         ## sun elevation to fully fade out
const CRICKET_CHIRP_RATE_MIN := 12         ## pulses per second
const CRICKET_CHIRP_RATE_MAX := 20

# =============================================================================
# Rustling leaves
# =============================================================================

const RUSTLE_VOLUME := 0.12
const RUSTLE_TRIGGER_DIST := 5             ## meters to trigger rustle
const RUSTLE_COOLDOWN := 0.3               ## seconds between rustles
const RUSTLE_MAX_CONCURRENT := 3

# =============================================================================
# Collectibles
# =============================================================================

const COLLECTIBLE_GRID_SPACING := 12           ## meters between potential positions
const COLLECTIBLE_DENSITY_THRESHOLD := 0.55    ## noise > this = collectible
const COLLECTIBLE_COLLISION_RADIUS := 1.2      ## pickup distance in meters
const COLLECTIBLE_BOB_SPEED := 1.5             ## oscillations per second
const COLLECTIBLE_BOB_AMOUNT := 0.08           ## meters of vertical bob
const COLLECTIBLE_SPIN_SPEED := 1.8            ## radians per second
const COLLECTIBLE_GLOW_COLOR := Color(0x66 / 255.0, 0xff / 255.0, 0xcc / 255.0)
const COLLECTIBLE_CORE_COLOR := Color(0xaa / 255.0, 0xff / 255.0, 0xee / 255.0)
const COLLECTIBLE_ORB_RADIUS := 0.08           ## core orb radius
const COLLECTIBLE_GLOW_RADIUS := 0.2           ## glow shell radius
const COLLECTIBLE_SCORE_VALUE := 1             ## points per orb
const COLLECTIBLE_CHIME_VOLUME := 0.18         ## collection chime volume
const COLLECTIBLE_CHIME_FREQ := 880            ## base chime frequency
const COLLECTIBLE_MAX_INSTANCES := 500         ## instanced mesh cap

# =============================================================================
# Spatial audio
# =============================================================================

const SPATIAL_REF_DISTANCE := 10
const SPATIAL_MAX_DISTANCE := 60
const SPATIAL_ROLLOFF := 0.8

# =============================================================================
# Weather
# =============================================================================

const WEATHER_TRANSITION_RATE := 0.0083        ## intensity units per second
const WEATHER_HOLD_MIN := 180                  ## seconds to hold a state (3 min)
const WEATHER_HOLD_MAX := 480                  ## seconds max hold (8 min)
const WEATHER_STORM_CLOUD_COLOR := Color(0x30 / 255.0, 0x30 / 255.0, 0x38 / 255.0)

# =============================================================================
# Rain particles
# =============================================================================

const RAIN_PARTICLE_COUNT := 5000
const RAIN_RADIUS := 25                        ## cylinder radius around player
const RAIN_HEIGHT := 20                        ## cylinder height
const RAIN_SPEED_MIN := 11                     ## m/s downward
const RAIN_SPEED_MAX := 16
const RAIN_WIND_INFLUENCE := 0.3               ## how much wind pushes rain sideways

# =============================================================================
# Thunder / lightning
# =============================================================================

const THUNDER_INTERVAL_MIN := 6                ## seconds between flashes
const THUNDER_INTERVAL_MAX := 18
const LIGHTNING_FLASH_DECAY := 0.2             ## seconds for flash to fade
const LIGHTNING_BOLT_MIN_DIST := 60            ## min bolt distance from player
const LIGHTNING_BOLT_MAX_DIST := 200           ## max bolt distance from player

# =============================================================================
# Rain audio
# =============================================================================

const RAIN_PATTER_FREQ := 3200
const RAIN_PATTER_Q := 0.6
const RAIN_WASH_FREQ := 800
const RAIN_WASH_Q := 0.4
const THUNDER_FREQ_MIN := 150
const THUNDER_FREQ_MAX := 250
const THUNDER_DECAY := 7

# =============================================================================
# Ground wetness
# =============================================================================

const WETNESS_WET_RATE := 0.0083               ## per second (~2 min to fully wet)
const WETNESS_DRY_RATE := 0.0042               ## per second (~4 min to fully dry)

# =============================================================================
# Cottages
# =============================================================================

const COTTAGE_GRID_SPACING := 16               ## meters between potential positions
const COTTAGE_DENSITY_THRESHOLD := 0.45        ## noise > this = cottage
const COTTAGE_CLEARING_RADIUS := 10            ## meters — no trees/veg within this radius
const COTTAGE_MIN_TREE_DENSITY := 0.0          ## relaxed
const COTTAGE_MAX_SLOPE := 0.3                 ## max terrain slope
const COTTAGE_COLLISION_RADIUS := 2.0          ## player collision radius
const COTTAGE_GARDEN_COLOR := Color(0.38, 0.30, 0.16)  ## warm earthy garden soil

# =============================================================================
# Cottage smoke particles
# =============================================================================

const SMOKE_PARTICLES_PER_COTTAGE := 20
const SMOKE_LIFETIME := 7.0                    ## seconds
const SMOKE_RISE_SPEED := 2.2                  ## m/s upward
const SMOKE_DRIFT_SPEED := 0.5                 ## m/s wind drift
const SMOKE_START_SIZE := 0.4                  ## meters
const SMOKE_END_SIZE := 3.5                    ## meters
const SMOKE_COLOR := Color(0.55, 0.55, 0.58)  ## subtle grey wisps
