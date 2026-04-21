extends RefCounted
## Generates unique procedural cottage meshes from a position seed.
## Each cottage gets walls, roof, chimney, door, and windows — all vertex-colored.

const MAX_CACHE := 64

var _cache: Dictionary = {}
var _cache_order: Array[int] = []


func generate(seed_val: int) -> Dictionary:
	if _cache.has(seed_val):
		return _cache[seed_val]

	# Evict oldest if at capacity
	if _cache_order.size() >= MAX_CACHE:
		var oldest: int = _cache_order.pop_front()
		_cache.erase(oldest)

	var result := _generate_cottage(seed_val)
	_cache[seed_val] = result
	_cache_order.append(seed_val)
	return result


func _seeded_hash(seed_val: int, offset: int) -> float:
	return fmod(abs(sin(float(seed_val + offset) * 127.1 + float(offset) * 311.7)) * 43758.5453, 1.0)


func _generate_cottage(seed_val: int) -> Dictionary:
	# Derive dimensions from seed
	var width_x := lerpf(Config.COTTAGE_WIDTH_X_RANGE.x, Config.COTTAGE_WIDTH_X_RANGE.y, _seeded_hash(seed_val, 0))
	var width_z := lerpf(Config.COTTAGE_WIDTH_Z_RANGE.x, Config.COTTAGE_WIDTH_Z_RANGE.y, _seeded_hash(seed_val, 1))
	var log_radius := lerpf(Config.COTTAGE_LOG_RADIUS_RANGE.x, Config.COTTAGE_LOG_RADIUS_RANGE.y, _seeded_hash(seed_val, 2))
	var log_count := Config.COTTAGE_LOG_COUNT_RANGE.x + int(_seeded_hash(seed_val, 3) * float(Config.COTTAGE_LOG_COUNT_RANGE.y - Config.COTTAGE_LOG_COUNT_RANGE.x + 1))
	log_count = clampi(log_count, Config.COTTAGE_LOG_COUNT_RANGE.x, Config.COTTAGE_LOG_COUNT_RANGE.y)
	var roof_pitch := lerpf(Config.COTTAGE_ROOF_PITCH_RANGE.x, Config.COTTAGE_ROOF_PITCH_RANGE.y, _seeded_hash(seed_val, 4))
	var roof_overhang := lerpf(Config.COTTAGE_ROOF_OVERHANG_RANGE.x, Config.COTTAGE_ROOF_OVERHANG_RANGE.y, _seeded_hash(seed_val, 5))
	var log_overhang := lerpf(Config.COTTAGE_LOG_OVERHANG_RANGE.x, Config.COTTAGE_LOG_OVERHANG_RANGE.y, _seeded_hash(seed_val, 6))
	var lean_x := (_seeded_hash(seed_val, 7) - 0.5) * 0.03
	var lean_z := (_seeded_hash(seed_val, 8) - 0.5) * 0.03
	var chimney_corner := int(_seeded_hash(seed_val, 9) * 4.0) % 4
	var chimney_lean := (_seeded_hash(seed_val, 10) - 0.5) * 0.02
	var door_side := 0  # front wall (positive Z face)

	var log_diameter := log_radius * 2.0
	var log_step := log_diameter * 0.76
	var wall_height := float(log_count) * log_step
	var half_x := width_x * 0.5
	var half_z := width_z * 0.5

	# Wood base color from seed HSL
	var wood_hue := lerpf(0.06, 0.10, _seeded_hash(seed_val, 11))
	var wood_sat := lerpf(0.3, 0.5, _seeded_hash(seed_val, 12))
	var wood_lit := lerpf(0.2, 0.3, _seeded_hash(seed_val, 13))
	var wood_base := Color.from_hsv(wood_hue, wood_sat, wood_lit)

	# Door opening: centered on front wall (Z = +half_z)
	var door_width := lerpf(0.5, 0.7, _seeded_hash(seed_val, 14))
	var door_height_logs := mini(int(wall_height / log_step * 0.55), log_count - 1)
	var door_top_y := float(door_height_logs) * log_step

	# Window positions on side walls
	var window_y := wall_height * 0.42
	var window_size := lerpf(0.35, 0.5, _seeded_hash(seed_val, 15))

	# Build main mesh
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Build window mesh (separate for emissive shader)
	var wst := SurfaceTool.new()
	wst.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Door opening range on front wall (X coords relative to center)
	var door_open := [Vector2(-door_width * 0.5, door_width * 0.5)]

	# Window openings on side walls
	var side_window_z := 0.0  # centered
	var side_window_open := [Vector2(side_window_z - window_size * 0.5, side_window_z + window_size * 0.5)]

	# Back wall window
	var back_window_x := (_seeded_hash(seed_val, 16) - 0.5) * width_x * 0.3
	var back_window_open := [Vector2(back_window_x - window_size * 0.5, back_window_x + window_size * 0.5)]

	# ---- Walls ----
	_build_walls(st, half_x, half_z, log_radius, log_count, log_step, log_overhang,
		wood_base, seed_val, door_open, side_window_open, back_window_open,
		window_y, window_size, door_top_y)

	# ---- Gables ----
	_build_gables(st, half_x, half_z, wall_height, log_step, log_radius, log_overhang,
		roof_pitch, wood_base, seed_val)

	# ---- Roof ----
	_build_roof(st, half_x, half_z, wall_height, roof_pitch, roof_overhang, log_radius, seed_val)

	# ---- Chimney ----
	var chimney_top := _build_chimney(st, half_x, half_z, wall_height, roof_pitch,
		chimney_corner, chimney_lean, seed_val)

	# ---- Door ----
	_build_door(st, half_z, door_width, door_top_y, log_radius, seed_val)

	# ---- Windows (glass to separate mesh) ----
	_build_windows(st, wst, half_x, half_z, window_y, window_size, log_radius,
		side_window_open, back_window_open, back_window_x, seed_val)

	# ---- Apply global lean to all vertices ----
	var main_mesh := _apply_lean_and_commit(st, lean_x, lean_z)
	var window_mesh := _apply_lean_and_commit(wst, lean_x, lean_z)

	var result := {
		"main_mesh": main_mesh,
		"window_mesh": window_mesh,
		"chimney_top": Vector3(chimney_top.x + chimney_top.y * lean_x, chimney_top.y, chimney_top.z + chimney_top.y * lean_z),
		"dimensions": Vector3(width_x, wall_height + roof_pitch, width_z),
	}
	return result


func _apply_lean_and_commit(st: SurfaceTool, lean_x: float, lean_z: float) -> ArrayMesh:
	var mesh := st.commit()
	if mesh.get_surface_count() == 0:
		return mesh

	var arrays := mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		var v := verts[i]
		verts[i] = Vector3(v.x + v.y * lean_x, v.y, v.z + v.y * lean_z)
	arrays[Mesh.ARRAY_VERTEX] = verts

	var leaned := ArrayMesh.new()
	leaned.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return leaned


# =========================================================================
# Walls
# =========================================================================

func _build_walls(st: SurfaceTool, half_x: float, half_z: float,
		log_radius: float, log_count: int, log_step: float, log_overhang: float,
		wood_base: Color, seed_val: int,
		door_open: Array, side_window_open: Array, back_window_open: Array,
		window_y: float, window_size: float, door_top_y: float) -> void:

	var log_diameter := log_radius * 2.0

	# Front/back walls: logs along X axis (at Z = ±half_z)
	for i in log_count:
		var y := float(i) * log_step
		var jitter := (_seeded_hash(seed_val, 100 + i) - 0.5) * 0.024
		var log_y := y + jitter

		# Front wall (Z = +half_z): has door opening
		var front_openings: Array = []
		if y < door_top_y:
			front_openings = door_open.duplicate()
		_build_wall_log_split(st, Vector3.FORWARD, half_x, half_z, log_y,
			log_radius, log_overhang, wood_base, seed_val, 200 + i, front_openings)

		# Back wall (Z = -half_z): has window
		var back_openings: Array = []
		if absf(y - window_y) < window_size * 0.5:
			back_openings = back_window_open.duplicate()
		_build_wall_log_split(st, Vector3.BACK, half_x, half_z, log_y,
			log_radius, log_overhang, wood_base, seed_val, 400 + i, back_openings)

	# Side walls: logs along Z axis (at X = ±half_x), offset by half log_step
	for i in log_count:
		var y := float(i) * log_step + log_step * 0.5
		if y > float(log_count) * log_step:
			break
		var jitter := (_seeded_hash(seed_val, 600 + i) - 0.5) * 0.024
		var log_y := y + jitter

		# Right wall (X = +half_x)
		var right_openings: Array = []
		if absf(log_y - window_y) < window_size * 0.5:
			right_openings = side_window_open.duplicate()
		_build_side_wall_log_split(st, 1.0, half_x, half_z, log_y,
			log_radius, log_overhang, wood_base, seed_val, 700 + i, right_openings)

		# Left wall (X = -half_x)
		var left_openings: Array = []
		if absf(log_y - window_y) < window_size * 0.5:
			left_openings = side_window_open.duplicate()
		_build_side_wall_log_split(st, -1.0, half_x, half_z, log_y,
			log_radius, log_overhang, wood_base, seed_val, 900 + i, left_openings)


func _build_wall_log_split(st: SurfaceTool, face_dir: Vector3, half_x: float, half_z: float,
		y: float, log_radius: float, log_overhang: float, wood_base: Color,
		seed_val: int, hash_offset: int, openings: Array) -> void:
	# Front/back wall log along X axis
	var z_pos := half_z if face_dir == Vector3.FORWARD else -half_z
	var full_len := half_x + log_overhang
	var segments := _split_log(-half_x - log_overhang, half_x + log_overhang, openings, log_radius)

	for seg in segments:
		var seg_start: float = seg.x
		var seg_end: float = seg.y
		var seg_len := seg_end - seg_start
		var center_x := (seg_start + seg_end) * 0.5
		_build_log_cylinder(st, Vector3(center_x, y, z_pos), Vector3.RIGHT,
			seg_len * 0.5, log_radius, wood_base, seed_val, hash_offset)


func _build_side_wall_log_split(st: SurfaceTool, side: float, half_x: float, half_z: float,
		y: float, log_radius: float, log_overhang: float, wood_base: Color,
		seed_val: int, hash_offset: int, openings: Array) -> void:
	# Side wall log along Z axis
	var x_pos := half_x * side
	var segments := _split_log(-half_z - log_overhang, half_z + log_overhang, openings, log_radius)

	for seg in segments:
		var seg_start: float = seg.x
		var seg_end: float = seg.y
		var seg_len := seg_end - seg_start
		var center_z := (seg_start + seg_end) * 0.5
		_build_log_cylinder(st, Vector3(x_pos, y, center_z), Vector3.BACK,
			seg_len * 0.5, log_radius, wood_base, seed_val, hash_offset)


func _split_log(start: float, end: float, openings: Array, log_radius: float) -> Array[Vector2]:
	if openings.is_empty():
		return [Vector2(start, end)]

	# Sort openings by start position
	var sorted_opens := openings.duplicate()
	sorted_opens.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)

	var result: Array[Vector2] = []
	var cursor := start
	for opening in sorted_opens:
		var open_start: float = opening.x
		var open_end: float = opening.y
		if cursor < open_start:
			var seg_len := open_start - cursor
			if seg_len > log_radius * 3.0:
				result.append(Vector2(cursor, open_start))
		cursor = open_end
	if cursor < end:
		var seg_len := end - cursor
		if seg_len > log_radius * 3.0:
			result.append(Vector2(cursor, end))
	return result


func _build_log_cylinder(st: SurfaceTool, center: Vector3, axis: Vector3,
		half_length: float, radius: float, wood_base: Color,
		seed_val: int, hash_offset: int) -> void:
	var radial := 6
	var length_segs := 3

	# Per-log color variation
	var log_tint := (_seeded_hash(seed_val, hash_offset * 7 + 31) - 0.5) * 0.12
	var base_color := Color(
		clampf(wood_base.r + log_tint, 0.0, 1.0),
		clampf(wood_base.g + log_tint * 0.8, 0.0, 1.0),
		clampf(wood_base.b + log_tint * 0.4, 0.0, 1.0))

	# Build perpendicular axes
	var up := Vector3.UP
	var right: Vector3
	if absf(axis.dot(up)) > 0.9:
		right = axis.cross(Vector3.RIGHT).normalized()
	else:
		right = axis.cross(up).normalized()
	var fwd := right.cross(axis).normalized()

	for li in length_segs:
		var t0 := float(li) / float(length_segs)
		var t1 := float(li + 1) / float(length_segs)
		var len0 := lerpf(-half_length, half_length, t0)
		var len1 := lerpf(-half_length, half_length, t1)

		# End darkening
		var end_dark_0 := maxf(absf(t0 * 2.0 - 1.0) - 0.5, 0.0) * 0.15
		var end_dark_1 := maxf(absf(t1 * 2.0 - 1.0) - 0.5, 0.0) * 0.15

		for ri in radial:
			var a0 := float(ri) / float(radial) * TAU
			var a1 := float((ri + 1) % radial) / float(radial) * TAU

			var n0 := (right * cos(a0) + fwd * sin(a0)).normalized()
			var n1 := (right * cos(a1) + fwd * sin(a1)).normalized()

			var p00 := center + axis * len0 + n0 * radius
			var p10 := center + axis * len1 + n0 * radius
			var p01 := center + axis * len0 + n1 * radius
			var p11 := center + axis * len1 + n1 * radius

			var c00 := _color_log_vertex(base_color, p00, end_dark_0, seed_val, hash_offset + ri + li * 10)
			var c10 := _color_log_vertex(base_color, p10, end_dark_1, seed_val, hash_offset + ri + (li + 1) * 10)
			var c01 := _color_log_vertex(base_color, p01, end_dark_0, seed_val, hash_offset + ri + 1 + li * 10)
			var c11 := _color_log_vertex(base_color, p11, end_dark_1, seed_val, hash_offset + ri + 1 + (li + 1) * 10)

			st.set_color(c00); st.set_normal(n0); st.add_vertex(p00)
			st.set_color(c01); st.set_normal(n1); st.add_vertex(p01)
			st.set_color(c10); st.set_normal(n0); st.add_vertex(p10)

			st.set_color(c01); st.set_normal(n1); st.add_vertex(p01)
			st.set_color(c11); st.set_normal(n1); st.add_vertex(p11)
			st.set_color(c10); st.set_normal(n0); st.add_vertex(p10)


func _color_log_vertex(base: Color, pos: Vector3, end_dark: float, seed_val: int, offset: int) -> Color:
	# Per-vertex noise
	var noise_val := (_seeded_hash(seed_val, offset * 13 + int(pos.x * 100.0 + pos.z * 200.0)) - 0.5) * 0.20
	# Knot: 8% chance
	var knot_dark := 0.0
	if _seeded_hash(seed_val, offset * 17 + int(pos.y * 300.0)) < 0.08:
		knot_dark = 0.12
	return Color(
		clampf(base.r + noise_val - end_dark - knot_dark, 0.0, 1.0),
		clampf(base.g + noise_val * 0.8 - end_dark - knot_dark, 0.0, 1.0),
		clampf(base.b + noise_val * 0.4 - end_dark * 0.5 - knot_dark, 0.0, 1.0))


# =========================================================================
# Gables
# =========================================================================

func _build_gables(st: SurfaceTool, half_x: float, half_z: float,
		wall_height: float, log_step: float, log_radius: float, log_overhang: float,
		roof_pitch: float, wood_base: Color, seed_val: int) -> void:
	var gable_rows := ceili(roof_pitch / log_step)
	var slope := roof_pitch / half_x

	# Front gable (Z = +half_z) and back gable (Z = -half_z)
	for face in [1.0, -1.0]:
		var z_pos: float = half_z * face
		for row in gable_rows:
			var y := wall_height + float(row) * log_step
			var row_half_x := half_x - float(row + 1) * log_step / slope
			if row_half_x < log_radius * 3.0:
				break
			var jitter := (_seeded_hash(seed_val, 1100 + row + int(face * 10.0)) - 0.5) * 0.024
			_build_log_cylinder(st, Vector3(0.0, y + jitter, z_pos), Vector3.RIGHT,
				row_half_x, log_radius, wood_base, seed_val, 1200 + row + int(face * 50.0))


# =========================================================================
# Roof
# =========================================================================

func _build_roof(st: SurfaceTool, half_x: float, half_z: float,
		wall_height: float, roof_pitch: float, roof_overhang: float,
		log_radius: float, seed_val: int) -> void:
	var ridge_y := wall_height + roof_pitch
	var ridge_half_z := half_z + roof_overhang
	var eave_half_z := half_z + roof_overhang
	var eave_half_x := half_x + roof_overhang

	# Thatch color palette
	var base_hue := lerpf(0.07, 0.12, _seeded_hash(seed_val, 1300))
	var thatch_colors: Array[Color] = []
	for ci in 6:
		var h := base_hue + (_seeded_hash(seed_val, 1310 + ci) - 0.5) * 0.04
		var s := lerpf(0.25, 0.55, _seeded_hash(seed_val, 1320 + ci))
		var l := lerpf(0.22, 0.38, _seeded_hash(seed_val, 1330 + ci))
		# Moss/green tint on some
		if _seeded_hash(seed_val, 1340 + ci) < 0.3:
			h = lerpf(h, 0.25, 0.3)
			s = lerpf(s, 0.4, 0.3)
		thatch_colors.append(Color.from_hsv(clampf(h, 0.0, 1.0), clampf(s, 0.0, 1.0), clampf(l, 0.0, 1.0)))

	var roof_thickness := log_radius * 0.8
	var slope_len := sqrt(half_x * half_x + roof_pitch * roof_pitch)
	var segments_along := 8
	var segments_across := 6

	# Two panels
	for panel in 2:
		var sign_x := 1.0 if panel == 0 else -1.0
		for si in segments_along:
			var t0_z := float(si) / float(segments_along)
			var t1_z := float(si + 1) / float(segments_along)
			var z0 := lerpf(-eave_half_z, eave_half_z, t0_z)
			var z1 := lerpf(-eave_half_z, eave_half_z, t1_z)

			for sj in segments_across:
				var t0_s := float(sj) / float(segments_across)
				var t1_s := float(sj + 1) / float(segments_across)

				# Eave to ridge
				var x0: float
				var y0: float
				var x1: float
				var y1: float
				if panel == 0:
					x0 = lerpf(eave_half_x, 0.0, t0_s)
					y0 = lerpf(wall_height, ridge_y, t0_s)
					x1 = lerpf(eave_half_x, 0.0, t1_s)
					y1 = lerpf(wall_height, ridge_y, t1_s)
				else:
					x0 = lerpf(-eave_half_x, 0.0, t0_s)
					y0 = lerpf(wall_height, ridge_y, t0_s)
					x1 = lerpf(-eave_half_x, 0.0, t1_s)
					y1 = lerpf(wall_height, ridge_y, t1_s)

				# Jitter + sag
				var jitter0 := (_seeded_hash(seed_val, 1400 + si * 10 + sj + panel * 100) - 0.5) * 0.03
				var jitter1 := (_seeded_hash(seed_val, 1500 + si * 10 + sj + panel * 100) - 0.5) * 0.03
				var sag0 := sin(t0_z * PI) * sin(t0_s * PI) * 0.04
				var sag1 := sin(t1_z * PI) * sin(t1_s * PI) * 0.04

				var p00 := Vector3(x0, y0 + jitter0 - sag0, z0)
				var p10 := Vector3(x0, y0 + jitter0 - sag0, z1)
				var p01 := Vector3(x1, y1 + jitter1 - sag1, z0)
				var p11 := Vector3(x1, y1 + jitter1 - sag1, z1)

				var normal := (p10 - p00).cross(p01 - p00).normalized()
				if normal.y < 0.0:
					normal = -normal

				var ci0 := (si + sj + panel * 3) % thatch_colors.size()
				var ci1 := (si + sj + 1 + panel * 3) % thatch_colors.size()
				var c0: Color = thatch_colors[ci0]
				var c1: Color = thatch_colors[ci1]
				# Per-vertex variation
				c0 = _vary_color_det(c0, 0.06, p00)
				c1 = _vary_color_det(c1, 0.06, p11)

				st.set_color(c0); st.set_normal(normal); st.add_vertex(p00)
				st.set_color(c0); st.set_normal(normal); st.add_vertex(p10)
				st.set_color(c1); st.set_normal(normal); st.add_vertex(p01)

				st.set_color(c0); st.set_normal(normal); st.add_vertex(p10)
				st.set_color(c1); st.set_normal(normal); st.add_vertex(p11)
				st.set_color(c1); st.set_normal(normal); st.add_vertex(p01)

	# Ridge beam
	_build_log_cylinder(st, Vector3(0.0, ridge_y, 0.0), Vector3.BACK,
		ridge_half_z, log_radius * 0.7,
		Color(wood_base_from_seed(seed_val)), seed_val, 1600)


func wood_base_from_seed(seed_val: int) -> Color:
	var wood_hue := lerpf(0.06, 0.10, _seeded_hash(seed_val, 11))
	var wood_sat := lerpf(0.3, 0.5, _seeded_hash(seed_val, 12))
	var wood_lit := lerpf(0.2, 0.3, _seeded_hash(seed_val, 13))
	return Color.from_hsv(wood_hue, wood_sat, wood_lit)


# =========================================================================
# Chimney
# =========================================================================

func _build_chimney(st: SurfaceTool, half_x: float, half_z: float,
		wall_height: float, roof_pitch: float, chimney_corner: int,
		chimney_lean: float, seed_val: int) -> Vector3:
	var chimney_w := 0.35
	var chimney_h := wall_height + roof_pitch + 0.5  # above ridge

	# Corner position (40% from center toward corner)
	var cx := half_x * 0.4 * (1.0 if chimney_corner % 2 == 0 else -1.0)
	var cz := half_z * 0.4 * (1.0 if chimney_corner < 2 else -1.0)

	var half_w := chimney_w * 0.5
	var stone_base := Config.COTTAGE_STONE_COLOR

	# Build box with per-vertex stone color variation
	var faces := [
		# front, back, right, left, top
		[Vector3(0, 0, 1), Vector3(-1, 0, 0), Vector3(1, 0, 0)],
		[Vector3(0, 0, -1), Vector3(1, 0, 0), Vector3(-1, 0, 0)],
		[Vector3(1, 0, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)],
		[Vector3(-1, 0, 0), Vector3(0, 0, -1), Vector3(0, 0, 1)],
		[Vector3(0, 1, 0), Vector3(1, 0, 0), Vector3(0, 0, 1)],
	]

	for fi in faces.size():
		var normal: Vector3 = faces[fi][0]
		var right: Vector3 = faces[fi][1]
		var up_dir: Vector3 = faces[fi][2]

		var p00: Vector3
		var p10: Vector3
		var p01: Vector3
		var p11: Vector3

		if fi < 4:  # Side faces
			var face_center := Vector3(cx, chimney_h * 0.5, cz) + normal * half_w
			p00 = face_center + right * half_w + Vector3(0, -chimney_h * 0.5, 0)
			p10 = face_center - right * half_w + Vector3(0, -chimney_h * 0.5, 0)
			p01 = face_center + right * half_w + Vector3(0, chimney_h * 0.5, 0)
			p11 = face_center - right * half_w + Vector3(0, chimney_h * 0.5, 0)
			# Apply chimney lean
			p01.x += chimney_lean * chimney_h
			p11.x += chimney_lean * chimney_h
		else:  # Top
			p00 = Vector3(cx - half_w, chimney_h, cz - half_w)
			p10 = Vector3(cx + half_w, chimney_h, cz - half_w)
			p01 = Vector3(cx - half_w, chimney_h, cz + half_w)
			p11 = Vector3(cx + half_w, chimney_h, cz + half_w)

		var c00 := _vary_color_det(stone_base, 0.12, p00)
		var c10 := _vary_color_det(stone_base, 0.12, p10)
		var c01 := _vary_color_det(stone_base, 0.12, p01)
		var c11 := _vary_color_det(stone_base, 0.12, p11)

		st.set_color(c00); st.set_normal(normal); st.add_vertex(p00)
		st.set_color(c10); st.set_normal(normal); st.add_vertex(p10)
		st.set_color(c01); st.set_normal(normal); st.add_vertex(p01)

		st.set_color(c10); st.set_normal(normal); st.add_vertex(p10)
		st.set_color(c11); st.set_normal(normal); st.add_vertex(p11)
		st.set_color(c01); st.set_normal(normal); st.add_vertex(p01)

	return Vector3(cx + chimney_lean * chimney_h, chimney_h, cz)


# =========================================================================
# Door
# =========================================================================

func _build_door(st: SurfaceTool, half_z: float, door_width: float,
		door_top_y: float, log_radius: float, seed_val: int) -> void:
	var z_pos := half_z - log_radius * 0.3  # slightly inset
	var half_w := door_width * 0.5
	var door_h := door_top_y

	# Door panel
	var normal := Vector3.FORWARD
	var c := Config.COTTAGE_DOOR_COLOR
	var p00 := Vector3(-half_w, 0.0, z_pos)
	var p10 := Vector3(half_w, 0.0, z_pos)
	var p01 := Vector3(-half_w, door_h, z_pos)
	var p11 := Vector3(half_w, door_h, z_pos)

	st.set_color(c); st.set_normal(normal); st.add_vertex(p00)
	st.set_color(c); st.set_normal(normal); st.add_vertex(p10)
	st.set_color(c); st.set_normal(normal); st.add_vertex(p01)
	st.set_color(c); st.set_normal(normal); st.add_vertex(p10)
	st.set_color(c); st.set_normal(normal); st.add_vertex(p11)
	st.set_color(c); st.set_normal(normal); st.add_vertex(p01)

	# Frame: lintel + 2 jambs
	var fc := Config.COTTAGE_FRAME_COLOR
	var frame_w := 0.04
	var frame_d := 0.03

	# Lintel (top)
	_build_box(st, Vector3(0.0, door_h + frame_w * 0.5, z_pos + frame_d),
		Vector3(half_w + frame_w, frame_w, frame_d), fc)
	# Left jamb
	_build_box(st, Vector3(-half_w - frame_w * 0.5, door_h * 0.5, z_pos + frame_d),
		Vector3(frame_w, door_h * 0.5, frame_d), fc)
	# Right jamb
	_build_box(st, Vector3(half_w + frame_w * 0.5, door_h * 0.5, z_pos + frame_d),
		Vector3(frame_w, door_h * 0.5, frame_d), fc)


# =========================================================================
# Windows
# =========================================================================

func _build_windows(st: SurfaceTool, wst: SurfaceTool,
		half_x: float, half_z: float, window_y: float, window_size: float,
		log_radius: float, side_window_open: Array, back_window_open: Array,
		back_window_x: float, seed_val: int) -> void:

	var half_w := window_size * 0.5
	var pane_half := half_w * 0.45  # each of 4 panes
	var bar_w := 0.02
	var frame_w := 0.04
	var frame_d := 0.02

	# Right wall window (X = +half_x)
	_build_single_window(st, wst, Vector3(half_x + log_radius * 0.3, window_y, 0.0),
		Vector3.RIGHT, Vector3.BACK, half_w, pane_half, bar_w, frame_w, frame_d, seed_val)

	# Left wall window (X = -half_x)
	_build_single_window(st, wst, Vector3(-half_x - log_radius * 0.3, window_y, 0.0),
		Vector3.LEFT, Vector3.FORWARD, half_w, pane_half, bar_w, frame_w, frame_d, seed_val)

	# Back wall window
	_build_single_window(st, wst, Vector3(back_window_x, window_y, -half_z - log_radius * 0.3),
		Vector3.BACK, Vector3.RIGHT, half_w, pane_half, bar_w, frame_w, frame_d, seed_val)


func _build_single_window(st: SurfaceTool, wst: SurfaceTool,
		center: Vector3, face_normal: Vector3, right_dir: Vector3,
		half_w: float, pane_half: float, bar_w: float, frame_w: float,
		frame_d: float, seed_val: int) -> void:
	var up := Vector3.UP

	# 4 glass panes (2x2 grid) — into window mesh
	var gc := Config.COTTAGE_GLASS_COLOR
	var offsets := [
		Vector2(-0.5, 0.5), Vector2(0.5, 0.5),
		Vector2(-0.5, -0.5), Vector2(0.5, -0.5),
	]
	for offset in offsets:
		var pane_center: Vector3 = center + right_dir * (offset.x * pane_half) + up * (offset.y * pane_half)
		var p_half: float = pane_half * 0.42
		var p00: Vector3 = pane_center - right_dir * p_half - up * p_half
		var p10: Vector3 = pane_center + right_dir * p_half - up * p_half
		var p01: Vector3 = pane_center - right_dir * p_half + up * p_half
		var p11: Vector3 = pane_center + right_dir * p_half + up * p_half

		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p00)
		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p10)
		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p01)
		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p10)
		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p11)
		wst.set_color(gc); wst.set_normal(face_normal); wst.add_vertex(p01)

	# Cross bars (vertical + horizontal) — into main mesh
	var fc := Config.COTTAGE_FRAME_COLOR
	# Vertical bar
	_build_box(st, center + face_normal * frame_d, Vector3(bar_w, half_w, bar_w), fc)
	# Horizontal bar
	var h_center := center + face_normal * frame_d
	var h_size := Vector3(half_w if absf(face_normal.x) < 0.5 else bar_w,
		bar_w,
		bar_w if absf(face_normal.x) < 0.5 else half_w)
	# Simplified: use right_dir for orientation
	_build_box(st, h_center, Vector3(bar_w, bar_w, half_w) if absf(face_normal.z) > 0.5 else Vector3(half_w, bar_w, bar_w), fc)

	# Frame surround
	# Top
	_build_box(st, center + up * (half_w + frame_w * 0.5) + face_normal * frame_d,
		Vector3(half_w + frame_w, frame_w * 0.5, frame_d) if absf(face_normal.z) > 0.5 else Vector3(frame_d, frame_w * 0.5, half_w + frame_w), fc)
	# Bottom
	_build_box(st, center - up * (half_w + frame_w * 0.5) + face_normal * frame_d,
		Vector3(half_w + frame_w, frame_w * 0.5, frame_d) if absf(face_normal.z) > 0.5 else Vector3(frame_d, frame_w * 0.5, half_w + frame_w), fc)
	# Left
	_build_box(st, center - right_dir * (half_w + frame_w * 0.5) + face_normal * frame_d,
		Vector3(frame_w * 0.5, half_w, frame_d) if absf(face_normal.z) > 0.5 else Vector3(frame_d, half_w, frame_w * 0.5), fc)
	# Right
	_build_box(st, center + right_dir * (half_w + frame_w * 0.5) + face_normal * frame_d,
		Vector3(frame_w * 0.5, half_w, frame_d) if absf(face_normal.z) > 0.5 else Vector3(frame_d, half_w, frame_w * 0.5), fc)


# =========================================================================
# Helpers
# =========================================================================

func _build_box(st: SurfaceTool, center: Vector3, half_size: Vector3, color: Color) -> void:
	# 6-face box
	var faces := [
		[Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0)],   # front
		[Vector3(0, 0, -1), Vector3(-1, 0, 0), Vector3(0, 1, 0)],  # back
		[Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)],   # right
		[Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 1, 0)],   # left
		[Vector3(0, 1, 0), Vector3(1, 0, 0), Vector3(0, 0, 1)],    # top
		[Vector3(0, -1, 0), Vector3(1, 0, 0), Vector3(0, 0, -1)],  # bottom
	]

	for face in faces:
		var normal: Vector3 = face[0]
		var right: Vector3 = face[1]
		var up: Vector3 = face[2]

		var face_dist := absf(normal.x) * half_size.x + absf(normal.y) * half_size.y + absf(normal.z) * half_size.z
		var right_ext := absf(right.x) * half_size.x + absf(right.y) * half_size.y + absf(right.z) * half_size.z
		var up_ext := absf(up.x) * half_size.x + absf(up.y) * half_size.y + absf(up.z) * half_size.z

		var face_center := center + normal * face_dist

		var p00 := face_center - right * right_ext - up * up_ext
		var p10 := face_center + right * right_ext - up * up_ext
		var p01 := face_center - right * right_ext + up * up_ext
		var p11 := face_center + right * right_ext + up * up_ext

		st.set_color(color); st.set_normal(normal); st.add_vertex(p00)
		st.set_color(color); st.set_normal(normal); st.add_vertex(p10)
		st.set_color(color); st.set_normal(normal); st.add_vertex(p01)

		st.set_color(color); st.set_normal(normal); st.add_vertex(p10)
		st.set_color(color); st.set_normal(normal); st.add_vertex(p11)
		st.set_color(color); st.set_normal(normal); st.add_vertex(p01)


func _vary_color_det(base: Color, amount: float, pos: Vector3) -> Color:
	var h := fmod(abs(pos.x * 73.13 + pos.y * 37.17 + pos.z * 91.31 + 0.5), 1.0)
	var noise_val := (h - 0.5) * amount
	return Color(
		clampf(base.r + noise_val, 0.0, 1.0),
		clampf(base.g + noise_val * 1.2, 0.0, 1.0),
		clampf(base.b + noise_val * 0.5, 0.0, 1.0))
