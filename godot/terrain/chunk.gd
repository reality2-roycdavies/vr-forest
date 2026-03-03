extends Node3D
## Single terrain chunk — holds mesh and tree placement data.

var chunk_coord: Vector2i
var tree_data: Array[Dictionary] = []
var _mesh_instance: MeshInstance3D

static var _material: StandardMaterial3D


func setup(coord: Vector2i, mesh: ArrayMesh, trees: Array[Dictionary]) -> void:
	chunk_coord = coord
	tree_data = trees

	if _material == null:
		_material = StandardMaterial3D.new()
		_material.vertex_color_use_as_albedo = true
		_material.roughness = 0.85
		_material.metallic = 0.0

	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.mesh = mesh
	_mesh_instance.material_override = _material
	_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(_mesh_instance)
