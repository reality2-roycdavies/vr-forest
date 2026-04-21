extends Node3D
## OpenXR initialization and fallback desktop camera.
## Manages XROrigin3D + XRCamera3D + two XRController3D nodes.
## References VF-MOVEMENT spec for locomotion parameters.

@onready var xr_origin: XROrigin3D = $XROrigin3D
@onready var xr_camera: XRCamera3D = $XROrigin3D/XRCamera3D
@onready var left_controller: XRController3D = $XROrigin3D/LeftController
@onready var right_controller: XRController3D = $XROrigin3D/RightController

var xr_interface: XRInterface
var xr_active := false

## Desktop fallback camera (used when no headset detected)
var desktop_camera: Camera3D


func _ready() -> void:
	_try_init_xr()


func _try_init_xr() -> void:
	xr_interface = XRServer.find_interface("OpenXR")
	if xr_interface and xr_interface.is_initialized():
		_activate_xr()
	elif xr_interface and xr_interface.initialize():
		_activate_xr()
	else:
		push_warning("OpenXR not available — falling back to desktop camera")
		_activate_desktop_fallback()


func _activate_xr() -> void:
	xr_active = true
	# Set viewport to use XR
	get_viewport().use_xr = true
	# Configure world scale (1:1 meters)
	xr_origin.world_scale = 1.0
	# Set eye height from config
	xr_origin.position.y = Config.TERRAIN_FOLLOW_OFFSET


func _activate_desktop_fallback() -> void:
	xr_active = false
	# Hide XR nodes, create standard Camera3D
	xr_origin.visible = false
	desktop_camera = Camera3D.new()
	desktop_camera.position = Vector3(0, Config.TERRAIN_FOLLOW_OFFSET, 0)
	desktop_camera.fov = 70.0
	desktop_camera.far = Config.CAMERA_FAR_LOW
	add_child(desktop_camera)
	desktop_camera.make_current()


func _process(_delta: float) -> void:
	# TODO: implement locomotion from VF-MOVEMENT spec
	# - Thumbstick smooth locomotion (left stick)
	# - Snap turn (right stick)
	# - Jump (button press)
	# - Sprint (button hold)
	# - Terrain following
	# - Swimming mode when below water level
	pass


## Get the active camera position (works for both XR and desktop).
func get_camera_position() -> Vector3:
	if xr_active:
		return xr_camera.global_position
	elif desktop_camera:
		return desktop_camera.global_position
	return Vector3.ZERO


## Get the active camera forward direction.
func get_camera_forward() -> Vector3:
	if xr_active:
		return -xr_camera.global_transform.basis.z
	elif desktop_camera:
		return -desktop_camera.global_transform.basis.z
	return Vector3.FORWARD
