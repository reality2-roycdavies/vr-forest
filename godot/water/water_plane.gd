extends Node3D
## Dark opaque water plane at WATER_LEVEL, follows player XZ position.

var _mesh_instance: MeshInstance3D
var _material: StandardMaterial3D


func _ready() -> void:
	_material = StandardMaterial3D.new()
	_material.albedo_color = Config.WATER_COLOR  # (0.05, 0.15, 0.28)
	_material.roughness = 0.3
	_material.metallic = 0.1
	_material.cull_mode = BaseMaterial3D.CULL_DISABLED

	var plane_mesh := PlaneMesh.new()
	plane_mesh.size = Vector2(300.0, 300.0)
	plane_mesh.subdivide_width = 64
	plane_mesh.subdivide_depth = 64

	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.mesh = plane_mesh
	_mesh_instance.material_override = _material
	_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mesh_instance)

	# Set initial Y position
	global_position.y = Config.WATER_LEVEL


func _process(_delta: float) -> void:
	# Follow player XZ position so water is always visible
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		var player: Node3D = players[0]
		global_position.x = player.global_position.x
		global_position.z = player.global_position.z
		global_position.y = Config.WATER_LEVEL
