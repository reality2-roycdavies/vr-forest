shader_type spatial;
render_mode blend_add, cull_disabled, unshaded;

// Billboard smoke particle with soft alpha.
// INSTANCE_CUSTOM.r = opacity, INSTANCE_CUSTOM.g = brightness

varying float v_opacity;
varying float v_brightness;

void vertex() {
	// Pass instance custom data to fragment via varyings
	v_opacity = INSTANCE_CUSTOM.r;
	v_brightness = INSTANCE_CUSTOM.g;

	// Billboard: replace model rotation with camera-facing basis
	vec3 scale = vec3(length(MODEL_MATRIX[0]), length(MODEL_MATRIX[1]), length(MODEL_MATRIX[2]));
	vec3 world_pos = (MODEL_MATRIX * vec4(vec3(0.0), 1.0)).xyz;

	mat4 billboard = mat4(
		vec4(INV_VIEW_MATRIX[0].xyz * scale.x, 0.0),
		vec4(INV_VIEW_MATRIX[1].xyz * scale.y, 0.0),
		vec4(INV_VIEW_MATRIX[2].xyz * scale.z, 0.0),
		vec4(world_pos, 1.0)
	);

	MODELVIEW_MATRIX = VIEW_MATRIX * billboard;
}

void fragment() {
	// Soft radial gradient
	vec2 uv = UV * 2.0 - 1.0;
	float dist = length(uv);
	float alpha = smoothstep(1.0, 0.3, dist);

	vec3 smoke_color = vec3(0.55, 0.55, 0.58) * v_brightness;

	ALBEDO = smoke_color;
	ALPHA = alpha * v_opacity * 0.6;
}
