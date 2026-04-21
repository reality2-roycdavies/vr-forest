extends RefCounted
## Generates procedural tree meshes (pine, oak, birch, tussock) using SurfaceTool.
## Each tree type produces a trunk mesh and a canopy mesh.

enum TreeType { PINE = 0, OAK = 1, BIRCH = 2, TUSSOCK = 3 }

# Cached meshes: [trunk_mesh, canopy_mesh] per type
var _cache: Dictionary = {}


func get_trunk_mesh(tree_type: int) -> ArrayMesh:
	_ensure_cached(tree_type)
	return _cache[tree_type][0]


func get_canopy_mesh(tree_type: int) -> ArrayMesh:
	_ensure_cached(tree_type)
	return _cache[tree_type][1]


func _ensure_cached(tree_type: int) -> void:
	if _cache.has(tree_type):
		return
	match tree_type:
		TreeType.PINE:
			_cache[tree_type] = [_make_pine_trunk(), _make_pine_canopy()]
		TreeType.OAK:
			_cache[tree_type] = [_make_oak_trunk(), _make_oak_canopy()]
		TreeType.BIRCH:
			_cache[tree_type] = [_make_birch_trunk(), _make_birch_canopy()]
		TreeType.TUSSOCK:
			_cache[tree_type] = [_make_tussock_trunk(), _make_tussock_canopy()]


# =========================================================================
# Pine (Type 0)
# =========================================================================

func _make_pine_trunk() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var radial := 8
	var height_segs := 4
	var top_r := 0.06
	var bot_r := 0.13
	var h := 1.1
	var dark_brown := Color(0x3d / 255.0, 0x25 / 255.0, 0x10 / 255.0)
	var light_brown := Color(0x6b / 255.0, 0x48 / 255.0, 0x28 / 255.0)

	_build_cylinder(st, radial, height_segs, top_r, bot_r, h, dark_brown, light_brown, 0.06, 0.02)

	# Branch stubs per SPEC-04
	var stub_heights := [0.4, 0.6, 0.78]
	var stub_lengths := [0.28, 0.25, 0.22]
	var stub_angles := [0.5, -0.7, 1.9]
	for i in stub_heights.size():
		_build_branch_stub(st, top_r, bot_r, h, stub_heights[i], stub_angles[i], stub_lengths[i], dark_brown)

	return st.commit()


func _make_pine_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x18 / 255.0, 0x40 / 255.0, 0x1a / 255.0)
	var segs := 12

	# 5 stacked cones — wide at base, narrowing toward top
	_build_cone(st, segs, 0.65, 0.55, 0.55, base_color, 0.25)
	_build_cone(st, segs, 0.55, 0.55, 0.85, base_color, 0.25)
	_build_cone(st, segs, 0.45, 0.50, 1.15, base_color, 0.25)
	_build_cone(st, segs, 0.35, 0.45, 1.40, base_color, 0.25)
	_build_cone(st, segs, 0.22, 0.40, 1.65, base_color, 0.25)

	return st.commit()


# =========================================================================
# Oak (Type 1)
# =========================================================================

func _make_oak_trunk() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var dark_brown := Color(0x3d / 255.0, 0x25 / 255.0, 0x10 / 255.0)
	var light_brown := Color(0x6b / 255.0, 0x48 / 255.0, 0x28 / 255.0)

	_build_cylinder(st, 8, 4, 0.09, 0.17, 0.95, dark_brown, light_brown, 0.04, 0.015)

	# Branch stubs per SPEC-04
	var stub_heights := [0.35, 0.55, 0.75]
	var stub_lengths := [0.48, 0.42, 0.35]
	var stub_angles := [0.8, -0.6, 1.8]
	for i in stub_heights.size():
		_build_branch_stub(st, 0.09, 0.17, 0.95, stub_heights[i], stub_angles[i], stub_lengths[i], dark_brown)

	return st.commit()


func _make_oak_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x38 / 255.0, 0x60 / 255.0, 0x20 / 255.0)

	# Broad, rounded crown — 8 clustered spheres
	_build_sphere(st, Vector3(0.0, 1.3, 0.0), 0.45, 2, base_color, 0.28)
	_build_sphere(st, Vector3(0.4, 1.25, 0.2), 0.38, 2, base_color, 0.28)
	_build_sphere(st, Vector3(-0.35, 1.3, -0.25), 0.40, 2, base_color, 0.28)
	_build_sphere(st, Vector3(0.15, 1.55, -0.2), 0.35, 2, base_color, 0.28)
	_build_sphere(st, Vector3(-0.2, 1.5, 0.3), 0.36, 2, base_color, 0.28)
	_build_sphere(st, Vector3(0.3, 1.15, -0.35), 0.32, 2, base_color, 0.28)
	_build_sphere(st, Vector3(-0.1, 1.65, 0.05), 0.30, 2, base_color, 0.28)
	_build_sphere(st, Vector3(0.25, 1.45, 0.28), 0.28, 2, base_color, 0.28)

	return st.commit()


# =========================================================================
# Birch (Type 2)
# =========================================================================

func _make_birch_trunk() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var bark_light := Color(0xd4 / 255.0, 0xcf / 255.0, 0xc0 / 255.0)
	var bark_dark := Color(0x9a / 255.0, 0x95 / 255.0, 0x88 / 255.0)

	_build_cylinder(st, 6, 5, 0.04, 0.07, 1.3, bark_dark, bark_light, 0.03, 0.01)

	# Branch stubs per SPEC-04
	var stub_heights := [0.55, 0.75, 0.95]
	var stub_lengths := [0.28, 0.26, 0.23]
	var stub_angles := [0.6, -0.9, 1.5]
	for i in stub_heights.size():
		_build_branch_stub(st, 0.04, 0.07, 1.3, stub_heights[i], stub_angles[i], stub_lengths[i], bark_dark)

	return st.commit()


func _make_birch_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x5a / 255.0, 0x90 / 255.0, 0x35 / 255.0)
	var segs := 10

	# 5 cone lobes — lighter, more open canopy
	_build_cone(st, segs, 0.38, 0.50, 0.90, base_color, 0.30, 0.12, 0.08)
	_build_cone(st, segs, 0.32, 0.48, 1.20, base_color, 0.30, -0.08, 0.10)
	_build_cone(st, segs, 0.28, 0.45, 1.45, base_color, 0.30, 0.06, -0.06)
	_build_cone(st, segs, 0.22, 0.40, 1.65, base_color, 0.30, -0.04, -0.08)
	_build_cone(st, segs, 0.15, 0.32, 1.85, base_color, 0.30)

	return st.commit()


# =========================================================================
# Tussock (Type 3) — grass clump
# =========================================================================

func _make_tussock_trunk() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var dark_brown := Color(0x3d / 255.0, 0x25 / 255.0, 0x10 / 255.0)
	var light_brown := Color(0x6b / 255.0, 0x48 / 255.0, 0x28 / 255.0)

	# Minimal stub trunk
	_build_cylinder(st, 4, 1, 0.02, 0.03, 0.05, dark_brown, light_brown, 0.0, 0.0)

	return st.commit()


func _make_tussock_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0xb0 / 255.0, 0x88 / 255.0, 0x40 / 255.0)  # golden straw
	var blade_count := 56

	for i in blade_count:
		# Golden-angle spacing with perturbation
		var angle := (float(i) / float(blade_count)) * TAU + sin(i * 7.1) * 0.3
		var blade_h := lerpf(0.20, 0.38, fmod(abs(sin(i * 3.7)), 1.0))
		var blade_w := lerpf(0.007, 0.012, fmod(abs(cos(i * 5.3)), 1.0))
		var lean := lerpf(0.15, 0.35, fmod(abs(sin(i * 2.1)), 1.0))

		_build_grass_blade(st, angle, blade_h, blade_w, lean, base_color, 0.20)

	return st.commit()


func _build_grass_blade(st: SurfaceTool, angle: float, blade_h: float,
		blade_w: float, lean: float, base_color: Color, variation: float) -> void:
	# 2 vertical segments (4 triangles) forming a tapered plane
	var segs := 2
	var dir := Vector3(cos(angle), 0.0, sin(angle))
	var right := Vector3(-sin(angle), 0.0, cos(angle))
	var normal := right.cross(Vector3.UP).normalized()
	if normal.length_squared() < 0.01:
		normal = Vector3.FORWARD

	for seg in segs:
		var t0 := float(seg) / float(segs)
		var t1 := float(seg + 1) / float(segs)

		var w0 := blade_w * (1.0 - t0 * 0.92)
		var w1 := blade_w * (1.0 - t1 * 0.92)

		var y0 := t0 * blade_h
		var y1 := t1 * blade_h

		# Quadratic outward lean
		var lean0 := lean * t0 * t0
		var lean1 := lean * t1 * t1

		# Tip droop for t > 0.7
		var droop0 := 0.0
		var droop1 := 0.0
		if t0 > 0.7:
			var dt0 := (t0 - 0.7) / 0.3
			droop0 = dt0 * dt0 * blade_h * 0.10
		if t1 > 0.7:
			var dt1 := (t1 - 0.7) / 0.3
			droop1 = dt1 * dt1 * blade_h * 0.10

		var center0 := dir * lean0 + Vector3(0.0, y0 - droop0, 0.0)
		var center1 := dir * lean1 + Vector3(0.0, y1 - droop1, 0.0)

		var p0l := center0 - right * w0
		var p0r := center0 + right * w0
		var p1l := center1 - right * w1
		var p1r := center1 + right * w1

		var c0 := _vary_color(base_color, variation)
		var c1 := _vary_color(base_color, variation)

		# Quad as 2 triangles
		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0l)
		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1l)

		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1l)


# =========================================================================
# Geometry helpers
# =========================================================================

func _build_cylinder(st: SurfaceTool, radial: int, height_segs: int,
		top_r: float, bot_r: float, h: float,
		color_bottom: Color, color_top: Color,
		bend_primary: float, bend_secondary: float) -> void:
	var rings: Array[Array] = []
	var ring_normals: Array[Array] = []

	for iy in height_segs + 1:
		var t := float(iy) / float(height_segs)
		var y := t * h
		var r := lerpf(bot_r, top_r, t)
		var color := color_bottom.lerp(color_top, t)

		# S-curve trunk bend
		var bend_x := sin(t * PI) * bend_primary + sin(t * PI * 2.5) * bend_secondary

		var ring: Array[Vector3] = []
		var norms: Array[Vector3] = []
		for ir in radial:
			var a := float(ir) / float(radial) * TAU
			var vx := cos(a) * r + bend_x
			var vz := sin(a) * r
			ring.append(Vector3(vx, y, vz))
			# Smooth radial normal (ignore bend — it's small)
			norms.append(Vector3(cos(a), 0.0, sin(a)))

		rings.append(ring)
		ring_normals.append(norms)

		# Build quads connecting to previous ring
		if iy > 0:
			var prev_ring: Array = rings[iy - 1]
			var prev_norms: Array = ring_normals[iy - 1]
			var prev_t := float(iy - 1) / float(height_segs)
			var prev_color := color_bottom.lerp(color_top, prev_t)

			for ir in radial:
				var next_ir := (ir + 1) % radial
				var p0: Vector3 = prev_ring[ir]
				var p1: Vector3 = prev_ring[next_ir]
				var p2: Vector3 = ring[ir]
				var p3: Vector3 = ring[next_ir]

				var n0: Vector3 = prev_norms[ir]
				var n1: Vector3 = prev_norms[next_ir]
				var n2: Vector3 = norms[ir]
				var n3: Vector3 = norms[next_ir]

				st.set_color(prev_color); st.set_normal(n0); st.add_vertex(p0)
				st.set_color(prev_color); st.set_normal(n1); st.add_vertex(p1)
				st.set_color(color); st.set_normal(n2); st.add_vertex(p2)

				st.set_color(prev_color); st.set_normal(n1); st.add_vertex(p1)
				st.set_color(color); st.set_normal(n3); st.add_vertex(p3)
				st.set_color(color); st.set_normal(n2); st.add_vertex(p2)


func _build_cone(st: SurfaceTool, segments: int, radius: float, height: float,
		base_y: float, base_color: Color, variation: float,
		offset_x: float = 0.0, offset_z: float = 0.0) -> void:
	# Multi-ring tapered shape — 5 height rings for more vertices to jitter
	var height_segs := 5
	var jitter := 0.15

	for iy in height_segs:
		var t0 := float(iy) / float(height_segs)
		var t1 := float(iy + 1) / float(height_segs)
		# Parabolic taper — rounder than linear, avoids sharp tip
		var r0 := radius * (1.0 - t0 * t0)
		var r1 := radius * (1.0 - t1 * t1)
		var y0 := base_y + t0 * height
		var y1 := base_y + t1 * height

		for i in segments:
			var a0 := float(i) / float(segments) * TAU
			var a1 := float(i + 1) / float(segments) * TAU

			var p00 := _jitter_point(Vector3(cos(a0) * r0 + offset_x, y0, sin(a0) * r0 + offset_z), jitter)
			var p10 := _jitter_point(Vector3(cos(a1) * r0 + offset_x, y0, sin(a1) * r0 + offset_z), jitter)
			var p01 := _jitter_point(Vector3(cos(a0) * r1 + offset_x, y1, sin(a0) * r1 + offset_z), jitter)
			var p11 := _jitter_point(Vector3(cos(a1) * r1 + offset_x, y1, sin(a1) * r1 + offset_z), jitter)

			var n0 := Vector3(cos(a0) * height, radius, sin(a0) * height).normalized()
			var n1 := Vector3(cos(a1) * height, radius, sin(a1) * height).normalized()
			var c00 := _hash_color(base_color, variation, p00)
			var c10 := _hash_color(base_color, variation, p10)
			var c01 := _hash_color(base_color, variation, p01)
			var c11 := _hash_color(base_color, variation, p11)

			st.set_color(c00); st.set_normal(n0); st.add_vertex(p00)
			st.set_color(c10); st.set_normal(n1); st.add_vertex(p10)
			st.set_color(c01); st.set_normal(n0); st.add_vertex(p01)

			st.set_color(c10); st.set_normal(n1); st.add_vertex(p10)
			st.set_color(c11); st.set_normal(n1); st.add_vertex(p11)
			st.set_color(c01); st.set_normal(n0); st.add_vertex(p01)


func _build_sphere(st: SurfaceTool, center: Vector3, radius: float,
		detail: int, base_color: Color, variation: float) -> void:
	# UV sphere with enough geometry for organic jitter
	var rings := 6 + detail * 2
	var sectors := 8 + detail * 2

	for iy in rings:
		var phi0 := PI * float(iy) / float(rings)
		var phi1 := PI * float(iy + 1) / float(rings)

		for ix in sectors:
			var theta0 := TAU * float(ix) / float(sectors)
			var theta1 := TAU * float(ix + 1) / float(sectors)

			var p00 := _jitter_point(center + _sphere_point(phi0, theta0, radius), 0.15)
			var p10 := _jitter_point(center + _sphere_point(phi0, theta1, radius), 0.15)
			var p01 := _jitter_point(center + _sphere_point(phi1, theta0, radius), 0.15)
			var p11 := _jitter_point(center + _sphere_point(phi1, theta1, radius), 0.15)

			var n00 := _sphere_point(phi0, theta0, 1.0)
			var n10 := _sphere_point(phi0, theta1, 1.0)
			var n01 := _sphere_point(phi1, theta0, 1.0)
			var n11 := _sphere_point(phi1, theta1, 1.0)

			var c00 := _hash_color(base_color, variation, p00)
			var c10 := _hash_color(base_color, variation, p10)
			var c01 := _hash_color(base_color, variation, p01)
			var c11 := _hash_color(base_color, variation, p11)

			st.set_color(c00); st.set_normal(n00); st.add_vertex(p00)
			st.set_color(c10); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(c01); st.set_normal(n01); st.add_vertex(p01)

			st.set_color(c10); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(c11); st.set_normal(n11); st.add_vertex(p11)
			st.set_color(c01); st.set_normal(n01); st.add_vertex(p01)


func _build_branch_stub(st: SurfaceTool, trunk_top_r: float, trunk_bot_r: float,
		trunk_height: float, stub_height_frac: float, stub_angle: float,
		stub_length: float, color: Color) -> void:
	# Short 4-segment tapered cylinder oriented outward from trunk surface
	var segs := 4
	var radius_bot := trunk_top_r * 0.7
	var radius_top := trunk_top_r * 0.4

	# Position on trunk at stub_height_frac
	var y_pos := stub_height_frac * trunk_height
	var trunk_r_at_h := lerpf(trunk_bot_r, trunk_top_r, stub_height_frac)

	# Direction outward from trunk
	var dir := Vector3(cos(stub_angle), 0.0, sin(stub_angle))
	var up := Vector3(0.0, 1.0, 0.0)
	var right := dir.cross(up).normalized()

	# Tilt stub slightly upward
	var stub_dir := (dir + up * 0.3).normalized()
	var stub_right := stub_dir.cross(up).normalized()
	if stub_right.length_squared() < 0.01:
		stub_right = right
	var stub_up := stub_right.cross(stub_dir).normalized()

	var base_center := Vector3(cos(stub_angle) * trunk_r_at_h, y_pos, sin(stub_angle) * trunk_r_at_h)

	# Build 2-ring cylinder along stub_dir
	for seg in segs:
		var a0 := float(seg) / float(segs) * TAU
		var a1 := float(seg + 1) / float(segs) * TAU

		# Smooth radial normals relative to stub axis
		var sn0 := (stub_right * cos(a0) + stub_up * sin(a0)).normalized()
		var sn1 := (stub_right * cos(a1) + stub_up * sin(a1)).normalized()

		# Base ring
		var rb0 := stub_right * cos(a0) * radius_bot + stub_up * sin(a0) * radius_bot
		var rb1 := stub_right * cos(a1) * radius_bot + stub_up * sin(a1) * radius_bot
		# Tip ring
		var rt0 := stub_right * cos(a0) * radius_top + stub_up * sin(a0) * radius_top
		var rt1 := stub_right * cos(a1) * radius_top + stub_up * sin(a1) * radius_top

		var p0 := base_center + rb0
		var p1 := base_center + rb1
		var p2 := base_center + stub_dir * stub_length + rt0
		var p3 := base_center + stub_dir * stub_length + rt1

		var c0 := _hash_color(color, 0.06, p0)
		var c1 := _hash_color(color, 0.06, p1)
		var c2 := _hash_color(color, 0.06, p2)
		var c3 := _hash_color(color, 0.06, p3)

		st.set_color(c0); st.set_normal(sn0); st.add_vertex(p0)
		st.set_color(c1); st.set_normal(sn1); st.add_vertex(p1)
		st.set_color(c2); st.set_normal(sn0); st.add_vertex(p2)

		st.set_color(c1); st.set_normal(sn1); st.add_vertex(p1)
		st.set_color(c3); st.set_normal(sn1); st.add_vertex(p3)
		st.set_color(c2); st.set_normal(sn0); st.add_vertex(p2)


func _sphere_point(phi: float, theta: float, r: float) -> Vector3:
	return Vector3(
		sin(phi) * cos(theta) * r,
		cos(phi) * r,
		sin(phi) * sin(theta) * r
	)


func _jitter_point(p: Vector3, amount: float) -> Vector3:
	# Deterministic hash-based displacement along normalized direction from origin
	var hash_val := fmod(abs(p.x * 73.13 + p.y * 37.17 + p.z * 91.31), 1.0)
	var dir := p.normalized()
	if dir.length_squared() < 0.001:
		return p
	return p + dir * (hash_val - 0.5) * amount


func _vary_color(base: Color, amount: float) -> Color:
	# Random variation — use for independent geometry (grass blades, etc.)
	var noise := (randf() - 0.5) * amount
	return Color(
		clampf(base.r + noise, 0.0, 1.0),
		clampf(base.g + noise * 1.2, 0.0, 1.0),
		clampf(base.b + noise * 0.5, 0.0, 1.0))


func _hash_color(base: Color, amount: float, pos: Vector3) -> Color:
	# Deterministic variation from position — same position always gives same color.
	# Use for shared-edge surfaces (cones, spheres, cylinders) to avoid color seams.
	var h := fmod(abs(pos.x * 73.13 + pos.y * 37.17 + pos.z * 91.31 + 0.5), 1.0)
	var noise := (h - 0.5) * amount
	return Color(
		clampf(base.r + noise, 0.0, 1.0),
		clampf(base.g + noise * 1.2, 0.0, 1.0),
		clampf(base.b + noise * 0.5, 0.0, 1.0))
