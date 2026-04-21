extends Node3D
## Lightning bolt geometry and ambient flash per SPEC-06 §4.
## Active only during storms (rain_intensity > 0).

var _weather: RefCounted
var _bolt_mesh: MeshInstance3D
var _bolt_material: StandardMaterial3D
var _flash_timer := 0.0
var _next_flash := 10.0
var _flash_brightness := 0.0
var _flash_decay_timer := 0.0
var _bolt_visible_timer := 0.0


func set_weather(weather: RefCounted) -> void:
	_weather = weather


func _ready() -> void:
	_bolt_material = StandardMaterial3D.new()
	_bolt_material.albedo_color = Color(0.9, 0.9, 1.0)
	_bolt_material.emission_enabled = true
	_bolt_material.emission = Color(0.8, 0.85, 1.0)
	_bolt_material.emission_energy_multiplier = 8.0
	_bolt_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_bolt_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_bolt_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

	_bolt_mesh = MeshInstance3D.new()
	_bolt_mesh.material_override = _bolt_material
	_bolt_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_bolt_mesh.visible = false
	add_child(_bolt_mesh)

	_schedule_next()


func _process(delta: float) -> void:
	if _weather == null:
		return

	var rain: float = _weather.rain_intensity
	if rain < 0.01:
		_bolt_mesh.visible = false
		_flash_brightness = 0.0
		return

	_flash_timer += delta

	# Schedule based on rain intensity
	if _flash_timer >= _next_flash:
		_flash_timer = 0.0
		_trigger_lightning()
		_schedule_next()

	# Fade bolt
	if _bolt_mesh.visible:
		_bolt_visible_timer -= delta
		if _bolt_visible_timer <= 0.0:
			_bolt_mesh.visible = false
		else:
			var fade: float = _bolt_visible_timer / (Config.LIGHTNING_FLASH_DECAY * 1.5)
			_bolt_material.albedo_color.a = fade

	# Fade flash brightness
	if _flash_brightness > 0.0:
		_flash_brightness = maxf(0.0, _flash_brightness - delta / Config.LIGHTNING_FLASH_DECAY)


func get_flash_brightness() -> float:
	return _flash_brightness


func _schedule_next() -> void:
	var base_interval: float = Config.THUNDER_INTERVAL_MIN + randf() * (Config.THUNDER_INTERVAL_MAX - Config.THUNDER_INTERVAL_MIN)
	# Stretch by inverse rain intensity squared
	var rain: float = maxf(_weather.rain_intensity, 0.1) if _weather != null else 1.0
	_next_flash = base_interval * (1.0 / rain) * (1.0 / rain)
	_next_flash = minf(_next_flash, 60.0)


func _trigger_lightning() -> void:
	var players := get_tree().get_nodes_in_group("player")
	if players.size() == 0:
		return
	var player_pos: Vector3 = players[0].global_position

	# Random bolt position
	var angle: float = randf() * TAU
	var dist: float = Config.LIGHTNING_BOLT_MIN_DIST + randf() * (Config.LIGHTNING_BOLT_MAX_DIST - Config.LIGHTNING_BOLT_MIN_DIST)
	var bolt_x: float = player_pos.x + cos(angle) * dist
	var bolt_z: float = player_pos.z + sin(angle) * dist
	var ground_y: float = player_pos.y  # Approximate
	var top_y: float = ground_y + 60.0 + randf() * 30.0
	var bottom_y: float = ground_y + 1.0

	# Build bolt geometry
	var segments: int = 12 + randi() % 5
	_build_bolt_mesh(bolt_x, bolt_z, top_y, bottom_y, segments)

	# Flash
	_flash_brightness = (0.7 + randf() * 0.3) * clampf(1.3 - dist / 250.0, 0.0, 1.0)
	_bolt_mesh.visible = true
	_bolt_visible_timer = Config.LIGHTNING_FLASH_DECAY * 1.5
	_bolt_material.albedo_color.a = 1.0


func _build_bolt_mesh(cx: float, cz: float, top_y: float, bottom_y: float, segments: int) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)

	var points: Array[Vector3] = []
	var height_range: float = top_y - bottom_y

	# Main bolt path with jitter
	for i in segments + 1:
		var t: float = float(i) / float(segments)
		var y: float = top_y - t * height_range
		var jitter_scale: float = 8.0 * (1.0 - t * 0.5)  # Less jitter near ground
		var px: float = cx + (randf() - 0.5) * jitter_scale
		var pz: float = cz + (randf() - 0.5) * jitter_scale
		points.append(Vector3(px, y, pz))

	# Build ribbon mesh from points
	var width := 0.5
	for i in points.size():
		var p: Vector3 = points[i]
		var right: Vector3
		if i < points.size() - 1:
			var dir: Vector3 = (points[i + 1] - p).normalized()
			right = dir.cross(Vector3.UP).normalized() * width
		else:
			var dir: Vector3 = (p - points[i - 1]).normalized()
			right = dir.cross(Vector3.UP).normalized() * width

		var glow: float = 1.0 - float(i) / float(points.size()) * 0.3
		st.set_color(Color(glow, glow, 1.0))
		st.add_vertex(p - right)
		st.set_color(Color(glow, glow, 1.0))
		st.add_vertex(p + right)

	# Add 2-3 branch forks
	var branch_count: int = 2 + randi() % 3
	for _b in branch_count:
		var fork_idx: int = 2 + randi() % maxi(1, points.size() - 4)
		if fork_idx >= points.size():
			continue
		var fork_point: Vector3 = points[fork_idx]
		var branch_segs: int = 2 + randi() % 2
		var bp: Vector3 = fork_point
		for si in branch_segs:
			var next_bp := bp + Vector3(
				(randf() - 0.5) * 6.0,
				-height_range / float(segments) * (0.5 + randf()),
				(randf() - 0.5) * 6.0
			)
			var bw: float = width * 0.4
			var bdir: Vector3 = (next_bp - bp).normalized()
			var bright: Vector3 = bdir.cross(Vector3.UP).normalized() * bw

			st.set_color(Color(0.7, 0.7, 0.9))
			st.add_vertex(bp - bright)
			st.set_color(Color(0.7, 0.7, 0.9))
			st.add_vertex(bp + bright)
			st.set_color(Color(0.7, 0.7, 0.9))
			st.add_vertex(next_bp - bright)
			st.set_color(Color(0.7, 0.7, 0.9))
			st.add_vertex(next_bp + bright)
			bp = next_bp

	_bolt_mesh.mesh = st.commit()
