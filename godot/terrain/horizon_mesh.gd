extends Node3D
## Generates a low-resolution terrain ring beyond the chunk system to show
## distant mountains and terrain features. Uses 3 LOD bands with decreasing
## detail at distance. A height floor rises with distance so terrain always
## forms distant mountains rather than dropping to ocean (island effect).

var _noise: RefCounted
var _mesh_instance: MeshInstance3D
var _material: ShaderMaterial
var _thread: Thread
var _mutex: Mutex
var _running := true
var _generating := false
var _pending_mesh: ArrayMesh
var _last_center := Vector3(INF, 0, INF)


func _ready() -> void:
	_mutex = Mutex.new()

	_material = ShaderMaterial.new()
	_material.shader = load("res://shaders/terrain.gdshader")

	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.material_override = _material
	_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mesh_instance)


func set_noise(noise_instance: RefCounted) -> void:
	_noise = noise_instance


func _exit_tree() -> void:
	_mutex.lock()
	_running = false
	_mutex.unlock()
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()


func update_position(player_pos: Vector3) -> void:
	if _noise == null:
		return

	var dx: float = player_pos.x - _last_center.x
	var dz: float = player_pos.z - _last_center.z
	if dx * dx + dz * dz < Config.HORIZON_RETRIGGER_DIST * Config.HORIZON_RETRIGGER_DIST:
		return

	# Don't queue if already generating
	if _generating:
		return

	# Clean up previous thread
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()

	_last_center = player_pos
	_generating = true
	_thread = Thread.new()
	_thread.start(_generate.bind(player_pos.x, player_pos.z))


func _process(_delta: float) -> void:
	# Apply completed mesh from thread
	_mutex.lock()
	var mesh: ArrayMesh = _pending_mesh
	_pending_mesh = null
	_mutex.unlock()

	if mesh != null:
		_mesh_instance.mesh = mesh


func _generate(center_x: float, center_z: float) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	# 3 LOD bands: near (full detail), mid (simplified), far (approx + height floor)
	_generate_band(st, center_x, center_z,
		Config.HORIZON_INNER_RADIUS, Config.HORIZON_MID_RADIUS,
		Config.HORIZON_NEAR_RING_STEPS, 0)  # LOD 0 = full
	_generate_band(st, center_x, center_z,
		Config.HORIZON_MID_RADIUS, Config.HORIZON_FAR_RADIUS,
		Config.HORIZON_MID_RING_STEPS, 1)  # LOD 1 = simplified
	_generate_band(st, center_x, center_z,
		Config.HORIZON_FAR_RADIUS, Config.HORIZON_OUTER_RADIUS,
		Config.HORIZON_FAR_RING_STEPS, 2)  # LOD 2 = approx + floor

	var mesh: ArrayMesh = st.commit()

	_mutex.lock()
	_pending_mesh = mesh
	_generating = false
	_mutex.unlock()


func _generate_band(st: SurfaceTool, center_x: float, center_z: float,
		inner_r: float, outer_r: float, ring_steps: int, lod: int) -> void:
	var radial_steps: int = Config.HORIZON_RADIAL_STEPS
	var step_r: float = (outer_r - inner_r) / float(ring_steps)

	var grid_count: int = (ring_steps + 1) * radial_steps
	var positions: Array[Vector3] = []
	var colors: Array[Color] = []
	positions.resize(grid_count)
	colors.resize(grid_count)

	for ri in ring_steps + 1:
		var r: float = inner_r + float(ri) * step_r
		for ai in radial_steps:
			var angle: float = float(ai) / float(radial_steps) * TAU
			var wx: float = center_x + cos(angle) * r
			var wz: float = center_z + sin(angle) * r

			var h: float
			if lod == 0:
				h = _noise.get_natural_terrain_height(wx, wz)
			elif lod == 1:
				h = _noise.get_terrain_height_approx(wx, wz)
				# Add mountain contribution at mid distance
				var mf: float = _noise.get_mountain_factor(wx, wz)
				h += mf * Config.MOUNTAIN_HEIGHT * 0.5
			else:
				h = _noise.get_terrain_height_approx(wx, wz)
				var mf: float = _noise.get_mountain_factor(wx, wz)
				h += mf * Config.MOUNTAIN_HEIGHT * 0.6

			# Distance-based height floor — prevents island appearance
			# Ramps up gently from mid radius, reaching full floor at outer radius
			var dist_from_center: float = r
			var floor_start: float = Config.HORIZON_MID_RADIUS
			var floor_t: float = clampf((dist_from_center - floor_start) / (Config.HORIZON_OUTER_RADIUS - floor_start), 0.0, 1.0)
			var height_floor: float = Config.HORIZON_DISTANT_FLOOR * floor_t * floor_t

			h = maxf(h, height_floor)

			var idx: int = ri * radial_steps + ai
			positions[idx] = Vector3(wx, h, wz)
			colors[idx] = _get_horizon_color(h)

	# Build quads between rings
	for ri in ring_steps:
		for ai in radial_steps:
			var ai_next: int = (ai + 1) % radial_steps
			var i00: int = ri * radial_steps + ai
			var i10: int = ri * radial_steps + ai_next
			var i01: int = (ri + 1) * radial_steps + ai
			var i11: int = (ri + 1) * radial_steps + ai_next

			var p00: Vector3 = positions[i00]
			var p10: Vector3 = positions[i10]
			var p01: Vector3 = positions[i01]
			var p11: Vector3 = positions[i11]

			var n1: Vector3 = (p10 - p00).cross(p01 - p00).normalized()
			var n2: Vector3 = (p11 - p10).cross(p01 - p10).normalized()
			if n1.y < 0:
				n1 = -n1
			if n2.y < 0:
				n2 = -n2

			st.set_color(colors[i00]); st.set_normal(n1); st.add_vertex(p00)
			st.set_color(colors[i10]); st.set_normal(n1); st.add_vertex(p10)
			st.set_color(colors[i01]); st.set_normal(n1); st.add_vertex(p01)

			st.set_color(colors[i10]); st.set_normal(n2); st.add_vertex(p10)
			st.set_color(colors[i11]); st.set_normal(n2); st.add_vertex(p11)
			st.set_color(colors[i01]); st.set_normal(n2); st.add_vertex(p01)


func _get_horizon_color(height: float) -> Color:
	# Simplified version of terrain vertex coloring for distant terrain
	if height <= Config.SHORE_LEVEL:
		return Config.SHORE_COLOR

	# Forest zone
	var t: float = clampf((height - Config.SHORE_LEVEL) / (Config.SUBALPINE_START - Config.SHORE_LEVEL), 0.0, 1.0)
	var base: Color
	if t < 0.5:
		base = Config.GROUND_LOW_COLOR.lerp(Config.GROUND_MID_COLOR, t * 2.0)
	else:
		base = Config.GROUND_MID_COLOR.lerp(Config.GROUND_HIGH_COLOR, (t - 0.5) * 2.0)

	# Subalpine
	var sub_t: float = _smoothstep(Config.SUBALPINE_START - 1.5, Config.SUBALPINE_START + 1.5, height)
	base = base.lerp(Config.SUBALPINE_COLOR, sub_t)

	# Tussock
	var tree_t: float = _smoothstep(Config.TREELINE_START - 1.5, Config.TREELINE_START + 1.5, height)
	base = base.lerp(Config.TUSSOCK_COLOR, tree_t)

	# Alpine rock
	var alp_t: float = _smoothstep(Config.ALPINE_START - 1.5, Config.ALPINE_START + 1.5, height)
	base = base.lerp(Config.ALPINE_ROCK_COLOR, alp_t)

	# Snow
	var snow_t: float = _smoothstep(Config.SNOWLINE_START, Config.SNOWLINE_START + 4.0, height)
	base = base.lerp(Config.SNOW_COLOR, snow_t)

	return base


func _smoothstep(edge0: float, edge1: float, x: float) -> float:
	var t: float = clampf((x - edge0) / (edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
