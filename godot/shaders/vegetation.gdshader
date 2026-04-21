shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Wind animation + backface normal fix for grass, ferns, flowers.

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Height mask from local vertex Y
	float height_mask = clamp(VERTEX.y * 8.0, 0.0, 1.0);

	// Phase from world position for per-instance variation
	float phase = world_pos.x * 0.23 + world_pos.z * 0.31;

	// Sway: slow gentle movement
	float sway_x = sin(TIME * 1.2 + phase) * 0.025;
	float sway_z = cos(TIME * 0.9 + phase * 1.4) * 0.020;

	// Gust: occasional stronger push
	float gust = sin(TIME * 0.3 + phase * 0.5) * 0.5 + 0.5;
	gust = gust * gust; // sharpen gusts
	float gust_x = sin(TIME * 1.8 + phase) * gust * 0.015;

	vec3 displacement = vec3(
		(sway_x + gust_x) * height_mask,
		0.0,
		sway_z * height_mask
	);

	VERTEX += displacement;
}

void fragment() {
	vec3 base = COLOR.rgb;

	// Blade/frond detail — lengthwise stripe darkening (vein/midrib effect)
	// Uses local VERTEX.y as height along blade; world_pos for per-instance variation
	float midrib = abs(sin(world_pos.x * 50.0 + world_pos.z * 45.0)) * 0.12;
	// Cross-hatched vein pattern at finer scale
	float veins = sin(world_pos.y * 80.0 + world_pos.x * 30.0) *
	              sin(world_pos.z * 35.0 + world_pos.y * 60.0);
	veins = veins * 0.08;
	// Tip fade — slightly lighter/yellower toward blade tips
	float tip_fade = smoothstep(0.08, 0.2, VERTEX.y);
	base -= midrib * (1.0 - tip_fade * 0.5);
	base += veins;
	base += vec3(0.04, 0.02, -0.01) * tip_fade;

	// Flip normal for backfaces
	vec3 normal = NORMAL;
	if (!FRONT_FACING) {
		normal = -normal;
	}

	ALBEDO = clamp(base, vec3(0.0), vec3(1.0));
	NORMAL = normal;
	ROUGHNESS = 0.8;
	METALLIC = 0.0;
}
