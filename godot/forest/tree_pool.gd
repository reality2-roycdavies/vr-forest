extends Node3D
## Renders all trees using MultiMeshInstance3D for performance.
## 8 MultiMeshInstance3D nodes: 4 tree types × (trunk + canopy).

const FactoryScript = preload("res://forest/tree_factory.gd")

var _factory: RefCounted
var _multi_meshes: Array[MultiMeshInstance3D] = []
var _trunk_material: ShaderMaterial
var _canopy_material: ShaderMaterial
var _weather: RefCounted


func _ready() -> void:
	_factory = FactoryScript.new()

	_trunk_material = ShaderMaterial.new()
	_trunk_material.shader = load("res://shaders/trunk.gdshader")

	_canopy_material = ShaderMaterial.new()
	_canopy_material.shader = load("res://shaders/canopy.gdshader")

	# Create 8 MultiMeshInstance3D nodes (4 types × trunk/canopy)
	for type_idx in 4:
		for part in 2:  # 0=trunk, 1=canopy
			var mmi := MultiMeshInstance3D.new()
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

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


func set_weather(weather: RefCounted) -> void:
	_weather = weather


func _process(_delta: float) -> void:
	if _weather != null:
		var ws: float = _weather.wind_multiplier
		_canopy_material.set_shader_parameter("wind_strength", ws)
		_trunk_material.set_shader_parameter("wind_strength", ws)


func rebuild(tree_data: Array[Dictionary]) -> void:
	# Sort trees by type
	var by_type: Array[Array] = [[], [], [], []]
	for tree in tree_data:
		var t: int = tree["type"]
		if t >= 0 and t < 4:
			by_type[t].append(tree)

	# Update each MultiMesh
	for type_idx in 4:
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

			# Per-instance Y rotation from deterministic hash
			var angle := fmod(pos.x * 73.13 + pos.z * 37.17, TAU)
			var b := Basis(Vector3.UP, angle).scaled(Vector3(s, s, s))

			var xform := Transform3D(b, pos)

			trunk_mm.set_instance_transform(i, xform)
			canopy_mm.set_instance_transform(i, xform)
