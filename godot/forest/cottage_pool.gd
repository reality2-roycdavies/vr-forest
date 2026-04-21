extends Node3D
## Renders cottages as individual MeshInstance3D nodes with smoke particles and window glow.

const CottageFactoryScript = preload("res://forest/cottage_factory.gd")

var _factory: RefCounted
var _cottage_material: ShaderMaterial
var _window_material: ShaderMaterial
var _smoke_material: ShaderMaterial
var _smoke_mmi: MultiMeshInstance3D
var _smoke_mesh: ArrayMesh

# Chimney data for smoke particles
var _chimney_positions: Array[Vector3] = []

# Smoke particle state (flat arrays for performance)
var _smoke_ages: PackedFloat32Array
var _smoke_speed_muls: PackedFloat32Array
var _smoke_size_muls: PackedFloat32Array
var _smoke_offsets: PackedFloat32Array  # XZ drift offsets per particle


func _ready() -> void:
	_factory = CottageFactoryScript.new()

	# Main cottage shader
	_cottage_material = ShaderMaterial.new()
	_cottage_material.shader = load("res://shaders/cottage.gdshader")

	# Window glow shader
	_window_material = ShaderMaterial.new()
	_window_material.shader = load("res://shaders/window_glow.gdshader")

	# Smoke shader
	_smoke_material = ShaderMaterial.new()
	_smoke_material.shader = load("res://shaders/smoke.gdshader")

	# Smoke billboard quad mesh
	_smoke_mesh = _create_smoke_quad()

	# Smoke MultiMeshInstance3D
	_smoke_mmi = MultiMeshInstance3D.new()
	_smoke_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_smoke_mmi.material_override = _smoke_material
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.use_colors = false
	mm.instance_count = 0
	mm.mesh = _smoke_mesh
	_smoke_mmi.multimesh = mm
	add_child(_smoke_mmi)


func rebuild(cottage_data: Array[Dictionary]) -> void:
	# Remove old cottage meshes (but keep smoke MMI)
	for child in get_children():
		if child != _smoke_mmi:
			child.queue_free()

	# Cap at max count, keep nearest to origin
	var data := cottage_data.duplicate()
	if data.size() > Config.COTTAGE_MAX_COUNT:
		data.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			var pa: Vector3 = a["position"]
			var pb: Vector3 = b["position"]
			return pa.length_squared() < pb.length_squared()
		)
		data.resize(Config.COTTAGE_MAX_COUNT)

	_chimney_positions.clear()

	for cottage in data:
		var pos: Vector3 = cottage["position"]
		var seed_val: int = cottage["seed"]
		var rot: float = cottage["rotation"]

		var result: Dictionary = _factory.generate(seed_val)
		var main_mesh: ArrayMesh = result["main_mesh"]
		var window_mesh: ArrayMesh = result["window_mesh"]
		var chimney_top: Vector3 = result["chimney_top"]

		# Main body
		var main_mmi := MeshInstance3D.new()
		main_mmi.mesh = main_mesh
		main_mmi.material_override = _cottage_material
		main_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		var basis := Basis(Vector3.UP, rot)
		main_mmi.transform = Transform3D(basis, pos)
		add_child(main_mmi)

		# Windows (separate mesh for glow shader)
		if window_mesh.get_surface_count() > 0:
			var win_mmi := MeshInstance3D.new()
			win_mmi.mesh = window_mesh
			win_mmi.material_override = _window_material
			win_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			win_mmi.transform = Transform3D(basis, pos)
			add_child(win_mmi)

		# World-space chimney position
		var world_chimney := pos + basis * chimney_top
		_chimney_positions.append(world_chimney)

	# Rebuild smoke particles
	_init_smoke_particles()


func update(sun_elevation: float, delta: float) -> void:
	# Window glow
	var glow_factor := clampf((0.05 - sun_elevation) / 0.15, 0.0, 1.0)
	_window_material.set_shader_parameter("glow_factor", glow_factor)

	# Smoke particles
	_update_smoke(sun_elevation, delta)


# =========================================================================
# Smoke system
# =========================================================================

func _create_smoke_quad() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var s := 0.5  # half-size, scaled by instance transform
	var n := Vector3(0, 0, 1)
	var c := Config.SMOKE_COLOR

	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(-s, -s, 0))
	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(s, -s, 0))
	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(-s, s, 0))

	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(s, -s, 0))
	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(s, s, 0))
	st.set_color(c); st.set_normal(n); st.add_vertex(Vector3(-s, s, 0))

	return st.commit()


func _init_smoke_particles() -> void:
	var cottage_count := _chimney_positions.size()
	var particles_per := Config.SMOKE_PARTICLES_PER_COTTAGE
	var total := cottage_count * particles_per

	_smoke_ages.resize(total)
	_smoke_speed_muls.resize(total)
	_smoke_size_muls.resize(total)
	_smoke_offsets.resize(total * 2)

	var mm: MultiMesh = _smoke_mmi.multimesh
	mm.instance_count = 0
	mm.instance_count = total

	# Stagger initial ages so particles don't all spawn at once
	for i in total:
		_smoke_ages[i] = randf() * Config.SMOKE_LIFETIME
		_smoke_speed_muls[i] = lerpf(0.8, 1.2, randf())
		_smoke_size_muls[i] = lerpf(0.8, 1.2, randf())
		_smoke_offsets[i * 2] = randf() * TAU
		_smoke_offsets[i * 2 + 1] = randf() * TAU
		# Set initial transforms
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * 0.001), Vector3.ZERO))
		mm.set_instance_custom_data(i, Color(0, 0, 0, 0))


func _update_smoke(sun_elevation: float, delta: float) -> void:
	var mm: MultiMesh = _smoke_mmi.multimesh
	if mm.instance_count == 0:
		return

	var particles_per := Config.SMOKE_PARTICLES_PER_COTTAGE
	var lifetime := Config.SMOKE_LIFETIME
	var rise_speed := Config.SMOKE_RISE_SPEED
	var drift_speed := Config.SMOKE_DRIFT_SPEED
	var start_size := Config.SMOKE_START_SIZE
	var end_size := Config.SMOKE_END_SIZE

	# Night brightness
	var brightness := clampf((sun_elevation + 0.05) / 0.25, 0.15, 1.0)

	for ci in _chimney_positions.size():
		var chimney_pos: Vector3 = _chimney_positions[ci]

		for pi in particles_per:
			var idx := ci * particles_per + pi
			if idx >= mm.instance_count:
				break

			# Advance age
			_smoke_ages[idx] += delta
			if _smoke_ages[idx] >= lifetime:
				_smoke_ages[idx] = fmod(_smoke_ages[idx], lifetime)
				# Randomize on respawn
				_smoke_speed_muls[idx] = lerpf(0.8, 1.2, randf())
				_smoke_size_muls[idx] = lerpf(0.8, 1.2, randf())
				_smoke_offsets[idx * 2] = randf() * TAU
				_smoke_offsets[idx * 2 + 1] = randf() * TAU

			var t := _smoke_ages[idx] / lifetime
			var speed_mul: float = _smoke_speed_muls[idx]
			var size_mul: float = _smoke_size_muls[idx]

			# Position: rise + drift + wobble
			var rise := t * lifetime * rise_speed * speed_mul
			var drift_x := sin(_smoke_offsets[idx * 2] + t * 3.0) * drift_speed * t * 2.0
			var drift_z := cos(_smoke_offsets[idx * 2 + 1] + t * 2.7) * drift_speed * t * 2.0
			# Gentle wobble
			var wobble_x := sin(t * 8.0 + _smoke_offsets[idx * 2]) * 0.15
			var wobble_z := cos(t * 7.0 + _smoke_offsets[idx * 2 + 1]) * 0.15

			var particle_pos := chimney_pos + Vector3(drift_x + wobble_x, rise, drift_z + wobble_z)

			# Size
			var size := lerpf(start_size, end_size, t) * size_mul

			# Opacity: fade in, then fade out
			var opacity := minf(1.0, t * 4.0) * (1.0 - t * t) * 0.85

			var b := Basis.IDENTITY.scaled(Vector3(size, size, size))
			mm.set_instance_transform(idx, Transform3D(b, particle_pos))
			mm.set_instance_custom_data(idx, Color(opacity * brightness, brightness, 0.0, 0.0))
