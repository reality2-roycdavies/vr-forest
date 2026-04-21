extends Node3D
## Renders all vegetation using MultiMeshInstance3D for performance.
## 27 MultiMeshInstance3D nodes:
##   1 grass tuft, 3 ferns, 18 flowers (3×6), 3 rocks, 1 fallen log, 1 stump.

const VegFactoryScript = preload("res://forest/veg_factory.gd")

var _factory: RefCounted
var _multi_meshes: Array[MultiMeshInstance3D] = []

# Material categories
var _veg_material: ShaderMaterial         # grass/fern/flower (vegetation shader)
var _rock_material: StandardMaterial3D    # rocks (CULL_BACK)
var _wood_material: StandardMaterial3D    # logs/stumps (CULL_BACK)

# Index mapping: type_key -> MMI index in _multi_meshes array
# type_key for flowers: type * 100 + color_idx
var _type_to_index: Dictionary = {}


func _ready() -> void:
	_factory = VegFactoryScript.new()

	_veg_material = ShaderMaterial.new()
	_veg_material.shader = load("res://shaders/vegetation.gdshader")

	_rock_material = StandardMaterial3D.new()
	_rock_material.vertex_color_use_as_albedo = true
	_rock_material.roughness = 0.95
	_rock_material.cull_mode = BaseMaterial3D.CULL_BACK

	_wood_material = StandardMaterial3D.new()
	_wood_material.vertex_color_use_as_albedo = true
	_wood_material.roughness = 0.9
	_wood_material.cull_mode = BaseMaterial3D.CULL_BACK

	# 0: Grass tuft
	_add_mmi(0, 0, _veg_material)

	# 1-3: Ferns (compact, spreading, tall)
	for fern_type in range(1, 4):
		_add_mmi(fern_type, 0, _veg_material)

	# 4-21: Flowers (3 variants × 6 colors)
	for flower_type in range(4, 7):
		for color_idx in 6:
			_add_mmi(flower_type, color_idx, _veg_material)

	# 22-24: Rocks (small, medium, large)
	for rock_type in range(7, 10):
		_add_mmi(rock_type, 0, _rock_material)

	# 25: Fallen log
	_add_mmi(10, 0, _wood_material)

	# 26: Stump
	_add_mmi(11, 0, _wood_material)


func _add_mmi(veg_type: int, color_idx: int, material: Material) -> void:
	var mmi := MultiMeshInstance3D.new()
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = false
	mm.instance_count = 0
	mm.mesh = _factory.get_mesh(veg_type, color_idx)
	mmi.multimesh = mm
	mmi.material_override = material

	add_child(mmi)
	var idx := _multi_meshes.size()
	_multi_meshes.append(mmi)

	var key: int
	if veg_type >= 4 and veg_type <= 6:
		key = veg_type * 100 + color_idx
	else:
		key = veg_type
	_type_to_index[key] = idx


func rebuild(veg_data: Array[Dictionary]) -> void:
	print("[VegPool] rebuild called with ", veg_data.size(), " items")
	# Sort into buckets by type key
	var buckets: Dictionary = {}  # type_key -> Array[Dictionary]
	for item in veg_data:
		var t: int = item["type"]
		var key: int
		if t >= 4 and t <= 6:
			key = t * 100 + int(item["color_idx"])
		else:
			key = t
		if not buckets.has(key):
			buckets[key] = []
		buckets[key].append(item)

	# Apply per-category caps
	_apply_cap(buckets, [0], Config.VEG_GRASS_CAP)
	_apply_cap(buckets, [1, 2, 3], Config.VEG_FERN_CAP)

	var flower_keys: Array[int] = []
	for ft in range(4, 7):
		for ci in 6:
			flower_keys.append(ft * 100 + ci)
	_apply_cap(buckets, flower_keys, Config.VEG_FLOWER_CAP)

	_apply_cap(buckets, [7, 8, 9], Config.VEG_ROCK_CAP)
	_apply_cap(buckets, [10], Config.VEG_LOG_CAP)
	_apply_cap(buckets, [11], Config.VEG_STUMP_CAP)

	# Populate each MultiMesh
	for key in _type_to_index:
		var idx: int = _type_to_index[key]
		var items: Array = buckets.get(key, [])
		var count := items.size()

		var mm: MultiMesh = _multi_meshes[idx].multimesh
		mm.instance_count = 0
		mm.instance_count = count

		for i in count:
			var item: Dictionary = items[i]
			var pos: Vector3 = item["position"]
			var rot: float = item["rotation"]
			var s: float = item["scale"]
			var t: int = item["type"]

			var xform: Transform3D
			if t == 10:
				# Fallen log: pitch -90° to lie horizontal, scale encodes length/radius
				var log_len: float = item["length"]
				var log_rad: float = item["radius"]
				var b := Basis(Vector3.UP, rot) * Basis(Vector3.RIGHT, -PI / 2.0)
				b = b.scaled(Vector3(log_rad, log_len, log_rad))
				xform = Transform3D(b, pos)
			elif t == 11:
				# Stump: scale by radius (x,z) and height (y)
				var stump_h: float = item["length"]
				var stump_r: float = item["radius"]
				var b := Basis(Vector3.UP, rot).scaled(Vector3(stump_r, stump_h, stump_r))
				xform = Transform3D(b, pos)
			else:
				var b := Basis(Vector3.UP, rot).scaled(Vector3(s, s, s))
				xform = Transform3D(b, pos)

			mm.set_instance_transform(i, xform)

	# Debug: log instance counts per type
	var debug_counts := {}
	for key in _type_to_index:
		var idx: int = _type_to_index[key]
		var c: int = _multi_meshes[idx].multimesh.instance_count
		if c > 0:
			debug_counts[key] = c
	print("[VegPool] instance counts: ", debug_counts)


func _apply_cap(buckets: Dictionary, keys: Array, cap: int) -> void:
	# Count total items across keys
	var total := 0
	for key in keys:
		if buckets.has(key):
			total += buckets[key].size()

	if total <= cap:
		return

	# Collect all items with their keys, sort by distance to origin (player approx)
	# We use a simple approach: proportionally trim each bucket
	var ratio := float(cap) / float(total)
	for key in keys:
		if buckets.has(key):
			var arr: Array = buckets[key]
			var new_count := int(arr.size() * ratio)
			if new_count < arr.size():
				arr.resize(new_count)


