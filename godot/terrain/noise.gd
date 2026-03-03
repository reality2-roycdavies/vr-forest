extends RefCounted
## Terrain noise functions — skeleton port of threejs/js/terrain/noise.js
## Uses Godot's built-in FastNoiseLite instead of simplex-noise.
## Same seed values from Config; same function signatures.
##
## NOTE: FastNoiseLite output range differs from simplex-noise.
## Spec tests use range-based assertions, so exact values need not match —
## only behavioural constraints (height ranges, density thresholds, etc.).

# --- Noise instances ---

var _terrain_noise: FastNoiseLite
var _tree_noise: FastNoiseLite
var _veg_noise: FastNoiseLite
var _jitter_noise: FastNoiseLite
var _dirt_noise: FastNoiseLite
var _rock_noise: FastNoiseLite
var _stream_noise: FastNoiseLite
var _warp_noise: FastNoiseLite
var _collectible_noise: FastNoiseLite
var _mountain_noise: FastNoiseLite
var _mountain_warp_noise: FastNoiseLite
var _mountain_detail_noise: FastNoiseLite
var _log_noise: FastNoiseLite
var _cottage_noise: FastNoiseLite


func _init() -> void:
	_terrain_noise = _make_noise(Config.TERRAIN_SEED)
	_tree_noise = _make_noise(Config.TERRAIN_SEED + 1)
	_veg_noise = _make_noise(Config.TERRAIN_SEED + 2)
	_jitter_noise = _make_noise(Config.TERRAIN_SEED + 3)
	_dirt_noise = _make_noise(Config.TERRAIN_SEED + 4)
	_rock_noise = _make_noise(Config.TERRAIN_SEED + 5)
	_stream_noise = _make_noise(Config.TERRAIN_SEED + 6)
	_warp_noise = _make_noise(Config.TERRAIN_SEED + 7)
	_collectible_noise = _make_noise(Config.TERRAIN_SEED + 8)
	_mountain_noise = _make_noise(Config.TERRAIN_SEED + 9)
	_mountain_warp_noise = _make_noise(Config.TERRAIN_SEED + 10)
	_mountain_detail_noise = _make_noise(Config.TERRAIN_SEED + 11)
	_log_noise = _make_noise(Config.TERRAIN_SEED + 12)
	_cottage_noise = _make_noise(Config.TERRAIN_SEED + 13)


func _make_noise(seed_val: int) -> FastNoiseLite:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX
	n.seed = seed_val
	n.frequency = 1.0  # caller scales coordinates
	return n


# --- Public API (matches JS function signatures) ---

## Multi-octave fractal noise, normalized to [-1, 1].
func fractal_noise(x: float, z: float, scale: float, octaves: int,
		persistence: float, lacunarity: float) -> float:
	# TODO: implement multi-octave loop using _terrain_noise
	# FastNoiseLite has built-in fractal modes, but manual loop gives parity.
	return 0.0


## Get base terrain height (no river carving).
## Used by river tracer to find downhill paths.
func get_base_terrain_height(world_x: float, world_z: float) -> float:
	# TODO: port fractal noise + valley carving + mountain chains from JS
	return 0.0


## Get terrain height at world coordinates (base + river carving).
func get_terrain_height(world_x: float, world_z: float) -> float:
	# TODO: call get_base_terrain_height minus river carving
	return get_base_terrain_height(world_x, world_z)


## Approximate terrain height — base + valley only, no mountains.
## ~46% fewer noise evaluations. Use for water shader heightmap.
func get_terrain_height_approx(world_x: float, world_z: float) -> float:
	# TODO: port lightweight version (no mountain noise)
	return 0.0


## Mountain factor at world coordinates (0 = no mountain, 1 = peak).
func get_mountain_factor(world_x: float, world_z: float) -> float:
	# TODO: port mountain ridge noise chain
	return 0.0


## Tree density noise at world coordinates.
func get_tree_density(world_x: float, world_z: float) -> float:
	# TODO: return _tree_noise.get_noise_2d(world_x * TREE_DENSITY_SCALE, ...)
	return 0.0


## Vegetation density noise.
func get_veg_density(world_x: float, world_z: float) -> float:
	# TODO: return _veg_noise.get_noise_2d(world_x * 0.08, ...)
	return 0.0


## Jitter noise for natural placement offsets. Returns Vector2.
func get_jitter(world_x: float, world_z: float) -> Vector2:
	# TODO: two noise samples offset by 100
	return Vector2.ZERO


## Dirt patch noise — returns 0..1, higher = more dirt.
func get_dirt_amount(world_x: float, world_z: float) -> float:
	# TODO: two-frequency dirt noise, normalized 0..1
	return 0.0


## Rock placement noise.
func get_rock_density(world_x: float, world_z: float) -> float:
	# TODO: return _rock_noise.get_noise_2d(world_x * 0.04, ...)
	return 0.0


## Collectible placement noise.
func get_collectible_density(world_x: float, world_z: float) -> float:
	# TODO: return _collectible_noise.get_noise_2d(world_x * 0.03, ...)
	return 0.0


## Fallen log / stump placement noise.
func get_log_density(world_x: float, world_z: float) -> float:
	# TODO: return _log_noise.get_noise_2d(world_x * 0.04, ...)
	return 0.0


## Cottage placement noise.
func get_cottage_density(world_x: float, world_z: float) -> float:
	# TODO: return _cottage_noise.get_noise_2d(world_x * 0.02, ...)
	return 0.0


## Terrain slope at world coordinates (rise/run from finite differences).
func get_terrain_slope(world_x: float, world_z: float) -> float:
	var eps := 0.5
	var h_l := get_terrain_height(world_x - eps, world_z)
	var h_r := get_terrain_height(world_x + eps, world_z)
	var h_d := get_terrain_height(world_x, world_z - eps)
	var h_u := get_terrain_height(world_x, world_z + eps)
	var dx := (h_r - h_l) / (2.0 * eps)
	var dz := (h_u - h_d) / (2.0 * eps)
	return sqrt(dx * dx + dz * dz)
