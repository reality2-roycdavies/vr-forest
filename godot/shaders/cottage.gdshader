shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Wood grain detail on logs, stone speckle on chimney.
// Reuses noise approach from trunk.gdshader.

varying vec3 local_pos;
varying vec3 world_pos;

void vertex() {
	local_pos = VERTEX;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
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

float fbm(vec2 p, int octaves) {
	float value = 0.0;
	float amp = 0.5;
	float freq = 1.0;
	for (int i = 0; i < octaves; i++) {
		value += amp * vnoise(p * freq);
		p = vec2(p.x * 0.866 - p.y * 0.5, p.x * 0.5 + p.y * 0.866);
		freq *= 2.13;
		amp *= 0.48;
	}
	return value;
}

void fragment() {
	vec3 base = COLOR.rgb;

	// Detect stone by low saturation (grey vertex colors)
	float max_c = max(base.r, max(base.g, base.b));
	float min_c = min(base.r, min(base.g, base.b));
	float saturation = (max_c > 0.01) ? (max_c - min_c) / max_c : 0.0;

	if (saturation < 0.12 && max_c > 0.2 && max_c < 0.6) {
		// Stone texture: speckle noise
		vec2 stone_uv = world_pos.xz * 8.0 + vec2(world_pos.y * 3.0);
		float speckle = fbm(stone_uv, 3);
		float mortar = smoothstep(0.35, 0.65, sin(world_pos.y * 12.0) * 0.5 + 0.5);
		mortar *= smoothstep(0.35, 0.65, sin(world_pos.x * 8.0 + world_pos.z * 8.0 + world_pos.y * 3.0) * 0.5 + 0.5);
		base *= (1.0 - speckle * 0.15 - mortar * 0.08);
	} else {
		// Wood grain on logs
		float angle = atan(local_pos.z, local_pos.x);
		float height = local_pos.y;

		vec2 bark_uv = vec2(angle * 3.0, height * 10.0);

		// Domain warp
		vec2 warp = vec2(
			vnoise(bark_uv * 0.7 + vec2(0.0, 5.3)) * 0.6,
			vnoise(bark_uv * 0.7 + vec2(7.1, 0.0)) * 0.3
		);
		vec2 warped = bark_uv + warp;

		// Bark grooves
		float groove = sin(warped.y * 5.0 + warped.x * 0.8) * 0.5 + 0.5;
		groove = groove * groove;

		// Fine cracks
		float crack = fbm(warped * 2.0, 2);
		crack = crack * crack;

		float depth_var = vnoise(bark_uv * 0.4);
		float bark_dark = groove * (0.12 + depth_var * 0.10) + crack * 0.06;
		base *= (1.0 - bark_dark);
	}

	// Normal perturbation
	float eps = 0.3;
	vec2 n_uv = vec2(world_pos.x * 4.0, world_pos.y * 8.0);
	float h_a = fbm(n_uv + vec2(eps, 0.0), 2);
	float h_b = fbm(n_uv - vec2(eps, 0.0), 2);
	float h_c = fbm(n_uv + vec2(0.0, eps), 2);
	float h_d = fbm(n_uv - vec2(0.0, eps), 2);
	float nx = (h_a - h_b) * 0.15;
	float nz = (h_c - h_d) * 0.15;
	vec3 perturbed = normalize(NORMAL + vec3(nx, 0.0, nz));

	ALBEDO = clamp(base, vec3(0.0), vec3(1.0));
	NORMAL = perturbed;
	ROUGHNESS = 0.85;
	METALLIC = 0.0;
}
