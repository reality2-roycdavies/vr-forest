extends Node3D
## Renders all trees using MultiMeshInstance3D for performance.
## 6 MultiMeshInstance3D nodes: 3 tree types × (trunk + canopy).

const FactoryScript = preload("res://forest/tree_factory.gd")

var _factory: RefCounted
var _multi_meshes: Array[MultiMeshInstance3D] = []
var _trunk_material: StandardMaterial3D
var _canopy_material: StandardMaterial3D


func _ready() -> void:
	_factory = FactoryScript.new()

	_trunk_material = StandardMaterial3D.new()
	_trunk_material.vertex_color_use_as_albedo = true
	_trunk_material.roughness = 0.9
	_trunk_material.cull_mode = BaseMaterial3D.CULL_BACK

	_canopy_material = StandardMaterial3D.new()
	_canopy_material.vertex_color_use_as_albedo = true
	_canopy_material.roughness = 0.8
	_canopy_material.cull_mode = BaseMaterial3D.CULL_DISABLED

	# Create 6 MultiMeshInstance3D nodes (3 types × trunk/canopy)
	for type_idx in 3:
		for part in 2:  # 0=trunk, 1=canopy
			var mmi := MultiMeshInstance3D.new()
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if part == 0 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_colors = false
			mm.instance_count = 0

			if part == 0:
				mm.mesh = _factory.get_trunk_mesh(type_idx)
				mmi.material_override = _trunk_material
			else:
				mm.mesh = _factory.get_canopy_mesh(type_idx)
				mmi.material_override = _canopy_material

			mmi.multimesh = mm
			add_child(mmi)
			_multi_meshes.append(mmi)


func rebuild(tree_data: Array[Dictionary]) -> void:
	# Sort trees by type
	var by_type: Array[Array] = [[], [], []]
	for tree in tree_data:
		var t: int = tree["type"]
		if t >= 0 and t < 3:
			by_type[t].append(tree)

	# Update each MultiMesh
	for type_idx in 3:
		var trees: Array = by_type[type_idx]
		var count := trees.size()

		var trunk_mm: MultiMesh = _multi_meshes[type_idx * 2].multimesh
		var canopy_mm: MultiMesh = _multi_meshes[type_idx * 2 + 1].multimesh

		trunk_mm.instance_count = 0
		canopy_mm.instance_count = 0
		trunk_mm.instance_count = count
		canopy_mm.instance_count = count

		for i in count:
			var tree: Dictionary = trees[i]
			var pos: Vector3 = tree["position"]
			var s: float = tree["scale"]

			var xform := Transform3D(
				Basis.IDENTITY.scaled(Vector3(s, s, s)),
				pos
			)

			trunk_mm.set_instance_transform(i, xform)
			canopy_mm.set_instance_transform(i, xform)
