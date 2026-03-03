extends RefCounted
## Loads shared test vector JSON files from specs/testing/test-vectors/.
## GDScript equivalent of threejs/tests/helpers/load-vectors.js.
## Used by GUT tests to validate Godot implementation against spec constraints.

const VECTORS_DIR := "res://../../specs/testing/test-vectors/"


## Load a test vector JSON file by spec name (e.g. "config", "terrain").
## Returns a Dictionary with keys: spec, version, description, vectors (Array).
static func load_vectors(spec_name: String) -> Dictionary:
	var file_path := VECTORS_DIR + "vf-%s-vectors.json" % spec_name
	# Use absolute path since res:// won't resolve outside project
	var abs_path := ProjectSettings.globalize_path("res://").get_base_dir() \
		+ "/../specs/testing/test-vectors/vf-%s-vectors.json" % spec_name

	if not FileAccess.file_exists(abs_path):
		push_error("Vector file not found: %s" % abs_path)
		return {}

	var file := FileAccess.open(abs_path, FileAccess.READ)
	var json := JSON.new()
	var err := json.parse(file.get_as_text())
	if err != OK:
		push_error("Failed to parse vector file: %s" % json.get_error_message())
		return {}

	return json.data


## Get a single vector by ID from loaded vector data.
## Returns the matching Dictionary or an empty Dictionary if not found.
static func get_vector(data: Dictionary, vector_id: String) -> Dictionary:
	if not data.has("vectors"):
		push_error("Vector data missing 'vectors' array")
		return {}

	for v: Dictionary in data["vectors"]:
		if v.get("id", "") == vector_id:
			return v

	push_error("Vector %s not found in %s" % [vector_id, data.get("spec", "unknown")])
	return {}
