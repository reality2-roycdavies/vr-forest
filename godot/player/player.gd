extends CharacterBody3D
## Desktop player controller — WASD + mouse look.
## XR support will be added later via xr_setup.gd.

const MOUSE_SENSITIVITY := 0.002

@onready var camera: Camera3D = $Camera3D

var _mouse_captured := false


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_mouse_captured = true


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


func _physics_process(delta: float) -> void:
	# Gravity
	if not is_on_floor():
		velocity.y -= Config.GRAVITY * delta

	# Movement direction from WASD
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	var speed := Config.SPRINT_SPEED if Input.is_action_pressed("sprint") else Config.MOVE_SPEED

	if direction:
		velocity.x = direction.x * speed
		velocity.z = direction.z * speed
	else:
		velocity.x = move_toward(velocity.x, 0, speed)
		velocity.z = move_toward(velocity.z, 0, speed)

	move_and_slide()
