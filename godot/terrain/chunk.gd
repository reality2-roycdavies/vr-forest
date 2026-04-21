extends Node3D
## Single terrain chunk — holds terrain mesh, water mesh, and placement data.

var chunk_coord: Vector2i
var tree_data: Array[Dictionary] = []
var veg_data: Array[Dictionary] = []
var cottage_data: Array[Dictionary] = []
var _mesh_instance: MeshInstance3D
var _water_instance: MeshInstance3D

static var _material: ShaderMaterial
static var _water_material: StandardMaterial3D


func setup(coord: Vector2i, mesh: ArrayMesh, trees: Array[Dictionary],
		vegetation: Array[Dictionary] = [], cottages: Array[Dictionary] = [],
		water_mesh: ArrayMesh = null) -> void:
	chunk_coord = coord
	tree_data = trees
	veg_data = vegetation
	cottage_data = cottages

	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = load("res://shaders/terrain.gdshader")

	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.mesh = mesh
	_mesh_instance.material_override = _material
	_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(_mesh_instance)

	if water_mesh != null and water_mesh.get_surface_count() > 0:
		if _water_material == null:
			_water_material = StandardMaterial3D.new()
			_water_material.albedo_color = Config.WATER_COLOR
			_water_material.roughness = 0.3
			_water_material.metallic = 0.1
			_water_material.cull_mode = BaseMaterial3D.CULL_DISABLED

		_water_instance = MeshInstance3D.new()
		_water_instance.mesh = water_mesh
		_water_instance.material_override = _water_material
		_water_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(_water_instance)
