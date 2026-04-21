shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Bark grooves (standard + birch bands) with normal perturbation.
// Uses cylindrical coordinates + noise for irregular, natural-looking bark.

uniform float wind_strength : hint_range(0.0, 3.0) = 1.0;

varying vec3 local_pos;

void vertex() {
	local_pos = VERTEX;

	// Gentle trunk sway — increases with height, scaled by weather wind
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = wp.x * 0.13 + wp.z * 0.17;
	float height_mask = clamp(VERTEX.y * 0.8, 0.0, 1.0);
	float ws = wind_strength;

	float sway_x = sin(TIME * 0.8 + phase) * 0.012 * ws;
	float sway_z = cos(TIME * 0.65 + phase * 1.3) * 0.008 * ws;

	VERTEX.x += sway_x * height_mask;
	VERTEX.z += sway_z * height_mask;
}

// Hash for noise
float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// Value noise with smooth interpolation
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f); // smoothstep

	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));

	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// FBM for richer noise
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

	// Cylindrical coordinates: angle wraps seamlessly around trunk
	float angle = atan(local_pos.z, local_pos.x); // -PI to PI, seamless via atan2
	float height = local_pos.y;

	// Bark UV: angle normalized to 0..1 range (wraps seamlessly), height as-is
	// Multiply angle by integer to ensure seamless wrapping in noise domain
	vec2 bark_uv = vec2(angle * 3.0, height * 12.0);

	// Detect birch by luminance > 0.55
	float lum = dot(base, vec3(0.299, 0.587, 0.114));
	bool is_birch = lum > 0.55;

	if (is_birch) {
		// Domain warp — irregular band edges
		float warp = vnoise(vec2(angle * 2.0, height * 8.0)) * 0.15;
		float warped_h = height + warp;

		// Irregular horizontal dark bands
		float band = sin(warped_h * 45.0) * 0.5 + 0.5;
		band = smoothstep(0.25, 0.55, band);
		float band2 = sin(warped_h * 110.0 + 2.3) * 0.5 + 0.5;
		band2 = smoothstep(0.35, 0.65, band2);

		// Peeling texture — noise-modulated
		float peel_noise = fbm(vec2(angle * 4.0, height * 20.0), 2);
		float peel = peel_noise * 0.08;

		// Depth variation from noise — some bands darker than others
		float depth_var = vnoise(vec2(angle * 1.5, height * 3.0));
		float dark_factor = band * (0.18 + depth_var * 0.14) + band2 * 0.10 + peel;
		base *= (1.0 - dark_factor);
	} else {
		// Domain warp — makes grooves meander instead of running perfectly straight
		vec2 warp = vec2(
			vnoise(bark_uv * 0.7 + vec2(0.0, 5.3)) * 0.8,
			vnoise(bark_uv * 0.7 + vec2(7.1, 0.0)) * 0.4
		);
		vec2 warped = bark_uv + warp;

		// Primary bark grooves — warped for irregularity
		float groove = sin(warped.y * 6.5 + warped.x * 1.2) * 0.5 + 0.5;
		groove = groove * groove;

		// Secondary finer cracks
		float crack = fbm(warped * 2.5, 2);
		crack = crack * crack;

		// Noise-modulated depth — some areas have deeper grooves
		float depth_var = vnoise(bark_uv * 0.4);

		float bark_dark = groove * (0.15 + depth_var * 0.15) + crack * 0.08;
		base *= (1.0 - bark_dark);
	}

	// Normal perturbation — also noise-warped for irregular relief
	float eps = 0.3;
	vec2 n_uv = bark_uv * (is_birch ? 0.6 : 1.0);
	float h_a = fbm(n_uv + vec2(eps, 0.0), 2);
	float h_b = fbm(n_uv - vec2(eps, 0.0), 2);
	float h_c = fbm(n_uv + vec2(0.0, eps), 2);
	float h_d = fbm(n_uv - vec2(0.0, eps), 2);
	float nx = (h_a - h_b) * 0.2;
	float nz = (h_c - h_d) * 0.2;
	vec3 perturbed = normalize(NORMAL + vec3(nx, 0.0, nz));

	ALBEDO = clamp(base, vec3(0.0), vec3(1.0));
	NORMAL = perturbed;
	ROUGHNESS = 0.9;
	METALLIC = 0.0;
}
