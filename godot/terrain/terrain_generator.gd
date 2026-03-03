extends RefCounted
## Generates ArrayMesh terrain chunks with vertex colors and tree placement data.

var _chunk_size: float
var _segments: int
var _step: float
var noise: RefCounted  # noise.gd instance


func _init(noise_instance: RefCounted) -> void:
	noise = noise_instance
	_chunk_size = Config.CHUNK_SIZE       # 32m
	_segments = Config.CHUNK_SEGMENTS     # 63 (64x64 grid)
	_step = _chunk_size / float(_segments)


## Build a terrain mesh for one chunk.
## Returns { "mesh": ArrayMesh, "tree_data": Array[Dictionary] }
func generate_chunk(chunk_x: int, chunk_z: int) -> Dictionary:
	var origin_x := float(chunk_x) * _chunk_size
	var origin_z := float(chunk_z) * _chunk_size

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var grid_count := _segments + 1

	# Pre-compute heights and colors on grid
	var heights: Array[float] = []
	var colors: Array[Color] = []
	heights.resize(grid_count * grid_count)
	colors.resize(grid_count * grid_count)

	for iz in grid_count:
		for ix in grid_count:
			var wx := origin_x + float(ix) * _step
			var wz := origin_z + float(iz) * _step
			var idx := iz * grid_count + ix
			var h: float = noise.get_terrain_height(wx, wz)
			heights[idx] = h
			colors[idx] = _get_vertex_color(wx, wz, h)

	# Build triangles with normals
	for iz in _segments:
		for ix in _segments:
			var i00 := iz * grid_count + ix
			var i10 := i00 + 1
			var i01 := i00 + grid_count
			var i11 := i01 + 1

			var wx00 := origin_x + float(ix) * _step
			var wz00 := origin_z + float(iz) * _step

			var p00 := Vector3(wx00, heights[i00], wz00)
			var p10 := Vector3(wx00 + _step, heights[i10], wz00)
			var p01 := Vector3(wx00, heights[i01], wz00 + _step)
			var p11 := Vector3(wx00 + _step, heights[i11], wz00 + _step)

			var n00 := _calc_normal(origin_x, origin_z, ix, iz, heights)
			var n10 := _calc_normal(origin_x, origin_z, ix + 1, iz, heights)
			var n01 := _calc_normal(origin_x, origin_z, ix, iz + 1, heights)
			var n11 := _calc_normal(origin_x, origin_z, ix + 1, iz + 1, heights)

			# Triangle 1: 00, 01, 10
			st.set_color(colors[i00]); st.set_normal(n00); st.add_vertex(p00)
			st.set_color(colors[i01]); st.set_normal(n01); st.add_vertex(p01)
			st.set_color(colors[i10]); st.set_normal(n10); st.add_vertex(p10)

			# Triangle 2: 10, 01, 11
			st.set_color(colors[i10]); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(colors[i01]); st.set_normal(n01); st.add_vertex(p01)
			st.set_color(colors[i11]); st.set_normal(n11); st.add_vertex(p11)

	var mesh := st.commit()

	# Tree placement data
	var tree_data := _compute_tree_data(origin_x, origin_z)

	return { "mesh": mesh, "tree_data": tree_data }


func _calc_normal(origin_x: float, origin_z: float, ix: int, iz: int, heights: Array[float]) -> Vector3:
	var grid_count := _segments + 1
	var idx := iz * grid_count + ix

	var h_l: float
	var h_r: float
	var h_d: float
	var h_u: float

	if ix > 0:
		h_l = heights[idx - 1]
	else:
		h_l = noise.get_terrain_height(origin_x + float(ix - 1) * _step, origin_z + float(iz) * _step)

	if ix < _segments:
		h_r = heights[idx + 1]
	else:
		h_r = noise.get_terrain_height(origin_x + float(ix + 1) * _step, origin_z + float(iz) * _step)

	if iz > 0:
		h_d = heights[idx - grid_count]
	else:
		h_d = noise.get_terrain_height(origin_x + float(ix) * _step, origin_z + float(iz - 1) * _step)

	if iz < _segments:
		h_u = heights[idx + grid_count]
	else:
		h_u = noise.get_terrain_height(origin_x + float(ix) * _step, origin_z + float(iz + 1) * _step)

	var dx := (h_r - h_l) / (2.0 * _step)
	var dz := (h_u - h_d) / (2.0 * _step)

	return Vector3(-dx, 1.0, -dz).normalized()


func _get_vertex_color(wx: float, wz: float, height: float) -> Color:
	# Shore zone
	if height < Config.SHORE_LEVEL:
		return Config.SHORE_COLOR

	# Snow zone (24m+, only on flat areas)
	if height > Config.SNOWLINE_START + 4.0:
		var slope: float = noise.get_terrain_slope(wx, wz)
		var flat_factor := _smoothstep(0.85, 0.6, slope)
		return Config.ALPINE_ROCK_COLOR.lerp(Config.SNOW_COLOR, flat_factor)

	# Alpine rock zone (20m+)
	if height > Config.ALPINE_START:
		var t := clampf((height - Config.ALPINE_START) / 4.0, 0.0, 1.0)
		return Config.TUSSOCK_COLOR.lerp(Config.ALPINE_ROCK_COLOR, t)

	# Treeline / tussock zone (16m+)
	if height > Config.TREELINE_START:
		var t := clampf((height - Config.TREELINE_START) / 4.0, 0.0, 1.0)
		return Config.SUBALPINE_COLOR.lerp(Config.TUSSOCK_COLOR, t)

	# Subalpine zone (10m+)
	if height > Config.SUBALPINE_START:
		var t := clampf((height - Config.SUBALPINE_START) / 6.0, 0.0, 1.0)
		var forest_top := _get_forest_green(height)
		return forest_top.lerp(Config.SUBALPINE_COLOR, t)

	# Forest zone: green gradient with dirt patches
	var base_color := _get_forest_green(height)

	# Dirt patches
	var dirt: float = noise.get_dirt_amount(wx, wz)
	var tree_d: float = noise.get_tree_density(wx, wz)
	if dirt > Config.GROUND_DIRT_THRESHOLD and tree_d > Config.TREE_DENSITY_THRESHOLD:
		var dirt_blend := clampf((dirt - Config.GROUND_DIRT_THRESHOLD) * 3.0, 0.0, 1.0)
		base_color = base_color.lerp(Config.GROUND_DIRT_COLOR, dirt_blend * 0.7)

	return base_color


func _get_forest_green(height: float) -> Color:
	var t := clampf((height - Config.SHORE_LEVEL) / (Config.SUBALPINE_START - Config.SHORE_LEVEL), 0.0, 1.0)
	if t < 0.5:
		return Config.GROUND_LOW_COLOR.lerp(Config.GROUND_MID_COLOR, t * 2.0)
	else:
		return Config.GROUND_MID_COLOR.lerp(Config.GROUND_HIGH_COLOR, (t - 0.5) * 2.0)


func _compute_tree_data(origin_x: float, origin_z: float) -> Array[Dictionary]:
	var trees: Array[Dictionary] = []
	var spacing := float(Config.TREE_GRID_SPACING)

	var grid_start_x := floorf(origin_x / spacing) * spacing
	var grid_start_z := floorf(origin_z / spacing) * spacing

	var x := grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var density: float = noise.get_tree_density(x, z)
			if density > Config.TREE_DENSITY_THRESHOLD:
				var jitter: Vector2 = noise.get_jitter(x, z) * Config.TREE_JITTER
				var fx := x + jitter.x
				var fz := z + jitter.y

				# Must be within this chunk
				if fx >= origin_x and fx < origin_x + _chunk_size and fz >= origin_z and fz < origin_z + _chunk_size:
					var height: float = noise.get_terrain_height(fx, fz)

					# Skip shore and above treeline
					if height >= Config.SHORE_LEVEL and height <= Config.TREELINE_START + 2.0:
						var tree_type := absi(int(floor(density * 30.0))) % 3
						var scale_t := (density - Config.TREE_DENSITY_THRESHOLD) / (1.0 - Config.TREE_DENSITY_THRESHOLD)
						var tree_scale: float = Config.TREE_MIN_HEIGHT + scale_t * (Config.TREE_MAX_HEIGHT - Config.TREE_MIN_HEIGHT)

						# Altitude adjustments
						if height > Config.SUBALPINE_START:
							var alt_scale := maxf(Config.TREELINE_SCALE_MIN, 1.0 - (height - Config.SUBALPINE_START) / 8.0)
							tree_type = 0  # pines only above subalpine
							tree_scale *= alt_scale

						trees.append({
							"position": Vector3(fx, height - 0.15, fz),
							"type": tree_type,
							"scale": tree_scale,
							"density": density
						})
			z += spacing
		x += spacing

	return trees


func _smoothstep(edge0: float, edge1: float, x: float) -> float:
	var t := clampf((x - edge0) / (edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
