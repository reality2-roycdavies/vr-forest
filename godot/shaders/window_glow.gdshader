shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Emissive window panes controlled by sun elevation.

uniform float glow_factor : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec3 base = COLOR.rgb;
	vec3 glow_color = vec3(0.9, 0.65, 0.2); // warm amber

	ALBEDO = base;
	EMISSION = glow_color * glow_factor * 0.15;
	ROUGHNESS = 0.3;
	METALLIC = 0.0;
}
