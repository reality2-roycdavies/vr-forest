extends Node3D
## Dynamically loads/unloads terrain chunks around the player.
## Chunk generation runs on a background thread; only scene-tree
## attachment happens on the main thread, time-budgeted per frame.

const NoiseScript = preload("res://terrain/noise.gd")
const ErosionMapScript = preload("res://terrain/erosion_map.gd")
const RiverTracerScript = preload("res://terrain/river_tracer.gd")
const TerrainGeneratorScript = preload("res://terrain/terrain_generator.gd")
const ChunkScript = preload("res://terrain/chunk.gd")

signal chunks_changed

var _active_chunks: Dictionary = {}  # Vector2i → chunk node
var _noise: RefCounted
var _erosion_map: RefCounted
var _river_tracer: RefCounted
var _generator: RefCounted
var _last_player_chunk := Vector2i(999999, 999999)
var _rivers_ready := false
var _effective_load_radius := Config.LOAD_RADIUS
var _effective_unload_radius := Config.UNLOAD_RADIUS

# --- Threading ---
var _thread: Thread
var _mutex: Mutex
var _running := true
var _request_queue: Array[Dictionary] = []   # { "coord": Vector2i, "lod": int }
var _result_queue: Array[Dictionary] = []    # { "coord": Vector2i, "mesh": ArrayMesh, ... }
var _pending_coords: Dictionary = {}         # Vector2i → true (being generated)


func _ready() -> void:
	_noise = NoiseScript.new()
	_erosion_map = ErosionMapScript.new()
	_noise.set_erosion_map(_erosion_map)
	_river_tracer = RiverTracerScript.new(_noise)
	_noise.set_river_tracer(_river_tracer)
	_river_tracer.trace_async(0.0, 0.0, float(Config.RIVER_TRACE_RADIUS))
	_generator = TerrainGeneratorScript.new(_noise)

	_mutex = Mutex.new()
	_thread = Thread.new()
	_thread.start(_worker_loop)


func _exit_tree() -> void:
	# Signal thread to stop and wait for it
	_mutex.lock()
	_running = false
	_mutex.unlock()
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()

	if _river_tracer != null:
		_river_tracer.finish()
	if _erosion_map != null:
		_erosion_map.finish()


func get_noise() -> RefCounted:
	return _noise


func get_altitude_factor() -> float:
	var player = _find_player()
	if player == null:
		return 0.0
	return clampf(
		(player.global_position.y - Config.VIEW_ALTITUDE_MIN) / (Config.VIEW_ALTITUDE_MAX - Config.VIEW_ALTITUDE_MIN),
		0.0, 1.0)


func _process(_delta: float) -> void:
	var player = _find_player()
	if player == null:
		return

	# River tracer lifecycle
	if _river_tracer != null:
		if _river_tracer.is_ready() and not _rivers_ready:
			_rivers_ready = true
			_rebuild_all_chunks()
		if _rivers_ready and _river_tracer.check_retrace(player.global_position.x, player.global_position.z):
			_rivers_ready = false

	# Altitude-adaptive view distance
	var altitude: float = player.global_position.y
	var alt_t: float = clampf(
		(altitude - Config.VIEW_ALTITUDE_MIN) / (Config.VIEW_ALTITUDE_MAX - Config.VIEW_ALTITUDE_MIN),
		0.0, 1.0)
	var new_load: int = int(lerpf(Config.LOAD_RADIUS, Config.LOAD_RADIUS_MAX, alt_t))
	var new_unload: int = int(lerpf(Config.UNLOAD_RADIUS, Config.UNLOAD_RADIUS_MAX, alt_t))
	var radius_changed: bool = (new_load != _effective_load_radius)
	_effective_load_radius = new_load
	_effective_unload_radius = new_unload

	var player_chunk := Vector2i(
		int(floor(player.global_position.x / Config.CHUNK_SIZE)),
		int(floor(player.global_position.z / Config.CHUNK_SIZE))
	)

	if player_chunk != _last_player_chunk or radius_changed:
		_last_player_chunk = player_chunk
		_update_chunk_set(player_chunk)

	# Apply completed chunks from worker thread (time-budgeted)
	var applied := 0
	var start_ms := Time.get_ticks_msec()
	while true:
		var result: Dictionary = _pop_result()
		if result.is_empty():
			break

		var coord: Vector2i = result["coord"]
		# Skip if chunk was already unloaded or replaced while generating
		if _active_chunks.has(coord):
			continue
		# Skip if coord is no longer in range
		var dist := float((coord - _last_player_chunk).length())
		if dist > _effective_unload_radius:
			_mutex.lock()
			_pending_coords.erase(coord)
			_mutex.unlock()
			continue

		_apply_chunk(coord, result)
		applied += 1

		# Respect time budget
		if (Time.get_ticks_msec() - start_ms) >= Config.CHUNK_BUILD_BUDGET_MS:
			break

	if applied > 0:
		chunks_changed.emit()


func _update_chunk_set(center: Vector2i) -> void:
	var load_r := _effective_load_radius
	var unload_r := _effective_unload_radius

	# Collect missing chunks within load radius
	var needed: Array[Dictionary] = []
	for dz in range(-load_r, load_r + 1):
		for dx in range(-load_r, load_r + 1):
			var dist_sq := (dx * dx + dz * dz)
			if dist_sq > load_r * load_r:
				continue  # circular, not square
			var coord := center + Vector2i(dx, dz)
			if not _active_chunks.has(coord):
				_mutex.lock()
				var already_pending := _pending_coords.has(coord)
				_mutex.unlock()
				if not already_pending:
					needed.append({"coord": coord, "dist_sq": dist_sq})

	# Sort by distance — nearest first
	needed.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a["dist_sq"] < b["dist_sq"]
	)

	# Queue generation requests with 3-tier LOD
	_mutex.lock()
	for item in needed:
		var coord: Vector2i = item["coord"]
		var dist_sq: int = item["dist_sq"]
		var lod: int
		if dist_sq <= Config.LOD_NEAR_DIST_SQ:
			lod = Config.CHUNK_SEGMENTS          # full res
		elif dist_sq <= Config.LOD_MID_DIST_SQ:
			lod = Config.CHUNK_SEGMENTS_LOD      # medium
		else:
			lod = Config.CHUNK_SEGMENTS_LOD2     # ultra-low
		_request_queue.append({"coord": coord, "lod": lod})
		_pending_coords[coord] = true
	_mutex.unlock()

	# Unload distant chunks
	var to_remove: Array[Vector2i] = []
	for coord_key in _active_chunks.keys():
		var coord: Vector2i = coord_key
		var dist := float((coord - center).length())
		if dist > unload_r:
			to_remove.append(coord)

	for coord in to_remove:
		var chunk: Node3D = _active_chunks[coord]
		chunk.queue_free()
		_active_chunks.erase(coord)

	# Also cancel pending requests for chunks now out of range
	if to_remove.size() > 0:
		_mutex.lock()
		for coord in to_remove:
			_pending_coords.erase(coord)
		# Filter request queue
		var filtered: Array[Dictionary] = []
		for req in _request_queue:
			var rc: Vector2i = req["coord"]
			if float((rc - center).length()) <= unload_r:
				filtered.append(req)
			else:
				_pending_coords.erase(rc)
		_request_queue = filtered
		_mutex.unlock()
		chunks_changed.emit()


func _rebuild_all_chunks() -> void:
	# Cancel all pending work
	_mutex.lock()
	_request_queue.clear()
	_result_queue.clear()
	_pending_coords.clear()
	_mutex.unlock()

	for coord in _active_chunks:
		var chunk: Node3D = _active_chunks[coord]
		chunk.queue_free()
	_active_chunks.clear()
	_last_player_chunk = Vector2i(999999, 999999)


func _apply_chunk(coord: Vector2i, result: Dictionary) -> void:
	var chunk = ChunkScript.new()
	var water_mesh: ArrayMesh = result.get("water_mesh", null)
	chunk.setup(coord, result["mesh"], result["tree_data"], result["veg_data"], result["cottage_data"], water_mesh)
	add_child(chunk)
	_active_chunks[coord] = chunk

	_mutex.lock()
	_pending_coords.erase(coord)
	_mutex.unlock()


# --- Worker thread ---

func _worker_loop() -> void:
	while true:
		_mutex.lock()
		if not _running:
			_mutex.unlock()
			return

		if _request_queue.is_empty():
			_mutex.unlock()
			OS.delay_msec(2)
			continue

		var request: Dictionary = _request_queue.pop_front()
		_mutex.unlock()

		var coord: Vector2i = request["coord"]
		var lod: int = request["lod"]

		# Heavy work happens here, OFF main thread
		var result: Dictionary = _generator.generate_chunk(coord.x, coord.y, lod)
		result["coord"] = coord

		_mutex.lock()
		_result_queue.append(result)
		_mutex.unlock()


func _pop_result() -> Dictionary:
	_mutex.lock()
	var result: Dictionary = {}
	if not _result_queue.is_empty():
		result = _result_queue.pop_front()
	_mutex.unlock()
	return result


# --- Accessors ---

func get_all_tree_data() -> Array[Dictionary]:
	var all_trees: Array[Dictionary] = []
	for chunk_node in _active_chunks.values():
		all_trees.append_array(chunk_node.tree_data)
	return all_trees


func get_all_veg_data() -> Array[Dictionary]:
	var all_veg: Array[Dictionary] = []
	for chunk_node in _active_chunks.values():
		all_veg.append_array(chunk_node.veg_data)
	return all_veg


func get_all_cottage_data() -> Array[Dictionary]:
	var all_cottages: Array[Dictionary] = []
	for chunk_node in _active_chunks.values():
		all_cottages.append_array(chunk_node.cottage_data)
	return all_cottages


func _find_player() -> Node3D:
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0]
	return null
