extends Node3D
## Main scene orchestration — wires terrain, forest, atmosphere, and water.

const ChunkManagerScript = preload("res://terrain/chunk_manager.gd")
const TreePoolScript = preload("res://forest/tree_pool.gd")
const VegPoolScript = preload("res://forest/veg_pool.gd")
const CottagePoolScript = preload("res://forest/cottage_pool.gd")
const EnvironmentSetupScript = preload("res://atmosphere/environment_setup.gd")
const HorizonMeshScript = preload("res://terrain/horizon_mesh.gd")
const RainScript = preload("res://atmosphere/rain.gd")
const LightningScript = preload("res://atmosphere/lightning.gd")

var _chunk_manager: Node3D
var _tree_pool: Node3D
var _veg_pool: Node3D
var _cottage_pool: Node3D
var _environment: Node3D
var _horizon: Node3D
var _rain: Node3D
var _lightning: Node3D
var _weather_wired := false


func _ready() -> void:
	# Terrain system
	_chunk_manager = ChunkManagerScript.new()
	_chunk_manager.name = "ChunkManager"
	add_child(_chunk_manager)

	# Tree rendering
	_tree_pool = TreePoolScript.new()
	_tree_pool.name = "TreePool"
	add_child(_tree_pool)

	# Vegetation rendering
	_veg_pool = VegPoolScript.new()
	_veg_pool.name = "VegPool"
	add_child(_veg_pool)

	# Cottage rendering
	_cottage_pool = CottagePoolScript.new()
	_cottage_pool.name = "CottagePool"
	add_child(_cottage_pool)

	_chunk_manager.chunks_changed.connect(_on_chunks_changed)

	# Atmosphere (sky, fog, sun)
	_environment = EnvironmentSetupScript.new()
	_environment.name = "Atmosphere"
	add_child(_environment)

	# Distant horizon terrain
	_horizon = HorizonMeshScript.new()
	_horizon.name = "Horizon"
	add_child(_horizon)

	# Rain particles
	_rain = RainScript.new()
	_rain.name = "Rain"
	add_child(_rain)

	# Lightning
	_lightning = LightningScript.new()
	_lightning.name = "Lightning"
	add_child(_lightning)

	# Wire player to noise immediately — chunk manager is already ready
	_wire_player_noise()


func _wire_player_noise() -> void:
	if _chunk_manager == null:
		return
	var noise = _chunk_manager.get_noise()
	if noise == null:
		return
	var players = get_tree().get_nodes_in_group("player")
	for player in players:
		if player.has_method("set_noise"):
			player.set_noise(noise)
	if _horizon != null:
		_horizon.set_noise(noise)
	if _rain != null:
		_rain.set_noise(noise)


func _process(delta: float) -> void:
	_cottage_pool.update(_environment.get_sun_elevation(), delta)

	# Wire weather to rain/lightning once
	if not _weather_wired:
		var weather: RefCounted = _environment.get_weather()
		if weather != null:
			_rain.set_weather(weather)
			_lightning.set_weather(weather)
			_tree_pool.set_weather(weather)
			_weather_wired = true

	# Lightning flash affects ambient light
	if _lightning.has_method("get_flash_brightness"):
		var flash: float = _lightning.get_flash_brightness()
		if flash > 0.0:
			_environment.apply_flash(flash)

	# Altitude-adaptive fog and camera far plane
	var alt_t: float = _chunk_manager.get_altitude_factor()
	_environment.set_altitude_factor(alt_t)
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		var p: Node3D = players[0]
		if p.has_node("Camera3D"):
			var cam: Camera3D = p.get_node("Camera3D")
			cam.far = lerpf(Config.CAMERA_FAR_LOW, Config.CAMERA_FAR_HIGH, alt_t)
		_horizon.update_position(p.global_position)


func _on_chunks_changed() -> void:
	_tree_pool.rebuild(_chunk_manager.get_all_tree_data())
	_veg_pool.rebuild(_chunk_manager.get_all_veg_data())
	_cottage_pool.rebuild(_chunk_manager.get_all_cottage_data())
