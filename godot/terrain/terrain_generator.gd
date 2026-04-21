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
## segments_override: pass Config.CHUNK_SEGMENTS_LOD for distant chunks.
## Returns { "mesh": ArrayMesh, "tree_data": Array[Dictionary], ... }
func generate_chunk(chunk_x: int, chunk_z: int, segments_override: int = -1) -> Dictionary:
	var segs := _segments if segments_override < 0 else segments_override
	var step := _chunk_size / float(segs)
	var origin_x := float(chunk_x) * _chunk_size
	var origin_z := float(chunk_z) * _chunk_size

	# Pre-compute cottage positions for clearing/ground-blend
	var cottage_positions := _get_nearby_cottage_positions(origin_x, origin_z)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var grid_count := segs + 1

	# Pre-compute heights and colors on grid
	var heights: Array[float] = []
	var colors: Array[Color] = []
	heights.resize(grid_count * grid_count)
	colors.resize(grid_count * grid_count)

	for iz in grid_count:
		for ix in grid_count:
			var wx := origin_x + float(ix) * step
			var wz := origin_z + float(iz) * step
			var idx := iz * grid_count + ix
			var h: float = noise.get_terrain_height(wx, wz)
			heights[idx] = h
			colors[idx] = _get_vertex_color(wx, wz, h, cottage_positions)

	# Edge height correction: snap all 4 edges to the coarsest LOD grid
	# so adjacent chunks at different LOD levels share identical edge geometry.
	var lod2_segs: int = Config.CHUNK_SEGMENTS_LOD2
	var lod2_step: float = _chunk_size / float(lod2_segs)

	# South edge (iz=0)
	var south_h: Array[float] = []
	south_h.resize(lod2_segs + 1)
	for i in lod2_segs + 1:
		south_h[i] = noise.get_terrain_height(origin_x + float(i) * lod2_step, origin_z)
	for ix in grid_count:
		var d: float = float(ix) * step
		var sf: float = d / lod2_step
		var si: int = mini(int(floor(sf)), lod2_segs - 1)
		var h: float = lerpf(south_h[si], south_h[si + 1], sf - float(si))
		heights[ix] = h
		colors[ix] = _get_vertex_color(origin_x + d, origin_z, h, cottage_positions)

	# North edge (iz=segs)
	var north_z: float = origin_z + _chunk_size
	var north_h: Array[float] = []
	north_h.resize(lod2_segs + 1)
	for i in lod2_segs + 1:
		north_h[i] = noise.get_terrain_height(origin_x + float(i) * lod2_step, north_z)
	for ix in grid_count:
		var idx_n: int = segs * grid_count + ix
		var d: float = float(ix) * step
		var sf: float = d / lod2_step
		var si: int = mini(int(floor(sf)), lod2_segs - 1)
		var h: float = lerpf(north_h[si], north_h[si + 1], sf - float(si))
		heights[idx_n] = h
		colors[idx_n] = _get_vertex_color(origin_x + d, north_z, h, cottage_positions)

	# West edge (ix=0)
	var west_h: Array[float] = []
	west_h.resize(lod2_segs + 1)
	for i in lod2_segs + 1:
		west_h[i] = noise.get_terrain_height(origin_x, origin_z + float(i) * lod2_step)
	for iz in grid_count:
		var idx_w: int = iz * grid_count
		var d: float = float(iz) * step
		var sf: float = d / lod2_step
		var si: int = mini(int(floor(sf)), lod2_segs - 1)
		var h: float = lerpf(west_h[si], west_h[si + 1], sf - float(si))
		heights[idx_w] = h
		colors[idx_w] = _get_vertex_color(origin_x, origin_z + d, h, cottage_positions)

	# East edge (ix=segs)
	var east_x: float = origin_x + _chunk_size
	var east_h: Array[float] = []
	east_h.resize(lod2_segs + 1)
	for i in lod2_segs + 1:
		east_h[i] = noise.get_terrain_height(east_x, origin_z + float(i) * lod2_step)
	for iz in grid_count:
		var idx_e: int = iz * grid_count + segs
		var d: float = float(iz) * step
		var sf: float = d / lod2_step
		var si: int = mini(int(floor(sf)), lod2_segs - 1)
		var h: float = lerpf(east_h[si], east_h[si + 1], sf - float(si))
		heights[idx_e] = h
		colors[idx_e] = _get_vertex_color(east_x, origin_z + d, h, cottage_positions)

	# Build triangles with normals
	for iz in segs:
		for ix in segs:
			var i00 := iz * grid_count + ix
			var i10 := i00 + 1
			var i01 := i00 + grid_count
			var i11 := i01 + 1

			var wx00 := origin_x + float(ix) * step
			var wz00 := origin_z + float(iz) * step

			var p00 := Vector3(wx00, heights[i00], wz00)
			var p10 := Vector3(wx00 + step, heights[i10], wz00)
			var p01 := Vector3(wx00, heights[i01], wz00 + step)
			var p11 := Vector3(wx00 + step, heights[i11], wz00 + step)

			var n00 := _calc_normal_ex(origin_x, origin_z, ix, iz, heights, grid_count, step)
			var n10 := _calc_normal_ex(origin_x, origin_z, ix + 1, iz, heights, grid_count, step)
			var n01 := _calc_normal_ex(origin_x, origin_z, ix, iz + 1, heights, grid_count, step)
			var n11 := _calc_normal_ex(origin_x, origin_z, ix + 1, iz + 1, heights, grid_count, step)

			# Triangle 1: 00, 10, 01 (CCW when viewed from above)
			st.set_color(colors[i00]); st.set_normal(n00); st.add_vertex(p00)
			st.set_color(colors[i10]); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(colors[i01]); st.set_normal(n01); st.add_vertex(p01)

			# Triangle 2: 10, 11, 01
			st.set_color(colors[i10]); st.set_normal(n10); st.add_vertex(p10)
			st.set_color(colors[i11]); st.set_normal(n11); st.add_vertex(p11)
			st.set_color(colors[i01]); st.set_normal(n01); st.add_vertex(p01)

	var mesh := st.commit()

	# Water surface mesh — polygons that conform to basin shapes
	var water_mesh := _generate_water_mesh(origin_x, origin_z, segs, step, heights)

	# Pre-compute LOD2 height grid for accurate object placement on mesh surface
	var lod2_grid := _compute_lod2_grid(origin_x, origin_z)

	# Tree placement data
	var tree_data := _compute_tree_data(origin_x, origin_z, lod2_grid)

	# Tussock placement data
	var tussock_data := _compute_tussock_data(origin_x, origin_z, lod2_grid)
	tree_data.append_array(tussock_data)

	# Vegetation placement data (pass tree_data for trunk proximity rejection)
	var veg_data := _compute_veg_data(origin_x, origin_z, tree_data, lod2_grid)

	# Cottage placement data
	var cottage_data := _compute_cottage_data(origin_x, origin_z)

	return { "mesh": mesh, "water_mesh": water_mesh, "tree_data": tree_data, "veg_data": veg_data, "cottage_data": cottage_data }


func _calc_normal(origin_x: float, origin_z: float, ix: int, iz: int, heights: Array[float]) -> Vector3:
	return _calc_normal_ex(origin_x, origin_z, ix, iz, heights, _segments + 1, _step)


func _calc_normal_ex(origin_x: float, origin_z: float, ix: int, iz: int, heights: Array[float], grid_count: int, step: float) -> Vector3:
	var segs := grid_count - 1
	var idx := iz * grid_count + ix

	var h_l: float
	var h_r: float
	var h_d: float
	var h_u: float

	if ix > 0:
		h_l = heights[idx - 1]
	else:
		h_l = noise.get_terrain_height(origin_x + float(ix - 1) * step, origin_z + float(iz) * step)

	if ix < segs:
		h_r = heights[idx + 1]
	else:
		h_r = noise.get_terrain_height(origin_x + float(ix + 1) * step, origin_z + float(iz) * step)

	if iz > 0:
		h_d = heights[idx - grid_count]
	else:
		h_d = noise.get_terrain_height(origin_x + float(ix) * step, origin_z + float(iz - 1) * step)

	if iz < segs:
		h_u = heights[idx + grid_count]
	else:
		h_u = noise.get_terrain_height(origin_x + float(ix) * step, origin_z + float(iz + 1) * step)

	var dx := (h_r - h_l) / (2.0 * step)
	var dz := (h_u - h_d) / (2.0 * step)

	return Vector3(-dx, 1.0, -dz).normalized()


## Noise-perturbed shore boundary per SPEC-02.
func _get_effective_shore(wx: float, wz: float) -> float:
	var n := sin(wx * 1.7 + wz * 0.9) * 0.5 + sin(wx * 0.5 - wz * 1.3) * 0.7 + sin(wx * 3.1 + wz * 2.3) * 0.25
	return Config.SHORE_LEVEL + n * 0.25


func _generate_water_mesh(origin_x: float, origin_z: float, segs: int,
		step: float, heights: Array[float]) -> ArrayMesh:
	var grid_count := segs + 1
	var overlap := 0.8  # meters — water extends past shore edge
	var wst := SurfaceTool.new()
	wst.begin(Mesh.PRIMITIVE_TRIANGLES)
	var has_water := false
	var water_normal := Vector3.UP

	# Coarser grid for water — reduces polycount and noise calls
	var water_step := 4
	if segs <= Config.CHUNK_SEGMENTS_LOD:
		water_step = 2
	if segs <= Config.CHUNK_SEGMENTS_LOD2:
		water_step = 1

	for iz in range(0, segs, water_step):
		for ix in range(0, segs, water_step):
			var ix1 := mini(ix + water_step, segs)
			var iz1 := mini(iz + water_step, segs)

			var wx00 := origin_x + float(ix) * step
			var wz00 := origin_z + float(iz) * step
			var wx11 := origin_x + float(ix1) * step
			var wz11 := origin_z + float(iz1) * step
			var wx_mid := (wx00 + wx11) * 0.5
			var wz_mid := (wz00 + wz11) * 0.5

			# Water in lake basins at any altitude
			var water_y: float = noise.get_local_water_level(wx_mid, wz_mid)
			var in_basin: bool = water_y > Config.WATER_LEVEL

			# Also render water where rivers exist
			var river_factor: float = noise.get_river_factor(wx_mid, wz_mid)

			var h00: float = heights[iz * grid_count + ix]
			var h10: float = heights[iz * grid_count + ix1]
			var h01: float = heights[iz1 * grid_count + ix]
			var h11: float = heights[iz1 * grid_count + ix1]
			var min_h := minf(minf(h00, h10), minf(h01, h11))
			var max_h := maxf(maxf(h00, h10), maxf(h01, h11))

			# Basin water: must be in a basin, terrain below water, and not too steep
			if in_basin and min_h < water_y and max_h - min_h < 3.0:
				has_water = true
				var p00 := Vector3(wx00, water_y, wz00)
				var p10 := Vector3(wx11, water_y, wz00)
				var p01 := Vector3(wx00, water_y, wz11)
				var p11 := Vector3(wx11, water_y, wz11)

				var wc := Config.WATER_COLOR
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p00)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p10)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p01)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p10)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p11)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p01)

			# For rivers: emit water at terrain height (rivers carve into terrain)
			elif river_factor > 0.3:
				has_water = true
				# River water sits at the carved terrain surface
				var rh := (h00 + h10 + h01 + h11) * 0.25 + 0.05
				var p00 := Vector3(wx00, rh, wz00)
				var p10 := Vector3(wx11, rh, wz00)
				var p01 := Vector3(wx00, rh, wz11)
				var p11 := Vector3(wx11, rh, wz11)

				var wc := Config.WATER_COLOR
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p00)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p10)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p01)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p10)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p11)
				wst.set_color(wc); wst.set_normal(water_normal); wst.add_vertex(p01)

	if not has_water:
		return ArrayMesh.new()
	return wst.commit()


func _get_vertex_color(wx: float, wz: float, height: float, cottage_positions: Array[Vector3] = []) -> Color:
	# 1. Effective shore level (noise-perturbed)
	var eff_shore := _get_effective_shore(wx, wz)

	# Shore zone
	if height < eff_shore:
		return Config.SHORE_COLOR

	# 2. Shore-to-grass blend (smoothstep)
	var grass_blend := _smoothstep(eff_shore, eff_shore + 0.5, height)

	# 3. Forest green gradient with dirt patches
	var base_color := _get_forest_green(height)

	# Dirt patches
	var dirt: float = noise.get_dirt_amount(wx, wz)
	var tree_d: float = noise.get_tree_density(wx, wz)
	if tree_d > Config.TREE_DENSITY_THRESHOLD:
		# Dense canopy always creates some dirt; dirt noise adds more
		var canopy_factor := clampf((tree_d - Config.TREE_DENSITY_THRESHOLD) * 2.5, 0.0, 1.0)
		var dirt_factor := 0.0
		if dirt > Config.GROUND_DIRT_THRESHOLD:
			dirt_factor = clampf((dirt - Config.GROUND_DIRT_THRESHOLD) * 2.0, 0.0, 1.0)
		# Base dirt from canopy shade + extra from dirt noise
		var total_dirt := clampf(canopy_factor * 0.6 + dirt_factor * 0.4, 0.0, 1.0)
		# Use darker dirt under dense canopy
		var dirt_col: Color = Config.GROUND_DIRT_COLOR.lerp(Config.GROUND_DIRT_DARK, canopy_factor * 0.7)
		base_color = base_color.lerp(dirt_col, total_dirt * 0.95)

	# Blend shore to grass
	var color := Config.SHORE_COLOR.lerp(base_color, grass_blend)

	# 4. Zone-noise-offset boundaries
	var zone_offset: float = noise.get_zone_noise(wx, wz)

	var subalpine_boundary := Config.SUBALPINE_START + zone_offset
	var treeline_boundary := Config.TREELINE_START + zone_offset
	var alpine_boundary := Config.ALPINE_START + zone_offset
	var snowline_boundary := Config.SNOWLINE_START + zone_offset

	# 5. Smooth blends between zones using smoothstep
	# Subalpine blend
	var subalpine_blend := _smoothstep(subalpine_boundary - 1.5, subalpine_boundary + 1.5, height)
	color = color.lerp(Config.SUBALPINE_COLOR, subalpine_blend * grass_blend)

	# Treeline/tussock blend
	var treeline_blend := _smoothstep(treeline_boundary - 1.5, treeline_boundary + 1.5, height)
	color = color.lerp(Config.TUSSOCK_COLOR, treeline_blend * grass_blend)

	# Alpine rock blend
	var alpine_blend := _smoothstep(alpine_boundary - 1.5, alpine_boundary + 1.5, height)
	color = color.lerp(Config.ALPINE_ROCK_COLOR, alpine_blend * grass_blend)

	# 6. Snow with slope-aware accumulation
	var snow_blend := _smoothstep(snowline_boundary, snowline_boundary + 4.0, height)
	var slope: float = noise.get_terrain_slope(wx, wz)
	var slope_normal_y := 1.0 / sqrt(1.0 + slope * slope)
	var flat_factor := _smoothstep(0.38, 0.95, slope_normal_y)
	snow_blend *= flat_factor
	color = color.lerp(Config.SNOW_COLOR, snow_blend * grass_blend)

	# 7. Steep slope rock exposure (suppressed by snow and shore)
	var steep_factor := 1.0 - _smoothstep(0.45, 0.93, slope_normal_y)
	steep_factor *= grass_blend  # reduce on shore
	steep_factor *= (1.0 - snow_blend)  # snow takes precedence
	color = color.lerp(Config.STEEP_ROCK_COLOR, steep_factor)

	# 8. River-bed coloring
	var river_factor: float = noise.get_river_factor(wx, wz)
	if river_factor > 0.1:
		var river_blend := _smoothstep(0.1, 0.5, river_factor)
		color = color.lerp(Config.SHORE_COLOR, river_blend)

	# 8b. Highland lake shore coloring
	var local_water: float = noise.get_local_water_level(wx, wz)
	if local_water > Config.WATER_LEVEL and height < local_water + 0.5 and height >= local_water - 0.2:
		var shore_t := 1.0 - clampf((height - local_water) / 0.5, 0.0, 1.0)
		color = color.lerp(Config.SHORE_COLOR, shore_t * 0.7)

	# 9. Garden soil blend near cottages
	if not cottage_positions.is_empty():
		var blend_radius := Config.COTTAGE_CLEARING_RADIUS * 1.5
		var d := _dist_to_nearest_cottage(wx, wz, cottage_positions)
		if d < blend_radius:
			var t := d / blend_radius
			var factor := 1.0 - t * t * (3.0 - 2.0 * t)
			color = color.lerp(Config.COTTAGE_GARDEN_COLOR, factor * grass_blend)

	return color


func _get_forest_green(height: float) -> Color:
	var t := clampf((height - Config.SHORE_LEVEL) / (Config.SUBALPINE_START - Config.SHORE_LEVEL), 0.0, 1.0)
	if t < 0.5:
		return Config.GROUND_LOW_COLOR.lerp(Config.GROUND_MID_COLOR, t * 2.0)
	else:
		return Config.GROUND_MID_COLOR.lerp(Config.GROUND_HIGH_COLOR, (t - 0.5) * 2.0)


func _compute_tree_data(origin_x: float, origin_z: float, lod2_grid: Array[float] = []) -> Array[Dictionary]:
	var trees: Array[Dictionary] = []
	var spacing := float(Config.TREE_GRID_SPACING)
	var cottage_positions := _get_nearby_cottage_positions(origin_x, origin_z)

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
					# Skip trees in river channels
					if noise.get_river_factor(fx, fz) > 0.3:
						z += spacing
						continue
					# Skip trees near cottages (clearing effect)
					if _is_near_cottage(fx, fz, cottage_positions, Config.COTTAGE_CLEARING_RADIUS):
						z += spacing
						continue

					var height: float = noise.get_terrain_height(fx, fz)

					# Skip steep slopes — trees can't grow on cliffs
					if noise.get_terrain_slope(fx, fz) > 0.7:
						z += spacing
						continue

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

						var place_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, fx, fz) if not lod2_grid.is_empty() else height
						trees.append({
							"position": Vector3(fx, place_y - 0.15, fz),
							"type": tree_type,
							"scale": tree_scale,
							"density": density
						})
			z += spacing
		x += spacing

	return trees


func _compute_tussock_data(origin_x: float, origin_z: float, lod2_grid: Array[float] = []) -> Array[Dictionary]:
	var tussocks: Array[Dictionary] = []
	var spacing := 2.0  # denser than trees
	var cottage_positions := _get_nearby_cottage_positions(origin_x, origin_z)

	var grid_start_x := floorf(origin_x / spacing) * spacing
	var grid_start_z := floorf(origin_z / spacing) * spacing

	var x := grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			# Hash-based rejection for randomness
			var hash_val := fmod(abs(x * 127.1 + z * 311.7), 1.0)
			if hash_val > 0.35:
				z += spacing
				continue

			var jitter: Vector2 = noise.get_jitter(x, z) * 0.8
			var fx := x + jitter.x
			var fz := z + jitter.y

			# Must be within this chunk
			if fx >= origin_x and fx < origin_x + _chunk_size and fz >= origin_z and fz < origin_z + _chunk_size:
				# Skip tussocks in river channels
				if noise.get_river_factor(fx, fz) > 0.3:
					z += spacing
					continue
				var height: float = noise.get_terrain_height(fx, fz)

				# Skip steep slopes
				if noise.get_terrain_slope(fx, fz) > 0.7:
					z += spacing
					continue

				# Altitude zone: SUBALPINE_START+2 to ALPINE_START
				var min_alt := Config.SUBALPINE_START + 2.0
				var max_alt := Config.ALPINE_START
				if height >= min_alt and height <= max_alt:
					# Density peaks at TREELINE_START, tapers at edges
					var density_t: float
					if height < Config.TREELINE_START:
						density_t = _smoothstep(min_alt, Config.TREELINE_START, height)
					else:
						density_t = 1.0 - _smoothstep(Config.TREELINE_START, max_alt, height)

					# Additional hash-based density thinning
					var hash2 := fmod(abs(x * 73.13 + z * 37.17), 1.0)
					if hash2 < density_t * 0.6:
						# Scale from hash
						var scale_hash := fmod(abs(x * 91.31 + z * 43.37), 1.0)
						var tussock_scale := lerpf(0.5, 2.0, scale_hash)

						var tus_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, fx, fz) if not lod2_grid.is_empty() else height
						tussocks.append({
							"position": Vector3(fx, tus_y - 0.05, fz),
							"type": 3,  # TUSSOCK
							"scale": tussock_scale,
							"density": density_t
						})

			z += spacing
		x += spacing

	return tussocks


func _compute_veg_data(origin_x: float, origin_z: float, tree_data: Array[Dictionary] = [], lod2_grid: Array[float] = []) -> Array[Dictionary]:
	var veg: Array[Dictionary] = []
	var cottage_positions := _get_nearby_cottage_positions(origin_x, origin_z)

	# Build list of tree trunk XZ positions for proximity rejection
	var trunk_positions: Array[Vector2] = []
	for tree in tree_data:
		var p: Vector3 = tree["position"]
		trunk_positions.append(Vector2(p.x, p.z))

	# --- Grass, ferns via fine grid (VEG_GRID_SPACING = 1.3m) ---
	var spacing := float(Config.VEG_GRID_SPACING)
	var grid_start_x := floorf(origin_x / spacing) * spacing
	var grid_start_z := floorf(origin_z / spacing) * spacing

	var x := grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var veg_d: float = noise.get_veg_density(x, z)
			var tree_d: float = noise.get_tree_density(x, z)
			var height: float = noise.get_terrain_height(x, z)
			var eff_shore := _get_effective_shore(x, z)

			# Skip shore and snow
			if height < eff_shore or height > Config.SNOWLINE_START:
				z += spacing
				continue

			# Skip steep slopes
			if noise.get_terrain_slope(x, z) > 0.7:
				z += spacing
				continue

			# Skip vegetation near cottages (clearing effect)
			if _is_near_cottage(x, z, cottage_positions, Config.COTTAGE_CLEARING_RADIUS):
				z += spacing
				continue

			# Skip vegetation in river channels
			if noise.get_river_factor(x, z) > 0.3:
				z += spacing
				continue

			# Skip vegetation too close to tree trunks
			if _is_near_trunk(x, z, trunk_positions, Config.TREE_COLLISION_RADIUS * 3.0):
				z += spacing
				continue

			# --- Grass ---
			if veg_d > Config.VEG_DENSITY_THRESHOLD and height < Config.TREELINE_START + 2.0:
				# Not under dense canopy
				if tree_d < 0.3 or veg_d > 0.3:
					# 2-4 nearby clumps
					var clump_hash := fmod(abs(x * 127.1 + z * 311.7), 1.0)
					var clump_count := 2 + int(clump_hash * 3.0)
					for ci in clump_count:
						var cx := x + sin(ci * 2.4 + x * 0.7) * 0.3
						var cz := z + cos(ci * 3.1 + z * 0.9) * 0.3
						if cx >= origin_x and cx < origin_x + _chunk_size and cz >= origin_z and cz < origin_z + _chunk_size:
							var ch: float = noise.get_terrain_height(cx, cz)
							if ch >= eff_shore:
								var gs := Config.VEG_GRASS_SCALE * (0.5 + veg_d * 0.8)
								var grass_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, cx, cz) if not lod2_grid.is_empty() else ch
								veg.append({
									"position": Vector3(cx, grass_y - 0.02, cz),
									"type": 0,  # GRASS_TUFT
									"scale": gs,
									"rotation": fmod(abs(cx * 73.13 + cz * 37.17), TAU),
									"color_idx": 0,
									"length": 0.0,
									"radius": 0.0,
								})

			# --- Ferns --- prefer shaded understory
			if veg_d > 0.15 and tree_d > 0.2 and height < Config.SUBALPINE_START:
				var fern_hash := fmod(abs(x * 91.31 + z * 43.37), 1.0)
				var fern_variant: int
				if fern_hash < 0.4:
					fern_variant = 1  # FERN_COMPACT
				elif fern_hash < 0.75:
					fern_variant = 2  # FERN_SPREADING
				else:
					fern_variant = 3  # FERN_TALL
				var jitter: Vector2 = noise.get_jitter(x, z) * 0.4
				var fx := x + jitter.x
				var fz := z + jitter.y
				if fx >= origin_x and fx < origin_x + _chunk_size and fz >= origin_z and fz < origin_z + _chunk_size:
					var fh: float = noise.get_terrain_height(fx, fz)
					if fh >= eff_shore:
						var fern_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, fx, fz) if not lod2_grid.is_empty() else fh
						veg.append({
							"position": Vector3(fx, fern_y - 0.02, fz),
							"type": fern_variant,
							"scale": Config.VEG_FERN_SCALE * (0.6 + fern_hash * 0.6),
							"rotation": fmod(abs(fx * 53.7 + fz * 29.3), TAU),
							"color_idx": 0,
							"length": 0.0,
							"radius": 0.0,
						})

			z += spacing
		x += spacing

	# --- Flowers via 2.0m grid ---
	var flower_spacing := Config.FLOWER_GRID_SPACING
	grid_start_x = floorf(origin_x / flower_spacing) * flower_spacing
	grid_start_z = floorf(origin_z / flower_spacing) * flower_spacing

	x = grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var veg_d: float = noise.get_veg_density(x, z)
			# Garden flowers near cottages: reduced threshold within 15m
			var flower_threshold := Config.FLOWER_DENSITY_THRESHOLD
			var cottage_dist := _dist_to_nearest_cottage(x, z, cottage_positions)
			if cottage_dist < Config.COTTAGE_CLEARING_RADIUS * 1.5 and cottage_dist > Config.COTTAGE_CLEARING_RADIUS:
				flower_threshold = Config.FLOWER_DENSITY_THRESHOLD - 0.5
			elif cottage_dist <= Config.COTTAGE_CLEARING_RADIUS:
				z += flower_spacing
				continue  # Inside clearing, no flowers
			if veg_d > flower_threshold:
				if noise.get_river_factor(x, z) > 0.3:
					z += flower_spacing
					continue
				if noise.get_terrain_slope(x, z) > 0.7:
					z += flower_spacing
					continue
				var height: float = noise.get_terrain_height(x, z)
				var eff_shore := _get_effective_shore(x, z)
				if height >= eff_shore and height < Config.TREELINE_START:
					var f_hash := fmod(abs(x * 43.37 + z * 91.31), 1.0)
					var variant: int = 4 + int(f_hash * 3.0) % 3  # FLOWER_5P/4P/6P
					var color_hash := fmod(abs(x * 17.3 + z * 71.9), 1.0)
					var color_idx := int(color_hash * 6.0) % 6
					# Cluster 3-5 nearby
					var cluster_count := 3 + int(fmod(abs(x * 31.7 + z * 59.1), 1.0) * 3.0)
					for ci in cluster_count:
						var cx := x + sin(ci * 1.8 + x * 0.5) * 0.6
						var cz := z + cos(ci * 2.3 + z * 0.7) * 0.6
						if cx >= origin_x and cx < origin_x + _chunk_size and cz >= origin_z and cz < origin_z + _chunk_size:
							var ch: float = noise.get_terrain_height(cx, cz)
							if ch >= eff_shore:
								var flw_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, cx, cz) if not lod2_grid.is_empty() else ch
								veg.append({
									"position": Vector3(cx, flw_y - 0.01, cz),
									"type": variant,
									"scale": Config.FLOWER_SCALE * (0.7 + f_hash * 0.5),
									"rotation": fmod(abs(cx * 61.3 + cz * 43.7), TAU),
									"color_idx": color_idx,
									"length": 0.0,
									"radius": 0.0,
								})
			z += flower_spacing
		x += flower_spacing

	# --- Rocks via 5.0m grid ---
	var rock_spacing := float(Config.ROCK_GRID_SPACING)
	grid_start_x = floorf(origin_x / rock_spacing) * rock_spacing
	grid_start_z = floorf(origin_z / rock_spacing) * rock_spacing

	x = grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var rock_d: float = noise.get_rock_density(x, z)
			if rock_d > Config.ROCK_DENSITY_THRESHOLD:
				if noise.get_river_factor(x, z) > 0.3:
					z += rock_spacing
					continue
				var height: float = noise.get_terrain_height(x, z)
				var eff_shore := _get_effective_shore(x, z)
				if height >= eff_shore:
					var jitter: Vector2 = noise.get_jitter(x, z) * 1.5
					var rx := x + jitter.x
					var rz := z + jitter.y
					if rx >= origin_x and rx < origin_x + _chunk_size and rz >= origin_z and rz < origin_z + _chunk_size:
						var rh: float = noise.get_terrain_height(rx, rz)
						if rh >= eff_shore:
							var r_hash := fmod(abs(x * 37.17 + z * 73.13), 1.0)
							# Denser at altitude: bias toward larger rocks
							var alt_bias := clampf((rh - Config.SUBALPINE_START) / 10.0, 0.0, 0.5)
							var size_val := r_hash + alt_bias
							var rock_type: int
							if size_val < 0.5:
								rock_type = 7  # ROCK_SMALL
							elif size_val < 0.85:
								rock_type = 8  # ROCK_MEDIUM
							else:
								rock_type = 9  # ROCK_LARGE
							var embed := 0.08 if rock_type == 7 else (0.15 if rock_type == 8 else 0.25)
							var rock_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, rx, rz) if not lod2_grid.is_empty() else rh
							veg.append({
								"position": Vector3(rx, rock_y - embed, rz),
								"type": rock_type,
								"scale": Config.VEG_ROCK_SCALE * (0.7 + r_hash * 0.6),
								"rotation": fmod(abs(rx * 91.31 + rz * 43.37), TAU),
								"color_idx": 0,
								"length": 0.0,
								"radius": 0.0,
							})
			z += rock_spacing
		x += rock_spacing

	# --- Logs / Stumps via 8.0m grid ---
	var log_spacing := float(Config.LOG_GRID_SPACING)
	grid_start_x = floorf(origin_x / log_spacing) * log_spacing
	grid_start_z = floorf(origin_z / log_spacing) * log_spacing

	x = grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var log_d: float = noise.get_log_density(x, z)
			var tree_d: float = noise.get_tree_density(x, z)
			if log_d > Config.LOG_DENSITY_THRESHOLD and tree_d > 0.15:
				if noise.get_river_factor(x, z) > 0.3:
					z += log_spacing
					continue
				if noise.get_terrain_slope(x, z) > 0.7:
					z += log_spacing
					continue
				var height: float = noise.get_terrain_height(x, z)
				var eff_shore := _get_effective_shore(x, z)
				if height >= eff_shore and height < Config.TREELINE_START:
					var jitter: Vector2 = noise.get_jitter(x, z) * Config.LOG_JITTER
					var lx := x + jitter.x
					var lz := z + jitter.y
					if lx >= origin_x and lx < origin_x + _chunk_size and lz >= origin_z and lz < origin_z + _chunk_size:
						var lh: float = noise.get_terrain_height(lx, lz)
						if lh >= eff_shore:
							var l_hash := fmod(abs(x * 59.1 + z * 31.7), 1.0)
							var angle := fmod(abs(lx * 43.37 + lz * 91.31), TAU)
							var log_mesh_y: float = _sample_mesh_height(lod2_grid, origin_x, origin_z, lx, lz) if not lod2_grid.is_empty() else lh
							if l_hash < 0.6:
								# Fallen log
								var log_len := lerpf(Config.LOG_MIN_LENGTH, Config.LOG_MAX_LENGTH, fmod(abs(x * 17.3 + z * 71.9), 1.0))
								var log_rad := lerpf(Config.LOG_RADIUS_MIN, Config.LOG_RADIUS_MAX, fmod(abs(x * 71.9 + z * 17.3), 1.0))
								veg.append({
									"position": Vector3(lx, log_mesh_y - log_rad * 0.3, lz),
									"type": 10,  # FALLEN_LOG
									"scale": 1.0,
									"rotation": angle,
									"color_idx": 0,
									"length": log_len,
									"radius": log_rad,
								})
							else:
								# Stump
								var stump_r := lerpf(Config.STUMP_RADIUS_MIN, Config.STUMP_RADIUS_MAX, fmod(abs(x * 29.3 + z * 53.7), 1.0))
								var stump_h := lerpf(Config.STUMP_HEIGHT_MIN, Config.STUMP_HEIGHT_MAX, fmod(abs(x * 53.7 + z * 29.3), 1.0))
								veg.append({
									"position": Vector3(lx, log_mesh_y - 0.03, lz),
									"type": 11,  # STUMP
									"scale": 1.0,
									"rotation": angle,
									"color_idx": 0,
									"length": stump_h,
									"radius": stump_r,
								})
			z += log_spacing
		x += log_spacing

	return veg


func _compute_cottage_data(origin_x: float, origin_z: float) -> Array[Dictionary]:
	var cottages: Array[Dictionary] = []
	var spacing := float(Config.COTTAGE_GRID_SPACING)

	var grid_start_x := floorf(origin_x / spacing) * spacing
	var grid_start_z := floorf(origin_z / spacing) * spacing

	var x := grid_start_x
	while x < origin_x + _chunk_size:
		var z := grid_start_z
		while z < origin_z + _chunk_size:
			var density: float = noise.get_cottage_density(x, z)
			if density > Config.COTTAGE_DENSITY_THRESHOLD:
				# Jitter
				var jx := x + sin(x * 127.1 + z * 311.7 + 700.0) * Config.COTTAGE_JITTER
				var jz := z + cos(x * 311.7 + z * 127.1 + 700.0) * Config.COTTAGE_JITTER

				# Must be within this chunk
				if jx >= origin_x and jx < origin_x + _chunk_size and jz >= origin_z and jz < origin_z + _chunk_size:
					# Skip cottages in river channels
					if noise.get_river_factor(jx, jz) > 0.3:
						z += spacing
						continue
					var height: float = noise.get_terrain_height(jx, jz)
					var eff_shore := _get_effective_shore(jx, jz)

					# Altitude constraints: above shore+1, below subalpine, above water+0.5
					if height >= eff_shore + 1.0 and height < Config.SUBALPINE_START and height > Config.WATER_LEVEL + 0.5:
						# Slope check: 3x3 grid at 2.5m radius
						var max_slope := 0.0
						var min_h := height
						var max_h := height
						for sx in range(-1, 2):
							for sz in range(-1, 2):
								if sx == 0 and sz == 0:
									continue
								var sh: float = noise.get_terrain_height(jx + float(sx) * 2.5, jz + float(sz) * 2.5)
								var slope_val := absf(sh - height) / 2.5
								max_slope = maxf(max_slope, slope_val)
								min_h = minf(min_h, sh)
								max_h = maxf(max_h, sh)

						if max_slope <= Config.COTTAGE_MAX_SLOPE and (max_h - min_h) <= 0.6:
							# Use lowest footprint Y to prevent floating
							var cottage_seed := absi(int(floor(jx * 127.1 + jz * 311.7)))
							var rotation := fmod(abs(jx * 73.13 + jz * 37.17), TAU)
							cottages.append({
								"position": Vector3(jx, min_h, jz),
								"seed": cottage_seed,
								"rotation": rotation,
							})
			z += spacing
		x += spacing

	return cottages


func _get_nearby_cottage_positions(origin_x: float, origin_z: float) -> Array[Vector3]:
	var positions: Array[Vector3] = []
	var spacing := float(Config.COTTAGE_GRID_SPACING)
	var margin := spacing  # one grid cell margin

	var grid_start_x := floorf((origin_x - margin) / spacing) * spacing
	var grid_start_z := floorf((origin_z - margin) / spacing) * spacing
	var end_x := origin_x + _chunk_size + margin
	var end_z := origin_z + _chunk_size + margin

	var x := grid_start_x
	while x < end_x:
		var z := grid_start_z
		while z < end_z:
			var density: float = noise.get_cottage_density(x, z)
			if density > Config.COTTAGE_DENSITY_THRESHOLD:
				var jx := x + sin(x * 127.1 + z * 311.7 + 700.0) * Config.COTTAGE_JITTER
				var jz := z + cos(x * 311.7 + z * 127.1 + 700.0) * Config.COTTAGE_JITTER

				var height: float = noise.get_terrain_height(jx, jz)
				var eff_shore := _get_effective_shore(jx, jz)

				if height >= eff_shore + 1.0 and height < Config.SUBALPINE_START and height > Config.WATER_LEVEL + 0.5:
					var max_slope := 0.0
					var min_h := height
					var max_h := height
					for sx in range(-1, 2):
						for sz in range(-1, 2):
							if sx == 0 and sz == 0:
								continue
							var sh: float = noise.get_terrain_height(jx + float(sx) * 2.5, jz + float(sz) * 2.5)
							max_slope = maxf(max_slope, absf(sh - height) / 2.5)
							min_h = minf(min_h, sh)
							max_h = maxf(max_h, sh)

					if max_slope <= Config.COTTAGE_MAX_SLOPE and (max_h - min_h) <= 0.6:
						positions.append(Vector3(jx, min_h, jz))
			z += spacing
		x += spacing

	return positions


func _is_near_trunk(px: float, pz: float, trunk_positions: Array[Vector2], radius: float) -> bool:
	var r2 := radius * radius
	for tp in trunk_positions:
		var dx := px - tp.x
		var dz := pz - tp.y
		if dx * dx + dz * dz < r2:
			return true
	return false


func _is_near_cottage(px: float, pz: float, cottage_positions: Array[Vector3], radius: float) -> bool:
	for cpos in cottage_positions:
		var dx := px - cpos.x
		var dz := pz - cpos.z
		if dx * dx + dz * dz < radius * radius:
			return true
	return false


func _dist_to_nearest_cottage(px: float, pz: float, cottage_positions: Array[Vector3]) -> float:
	var min_dist := 9999.0
	for cpos in cottage_positions:
		var dx := px - cpos.x
		var dz := pz - cpos.z
		var d := sqrt(dx * dx + dz * dz)
		min_dist = minf(min_dist, d)
	return min_dist


## Pre-compute the LOD2 height grid for a chunk (16x16 = 256 heights).
## Used for placing objects at the actual mesh surface height.
func _compute_lod2_grid(origin_x: float, origin_z: float) -> Array[float]:
	var lod2_segs: int = Config.CHUNK_SEGMENTS_LOD2
	var lod2_step: float = _chunk_size / float(lod2_segs)
	var grid_size: int = lod2_segs + 1
	var grid: Array[float] = []
	grid.resize(grid_size * grid_size)
	for iz in grid_size:
		for ix in grid_size:
			var wx: float = origin_x + float(ix) * lod2_step
			var wz: float = origin_z + float(iz) * lod2_step
			grid[iz * grid_size + ix] = noise.get_terrain_height(wx, wz)
	return grid


## Sample the placement height for objects. Returns the lower of the noise
## height and the LOD2 bilinear-interpolated height. On convex terrain (ridges)
## the noise value is lower; on concave terrain (valleys) the LOD2 interpolation
## is lower. Taking the minimum ensures objects never float at any LOD level.
func _sample_mesh_height(lod2_grid: Array[float], origin_x: float, origin_z: float, wx: float, wz: float) -> float:
	var lod2_segs: int = Config.CHUNK_SEGMENTS_LOD2
	var lod2_step: float = _chunk_size / float(lod2_segs)
	var grid_size: int = lod2_segs + 1
	var lx: float = (wx - origin_x) / lod2_step
	var lz: float = (wz - origin_z) / lod2_step
	var ix: int = clampi(int(floor(lx)), 0, lod2_segs - 1)
	var iz: int = clampi(int(floor(lz)), 0, lod2_segs - 1)
	var fx: float = lx - float(ix)
	var fz: float = lz - float(iz)
	var i00: int = iz * grid_size + ix
	var lod2_h: float = lerpf(
		lerpf(lod2_grid[i00], lod2_grid[i00 + 1], fx),
		lerpf(lod2_grid[i00 + grid_size], lod2_grid[i00 + grid_size + 1], fx),
		fz
	)
	var noise_h: float = noise.get_terrain_height(wx, wz)
	return minf(lod2_h, noise_h)


func _smoothstep(edge0: float, edge1: float, x: float) -> float:
	var t := clampf((x - edge0) / (edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
