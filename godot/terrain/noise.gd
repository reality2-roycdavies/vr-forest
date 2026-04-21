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
var _zone_noise: FastNoiseLite
var _continent_noise: FastNoiseLite
var _continent_warp_noise: FastNoiseLite
var _ridge_noise: FastNoiseLite
var _terrace_noise: FastNoiseLite
var _lake_noise: FastNoiseLite
var _lake_warp_noise: FastNoiseLite
var _erosion_map: RefCounted  # ErosionMap instance, set via set_erosion_map()
var _river_tracer: RefCounted  # RiverTracer instance, set via set_river_tracer()


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
	_zone_noise = _make_noise(Config.TERRAIN_SEED + 14)
	_continent_noise = _make_noise(Config.TERRAIN_SEED + 15)
	_continent_warp_noise = _make_noise(Config.TERRAIN_SEED + 16)
	_ridge_noise = _make_noise(Config.TERRAIN_SEED + 17)
	_terrace_noise = _make_noise(Config.TERRAIN_SEED + 18)
	_lake_noise = _make_noise(Config.TERRAIN_SEED + 19)
	_lake_warp_noise = _make_noise(Config.TERRAIN_SEED + 20)


func set_erosion_map(emap: RefCounted) -> void:
	_erosion_map = emap


func set_river_tracer(tracer: RefCounted) -> void:
	_river_tracer = tracer


func _make_noise(seed_val: int) -> FastNoiseLite:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX
	n.seed = seed_val
	n.frequency = 1.0  # caller scales coordinates
	return n


# --- Geological helpers ---

## Continental value at world coordinates — very low frequency, domain-warped.
## Returns [-1, 1]. Determines biome character:
##   [-1, -0.3] lowland plains, [-0.3, 0.2] rolling hills,
##   [0.2, 0.6] valley country, [0.6, 1.0] mountainous
func _get_continent_value(x: float, z: float) -> float:
	var wx := _continent_warp_noise.get_noise_2d(x * Config.CONTINENT_SCALE * 0.7, z * Config.CONTINENT_SCALE * 0.7) * Config.CONTINENT_WARP
	var wz := _continent_warp_noise.get_noise_2d(x * Config.CONTINENT_SCALE * 0.7 + 300.0, z * Config.CONTINENT_SCALE * 0.7 + 300.0) * Config.CONTINENT_WARP
	return _continent_noise.get_noise_2d((x + wx) * Config.CONTINENT_SCALE, (z + wz) * Config.CONTINENT_SCALE)


## Ridged multifractal with Swiss turbulence.
## Returns [0, ~1] — sharp ridges, flat valleys, natural erosion-like detail loss on slopes.
func _ridged_swiss(x: float, z: float, noise_src: FastNoiseLite, scale: float,
		octaves: int, persistence: float, lacunarity: float,
		ridge_offset: float, ridge_gain: float, weight_clamp: float) -> float:
	var total := 0.0
	var amplitude := 1.0
	var frequency := scale
	var max_amp := 0.0
	var weight := 1.0
	var deriv_sum := 0.0

	for _i in octaves:
		var n := noise_src.get_noise_2d(x * frequency, z * frequency)
		# Ridge transform: offset - |noise|, squared for sharp ridges
		var ridge := ridge_offset - absf(n)
		ridge *= ridge
		# Swiss turbulence: weight by accumulated derivative
		ridge *= weight
		total += ridge * amplitude
		max_amp += amplitude

		# Approximate derivative from noise magnitude for Swiss erosion
		deriv_sum += absf(n) * amplitude
		weight = clampf(ridge * ridge_gain, 0.0, weight_clamp)

		amplitude *= persistence
		frequency *= lacunarity

	return total / max_amp


## Power-law height remapping — flat valley floors, steeper hillsides.
## Applied separately to positive (peaks) and negative (valleys) ranges.
func _height_remap(h: float, max_h: float) -> float:
	if max_h < 0.001:
		return h
	if h >= 0.0:
		# Positive: power > 1 compresses low values → flat bases, steep peaks
		var t := clampf(h / max_h, 0.0, 1.0)
		return pow(t, Config.HEIGHT_REMAP_POWER) * max_h
	else:
		# Negative: mild compression to widen flat valley floors
		var t := clampf(-h / max_h, 0.0, 1.0)
		return -pow(t, 0.7) * max_h


## Terrace / stratification effect — subtle stepped plateaus.
## Visibility varies spatially so terracing doesn't appear everywhere.
func _terrace_effect(h: float, x: float, z: float) -> float:
	var visibility := _terrace_noise.get_noise_2d(x * Config.TERRACE_NOISE_SCALE, z * Config.TERRACE_NOISE_SCALE) * 0.5 + 0.5
	visibility = clampf(visibility * 1.5 - 0.25, 0.0, 1.0)  # bias toward visible
	var step := 1.0 / maxf(Config.TERRACE_FREQUENCY, 0.01)
	var terraced: float = round(h / step) * step
	return lerpf(h, terraced, Config.TERRACE_STRENGTH * visibility)


## Lake basin depression — creates bowl-shaped depressions at noise-determined locations.
## Returns carving depth >= 0. Higher values near basin centers, 0 outside basins.
func _get_lake_depression(x: float, z: float) -> float:
	# Domain warp for organic lake shapes
	var wx := _lake_warp_noise.get_noise_2d(x * Config.LAKE_BASIN_SCALE * 2.0, z * Config.LAKE_BASIN_SCALE * 2.0) * 40.0
	var wz := _lake_warp_noise.get_noise_2d(x * Config.LAKE_BASIN_SCALE * 2.0 + 200.0, z * Config.LAKE_BASIN_SCALE * 2.0 + 200.0) * 40.0

	var n := _lake_noise.get_noise_2d((x + wx) * Config.LAKE_BASIN_SCALE, (z + wz) * Config.LAKE_BASIN_SCALE)
	# Remap to [0,1]
	n = n * 0.5 + 0.5

	if n < Config.LAKE_BASIN_THRESHOLD:
		return 0.0

	# How far above threshold — drives basin depth
	var t := (n - Config.LAKE_BASIN_THRESHOLD) / (1.0 - Config.LAKE_BASIN_THRESHOLD)
	# Smooth bowl profile
	return Config.LAKE_BASIN_DEPTH * t * t


## Get the local water level at a position.
## Returns the Y level of water that should be rendered here:
## either the global WATER_LEVEL or a highland lake level if in a basin.
func get_local_water_level(x: float, z: float) -> float:
	var depression := _get_lake_depression(x, z)
	if depression < 0.5:
		return Config.WATER_LEVEL

	# Use natural (un-carved) terrain height — no circular dependency
	var natural_h := get_natural_terrain_height(x, z)
	# Basin floor is natural_h - depression; fill from the bottom up
	var lake_level := natural_h - depression * (1.0 - Config.LAKE_FILL_FRACTION)
	return maxf(Config.WATER_LEVEL, lake_level)


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


## Natural terrain height — everything except lake basin carving.
## Used by get_local_water_level() to find the undisturbed surface.
func get_natural_terrain_height(world_x: float, world_z: float) -> float:
	# --- 1. Continental value → biome blend factors ---
	var continent := _get_continent_value(world_x, world_z)

	# Biome weights (smooth overlapping ramps)
	var w_plains := clampf((-continent - 0.3) / 0.7, 0.0, 1.0)    # [-1, -0.3]
	var w_hills := 1.0 - absf(clampf((continent + 0.05) / 0.25, -1.0, 1.0))  # peak at -0.05
	var w_valley := clampf(1.0 - absf((continent - 0.4) / 0.2), 0.0, 1.0)  # peak at 0.4
	var w_mountain := clampf((continent - 0.6) / 0.4, 0.0, 1.0)   # [0.6, 1.0]

	# Normalize weights
	var w_total := w_plains + w_hills + w_valley + w_mountain + 0.001
	w_plains /= w_total
	w_hills /= w_total
	w_valley /= w_total
	w_mountain /= w_total

	# --- 2. Ridged Swiss multifractal height (sharp ridges, flat valleys) ---
	var ridged_h := _ridged_swiss(world_x, world_z, _ridge_noise,
		Config.RMF_SCALE, Config.RMF_OCTAVES, Config.RMF_PERSISTENCE,
		Config.RMF_LACUNARITY, Config.RMF_RIDGE_OFFSET, Config.RMF_RIDGE_GAIN,
		Config.SWISS_WEIGHT_CLAMP)

	# --- 3. Gentle fBm height (smooth, for plains blend) ---
	var gentle_h := fractal_noise(world_x, world_z,
		Config.TERRAIN_SCALE, Config.TERRAIN_OCTAVES,
		Config.TERRAIN_PERSISTENCE, Config.TERRAIN_LACUNARITY)

	# --- 4. Blend heights per biome with different amplitudes ---
	# Plains: very gentle, almost flat undulation
	var plains_h := gentle_h * 2.0
	# Hills: mostly gentle with subtle ridged character
	var hills_h := lerpf(gentle_h * 5.0, ridged_h * 7.0, 0.12)
	# Valley country: ridged noise creates distinct ridgelines and carved valleys
	var valley_h := lerpf(gentle_h * 4.0, ridged_h * 14.0, 0.5)
	# Mountain base: strong ridged influence for dramatic terrain
	var mountain_base_h := lerpf(gentle_h * 5.0, ridged_h * 16.0, 0.6)

	var blended_h := plains_h * w_plains + hills_h * w_hills + valley_h * w_valley + mountain_base_h * w_mountain

	# --- 4b. Power-law height remap ---
	blended_h = _height_remap(blended_h, Config.TERRAIN_HEIGHT)

	# --- 5. Terrace effect ---
	blended_h = _terrace_effect(blended_h, world_x, world_z)

	# --- 6. Improved valley carving: altitude-dependent shape ---
	var warp_x := _warp_noise.get_noise_2d(world_x * 0.006, world_z * 0.006) * Config.VALLEY_WARP
	var warp_z := _warp_noise.get_noise_2d(world_x * 0.006 + 100.0, world_z * 0.006 + 100.0) * Config.VALLEY_WARP

	var raw := _stream_noise.get_noise_2d(
		(world_x + warp_x) * Config.VALLEY_SCALE,
		(world_z + warp_z) * Config.VALLEY_SCALE)
	var ridge := 1.0 - absf(raw)

	# Altitude-dependent shape: V-shaped (power 3.0) at altitude, U-shaped (power 1.2) in lowlands
	var alt_factor := clampf(blended_h / Config.TERRAIN_HEIGHT, 0.0, 1.0)
	var valley_power := lerpf(1.2, 3.0, alt_factor)
	var channel := pow(ridge, valley_power)

	# Asymmetric offset noise for natural meander
	var asym := _warp_noise.get_noise_2d(world_x * 0.012 + 500.0, world_z * 0.012 + 500.0) * 0.3
	channel = clampf(channel + asym * channel, 0.0, 1.0)

	var normalized_h := clampf((blended_h / Config.TERRAIN_HEIGHT + 1.0) * 0.5, 0.0, 1.0)
	var carve_mask := maxf(0.0, 1.0 - normalized_h * 0.8)

	# Deeper carving in valley biomes
	var valley_depth_mod := 1.0 + w_valley * 0.6
	var carved_h := blended_h - channel * Config.VALLEY_DEPTH * carve_mask * valley_depth_mod

	# --- 7. Mountain chains — spawn modulated by continent ---
	var continent_mountain_boost := clampf((continent - 0.3) / 0.4, 0.0, 1.0)

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

	var amp_mod := _mountain_detail_noise.get_noise_2d(world_x * 0.0012, world_z * 0.0012) * 0.4 + 0.6

	var m_mask := maxf(0.0, m_blended - Config.MOUNTAIN_THRESHOLD) / (1.0 - Config.MOUNTAIN_THRESHOLD)

	var dist := sqrt(world_x * world_x + world_z * world_z)
	var spawn_fade := clampf((dist - 60.0) / 40.0, 0.0, 1.0) * continent_mountain_boost

	# Foothills — appear near mountains, gated by spawn_fade
	var foothill_noise := _mountain_detail_noise.get_noise_2d(world_x * Config.FOOTHILL_SCALE, world_z * Config.FOOTHILL_SCALE)
	var foothill_base := foothill_noise * 0.5 + 0.5
	var mountain_proximity := minf(1.0, m_blended * 2.5)

	var valley_dip := mountain_proximity * (1.0 - m_mask) * Config.MOUNTAIN_VALLEY_DEPTH

	# Mountains and foothills all use spawn_fade (continent-gated)
	var mountain_core := (m_mask * amp_mod * Config.MOUNTAIN_HEIGHT - valley_dip) * spawn_fade
	var mountain_foothills := foothill_base * mountain_proximity * Config.FOOTHILL_HEIGHT * spawn_fade
	var mountain_h := mountain_core + mountain_foothills

	# --- 8. Erosion overlay — scaled by local slope estimate ---
	var erosion_h := 0.0
	if _erosion_map != null:
		# Approximate local slope from blended height for erosion scaling
		var slope_est := clampf(absf(ridged_h - gentle_h) * 2.0, 0.1, 1.0)
		erosion_h = _erosion_map.sample(world_x, world_z) * slope_est

	# --- 9. Final height (no lake carving) ---
	return carved_h + mountain_h + erosion_h


## Get base terrain height (no river carving).
## Calls get_natural_terrain_height() then subtracts lake basin depression.
func get_base_terrain_height(world_x: float, world_z: float) -> float:
	var natural_h := get_natural_terrain_height(world_x, world_z)
	var lake_carve := _get_lake_depression(world_x, world_z)
	return natural_h - lake_carve


## Get terrain height at world coordinates (base - river carving).
func get_terrain_height(world_x: float, world_z: float) -> float:
	var h := get_base_terrain_height(world_x, world_z)
	if _river_tracer != null:
		h -= _river_tracer.get_river_carving(world_x, world_z)
	return h


## River presence factor [0-1] at world coordinates. Delegates to tracer.
func get_river_factor(world_x: float, world_z: float) -> float:
	if _river_tracer != null:
		return _river_tracer.get_river_factor(world_x, world_z)
	return 0.0


## Approximate terrain height — continent-blended base + valley carving, no mountains/erosion.
## Used for fast river tracing and placement checks.
func get_terrain_height_approx(world_x: float, world_z: float) -> float:
	# Simplified continent blend
	var continent := _get_continent_value(world_x, world_z)
	var w_plains := clampf((-continent - 0.3) / 0.7, 0.0, 1.0)
	var w_hills := 1.0 - absf(clampf((continent + 0.05) / 0.25, -1.0, 1.0))
	var w_total := w_plains + w_hills + 0.001
	w_plains /= w_total
	w_hills /= w_total

	var gentle_h := fractal_noise(world_x, world_z,
		Config.TERRAIN_SCALE, Config.TERRAIN_OCTAVES,
		Config.TERRAIN_PERSISTENCE, Config.TERRAIN_LACUNARITY)

	var base_height := gentle_h * lerpf(4.0, 8.0, w_hills / (w_plains + w_hills + 0.001))

	# Valley carving
	var warp_x := _warp_noise.get_noise_2d(world_x * 0.006, world_z * 0.006) * Config.VALLEY_WARP
	var warp_z := _warp_noise.get_noise_2d(world_x * 0.006 + 100.0, world_z * 0.006 + 100.0) * Config.VALLEY_WARP

	var raw := _stream_noise.get_noise_2d(
		(world_x + warp_x) * Config.VALLEY_SCALE,
		(world_z + warp_z) * Config.VALLEY_SCALE)
	var ridge := 1.0 - absf(raw)
	var channel := pow(ridge, Config.VALLEY_SHARPNESS)

	var normalized_h := clampf((base_height / Config.TERRAIN_HEIGHT + 1.0) * 0.5, 0.0, 1.0)
	var carve_mask := maxf(0.0, 1.0 - normalized_h * 0.8)

	return base_height - channel * Config.VALLEY_DEPTH * carve_mask


## Mountain factor at world coordinates (0 = no mountain, 1 = peak).
## Now modulated by continent value so mountains concentrate in mountainous biomes.
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
	var continent_mountain_boost := clampf((_get_continent_value(world_x, world_z) - 0.3) / 0.4, 0.0, 1.0)
	var spawn_fade := clampf((dist - 60.0) / 40.0, 0.0, 1.0) * continent_mountain_boost

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


## Zone boundary noise — multi-octave offset in meters for altitude zone edges.
func get_zone_noise(world_x: float, world_z: float) -> float:
	var n1 := _zone_noise.get_noise_2d(world_x * 0.06, world_z * 0.06) * 4.0
	var n2 := _zone_noise.get_noise_2d(world_x * 0.17 + 50.0, world_z * 0.17 + 50.0) * 2.0
	var n3 := _zone_noise.get_noise_2d(world_x * 0.43 + 120.0, world_z * 0.43 + 120.0) * 1.0
	return n1 + n2 + n3  # range approx [-3.5, +3.5] meters
