extends RefCounted
## Generates procedural tree meshes (pine, oak, birch) using SurfaceTool.
## Each tree type produces a trunk mesh and a canopy mesh.

enum TreeType { PINE = 0, OAK = 1, BIRCH = 2 }

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

	return st.commit()


func _make_pine_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x18 / 255.0, 0x40 / 255.0, 0x1a / 255.0)

	# 5 stacked cones
	var cone_data := [
		{ "y": 0.85, "r": 0.8, "h": 1.1, "segs": 14 },
		{ "y": 1.2, "r": 0.65, "h": 0.9, "segs": 14 },
		{ "y": 1.5, "r": 0.5, "h": 0.75, "segs": 12 },
		{ "y": 1.8, "r": 0.38, "h": 0.6, "segs": 10 },
		{ "y": 2.05, "r": 0.25, "h": 0.4, "segs": 8 },
	]

	for cd in cone_data:
		_build_cone(st, cd["segs"] as int, cd["r"] as float, cd["h"] as float, cd["y"] as float, base_color, 0.28)

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

	return st.commit()


func _make_oak_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x38 / 255.0, 0x60 / 255.0, 0x20 / 255.0)

	# 6 clustered spheres at various positions
	var sphere_data := [
		{ "pos": Vector3(0.0, 1.3, 0.0), "r": 0.55 },
		{ "pos": Vector3(0.3, 1.4, 0.15), "r": 0.45 },
		{ "pos": Vector3(-0.25, 1.35, -0.2), "r": 0.48 },
		{ "pos": Vector3(0.1, 1.6, -0.15), "r": 0.4 },
		{ "pos": Vector3(-0.15, 1.5, 0.25), "r": 0.42 },
		{ "pos": Vector3(0.2, 1.2, -0.3), "r": 0.35 },
	]

	for sd in sphere_data:
		_build_sphere(st, sd["pos"] as Vector3, sd["r"] as float, 2, base_color, 0.25)

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

	return st.commit()


func _make_birch_canopy() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var base_color := Color(0x5a / 255.0, 0x90 / 255.0, 0x35 / 255.0)

	# 4 cone lobes
	var lobe_data := [
		{ "y": 0.9, "r": 0.45, "h": 0.8, "segs": 10 },
		{ "y": 1.2, "r": 0.38, "h": 0.7, "segs": 10 },
		{ "y": 1.5, "r": 0.3, "h": 0.55, "segs": 8 },
		{ "y": 1.75, "r": 0.22, "h": 0.4, "segs": 8 },
	]

	for ld in lobe_data:
		_build_cone(st, ld["segs"] as int, ld["r"] as float, ld["h"] as float, ld["y"] as float, base_color, 0.30)

	return st.commit()


# =========================================================================
# Geometry helpers
# =========================================================================

func _build_cylinder(st: SurfaceTool, radial: int, height_segs: int,
		top_r: float, bot_r: float, h: float,
		color_bottom: Color, color_top: Color,
		bend_primary: float, bend_secondary: float) -> void:
	var rings: Array[Array] = []

	for iy in height_segs + 1:
		var t := float(iy) / float(height_segs)
		var y := t * h
		var r := lerpf(bot_r, top_r, t)
		var color := color_bottom.lerp(color_top, t)

		# S-curve trunk bend
		var bend_x := sin(t * PI) * bend_primary + sin(t * PI * 2.5) * bend_secondary

		var ring: Array[Vector3] = []
		for ir in radial:
			var angle := float(ir) / float(radial) * TAU
			var vx := cos(angle) * r + bend_x
			var vz := sin(angle) * r
			ring.append(Vector3(vx, y, vz))

		rings.append(ring)

		# Build quads connecting to previous ring
		if iy > 0:
			var prev_ring: Array = rings[iy - 1]
			var prev_t := float(iy - 1) / float(height_segs)
			var prev_color := color_bottom.lerp(color_top, prev_t)

			for ir in radial:
				var next_ir := (ir + 1) % radial
				var p0: Vector3 = prev_ring[ir]
				var p1: Vector3 = prev_ring[next_ir]
				var p2: Vector3 = ring[ir]
				var p3: Vector3 = ring[next_ir]

				var n := (p2 - p0).cross(p1 - p0).normalized()

				st.set_color(prev_color); st.set_normal(n); st.add_vertex(p0)
				st.set_color(color); st.set_normal(n); st.add_vertex(p2)
				st.set_color(prev_color); st.set_normal(n); st.add_vertex(p1)

				st.set_color(prev_color); st.set_normal(n); st.add_vertex(p1)
				st.set_color(color); st.set_normal(n); st.add_vertex(p2)
				st.set_color(color); st.set_normal(n); st.add_vertex(p3)


func _build_cone(st: SurfaceTool, segments: int, radius: float, height: float,
		base_y: float, base_color: Color, variation: float) -> void:
	var tip := Vector3(0, base_y + height, 0)
	var tip_color := _vary_color(base_color, variation * 0.5)

	for i in segments:
		var angle0 := float(i) / float(segments) * TAU
		var angle1 := float(i + 1) / float(segments) * TAU

		var p0 := Vector3(cos(angle0) * radius, base_y, sin(angle0) * radius)
		var p1 := Vector3(cos(angle1) * radius, base_y, sin(angle1) * radius)

		var n := (p1 - p0).cross(tip - p0).normalized()
		var c0 := _vary_color(base_color, variation)
		var c1 := _vary_color(base_color, variation)

		st.set_color(c0); st.set_normal(n); st.add_vertex(p0)
		st.set_color(c1); st.set_normal(n); st.add_vertex(p1)
		st.set_color(tip_color); st.set_normal(n); st.add_vertex(tip)


func _build_sphere(st: SurfaceTool, center: Vector3, radius: float,
		detail: int, base_color: Color, variation: float) -> void:
	# Simple UV sphere approximation
	var rings := 4 + detail * 2
	var sectors := 6 + detail * 2

	for iy in rings:
		var phi0 := PI * float(iy) / float(rings)
		var phi1 := PI * float(iy + 1) / float(rings)

		for ix in sectors:
			var theta0 := TAU * float(ix) / float(sectors)
			var theta1 := TAU * float(ix + 1) / float(sectors)

			var p00 := center + _sphere_point(phi0, theta0, radius)
			var p10 := center + _sphere_point(phi0, theta1, radius)
			var p01 := center + _sphere_point(phi1, theta0, radius)
			var p11 := center + _sphere_point(phi1, theta1, radius)

			var n00 := _sphere_point(phi0, theta0, 1.0)
			var n10 := _sphere_point(phi0, theta1, 1.0)
			var n01 := _sphere_point(phi1, theta0, 1.0)
			var n11 := _sphere_point(phi1, theta1, 1.0)

			var c00 := _vary_color(base_color, variation)
			var c10 := _vary_color(base_color, variation)
			var c01 := _vary_color(base_color, variation)
			var c11 := _vary_color(base_color, variation)

			st.set_color(c00); st.set_normal(n00); st.add_vertex(p00)
			st.set_color(c01); st.set_normal(n01); st.add_vertex(p01)
			st.set_color(c10); st.set_normal(n10); st.add_vertex(p10)

			st.set_color(c10); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(c01); st.set_normal(n01); st.add_vertex(p01)
			st.set_color(c11); st.set_normal(n11); st.add_vertex(p11)


func _sphere_point(phi: float, theta: float, r: float) -> Vector3:
	return Vector3(
		sin(phi) * cos(theta) * r,
		cos(phi) * r,
		sin(phi) * sin(theta) * r
	)


func _vary_color(base: Color, amount: float) -> Color:
	var offset := (randf() - 0.5) * amount
	return Color(
		clampf(base.r + offset, 0.0, 1.0),
		clampf(base.g + offset, 0.0, 1.0),
		clampf(base.b + offset, 0.0, 1.0)
	)
