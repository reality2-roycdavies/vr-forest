extends RefCounted
## Terrain noise functions — skeleton port of threejs/js/terrain/noise.js
## Uses Godot's built-in FastNoiseLite instead of simplex-noise.
## Same seed values from Config; same function signatures.

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


# --- Public API ---

## Multi-octave fractal noise, normalized to [-1, 1].
func fractal_noise(x: float, z: float, scale: float, octaves: int,
		persistence: float, lacunarity: float) -> float:
	var total := 0.0
	var amplitude := 1.0
	var frequency := scale
	var max_amp := 0.0
	for _i in octaves:
		total += _terrain_noise.get_noise_2d(x * frequency, z * frequency) * amplitude
		max_amp += amplitude
		amplitude *= persistence
		frequency *= lacunarity
	return total / max_amp


## Get base terrain height (no river carving).
func get_base_terrain_height(world_x: float, world_z: float) -> float:
	# Layer 1: fBm base terrain
	var base_height := fractal_noise(world_x, world_z,
		Config.TERRAIN_SCALE, Config.TERRAIN_OCTAVES,
		Config.TERRAIN_PERSISTENCE, Config.TERRAIN_LACUNARITY) * Config.TERRAIN_HEIGHT

	# Layer 2: Valley carving (domain-warped ridge noise)
	var warp_x := _warp_noise.get_noise_2d(world_x * 0.006, world_z * 0.006) * Config.VALLEY_WARP
	var warp_z := _warp_noise.get_noise_2d(world_x * 0.006 + 100.0, world_z * 0.006 + 100.0) * Config.VALLEY_WARP

	var raw := _stream_noise.get_noise_2d(
		(world_x + warp_x) * Config.VALLEY_SCALE,
		(world_z + warp_z) * Config.VALLEY_SCALE)
	var ridge := 1.0 - absf(raw)
	var channel := pow(ridge, Config.VALLEY_SHARPNESS)

	var normalized_h := (base_height / Config.TERRAIN_HEIGHT + 1.0) * 0.5
	var carve_mask := maxf(0.0, 1.0 - normalized_h * 0.8)

	var stream_h := base_height - channel * Config.VALLEY_DEPTH * carve_mask

	# Layer 3: Mountain chains (additive ridge noise)
	var mwx := _mountain_warp_noise.get_noise_2d(world_x * 0.004, world_z * 0.004) * Config.MOUNTAIN_WARP
	var mwz := _mountain_warp_noise.get_noise_2d(world_x * 0.004 + 200.0, world_z * 0.004 + 200.0) * Config.MOUNTAIN_WARP

	var m_raw := _mountain_noise.get_noise_2d(
		(world_x + mwx) * Config.MOUNTAIN_SCALE,
		(world_z + mwz) * Config.MOUNTAIN_SCALE)
	var m_ridge := 1.0 - m_raw * m_raw  # smooth parabolic peak
	var m_channel := pow(m_ridge, Config.MOUNTAIN_SHARPNESS)

	var m_detail := _mountain_detail_noise.get_noise_2d(
		(world_x + mwx) * 0.0075, (world_z + mwz) * 0.0075)
	var m_blended := m_channel * (0.7 + m_detail * 0.3)

	var amp_mod := _mountain_detail_noise.get_noise_2d(world_x * 0.0012, world_z * 0.0012) * 0.4 + 0.6

	var m_mask := maxf(0.0, m_blended - Config.MOUNTAIN_THRESHOLD) / (1.0 - Config.MOUNTAIN_THRESHOLD)

	# Spawn fade: mountains don't appear near origin
	var dist := sqrt(world_x * world_x + world_z * world_z)
	var spawn_fade := clampf((dist - 60.0) / 40.0, 0.0, 1.0)

	# Foothills
	var foothill_noise := _mountain_detail_noise.get_noise_2d(world_x * Config.FOOTHILL_SCALE, world_z * Config.FOOTHILL_SCALE)
	var foothill_base := foothill_noise * 0.5 + 0.5
	var foothill_proximity := minf(1.0, m_blended * 2.5)
	var foothill_h := foothill_base * foothill_proximity * Config.FOOTHILL_HEIGHT

	# Valley dip between ridges
	var valley_dip := foothill_proximity * (1.0 - m_mask) * Config.MOUNTAIN_VALLEY_DEPTH

	var final_height := stream_h + (m_mask * amp_mod * Config.MOUNTAIN_HEIGHT + foothill_h - valley_dip) * spawn_fade

	return final_height


## Get terrain height at world coordinates (base + river carving).
func get_terrain_height(world_x: float, world_z: float) -> float:
	return get_base_terrain_height(world_x, world_z)


## Approximate terrain height — base + valley only, no mountains.
func get_terrain_height_approx(world_x: float, world_z: float) -> float:
	var base_height := fractal_noise(world_x, world_z,
		Config.TERRAIN_SCALE, Config.TERRAIN_OCTAVES,
		Config.TERRAIN_PERSISTENCE, Config.TERRAIN_LACUNARITY) * Config.TERRAIN_HEIGHT

	var warp_x := _warp_noise.get_noise_2d(world_x * 0.006, world_z * 0.006) * Config.VALLEY_WARP
	var warp_z := _warp_noise.get_noise_2d(world_x * 0.006 + 100.0, world_z * 0.006 + 100.0) * Config.VALLEY_WARP

	var raw := _stream_noise.get_noise_2d(
		(world_x + warp_x) * Config.VALLEY_SCALE,
		(world_z + warp_z) * Config.VALLEY_SCALE)
	var ridge := 1.0 - absf(raw)
	var channel := pow(ridge, Config.VALLEY_SHARPNESS)

	var normalized_h := (base_height / Config.TERRAIN_HEIGHT + 1.0) * 0.5
	var carve_mask := maxf(0.0, 1.0 - normalized_h * 0.8)

	return base_height - channel * Config.VALLEY_DEPTH * carve_mask


## Mountain factor at world coordinates (0 = no mountain, 1 = peak).
func get_mountain_factor(world_x: float, world_z: float) -> float:
	var mwx := _mountain_warp_noise.get_noise_2d(world_x * 0.004, world_z * 0.004) * Config.MOUNTAIN_WARP
	var mwz := _mountain_warp_noise.get_noise_2d(world_x * 0.004 + 200.0, world_z * 0.004 + 200.0) * Config.MOUNTAIN_WARP

	var m_raw := _mountain_noise.get_noise_2d(
		(world_x + mwx) * Config.MOUNTAIN_SCALE,
		(world_z + mwz) * Config.MOUNTAIN_SCALE)
	var m_ridge := 1.0 - m_raw * m_raw
	var m_channel := pow(m_ridge, Config.MOUNTAIN_SHARPNESS)

	var m_detail := _mountain_detail_noise.get_noise_2d(
		(world_x + mwx) * 0.0075, (world_z + mwz) * 0.0075)
	var m_blended := m_channel * (0.7 + m_detail * 0.3)

	var m_mask := maxf(0.0, m_blended - Config.MOUNTAIN_THRESHOLD) / (1.0 - Config.MOUNTAIN_THRESHOLD)

	var dist := sqrt(world_x * world_x + world_z * world_z)
	var spawn_fade := clampf((dist - 60.0) / 40.0, 0.0, 1.0)

	return m_mask * spawn_fade


## Tree density noise at world coordinates.
func get_tree_density(world_x: float, world_z: float) -> float:
	return _tree_noise.get_noise_2d(world_x * Config.TREE_DENSITY_SCALE, world_z * Config.TREE_DENSITY_SCALE)


## Vegetation density noise.
func get_veg_density(world_x: float, world_z: float) -> float:
	return _veg_noise.get_noise_2d(world_x * 0.08, world_z * 0.08)


## Jitter noise for natural placement offsets. Returns Vector2.
func get_jitter(world_x: float, world_z: float) -> Vector2:
	var jx := _jitter_noise.get_noise_2d(world_x * 0.5, world_z * 0.5)
	var jz := _jitter_noise.get_noise_2d(world_x * 0.5 + 100.0, world_z * 0.5 + 100.0)
	return Vector2(jx, jz)


## Dirt patch noise — returns 0..1, higher = more dirt.
func get_dirt_amount(world_x: float, world_z: float) -> float:
	var d1 := _dirt_noise.get_noise_2d(world_x * Config.GROUND_DIRT_SCALE, world_z * Config.GROUND_DIRT_SCALE)
	var d2 := _dirt_noise.get_noise_2d(world_x * Config.GROUND_DIRT_SCALE * 2.5, world_z * Config.GROUND_DIRT_SCALE * 2.5)
	return (d1 * 0.6 + d2 * 0.4) * 0.5 + 0.5


## Rock placement noise.
func get_rock_density(world_x: float, world_z: float) -> float:
	return _rock_noise.get_noise_2d(world_x * 0.04, world_z * 0.04)


## Collectible placement noise.
func get_collectible_density(world_x: float, world_z: float) -> float:
	return _collectible_noise.get_noise_2d(world_x * 0.03, world_z * 0.03)


## Fallen log / stump placement noise.
func get_log_density(world_x: float, world_z: float) -> float:
	return _log_noise.get_noise_2d(world_x * 0.04, world_z * 0.04)


## Cottage placement noise.
func get_cottage_density(world_x: float, world_z: float) -> float:
	return _cottage_noise.get_noise_2d(world_x * 0.02, world_z * 0.02)


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
