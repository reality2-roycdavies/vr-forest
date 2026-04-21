extends Node3D
## Desktop player controller — WASD + mouse look + terrain following.
## XR support will be added later via xr_setup.gd.

const MOUSE_SENSITIVITY := 0.002

@onready var camera: Camera3D = $Camera3D

var _mouse_captured := false
var _noise: RefCounted
var _target_y := 0.0


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_mouse_captured = true
	add_to_group("player")
	_target_y = Config.TERRAIN_FOLLOW_OFFSET
	camera.current = true


func set_noise(noise_instance: RefCounted) -> void:
	_noise = noise_instance
	# Snap to correct terrain height immediately (avoid starting underground)
	var terrain_h: float = _noise.get_terrain_height(global_position.x, global_position.z)
	global_position.y = terrain_h + Config.TERRAIN_FOLLOW_OFFSET


func _unhandled_input(event: InputEvent) -> void:
	# Mouse look
	if event is InputEventMouseMotion and _mouse_captured:
		rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		camera.rotate_x(-event.relative.y * MOUSE_SENSITIVITY)
		camera.rotation.x = clampf(camera.rotation.x, -PI / 2.0, PI / 2.0)

	# Toggle mouse capture with Escape
	if event.is_action_pressed("ui_cancel"):
		if _mouse_captured:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			_mouse_captured = false
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			_mouse_captured = true


func _process(delta: float) -> void:
	# Movement direction from WASD
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	var speed := Config.SPRINT_SPEED if Input.is_action_pressed("sprint") else Config.MOVE_SPEED

	if direction:
		global_position += direction * speed * delta

	# Terrain following — smooth lerp to terrain height
	if _noise:
		var terrain_h: float = _noise.get_terrain_height(global_position.x, global_position.z)
		_target_y = terrain_h + Config.TERRAIN_FOLLOW_OFFSET
		global_position.y = lerpf(global_position.y, _target_y, 8.0 * delta)
