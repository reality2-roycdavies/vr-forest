shader_type spatial;
render_mode depth_draw_always, alpha_to_coverage, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Alpha-to-coverage canopy shader: noise-based alpha creates leaf gaps,
// MSAA coverage bits handle transparency without z-sorting issues.

uniform float wind_strength : hint_range(0.0, 3.0) = 1.0;

varying vec3 world_pos;

// Hash functions
float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float hash31(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n00 = hash31(i);
	float n10 = hash31(i + vec3(1,0,0));
	float n01 = hash31(i + vec3(0,1,0));
	float n11 = hash31(i + vec3(1,1,0));
	float n001 = hash31(i + vec3(0,0,1));
	float n101 = hash31(i + vec3(1,0,1));
	float n011 = hash31(i + vec3(0,1,1));
	float n111 = hash31(i + vec3(1,1,1));
	float x0 = mix(mix(n00, n10, f.x), mix(n01, n11, f.x), f.y);
	float x1 = mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y);
	return mix(x0, x1, f.z);
}

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	float height_mask = clamp(VERTEX.y * 1.5, 0.0, 1.0);
	float phase = wp.x * 0.13 + wp.z * 0.17;

	// Organic vertex displacement — breaks up smooth silhouettes
	vec3 np = wp * 4.0;
	float bulge = vnoise3(np) * 0.55
	            + vnoise3(np * 2.1 + vec3(7.3, 3.1, 5.7)) * 0.3
	            + vnoise3(np * 4.7 + vec3(13.1, 9.3, 2.1)) * 0.15;
	bulge = (bulge - 0.5) * 2.0;

	float radial = length(VERTEX.xz);
	float radial_mask = clamp(radial * 3.0, 0.0, 1.0);
	vec3 organic_offset = NORMAL * bulge * 0.22 * radial_mask;

	// Wind: sway + rustle + flutter, scaled by weather
	float ws = wind_strength;
	float sway_x = sin(TIME * 0.8 + phase) * 0.035 * ws;
	float sway_z = cos(TIME * 0.65 + phase * 1.3) * 0.025 * ws;
	float rustle_x = sin(TIME * 2.5 + phase * 2.1) * 0.012 * ws;
	float rustle_z = cos(TIME * 2.8 + phase * 1.7) * 0.012 * ws;
	float flutter = sin(TIME * 6.0 + VERTEX.x * 15.0 + VERTEX.z * 13.0 + phase) * 0.006 * ws;

	vec3 wind = vec3(
		(sway_x + rustle_x) * height_mask,
		flutter * height_mask,
		(sway_z + rustle_z) * height_mask
	);

	VERTEX += organic_offset + wind;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 base = COLOR.rgb;

	// --- Noise-based alpha: determines which fragments are "leaves" vs "gaps" ---
	// Multi-octave 3D noise sampled at world position
	vec3 ap = world_pos * 8.0;
	float leaf_noise = vnoise3(ap) * 0.5
	                 + vnoise3(ap * 2.3 + vec3(5.1, 11.7, 3.3)) * 0.3
	                 + vnoise3(ap * 5.7 + vec3(17.1, 7.3, 13.1)) * 0.2;

	// Threshold to create leaf/gap pattern — alpha_to_coverage handles soft edges
	float alpha = smoothstep(0.32, 0.42, leaf_noise);

	// Leaf-cluster color detail
	float leaf1 = vnoise(world_pos.xz * 10.0 + world_pos.y * 3.0) * 0.18;
	float leaf2 = vnoise(world_pos.xz * 23.0 + vec2(5.1, 3.7)) * 0.09;
	float leaf_detail = (leaf1 + leaf2) - 0.135;

	// Hue shift: some clusters yellow-green, others blue-green
	float hue_shift = vnoise(world_pos.xz * 4.0 + vec2(11.3, 7.1));
	vec3 warm = vec3(0.06, 0.03, -0.04);
	vec3 cool = vec3(-0.03, 0.02, 0.03);
	base += leaf_detail + mix(cool, warm, hue_shift) * 0.5;

	// Dappled light/shadow
	float dapple = vnoise(world_pos.xz * 7.0 + vec2(3.3, 9.1));
	base *= 0.85 + dapple * 0.3;

	// Normal: slight upward bias for rounder canopy shading
	vec3 normal = normalize(NORMAL + vec3(0.0, 0.15, 0.0));

	bool backface = !FRONT_FACING;
	if (backface) {
		normal = -normal;
	}

	// Back faces darkened (self-occluded interior foliage)
	if (backface) {
		base *= 0.35;
	}

	// Fake SSS on back faces
	if (backface) {
		float sss_dot = max(0.0, dot(normalize(NORMAL), VIEW));
		float sss_factor = pow(sss_dot, 2.0) * 0.35;
		base += vec3(0.2, 0.45, 0.08) * sss_factor;
	}

	ALBEDO = clamp(base, vec3(0.0), vec3(1.0));
	NORMAL = normal;
	ROUGHNESS = 0.8;
	METALLIC = 0.0;
	ALPHA = alpha;
}
