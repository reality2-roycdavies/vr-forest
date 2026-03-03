extends Node3D
## Sets up WorldEnvironment with procedural sky, fog, ambient light,
## and configures the DirectionalLight3D (sun).

var _world_env: WorldEnvironment
var _sun: DirectionalLight3D


func _ready() -> void:
	_setup_environment()
	_setup_sun()


func _setup_environment() -> void:
	var env := Environment.new()

	# Procedural sky — day palette from VF-ATMOSPHERE
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.4, 0.6, 0.9)
	sky_mat.sky_horizon_color = Color(0.55, 0.7, 0.9)
	sky_mat.ground_bottom_color = Color(0.35, 0.3, 0.2)
	sky_mat.ground_horizon_color = Color(0.55, 0.7, 0.9)
	sky_mat.sun_angle_max = 30.0
	sky_mat.sun_curve = 0.15

	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	env.sky = sky
	env.background_mode = Environment.BG_SKY

	# Fog — approximate near=50 far=130 from spec
	env.fog_enabled = true
	env.fog_light_color = Color(0.7, 0.8, 0.9)
	env.fog_density = 0.006
	env.fog_aerial_perspective = 0.5

	# Ambient light
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.65, 0.7)
	env.ambient_light_energy = 0.45

	# Tonemap for natural look
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0

	# SSAO for depth
	env.ssao_enabled = true
	env.ssao_radius = 2.0
	env.ssao_intensity = 1.5

	_world_env = WorldEnvironment.new()
	_world_env.environment = env
	add_child(_world_env)


func _setup_sun() -> void:
	_sun = DirectionalLight3D.new()
	_sun.light_color = Color(1.0, 0.95, 0.85)
	_sun.light_energy = 1.0

	# Sun angle — mid-morning
	_sun.rotation_degrees = Vector3(-45.0, 30.0, 0.0)

	# Shadows
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	_sun.directional_shadow_max_distance = 150.0
	_sun.shadow_bias = 0.05

	add_child(_sun)
