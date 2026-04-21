extends RefCounted
## Pre-computed toroidal hydraulic erosion heightmap.
## Generates a seamless erosion detail map in a background thread,
## sampled as a tiling overlay in the terrain noise pipeline.

var _size: int
var _tile_meters: float
var _delta: PackedFloat32Array  # erosion delta map, normalized [-1, 1]
var _rng: RandomNumberGenerator
var _ready := false
var _thread: Thread


func _init() -> void:
	_size = Config.EROSION_MAP_SIZE
	_tile_meters = Config.EROSION_TILE_METERS
	_rng = RandomNumberGenerator.new()
	_rng.seed = Config.EROSION_SEED
	_delta = PackedFloat32Array()
	_delta.resize(_size * _size)

	_thread = Thread.new()
	_thread.start(_generate)


func is_ready() -> bool:
	return _ready


## Call this once when done (e.g. before freeing) to join the thread.
func finish() -> void:
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()
		_thread = null


## Sample the erosion delta at world coordinates with bilinear interpolation.
## Returns 0.0 if the map hasn't finished generating yet.
func sample(world_x: float, world_z: float) -> float:
	if not _ready:
		return 0.0

	# Map world coords to tile UV with toroidal wrap
	var u := fmod(world_x / _tile_meters, 1.0)
	if u < 0.0:
		u += 1.0
	var v := fmod(world_z / _tile_meters, 1.0)
	if v < 0.0:
		v += 1.0

	var fx := u * _size - 0.5
	var fz := v * _size - 0.5

	var ix := int(floorf(fx))
	var iz := int(floorf(fz))
	var tx: float = fx - floorf(fx)
	var tz: float = fz - floorf(fz)

	var x0 := _wrap(ix)
	var x1 := _wrap(ix + 1)
	var z0 := _wrap(iz)
	var z1 := _wrap(iz + 1)

	var v00 := _delta[z0 * _size + x0]
	var v10 := _delta[z0 * _size + x1]
	var v01 := _delta[z1 * _size + x0]
	var v11 := _delta[z1 * _size + x1]

	var top: float = v00 + (v10 - v00) * tx
	var bot: float = v01 + (v11 - v01) * tx
	return (top + (bot - top) * tz) * Config.EROSION_AMPLITUDE


func _wrap(coord: int) -> int:
	return ((coord % _size) + _size) % _size


func _generate() -> void:
	var base := _generate_base_heightmap()
	var eroded := base.duplicate()
	_run_hydraulic_erosion(eroded)

	# Compute delta and normalize to [-1, 1]
	var min_d := INF
	var max_d := -INF
	for i in _size * _size:
		var d: float = eroded[i] - base[i]
		_delta[i] = d
		if d < min_d:
			min_d = d
		if d > max_d:
			max_d = d

	var range_d := maxf(absf(min_d), absf(max_d))
	if range_d > 0.0001:
		var inv := 1.0 / range_d
		for i in _size * _size:
			_delta[i] *= inv

	_ready = true


func _generate_base_heightmap() -> PackedFloat32Array:
	var noise := FastNoiseLite.new()
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	noise.seed = Config.EROSION_SEED + 100
	noise.frequency = 1.0

	var map := PackedFloat32Array()
	map.resize(_size * _size)

	var scale := 4.0 / _size  # ~4 cycles across the map
	var octaves := 5
	var persistence := 0.5
	var lacunarity := 2.0

	for z in _size:
		for x in _size:
			var total := 0.0
			var amp := 1.0
			var freq := scale
			var max_amp := 0.0
			for _o in octaves:
				total += noise.get_noise_2d(x * freq, z * freq) * amp
				max_amp += amp
				amp *= persistence
				freq *= lacunarity
			map[z * _size + x] = total / max_amp

	return map


func _run_hydraulic_erosion(heightmap: PackedFloat32Array) -> void:
	var inertia := Config.EROSION_INERTIA
	var capacity := Config.EROSION_CAPACITY
	var deposition := Config.EROSION_DEPOSITION
	var erosion_rate := Config.EROSION_EROSION_RATE
	var evaporation := Config.EROSION_EVAPORATION
	var min_slope := Config.EROSION_MIN_SLOPE
	var radius := Config.EROSION_RADIUS
	var max_lifetime := Config.EROSION_MAX_LIFETIME

	# Pre-compute erosion brush weights
	var brush_offsets: Array[Vector2i] = []
	var brush_weights: PackedFloat32Array = PackedFloat32Array()
	var weight_sum := 0.0
	for dy in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			var dist := sqrt(float(dx * dx + dy * dy))
			if dist <= radius:
				brush_offsets.append(Vector2i(dx, dy))
				var w := maxf(0.0, radius - dist)
				brush_weights.append(w)
				weight_sum += w
	# Normalize
	if weight_sum > 0.0:
		for i in brush_weights.size():
			brush_weights[i] /= weight_sum

	for _drop in Config.EROSION_DROPLETS:
		var px := _rng.randf() * _size
		var pz := _rng.randf() * _size
		var dir_x := 0.0
		var dir_z := 0.0
		var speed := 1.0
		var water := 1.0
		var sediment := 0.0

		for _step in max_lifetime:
			var ix := int(floorf(px))
			var iz := int(floorf(pz))
			var fx: float = px - floorf(px)
			var fz: float = pz - floorf(pz)

			# Bilinear gradient (toroidal)
			var x0 := _wrap(ix)
			var x1 := _wrap(ix + 1)
			var z0 := _wrap(iz)
			var z1 := _wrap(iz + 1)

			var h00 := heightmap[z0 * _size + x0]
			var h10 := heightmap[z0 * _size + x1]
			var h01 := heightmap[z1 * _size + x0]
			var h11 := heightmap[z1 * _size + x1]

			var h: float = h00 * (1.0 - fx) * (1.0 - fz) + h10 * fx * (1.0 - fz) + h01 * (1.0 - fx) * fz + h11 * fx * fz

			var grad_x: float = (h10 - h00) * (1.0 - fz) + (h11 - h01) * fz
			var grad_z: float = (h01 - h00) * (1.0 - fx) + (h11 - h10) * fx

			# Update direction with inertia
			dir_x = dir_x * inertia - grad_x * (1.0 - inertia)
			dir_z = dir_z * inertia - grad_z * (1.0 - inertia)

			var dir_len := sqrt(dir_x * dir_x + dir_z * dir_z)
			if dir_len < 0.0001:
				# Random direction if stuck
				var angle := _rng.randf() * TAU
				dir_x = cos(angle)
				dir_z = sin(angle)
				dir_len = 1.0

			dir_x /= dir_len
			dir_z /= dir_len

			# Move
			var new_px := px + dir_x
			var new_pz := pz + dir_z

			# Wrap toroidally
			new_px = fmod(fmod(new_px, float(_size)) + _size, float(_size))
			new_pz = fmod(fmod(new_pz, float(_size)) + _size, float(_size))

			# Height at new position
			var nix := int(floorf(new_px))
			var niz := int(floorf(new_pz))
			var nfx: float = new_px - floorf(new_px)
			var nfz: float = new_pz - floorf(new_pz)

			var nx0 := _wrap(nix)
			var nx1 := _wrap(nix + 1)
			var nz0 := _wrap(niz)
			var nz1 := _wrap(niz + 1)

			var nh: float = heightmap[nz0 * _size + nx0] * (1.0 - nfx) * (1.0 - nfz) + heightmap[nz0 * _size + nx1] * nfx * (1.0 - nfz) + heightmap[nz1 * _size + nx0] * (1.0 - nfx) * nfz + heightmap[nz1 * _size + nx1] * nfx * nfz

			var dh: float = nh - h

			# Sediment capacity
			var slope := maxf(-dh, min_slope)
			var c := slope * speed * water * capacity

			if sediment > c or dh > 0.0:
				# Deposit
				var deposit_amount: float
				if dh > 0.0:
					deposit_amount = minf(sediment, dh)
				else:
					deposit_amount = (sediment - c) * deposition
				sediment -= deposit_amount
				_deposit_at(heightmap, px, pz, deposit_amount)
			else:
				# Erode
				var erode_amount := minf((c - sediment) * erosion_rate, -dh)
				# Apply brush
				for bi in brush_offsets.size():
					var bx := _wrap(ix + brush_offsets[bi].x)
					var bz := _wrap(iz + brush_offsets[bi].y)
					var weighted := erode_amount * brush_weights[bi]
					heightmap[bz * _size + bx] -= weighted
				sediment += erode_amount

			# Update speed and water
			speed = sqrt(maxf(0.0, speed * speed + dh))
			water *= (1.0 - evaporation)

			px = new_px
			pz = new_pz

			if water < 0.001:
				break


func _deposit_at(heightmap: PackedFloat32Array, px: float, pz: float, amount: float) -> void:
	var ix := int(floorf(px))
	var iz := int(floorf(pz))
	var fx: float = px - floorf(px)
	var fz: float = pz - floorf(pz)

	var x0 := _wrap(ix)
	var x1 := _wrap(ix + 1)
	var z0 := _wrap(iz)
	var z1 := _wrap(iz + 1)

	heightmap[z0 * _size + x0] += amount * (1.0 - fx) * (1.0 - fz)
	heightmap[z0 * _size + x1] += amount * fx * (1.0 - fz)
	heightmap[z1 * _size + x0] += amount * (1.0 - fx) * fz
	heightmap[z1 * _size + x1] += amount * fx * fz
