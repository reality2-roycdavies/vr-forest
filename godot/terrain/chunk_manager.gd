extends Node3D
## Dynamically loads/unloads terrain chunks around the player.

const NoiseScript = preload("res://terrain/noise.gd")
const TerrainGeneratorScript = preload("res://terrain/terrain_generator.gd")
const ChunkScript = preload("res://terrain/chunk.gd")

signal chunks_changed

var _active_chunks: Dictionary = {}  # Vector2i → chunk node
var _build_queue: Array[Vector2i] = []
var _noise: RefCounted
var _generator: RefCounted
var _last_player_chunk := Vector2i(999999, 999999)


func _ready() -> void:
	_noise = NoiseScript.new()
	_generator = TerrainGeneratorScript.new(_noise)


func get_noise() -> RefCounted:
	return _noise


func _process(_delta: float) -> void:
	var player = _find_player()
	if player == null:
		return

	var player_chunk := Vector2i(
		int(floor(player.global_position.x / Config.CHUNK_SIZE)),
		int(floor(player.global_position.z / Config.CHUNK_SIZE))
	)

	if player_chunk != _last_player_chunk:
		_last_player_chunk = player_chunk
		_update_chunk_set(player_chunk)

	# Build queued chunks (max per frame)
	var built := 0
	while _build_queue.size() > 0 and built < Config.MAX_CHUNKS_PER_FRAME:
		var coord: Vector2i = _build_queue.pop_front()
		if not _active_chunks.has(coord):
			_build_chunk(coord)
			built += 1

	if built > 0:
		chunks_changed.emit()


func _update_chunk_set(center: Vector2i) -> void:
	# Queue missing chunks within load radius
	for dz in range(-Config.LOAD_RADIUS, Config.LOAD_RADIUS + 1):
		for dx in range(-Config.LOAD_RADIUS, Config.LOAD_RADIUS + 1):
			var coord := center + Vector2i(dx, dz)
			if not _active_chunks.has(coord) and not _build_queue.has(coord):
				_build_queue.append(coord)

	# Sort by distance to player for nearest-first loading
	_build_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var da := (a - center).length_squared()
		var db := (b - center).length_squared()
		return da < db
	)

	# Unload distant chunks
	var to_remove: Array[Vector2i] = []
	for coord_key in _active_chunks.keys():
		var coord: Vector2i = coord_key
		var dist := float((coord - center).length())
		if dist > Config.UNLOAD_RADIUS:
			to_remove.append(coord)

	for coord in to_remove:
		var chunk: Node3D = _active_chunks[coord]
		chunk.queue_free()
		_active_chunks.erase(coord)

	if to_remove.size() > 0:
		chunks_changed.emit()


func _build_chunk(coord: Vector2i) -> void:
	var result: Dictionary = _generator.generate_chunk(coord.x, coord.y)

	var chunk = ChunkScript.new()
	chunk.setup(coord, result["mesh"], result["tree_data"])
	add_child(chunk)
	_active_chunks[coord] = chunk


func get_all_tree_data() -> Array[Dictionary]:
	var all_trees: Array[Dictionary] = []
	for chunk_node in _active_chunks.values():
		all_trees.append_array(chunk_node.tree_data)
	return all_trees


func _find_player() -> Node3D:
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0]
	return null
