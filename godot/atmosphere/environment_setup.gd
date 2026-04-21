extends Node3D
## Sets up WorldEnvironment with procedural sky, fog, ambient light,
## and a DirectionalLight3D (sun) that tracks the real-time day/night cycle
## per SPEC-05.

const DayNightScript = preload("res://atmosphere/day_night.gd")
const WeatherScript = preload("res://atmosphere/weather.gd")

var _world_env: WorldEnvironment
var _env: Environment
var _sky_mat: ProceduralSkyMaterial
var _sun: DirectionalLight3D
var _day_night: RefCounted
var _weather: RefCounted


func _ready() -> void:
	_day_night = DayNightScript.new()
	_weather = WeatherScript.new()
	_setup_environment()
	_setup_sun()
	# Apply initial state immediately
	_day_night.update()
	_weather.update(0.0)
	_apply_palette()


func _process(delta: float) -> void:
	# Time scrubbing: [ and ] keys, 3 hours per second (SPEC-05 §2.2)
	if Input.is_action_pressed("time_forward"):
		_day_night.time_offset = clampf(_day_night.time_offset + 3.0 * delta, -12.0, 12.0)
	if Input.is_action_pressed("time_backward"):
		_day_night.time_offset = clampf(_day_night.time_offset - 3.0 * delta, -12.0, 12.0)

	_day_night.update()
	_weather.update(delta)
	_apply_palette()


func get_weather() -> RefCounted:
	return _weather


func _apply_palette() -> void:
	var p: Dictionary = _day_night.palette
	var w: float = _weather.intensity

	# Weather-derived values
	var dark: float = _weather.sky_darkening
	var storm_fog_color := Config.WEATHER_STORM_CLOUD_COLOR

	# Sky colors — darken toward overcast grey
	var sky_top: Color = p["sky_top"].lerp(storm_fog_color, dark)
	var sky_bottom: Color = p["sky_bottom"].lerp(storm_fog_color, dark)
	_sky_mat.sky_top_color = sky_top
	_sky_mat.sky_horizon_color = sky_bottom.lerp(sky_top, 0.3)
	_sky_mat.ground_bottom_color = p["hemi_ground"].lerp(storm_fog_color, dark * 0.5)
	_sky_mat.ground_horizon_color = sky_bottom

	# Fog — thicker in bad weather (lower multiplier = denser fog via shorter distance)
	var fog_color: Color = p["fog"].lerp(storm_fog_color, dark * 0.7)
	_env.fog_light_color = fog_color

	# Ambient light — dimmed by weather
	var ambient_color: Color = p["hemi_sky"].lerp(storm_fog_color, dark * 0.4)
	_env.ambient_light_color = ambient_color
	_env.ambient_light_energy = p["ambient_intensity"] * (1.0 - _weather.light_dimming * 0.5)

	# Sun direction and light — dimmed by clouds
	if _day_night.sun_elevation > -0.05:
		_sun.visible = true
		_sun.rotation.x = -_day_night.sun_elevation
		_sun.rotation.y = PI / 2.0 - _day_night.sun_azimuth
		_sun.light_color = p["sun_colour"].lerp(storm_fog_color, dark * 0.3)
		_sun.light_energy = p["sun_intensity"] * (1.0 - _weather.light_dimming)
	else:
		_sun.visible = false


func _setup_environment() -> void:
	_env = Environment.new()

	# Procedural sky
	_sky_mat = ProceduralSkyMaterial.new()
	_sky_mat.sky_top_color = Color(0.4, 0.6, 0.9)
	_sky_mat.sky_horizon_color = Color(0.55, 0.7, 0.9)
	_sky_mat.ground_bottom_color = Color(0.35, 0.3, 0.2)
	_sky_mat.ground_horizon_color = Color(0.55, 0.7, 0.9)
	_sky_mat.sun_angle_max = 30.0
	_sky_mat.sun_curve = 0.15

	var sky := Sky.new()
	sky.sky_material = _sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	_env.sky = sky
	_env.background_mode = Environment.BG_SKY

	# Fog
	_env.fog_enabled = true
	_env.fog_light_color = Color(0.7, 0.8, 0.9)
	_env.fog_density = Config.FOG_DENSITY_LOW
	_env.fog_aerial_perspective = 0.5

	# Ambient light
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color(0.6, 0.65, 0.7)
	_env.ambient_light_energy = 0.45

	# Tonemap
	_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_env.tonemap_white = 6.0

	# SSAO
	_env.ssao_enabled = true
	_env.ssao_radius = 2.0
	_env.ssao_intensity = 1.5

	_world_env = WorldEnvironment.new()
	_world_env.environment = _env
	add_child(_world_env)


func _setup_sun() -> void:
	_sun = DirectionalLight3D.new()
	_sun.light_color = Color(1.0, 0.95, 0.85)
	_sun.light_energy = 1.0

	# Initial rotation (will be overridden by _apply_palette)
	_sun.rotation_degrees = Vector3(-60, -30, 0)

	# Shadows
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	_sun.directional_shadow_max_distance = 150.0
	_sun.shadow_bias = 0.05

	add_child(_sun)


func get_sun_elevation() -> float:
	return _day_night.sun_elevation


func apply_flash(brightness: float) -> void:
	# Lightning flash: briefly boost ambient light
	_env.ambient_light_energy += brightness * 2.0


func set_altitude_factor(alt_t: float) -> void:
	var base_fog: float = lerpf(Config.FOG_DENSITY_LOW, Config.FOG_DENSITY_HIGH, alt_t)
	# Weather increases fog density (fog_multiplier < 1 = denser)
	_env.fog_density = base_fog / maxf(_weather.fog_multiplier, 0.1)
	_env.fog_aerial_perspective = lerpf(0.5, 0.1, alt_t)
	# Also extend shadow distance at altitude for better far-terrain shadows
	_sun.directional_shadow_max_distance = lerpf(150.0, 400.0, alt_t)
