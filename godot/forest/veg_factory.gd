extends RefCounted
## Generates procedural vegetation meshes (grass, ferns, flowers, rocks, logs, stumps).
## Each type produces a single ArrayMesh with baked vertex colors. Meshes are cached.

enum VegType {
	GRASS_TUFT = 0,
	FERN_COMPACT = 1,
	FERN_SPREADING = 2,
	FERN_TALL = 3,
	FLOWER_5P = 4,
	FLOWER_4P = 5,
	FLOWER_6P = 6,
	ROCK_SMALL = 7,
	ROCK_MEDIUM = 8,
	ROCK_LARGE = 9,
	FALLEN_LOG = 10,
	STUMP = 11,
}

# Cache key: int (VegType or VegType * 100 + color_idx for flowers)
var _cache: Dictionary = {}


func get_mesh(veg_type: int, color_idx: int = 0) -> ArrayMesh:
	var key: int
	if veg_type >= VegType.FLOWER_5P and veg_type <= VegType.FLOWER_6P:
		key = veg_type * 100 + color_idx
	else:
		key = veg_type
	if not _cache.has(key):
		_cache[key] = _build_mesh(veg_type, color_idx)
	return _cache[key]


func _build_mesh(veg_type: int, color_idx: int) -> ArrayMesh:
	match veg_type:
		VegType.GRASS_TUFT:
			return _make_grass_tuft()
		VegType.FERN_COMPACT:
			return _make_fern(5, 0.18, 0.08, 0.15)
		VegType.FERN_SPREADING:
			return _make_fern(7, 0.24, 0.14, 0.20)
		VegType.FERN_TALL:
			return _make_fern(4, 0.28, 0.18, 0.16)
		VegType.FLOWER_5P:
			return _make_flower(5, 0.15, 0.08, color_idx)
		VegType.FLOWER_4P:
			return _make_flower(4, 0.10, 0.06, color_idx)
		VegType.FLOWER_6P:
			return _make_flower(6, 0.18, 0.10, color_idx)
		VegType.ROCK_SMALL:
			return _make_rock(0.12, 0, 0.5)
		VegType.ROCK_MEDIUM:
			return _make_rock(0.25, 1, 0.5)
		VegType.ROCK_LARGE:
			return _make_rock(0.5, 1, 0.45)
		VegType.FALLEN_LOG:
			return _make_fallen_log()
		VegType.STUMP:
			return _make_stump()
	return ArrayMesh.new()


# =========================================================================
# Grass tuft
# =========================================================================

func _make_grass_tuft() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var blade_count := 9
	for i in blade_count:
		var angle := float(i) * TAU * 0.618
		var w := 0.008 + float(i % 3) * 0.004
		var h := 0.12 + float(i % 4) * 0.06
		var lean := 0.06 + float(i % 3) * 0.03
		_build_blade(st, angle, h, w, lean, Config.GRASS_COLOR, 0.20)

	return st.commit()


# =========================================================================
# Ferns (3 variants)
# =========================================================================

func _make_fern(frond_count: int, length: float, droop: float, rise: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for f in frond_count:
		var angle := float(f) / float(frond_count) * TAU + sin(f * 5.3) * 0.2
		_build_frond(st, angle, length, droop, rise)

	return st.commit()


func _build_frond(st: SurfaceTool, angle: float, length: float, droop: float, rise: float) -> void:
	var segments := 6
	var dir := Vector3(cos(angle), 0.0, sin(angle))
	var right := Vector3(-sin(angle), 0.0, cos(angle))

	# Build spine points
	var spine: Array[Vector3] = []
	for s in segments + 1:
		var t := float(s) / float(segments)
		# Spine rises then droops
		var y := rise * sin(t * PI * 0.8) - droop * t * t
		var outward := length * t
		spine.append(dir * outward + Vector3(0.0, y, 0.0))

	# Central stem — tapered quad strip
	var stem_width := 0.006
	for s in segments:
		var t0 := float(s) / float(segments)
		var t1 := float(s + 1) / float(segments)
		var w0 := stem_width * (1.0 - t0 * 0.8)
		var w1 := stem_width * (1.0 - t1 * 0.8)

		var p0l := spine[s] - right * w0
		var p0r := spine[s] + right * w0
		var p1l := spine[s + 1] - right * w1
		var p1r := spine[s + 1] + right * w1

		var n := Vector3.UP
		var c0 := _vary_color(Config.FERN_COLOR, 0.10)
		var c1 := _vary_color(Config.FERN_COLOR, 0.10)

		st.set_color(c0); st.set_normal(n); st.add_vertex(p0l)
		st.set_color(c0); st.set_normal(n); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(n); st.add_vertex(p1l)

		st.set_color(c0); st.set_normal(n); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(n); st.add_vertex(p1r)
		st.set_color(c1); st.set_normal(n); st.add_vertex(p1l)

	# Leaflet pairs — 5 per segment, bell curve sizing
	var leaflet_pairs := 5
	for s in segments:
		for lp in leaflet_pairs:
			var t := (float(s) + (float(lp) + 0.5) / float(leaflet_pairs)) / float(segments)
			# Bell curve: peaks in middle of frond
			var size_factor := sin(t * PI) * 0.8 + 0.2
			var leaflet_len := 0.025 * size_factor
			var leaflet_w := 0.008 * size_factor

			# Interpolate position on spine
			var spine_pos := spine[s].lerp(spine[s + 1], (float(lp) + 0.5) / float(leaflet_pairs))

			# Build left and right leaflet
			for side_f: float in [-1.0, 1.0]:
				var base: Vector3 = spine_pos + right * side_f * 0.003
				var tip: Vector3 = base + right * side_f * leaflet_len + Vector3(0.0, -0.005 * size_factor, 0.0)
				var mid: Vector3 = base + right * side_f * leaflet_len * 0.5 + dir * leaflet_w * 0.5

				var c := _vary_color(Config.FERN_COLOR, 0.15)
				var n := Vector3.UP
				st.set_color(c); st.set_normal(n); st.add_vertex(base)
				st.set_color(c); st.set_normal(n); st.add_vertex(mid)
				st.set_color(c); st.set_normal(n); st.add_vertex(tip)


# =========================================================================
# Flowers (3 variants × 6 colors)
# =========================================================================

func _make_flower(petal_count: int, stem_height: float, petal_len: float, color_idx: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var petal_color: Color = Config.FLOWER_COLORS[color_idx % Config.FLOWER_COLORS.size()]
	var stem_color := Config.GRASS_COLOR
	var center_color := Color(0.95, 0.90, 0.20)  # yellow center

	# S-curve stem (4 segments)
	var stem_segs := 4
	var stem_width := 0.004
	var stem_points: Array[Vector3] = []
	for s in stem_segs + 1:
		var t := float(s) / float(stem_segs)
		var y := t * stem_height
		var bend_x := sin(t * PI) * 0.01 + sin(t * PI * 2.5) * 0.005
		stem_points.append(Vector3(bend_x, y, 0.0))

	var stem_right := Vector3(0.0, 0.0, 1.0)
	for s in stem_segs:
		var w0 := stem_width * (1.0 - float(s) / float(stem_segs) * 0.5)
		var w1 := stem_width * (1.0 - float(s + 1) / float(stem_segs) * 0.5)

		var p0l := stem_points[s] - stem_right * w0
		var p0r := stem_points[s] + stem_right * w0
		var p1l := stem_points[s + 1] - stem_right * w1
		var p1r := stem_points[s + 1] + stem_right * w1

		var n := Vector3(1.0, 0.0, 0.0)
		var c := _vary_color(stem_color, 0.10)

		st.set_color(c); st.set_normal(n); st.add_vertex(p0l)
		st.set_color(c); st.set_normal(n); st.add_vertex(p0r)
		st.set_color(c); st.set_normal(n); st.add_vertex(p1l)

		st.set_color(c); st.set_normal(n); st.add_vertex(p0r)
		st.set_color(c); st.set_normal(n); st.add_vertex(p1r)
		st.set_color(c); st.set_normal(n); st.add_vertex(p1l)

	# 3 rosette leaves at base
	for leaf in 3:
		var leaf_angle := float(leaf) / 3.0 * TAU + 0.3
		var leaf_dir := Vector3(cos(leaf_angle), 0.0, sin(leaf_angle))
		var leaf_right := Vector3(-sin(leaf_angle), 0.0, cos(leaf_angle))
		var leaf_len := 0.035
		var leaf_w := 0.012

		var base := Vector3(0.0, 0.01, 0.0)
		var tip := base + leaf_dir * leaf_len + Vector3(0.0, -0.005, 0.0)
		var mid_l := base + leaf_dir * leaf_len * 0.5 - leaf_right * leaf_w * 0.5 + Vector3(0.0, 0.005, 0.0)
		var mid_r := base + leaf_dir * leaf_len * 0.5 + leaf_right * leaf_w * 0.5 + Vector3(0.0, 0.005, 0.0)

		var lc := _vary_color(stem_color, 0.12)
		var n := Vector3.UP
		st.set_color(lc); st.set_normal(n); st.add_vertex(base)
		st.set_color(lc); st.set_normal(n); st.add_vertex(mid_l)
		st.set_color(lc); st.set_normal(n); st.add_vertex(tip)

		st.set_color(lc); st.set_normal(n); st.add_vertex(base)
		st.set_color(lc); st.set_normal(n); st.add_vertex(tip)
		st.set_color(lc); st.set_normal(n); st.add_vertex(mid_r)

	# Petals as radial quads at top of stem
	var flower_center := stem_points[stem_segs]
	for p in petal_count:
		var petal_angle := float(p) / float(petal_count) * TAU
		var petal_dir := Vector3(cos(petal_angle), 0.0, sin(petal_angle))
		var petal_right := Vector3(-sin(petal_angle), 0.0, cos(petal_angle))
		var petal_w := petal_len * 0.4

		var p0 := flower_center
		var p1 := flower_center + petal_dir * petal_len + Vector3(0.0, -petal_len * 0.15, 0.0)
		var p_mid_l := flower_center + petal_dir * petal_len * 0.5 - petal_right * petal_w * 0.5 + Vector3(0.0, petal_len * 0.05, 0.0)
		var p_mid_r := flower_center + petal_dir * petal_len * 0.5 + petal_right * petal_w * 0.5 + Vector3(0.0, petal_len * 0.05, 0.0)

		var pc := _vary_color(petal_color, 0.08)
		var n := Vector3.UP

		# Two triangles per petal
		st.set_color(pc); st.set_normal(n); st.add_vertex(p0)
		st.set_color(pc); st.set_normal(n); st.add_vertex(p_mid_l)
		st.set_color(pc); st.set_normal(n); st.add_vertex(p1)

		st.set_color(pc); st.set_normal(n); st.add_vertex(p0)
		st.set_color(pc); st.set_normal(n); st.add_vertex(p1)
		st.set_color(pc); st.set_normal(n); st.add_vertex(p_mid_r)

	# Yellow center hexagon
	var center_r := petal_len * 0.15
	var center_segs := 6
	for cs in center_segs:
		var a0 := float(cs) / float(center_segs) * TAU
		var a1 := float(cs + 1) / float(center_segs) * TAU
		var cp0 := flower_center + Vector3(0.0, 0.002, 0.0)
		var cp1 := flower_center + Vector3(cos(a0) * center_r, 0.002, sin(a0) * center_r)
		var cp2 := flower_center + Vector3(cos(a1) * center_r, 0.002, sin(a1) * center_r)

		st.set_color(center_color); st.set_normal(Vector3.UP); st.add_vertex(cp0)
		st.set_color(center_color); st.set_normal(Vector3.UP); st.add_vertex(cp1)
		st.set_color(center_color); st.set_normal(Vector3.UP); st.add_vertex(cp2)

	return st.commit()


# =========================================================================
# Rocks (icosahedron with subdivision + jag)
# =========================================================================

func _make_rock(radius: float, detail: int, y_scale: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	# Build icosahedron vertices
	var phi := (1.0 + sqrt(5.0)) / 2.0
	var ico_verts: Array[Vector3] = [
		Vector3(-1, phi, 0).normalized(),
		Vector3(1, phi, 0).normalized(),
		Vector3(-1, -phi, 0).normalized(),
		Vector3(1, -phi, 0).normalized(),
		Vector3(0, -1, phi).normalized(),
		Vector3(0, 1, phi).normalized(),
		Vector3(0, -1, -phi).normalized(),
		Vector3(0, 1, -phi).normalized(),
		Vector3(phi, 0, -1).normalized(),
		Vector3(phi, 0, 1).normalized(),
		Vector3(-phi, 0, -1).normalized(),
		Vector3(-phi, 0, 1).normalized(),
	]

	var ico_tris: Array[Array] = [
		[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
		[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
		[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
	]

	# Subdivision
	var triangles := ico_tris.duplicate()
	for _d in detail:
		var new_tris: Array[Array] = []
		var midpoint_cache: Dictionary = {}
		for tri in triangles:
			var a: int = tri[0]
			var b: int = tri[1]
			var c: int = tri[2]
			var ab := _get_midpoint(ico_verts, midpoint_cache, a, b)
			var bc := _get_midpoint(ico_verts, midpoint_cache, b, c)
			var ca := _get_midpoint(ico_verts, midpoint_cache, c, a)
			new_tris.append([a, ab, ca])
			new_tris.append([b, bc, ab])
			new_tris.append([c, ca, bc])
			new_tris.append([ab, bc, ca])
		triangles = new_tris

	# Apply jag displacement (40% radial) and y_scale
	# Pre-compute displaced positions for smooth normal averaging
	var displaced_verts: Array[Vector3] = []
	displaced_verts.resize(ico_verts.size())
	for vi in ico_verts.size():
		var v: Vector3 = ico_verts[vi]
		var hash_val := fmod(abs(v.x * 73.13 + v.y * 37.17 + v.z * 91.31), 1.0)
		var jag := 1.0 + (hash_val - 0.5) * 0.4 * 2.0
		var displaced := v * jag * radius
		displaced.y *= y_scale
		displaced_verts[vi] = displaced

	# Accumulate smooth normals per vertex
	var smooth_normals: Array[Vector3] = []
	smooth_normals.resize(ico_verts.size())
	for vi in smooth_normals.size():
		smooth_normals[vi] = Vector3.ZERO
	for tri in triangles:
		var p0: Vector3 = displaced_verts[tri[0]]
		var p1: Vector3 = displaced_verts[tri[1]]
		var p2: Vector3 = displaced_verts[tri[2]]
		var face_n := (p1 - p0).cross(p2 - p0)
		for vi in 3:
			smooth_normals[tri[vi]] += face_n
	for vi in smooth_normals.size():
		smooth_normals[vi] = smooth_normals[vi].normalized()

	var colors := Config.ROCK_COLORS
	for tri in triangles:
		for vi in 3:
			var vert: Vector3 = displaced_verts[tri[vi]]
			var n: Vector3 = smooth_normals[tri[vi]]
			var base_c: Color = colors[int(abs(vert.x * 17.3 + vert.z * 31.7)) % colors.size()]
			var c := _hash_color(base_c, 0.12, vert)
			st.set_color(c); st.set_normal(n); st.add_vertex(vert)

	return st.commit()


func _get_midpoint(verts: Array[Vector3], cache: Dictionary, a: int, b: int) -> int:
	var key := mini(a, b) * 10000 + maxi(a, b)
	if cache.has(key):
		return cache[key]
	var mid := ((verts[a] + verts[b]) * 0.5).normalized()
	verts.append(mid)
	var idx := verts.size() - 1
	cache[key] = idx
	return idx


# =========================================================================
# Fallen log — normalized cylinder (1.0 length × 1.0 radius), scaled by transform
# =========================================================================

func _make_fallen_log() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var radial := 6
	var height_segs := 3
	var bark_colors := Config.LOG_BARK_COLORS

	# Cylinder along Y axis, unit dimensions — smooth radial normals + hash colors
	for iy in height_segs:
		var t0 := float(iy) / float(height_segs)
		var t1 := float(iy + 1) / float(height_segs)
		var y0 := t0
		var y1 := t1

		for ir in radial:
			var a0 := float(ir) / float(radial) * TAU
			var a1 := float(ir + 1) / float(radial) * TAU

			var p0 := Vector3(cos(a0), y0, sin(a0))
			var p1 := Vector3(cos(a1), y0, sin(a1))
			var p2 := Vector3(cos(a0), y1, sin(a0))
			var p3 := Vector3(cos(a1), y1, sin(a1))

			# Smooth radial normals
			var n0 := Vector3(cos(a0), 0.0, sin(a0))
			var n1 := Vector3(cos(a1), 0.0, sin(a1))
			var ci := (ir + iy) % bark_colors.size()
			var c0 := _hash_color(bark_colors[ci], 0.08, p0)
			var c1 := _hash_color(bark_colors[ci], 0.08, p1)
			var c2 := _hash_color(bark_colors[ci], 0.08, p2)
			var c3 := _hash_color(bark_colors[ci], 0.08, p3)

			st.set_color(c0); st.set_normal(n0); st.add_vertex(p0)
			st.set_color(c1); st.set_normal(n1); st.add_vertex(p1)
			st.set_color(c2); st.set_normal(n0); st.add_vertex(p2)

			st.set_color(c1); st.set_normal(n1); st.add_vertex(p1)
			st.set_color(c3); st.set_normal(n1); st.add_vertex(p3)
			st.set_color(c2); st.set_normal(n0); st.add_vertex(p2)

	# End caps — hash colors for smooth disc
	for cap_y: float in [0.0, 1.0]:
		var cap_n := Vector3.DOWN if cap_y < 0.5 else Vector3.UP
		for ir in radial:
			var a0 := float(ir) / float(radial) * TAU
			var a1 := float(ir + 1) / float(radial) * TAU
			var center := Vector3(0.0, cap_y, 0.0)
			var p0 := Vector3(cos(a0), cap_y, sin(a0))
			var p1 := Vector3(cos(a1), cap_y, sin(a1))

			var cc := _hash_color(Config.STUMP_CUT_COLOR, 0.06, center)
			var cp0 := _hash_color(Config.STUMP_CUT_COLOR, 0.06, p0)
			var cp1 := _hash_color(Config.STUMP_CUT_COLOR, 0.06, p1)

			if cap_y < 0.5:
				st.set_color(cc); st.set_normal(cap_n); st.add_vertex(center)
				st.set_color(cp1); st.set_normal(cap_n); st.add_vertex(p1)
				st.set_color(cp0); st.set_normal(cap_n); st.add_vertex(p0)
			else:
				st.set_color(cc); st.set_normal(cap_n); st.add_vertex(center)
				st.set_color(cp0); st.set_normal(cap_n); st.add_vertex(p0)
				st.set_color(cp1); st.set_normal(cap_n); st.add_vertex(p1)

	return st.commit()


# =========================================================================
# Stump — tapered cylinder with top disc cap
# =========================================================================

func _make_stump() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var radial := 6
	var height_segs := 2
	var bark_colors := Config.LOG_BARK_COLORS
	# Normalized: bottom radius 1.0, top radius 0.85, height 1.0
	var r_bot := 1.0
	var r_top := 0.85

	for iy in height_segs:
		var t0 := float(iy) / float(height_segs)
		var t1 := float(iy + 1) / float(height_segs)
		var y0 := t0
		var y1 := t1
		var rad0 := lerpf(r_bot, r_top, t0)
		var rad1 := lerpf(r_bot, r_top, t1)

		for ir in radial:
			var a0 := float(ir) / float(radial) * TAU
			var a1 := float(ir + 1) / float(radial) * TAU

			var p0 := Vector3(cos(a0) * rad0, y0, sin(a0) * rad0)
			var p1 := Vector3(cos(a1) * rad0, y0, sin(a1) * rad0)
			var p2 := Vector3(cos(a0) * rad1, y1, sin(a0) * rad1)
			var p3 := Vector3(cos(a1) * rad1, y1, sin(a1) * rad1)

			# Smooth radial normals + hash colors
			var n0 := Vector3(cos(a0), 0.0, sin(a0))
			var n1 := Vector3(cos(a1), 0.0, sin(a1))
			var ci := (ir + iy) % bark_colors.size()
			var c0 := _hash_color(bark_colors[ci], 0.08, p0)
			var c1 := _hash_color(bark_colors[ci], 0.08, p1)
			var c2 := _hash_color(bark_colors[ci], 0.08, p2)
			var c3 := _hash_color(bark_colors[ci], 0.08, p3)

			st.set_color(c0); st.set_normal(n0); st.add_vertex(p0)
			st.set_color(c1); st.set_normal(n1); st.add_vertex(p1)
			st.set_color(c2); st.set_normal(n0); st.add_vertex(p2)

			st.set_color(c1); st.set_normal(n1); st.add_vertex(p1)
			st.set_color(c3); st.set_normal(n1); st.add_vertex(p3)
			st.set_color(c2); st.set_normal(n0); st.add_vertex(p2)

	# Top disc cap with cut wood color — hash for edge-matching with sides
	var cap_c := Config.STUMP_CUT_COLOR
	for ir in radial:
		var a0 := float(ir) / float(radial) * TAU
		var a1 := float(ir + 1) / float(radial) * TAU
		var center := Vector3(0.0, 1.0, 0.0)
		var p0 := Vector3(cos(a0) * r_top, 1.0, sin(a0) * r_top)
		var p1 := Vector3(cos(a1) * r_top, 1.0, sin(a1) * r_top)

		st.set_color(_hash_color(cap_c, 0.06, center)); st.set_normal(Vector3.UP); st.add_vertex(center)
		st.set_color(_hash_color(cap_c, 0.06, p0)); st.set_normal(Vector3.UP); st.add_vertex(p0)
		st.set_color(_hash_color(cap_c, 0.06, p1)); st.set_normal(Vector3.UP); st.add_vertex(p1)

	return st.commit()


# =========================================================================
# Geometry helpers
# =========================================================================

func _build_blade(st: SurfaceTool, angle: float, blade_h: float,
		blade_w: float, lean: float, base_color: Color, variation: float) -> void:
	# 3 segments (6 triangles), tapered
	var segs := 3
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

		var center0 := dir * lean0 + Vector3(0.0, y0, 0.0)
		var center1 := dir * lean1 + Vector3(0.0, y1, 0.0)

		var p0l := center0 - right * w0
		var p0r := center0 + right * w0
		var p1l := center1 - right * w1
		var p1r := center1 + right * w1

		var c0 := _vary_color(base_color, variation)
		var c1 := _vary_color(base_color, variation)

		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0l)
		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1l)

		st.set_color(c0); st.set_normal(normal); st.add_vertex(p0r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1r)
		st.set_color(c1); st.set_normal(normal); st.add_vertex(p1l)


func _vary_color(base: Color, amount: float) -> Color:
	var n := (randf() - 0.5) * amount
	return Color(
		clampf(base.r + n, 0.0, 1.0),
		clampf(base.g + n * 1.2, 0.0, 1.0),
		clampf(base.b + n * 0.5, 0.0, 1.0))


func _hash_color(base: Color, amount: float, pos: Vector3) -> Color:
	var h := fmod(abs(pos.x * 73.13 + pos.y * 37.17 + pos.z * 91.31 + 0.5), 1.0)
	var n := (h - 0.5) * amount
	return Color(
		clampf(base.r + n, 0.0, 1.0),
		clampf(base.g + n * 1.2, 0.0, 1.0),
		clampf(base.b + n * 0.5, 0.0, 1.0))
