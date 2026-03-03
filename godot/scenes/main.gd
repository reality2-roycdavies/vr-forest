extends Node3D
## Main scene orchestration — wires terrain, forest, atmosphere, and water.

const ChunkManagerScript = preload("res://terrain/chunk_manager.gd")
const TreePoolScript = preload("res://forest/tree_pool.gd")
const EnvironmentSetupScript = preload("res://atmosphere/environment_setup.gd")
const WaterPlaneScript = preload("res://water/water_plane.gd")

var _chunk_manager: Node3D
var _tree_pool: Node3D
var _environment: Node3D
var _water: Node3D


func _ready() -> void:
	# Terrain system
	_chunk_manager = ChunkManagerScript.new()
	_chunk_manager.name = "ChunkManager"
	add_child(_chunk_manager)

	# Tree rendering
	_tree_pool = TreePoolScript.new()
	_tree_pool.name = "TreePool"
	add_child(_tree_pool)

	_chunk_manager.chunks_changed.connect(_on_chunks_changed)

	# Atmosphere (sky, fog, sun)
	_environment = EnvironmentSetupScript.new()
	_environment.name = "Atmosphere"
	add_child(_environment)

	# Water plane
	_water = WaterPlaneScript.new()
	_water.name = "Water"
	add_child(_water)

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


func _on_chunks_changed() -> void:
	_tree_pool.rebuild(_chunk_manager.get_all_tree_data())
