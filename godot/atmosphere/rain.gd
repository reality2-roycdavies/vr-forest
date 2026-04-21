extends Node3D
## Rain/snow particle system per SPEC-06 §3.
## Cylindrical volume of GPU particles around the player.
## Rain below treeline, snow above. Canopy sheltering reduces intensity.

var _particles: GPUParticles3D
var _material: ShaderMaterial
var _process_material: ParticleProcessMaterial
var _weather: RefCounted
var _noise: RefCounted

# Canopy shelter
var _shelter_factor := 0.0
var _last_shelter_pos := Vector3(INF, 0, INF)


func set_weather(weather: RefCounted) -> void:
	_weather = weather


func set_noise(noise_instance: RefCounted) -> void:
	_noise = noise_instance


func _ready() -> void:
	_process_material = ParticleProcessMaterial.new()
	_process_material.particle_flag_align_y = true
	_process_material.direction = Vector3(0, -1, 0)
	_process_material.spread = 5.0
	_process_material.initial_velocity_min = Config.RAIN_SPEED_MIN
	_process_material.initial_velocity_max = Config.RAIN_SPEED_MAX
	_process_material.gravity = Vector3(0, 0, 0)  # We handle gravity via initial velocity
	_process_material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	_process_material.emission_box_extents = Vector3(Config.RAIN_RADIUS, Config.RAIN_HEIGHT * 0.5, Config.RAIN_RADIUS)
	_process_material.lifetime_randomness = 0.3

	_material = ShaderMaterial.new()
	_material.shader = _create_rain_shader()

	var mesh := QuadMesh.new()
	mesh.size = Vector2(0.02, 0.4)

	_particles = GPUParticles3D.new()
	_particles.amount = Config.RAIN_PARTICLE_COUNT
	_particles.process_material = _process_material
	_particles.draw_pass_1 = mesh
	_particles.material_override = _material
	_particles.lifetime = 2.0
	_particles.visibility_aabb = AABB(Vector3(-30, -25, -30), Vector3(60, 50, 60))
	_particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_particles.emitting = false
	add_child(_particles)


func _process(delta: float) -> void:
	if _weather == null:
		return

	var rain: float = _weather.rain_intensity
	var should_emit: bool = rain > 0.01

	# Follow player
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		var p: Node3D = players[0]
		global_position = p.global_position + Vector3(0, Config.RAIN_HEIGHT * 0.3, 0)

		# Update canopy shelter
		if _noise != null:
			var dx: float = p.global_position.x - _last_shelter_pos.x
			var dz: float = p.global_position.z - _last_shelter_pos.z
			if dx * dx + dz * dz > 9.0:  # 3m threshold
				_last_shelter_pos = p.global_position
			var target_shelter := _sample_canopy(p.global_position.x, p.global_position.z)
			_shelter_factor += (target_shelter - _shelter_factor) * minf(1.0, 1.5 * delta)

		# Snow blend based on altitude
		var terrain_y: float = p.global_position.y
		var snow_blend: float = clampf(
			(terrain_y - Config.TREELINE_START) / (Config.SNOWLINE_START - Config.TREELINE_START),
			0.0, 1.0
		)
		_material.set_shader_parameter("snow_blend", snow_blend)

		# Storm factor for snow swirl
		var storm_factor: float = clampf(rain, 0.0, 1.0)
		_material.set_shader_parameter("storm_intensity", storm_factor)

	# Modulate amount via emitting toggle and speed
	if should_emit and not _particles.emitting:
		_particles.emitting = true
	elif not should_emit and _particles.emitting:
		_particles.emitting = false

	# Wind influence on rain direction
	var wind_x: float = sin(Time.get_ticks_msec() * 0.0003) * _weather.wind_multiplier * Config.RAIN_WIND_INFLUENCE
	var wind_z: float = cos(Time.get_ticks_msec() * 0.0005) * _weather.wind_multiplier * Config.RAIN_WIND_INFLUENCE * 0.7
	_process_material.direction = Vector3(wind_x, -1, wind_z).normalized()

	# Adjust speed based on rain intensity and shelter
	var effective_rain: float = rain * (1.0 - _shelter_factor * 0.8)
	_material.set_shader_parameter("rain_opacity", clampf(effective_rain, 0.0, 1.0))


func _sample_canopy(wx: float, wz: float) -> float:
	if _noise == null:
		return 0.0
	# Sample 3x3 grid around player
	var total := 0.0
	var cell_size := Config.RAIN_RADIUS * 2.0 / 16.0
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			var sx: float = wx + float(dx) * cell_size
			var sz: float = wz + float(dz) * cell_size
			if _noise.get_tree_density(sx, sz) > 0.3:
				total += 1.0
	return total / 9.0


func _create_rain_shader() -> Shader:
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded;

uniform float rain_opacity : hint_range(0.0, 1.0) = 0.0;
uniform float snow_blend : hint_range(0.0, 1.0) = 0.0;
uniform float storm_intensity : hint_range(0.0, 1.0) = 0.0;

void vertex() {
	// Scale particles: rain = thin streaks, snow = wider dots
	float width_scale = mix(1.0, 3.0, snow_blend);
	float height_scale = mix(1.0, 0.3, snow_blend);
	VERTEX.x *= width_scale;
	VERTEX.y *= height_scale;
}

void fragment() {
	// Rain color: pale blue-grey
	ALBEDO = vec3(0.7, 0.75, 0.85);

	// Shape: rain = tall streak, snow = round dot
	vec2 c = UV * 2.0 - 1.0;
	float x_sq = c.x * c.x * mix(80.0, 6.0, snow_blend);
	float y_sq = c.y * c.y * mix(0.8, 6.0, snow_blend);
	float dist = x_sq + y_sq;
	float core = exp(-dist * mix(3.0, 1.5, snow_blend));

	float alpha = core * rain_opacity * mix(0.7, mix(0.5, 0.85, storm_intensity), snow_blend);
	ALPHA = alpha;
}
"""
	return shader
