extends RefCounted
## Traces rivers from mountain sources downhill to water level.
## Uses spatial hash for fast per-vertex queries during chunk generation.
## Runs tracing in a background thread (mirrors erosion_map.gd pattern).

const FLOATS_PER_SEG := 9  # x0, z0, x1, z1, flow0, flow1, extra_carve0, extra_carve1, river_id

var _noise: RefCounted
var _segments: PackedFloat64Array
var _seg_count: int = 0
var _hash: Dictionary = {}       # Vector2i -> Array (of int segment indices)
var _rivers: Dictionary = {}     # int -> {reached_water, merged_into, start_seg, seg_count}
var _source_cache: Dictionary = {}  # Vector2i -> true
var _next_river_id: int = 0

var _thread: Thread
var _ready := false
var _tracing := false
var _center_x: float = 0.0
var _center_z: float = 0.0
var _radius: float = 0.0


func _init(noise_instance: RefCounted) -> void:
	_noise = noise_instance
	_segments = PackedFloat64Array()
	_segments.resize(50000 * FLOATS_PER_SEG)


func trace_async(cx: float, cz: float, radius: float) -> void:
	finish()
	_center_x = cx
	_center_z = cz
	_radius = radius
	_ready = false
	_tracing = true
	_thread = Thread.new()
	_thread.start(_do_trace)


func is_ready() -> bool:
	return _ready


func is_tracing() -> bool:
	return _tracing


func finish() -> void:
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()
		_thread = null
	_tracing = false


func check_retrace(px: float, pz: float) -> bool:
	if _tracing:
		return false
	var dx := px - _center_x
	var dz := pz - _center_z
	if dx * dx + dz * dz > Config.RIVER_RETRACE_DIST * Config.RIVER_RETRACE_DIST:
		trace_async(px, pz, float(Config.RIVER_TRACE_RADIUS))
		return true
	return false


# --- Background thread entry ---

func _do_trace() -> void:
	_seg_count = 0
	_hash.clear()
	_rivers.clear()
	_source_cache.clear()
	_next_river_id = 0

	var sources := _discover_sources(_center_x, _center_z, _radius)
	# Sort highest-first for correct confluence order
	sources.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.h > b.h
	)

	for src in sources:
		_trace_one_river(src.x, src.z)

	_validate_rivers()
	_tracing = false
	_ready = true


# --- Source discovery ---

func _discover_sources(cx: float, cz: float, radius: float) -> Array[Dictionary]:
	var spacing := float(Config.RIVER_SOURCE_SPACING)
	var min_alt := float(Config.RIVER_SOURCE_MIN_ALT)
	var valley_r := float(Config.RIVER_SOURCE_VALLEY_RADIUS)
	var valley_drop := float(Config.RIVER_SOURCE_VALLEY_DROP)
	var sources: Array[Dictionary] = []

	var grid_min_x := int(floorf((cx - radius) / spacing))
	var grid_max_x := int(ceilf((cx + radius) / spacing))
	var grid_min_z := int(floorf((cz - radius) / spacing))
	var grid_max_z := int(ceilf((cz + radius) / spacing))

	for gz in range(grid_min_z, grid_max_z + 1):
		for gx in range(grid_min_x, grid_max_x + 1):
			var key := Vector2i(gx, gz)
			if _source_cache.has(key):
				continue
			_source_cache[key] = true

			var base_x := float(gx) * spacing
			var base_z := float(gz) * spacing

			# Deterministic jitter
			var jit: Vector2 = _noise.get_jitter(base_x * 0.01, base_z * 0.01)
			var sx: float = base_x + jit.x * spacing * 0.35
			var sz: float = base_z + jit.y * spacing * 0.35

			# Check within trace circle
			var ddx: float = sx - cx
			var ddz: float = sz - cz
			if ddx * ddx + ddz * ddz > radius * radius:
				continue

			var h: float = _noise.get_base_terrain_height(sx, sz)
			if h < min_alt:
				continue

			# Valley check: source must be in a local depression
			var surround_sum := 0.0
			for i in 8:
				var angle := float(i) / 8.0 * TAU
				surround_sum += float(_noise.get_base_terrain_height(
					sx + cos(angle) * valley_r,
					sz + sin(angle) * valley_r
				))
			if h > surround_sum / 8.0 - valley_drop:
				continue

			sources.append({"x": sx, "z": sz, "h": h})

	return sources


# --- River tracing ---

func _trace_one_river(start_x: float, start_z: float) -> void:
	var step_size := Config.RIVER_STEP_SIZE
	var grad_eps := Config.RIVER_GRAD_EPS
	var max_steps: int = Config.RIVER_MAX_STEPS
	var mom := Config.RIVER_MOMENTUM
	var water_level := Config.WATER_LEVEL
	var merge_dist := Config.RIVER_MERGE_DIST
	var max_pit_breaks: int = Config.RIVER_PIT_MAX_BREAKS
	var stuck_interval: int = Config.RIVER_PIT_STUCK_INTERVAL
	var min_descent := Config.RIVER_PIT_MIN_DESCENT

	var river_id := _next_river_id
	_next_river_id += 1
	var start_seg := _seg_count

	var last_x := start_x
	var last_z := start_z
	var flow := 1.0
	var prev_dir_x := 0.0
	var prev_dir_z := 0.0
	var reached_water := false
	var merged_into := -1
	var pit_break_count := 0
	var last_check_h: float = _noise.get_base_terrain_height(start_x, start_z)
	var steps_since_check := 0

	for step in max_steps:
		var h: float = _noise.get_base_terrain_height(last_x, last_z)
		if h <= water_level + 0.5:
			reached_water = true
			break

		# Stuck detection
		steps_since_check += 1
		if steps_since_check >= stuck_interval:
			if last_check_h - h < min_descent and pit_break_count < max_pit_breaks:
				var escape = _find_escape_point(last_x, last_z, h)
				if escape != null:
					_create_breach_segments(
						last_x, last_z, h,
						escape.x, escape.z, escape.h,
						flow, river_id
					)
					last_x = escape.x
					last_z = escape.z
					pit_break_count += 1
					last_check_h = escape.h
					steps_since_check = 0
					prev_dir_x = 0.0
					prev_dir_z = 0.0
					continue
				break  # No escape found
			last_check_h = h
			steps_since_check = 0

		# Central-difference gradient
		var hL: float = _noise.get_base_terrain_height(last_x - grad_eps, last_z)
		var hR: float = _noise.get_base_terrain_height(last_x + grad_eps, last_z)
		var hD: float = _noise.get_base_terrain_height(last_x, last_z - grad_eps)
		var hU: float = _noise.get_base_terrain_height(last_x, last_z + grad_eps)
		var gx: float = (hL - hR) / (2.0 * grad_eps)
		var gz: float = (hD - hU) / (2.0 * grad_eps)
		var glen := sqrt(gx * gx + gz * gz)

		if glen < 0.001:
			if prev_dir_x == 0.0 and prev_dir_z == 0.0:
				break
			gx = prev_dir_x
			gz = prev_dir_z
			glen = 1.0

		var dir_x: float = gx / glen
		var dir_z: float = gz / glen

		# Momentum blending
		if prev_dir_x != 0.0 or prev_dir_z != 0.0:
			dir_x = dir_x * (1.0 - mom) + prev_dir_x * mom
			dir_z = dir_z * (1.0 - mom) + prev_dir_z * mom
			var dlen := sqrt(dir_x * dir_x + dir_z * dir_z)
			if dlen > 0.001:
				dir_x /= dlen
				dir_z /= dlen

		var new_x: float = last_x + dir_x * step_size
		var new_z: float = last_z + dir_z * step_size
		var new_flow := flow + 1.0

		# Confluence check
		var merge_result := _hash_query_nearest(new_x, new_z)
		if not merge_result.is_empty():
			var m_base: int = merge_result.seg_idx * FLOATS_PER_SEG
			var target_river := int(_segments[m_base + 8])
			if target_river != river_id and merge_result.dist < merge_dist:
				_add_segment(last_x, last_z, new_x, new_z, flow, new_flow, 0.0, 0.0, river_id)
				merged_into = target_river
				_merge_flow(target_river, merge_result.seg_idx, new_flow)
				break

		# Regular segment
		_add_segment(last_x, last_z, new_x, new_z, flow, new_flow, 0.0, 0.0, river_id)

		last_x = new_x
		last_z = new_z
		flow = new_flow
		prev_dir_x = dir_x
		prev_dir_z = dir_z

	# Store river metadata
	_rivers[river_id] = {
		"reached_water": reached_water,
		"merged_into": merged_into,
		"start_seg": start_seg,
		"seg_count": _seg_count - start_seg,
	}


# --- Pit escape ---

func _find_escape_point(pit_x: float, pit_z: float, pit_h: float):
	var search_step := float(Config.RIVER_PIT_SEARCH_STEP)
	var max_radius := float(Config.RIVER_PIT_SEARCH_RADIUS)

	var best_point = null
	var best_h := pit_h

	var r := search_step
	while r <= max_radius:
		var num_samples := maxi(8, int(TAU * r / search_step))
		for i in num_samples:
			var angle := float(i) / float(num_samples) * TAU
			var sx := pit_x + cos(angle) * r
			var sz := pit_z + sin(angle) * r
			var sh: float = _noise.get_base_terrain_height(sx, sz)

			if sh < best_h:
				best_h = sh
				best_point = {"x": sx, "z": sz, "h": sh}

		if best_point != null and (pit_h - best_h) > 1.0:
			break

		r += search_step

	return best_point


func _create_breach_segments(pit_x: float, pit_z: float, pit_h: float,
		esc_x: float, esc_z: float, esc_h: float,
		flow: float, river_id: int) -> void:
	var dx := esc_x - pit_x
	var dz := esc_z - pit_z
	var dist := sqrt(dx * dx + dz * dz)
	var num_steps := maxi(1, ceili(dist / Config.RIVER_STEP_SIZE))

	var prev_x := pit_x
	var prev_z := pit_z
	var prev_ec := 0.0

	for i in range(1, num_steps + 1):
		var t := float(i) / float(num_steps)
		var bx := pit_x + dx * t
		var bz := pit_z + dz * t
		var desired_h := pit_h * (1.0 - t) + esc_h * t
		var terrain_h: float = _noise.get_base_terrain_height(bx, bz)
		var ec := maxf(0.0, terrain_h - desired_h)

		_add_segment(prev_x, prev_z, bx, bz, flow, flow, prev_ec, ec, river_id)

		prev_x = bx
		prev_z = bz
		prev_ec = ec


# --- Flow merge ---

func _merge_flow(target_river_id: int, from_seg_idx: int, added_flow: float) -> void:
	var river: Dictionary = _rivers.get(target_river_id, {})
	if river.is_empty():
		return
	var end_seg: int = river.start_seg + river.seg_count
	for i in range(from_seg_idx, end_seg):
		var base := i * FLOATS_PER_SEG
		_segments[base + 4] += added_flow
		_segments[base + 5] += added_flow


# --- Validation ---

func _validate_rivers() -> void:
	var valid: Dictionary = {}
	var checked: Dictionary = {}

	for river_id in _rivers:
		_check_valid(river_id, valid, checked)

	var invalid_ids: Dictionary = {}
	for river_id in _rivers:
		if not valid.has(river_id):
			invalid_ids[river_id] = true

	if invalid_ids.size() > 0:
		_hash_remove_rivers(invalid_ids)


func _check_valid(id: int, valid: Dictionary, checked: Dictionary) -> bool:
	if valid.has(id):
		return true
	if checked.has(id):
		return false
	checked[id] = true
	var river: Dictionary = _rivers.get(id, {})
	if river.is_empty():
		return false
	if river.reached_water:
		valid[id] = true
		return true
	if river.merged_into >= 0 and _check_valid(river.merged_into, valid, checked):
		valid[id] = true
		return true
	return false


# --- Spatial hash ---

func _hash_insert(seg_idx: int) -> void:
	var base := seg_idx * FLOATS_PER_SEG
	var x0 := _segments[base]
	var z0 := _segments[base + 1]
	var x1 := _segments[base + 2]
	var z1 := _segments[base + 3]
	var cs := float(Config.RIVER_HASH_CELL)
	var min_cx := int(floorf(minf(x0, x1) / cs))
	var max_cx := int(floorf(maxf(x0, x1) / cs))
	var min_cz := int(floorf(minf(z0, z1) / cs))
	var max_cz := int(floorf(maxf(z0, z1) / cs))

	for cz in range(min_cz, max_cz + 1):
		for cx in range(min_cx, max_cx + 1):
			var key := Vector2i(cx, cz)
			if not _hash.has(key):
				_hash[key] = []
			_hash[key].append(seg_idx)


func _hash_query_nearest(x: float, z: float) -> Dictionary:
	var cs := float(Config.RIVER_HASH_CELL)
	var ccx := int(floorf(x / cs))
	var ccz := int(floorf(z / cs))
	var best_dist := INF
	var best_idx := -1
	var best_t := 0.0

	for dz in range(-1, 2):
		for dx in range(-1, 2):
			var key := Vector2i(ccx + dx, ccz + dz)
			if not _hash.has(key):
				continue
			var indices: Array = _hash[key]
			for seg_idx in indices:
				var result := _pt_seg_dist(x, z, seg_idx)
				if result.x < best_dist:
					best_dist = result.x
					best_idx = seg_idx
					best_t = result.y

	if best_idx < 0:
		return {}
	return {"dist": best_dist, "seg_idx": best_idx, "t": best_t}


func _hash_remove_rivers(invalid_ids: Dictionary) -> void:
	var keys_to_remove: Array = []
	for key in _hash:
		var indices: Array = _hash[key]
		var filtered: Array = []
		for seg_idx in indices:
			var base: int = seg_idx * FLOATS_PER_SEG
			var rid := int(_segments[base + 8])
			if not invalid_ids.has(rid):
				filtered.append(seg_idx)
		if filtered.is_empty():
			keys_to_remove.append(key)
		elif filtered.size() < indices.size():
			_hash[key] = filtered

	for key in keys_to_remove:
		_hash.erase(key)


# --- Geometry helpers ---

func _pt_seg_dist(px: float, pz: float, seg_idx: int) -> Vector2:
	var base := seg_idx * FLOATS_PER_SEG
	var x0 := _segments[base]
	var z0 := _segments[base + 1]
	var x1 := _segments[base + 2]
	var z1 := _segments[base + 3]
	var dx := x1 - x0
	var dz := z1 - z0
	var len2 := dx * dx + dz * dz
	var t := 0.0
	if len2 > 0.0001:
		t = clampf(((px - x0) * dx + (pz - z0) * dz) / len2, 0.0, 1.0)
	var cx := x0 + t * dx - px
	var cz := z0 + t * dz - pz
	return Vector2(sqrt(cx * cx + cz * cz), t)


func _add_segment(x0: float, z0: float, x1: float, z1: float,
		flow0: float, flow1: float, ec0: float, ec1: float,
		river_id: int) -> void:
	_ensure_capacity(_seg_count + 1)
	var base := _seg_count * FLOATS_PER_SEG
	_segments[base] = x0
	_segments[base + 1] = z0
	_segments[base + 2] = x1
	_segments[base + 3] = z1
	_segments[base + 4] = flow0
	_segments[base + 5] = flow1
	_segments[base + 6] = ec0
	_segments[base + 7] = ec1
	_segments[base + 8] = float(river_id)
	_hash_insert(_seg_count)
	_seg_count += 1


func _ensure_capacity(needed_segs: int) -> void:
	var needed_floats := needed_segs * FLOATS_PER_SEG
	if needed_floats > _segments.size():
		_segments.resize(maxi(needed_floats, _segments.size() * 2))


# --- Public query API (called per vertex during chunk generation) ---

func get_river_factor(x: float, z: float) -> float:
	if not _ready:
		return 0.0
	var result := _hash_query_nearest(x, z)
	if result.is_empty():
		return 0.0

	var dist: float = result.dist
	var seg_idx: int = result.seg_idx
	var t: float = result.t
	var base := seg_idx * FLOATS_PER_SEG
	var flow := _segments[base + 4] * (1.0 - t) + _segments[base + 5] * t

	var half_width := minf(Config.RIVER_MAX_HALFWIDTH,
		Config.RIVER_MIN_HALFWIDTH + Config.RIVER_WIDTH_SCALE * sqrt(flow))
	var max_depth := minf(Config.RIVER_MAX_CARVE,
		Config.RIVER_CARVE_SCALE * sqrt(flow))
	var flat_width := maxf(half_width, max_depth * 1.0)
	var bank_width := maxf(Config.RIVER_BANK_WIDTH, max_depth * 1.5)
	var total_width := flat_width + bank_width

	if dist >= total_width:
		return 0.0
	if dist <= flat_width:
		return 1.0

	var bt := (dist - flat_width) / bank_width
	return 1.0 - bt * bt * (3.0 - 2.0 * bt)


func get_river_carving(x: float, z: float) -> float:
	if not _ready:
		return 0.0
	var result := _hash_query_nearest(x, z)
	if result.is_empty():
		return 0.0

	var dist: float = result.dist
	var seg_idx: int = result.seg_idx
	var t: float = result.t
	var base := seg_idx * FLOATS_PER_SEG
	var flow := _segments[base + 4] * (1.0 - t) + _segments[base + 5] * t

	var half_width := minf(Config.RIVER_MAX_HALFWIDTH,
		Config.RIVER_MIN_HALFWIDTH + Config.RIVER_WIDTH_SCALE * sqrt(flow))
	var max_depth := minf(Config.RIVER_MAX_CARVE,
		Config.RIVER_CARVE_SCALE * sqrt(flow))
	var flat_width := maxf(half_width, max_depth * 1.0)
	var carve_width := flat_width + maxf(Config.RIVER_BANK_WIDTH, max_depth * 1.5)

	if dist >= carve_width:
		return 0.0

	var extra_carve := _segments[base + 6] * (1.0 - t) + _segments[base + 7] * t

	var u := dist / carve_width
	var flat_ratio := flat_width / carve_width
	var profile: float
	if u <= flat_ratio:
		profile = 1.0
	else:
		var bank_u := (u - flat_ratio) / (1.0 - flat_ratio)
		profile = 0.5 * (1.0 + cos(PI * bank_u))

	return (max_depth + extra_carve) * profile


func get_river_flow_dir(x: float, z: float) -> Vector2:
	if not _ready:
		return Vector2.ZERO
	var result := _hash_query_nearest(x, z)
	if result.is_empty():
		return Vector2.ZERO

	var base: int = int(result.seg_idx) * FLOATS_PER_SEG
	var dx := _segments[base + 2] - _segments[base]
	var dz := _segments[base + 3] - _segments[base + 1]
	var seg_len := sqrt(dx * dx + dz * dz)
	if seg_len > 0.001:
		return Vector2(dx / seg_len, dz / seg_len)
	return Vector2.ZERO
