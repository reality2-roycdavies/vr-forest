shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Procedural micro-detail via domain-warped FBM. Fully seamless — no cell grids.

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// Hash-based pseudo-random (returns 0..1)
float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// Value noise — seamless within its own domain via smoothstep interpolation
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic Hermite (C2 continuous)

	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));

	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// FBM — irrational frequency ratio prevents visible periodicity
float fbm(vec2 p, int octaves) {
	float value = 0.0;
	float amp = 0.5;
	float freq = 1.0;
	for (int i = 0; i < octaves; i++) {
		value += amp * vnoise(p * freq);
		// Rotate each octave to break axis-alignment
		p = vec2(p.x * 0.866 - p.y * 0.5, p.x * 0.5 + p.y * 0.866);
		freq *= 2.17;
		amp *= 0.47;
	}
	return value;
}

void fragment() {
	vec3 base = COLOR.rgb;

	// Domain warp: one noise layer distorts coordinates of the detail layers.
	// This breaks up any residual grid alignment, completely seamless.
	vec2 warp = vec2(
		vnoise(world_pos.xz * 1.7 + vec2(0.0, 3.2)),
		vnoise(world_pos.xz * 1.7 + vec2(5.1, 0.0))
	);
	vec2 warped = world_pos.xz + warp * 0.6;

	// Fine grass/moss detail
	float detail1 = fbm(warped * 2.5, 3) * 0.12 - 0.06;
	// Coarse rock-grain detail
	float detail2 = fbm(world_pos.xz * 8.0, 2) * 0.06 - 0.03;

	// Zone-dependent blend: grass strokes in lowland, rock grain at altitude
	float alt_factor = clamp(world_pos.y / 20.0, 0.0, 1.0);
	float combined = detail1 * (1.0 - alt_factor) + detail2 * alt_factor * 1.5;

	base += combined;

	// Per-pixel normal perturbation from noise gradient
	float eps = 0.25;
	float h_x = vnoise(warped * 4.0 + vec2(eps, 0.0)) - vnoise(warped * 4.0 - vec2(eps, 0.0));
	float h_z = vnoise(warped * 4.0 + vec2(0.0, eps)) - vnoise(warped * 4.0 - vec2(0.0, eps));
	vec3 perturbed_normal = normalize(NORMAL + vec3(h_x * 0.08, 0.0, h_z * 0.08));

	ALBEDO = clamp(base, vec3(0.0), vec3(1.0));
	NORMAL = perturbed_normal;
	ROUGHNESS = 0.85;
	METALLIC = 0.0;
}
