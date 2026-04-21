extends RefCounted
## Weather state machine per SPEC-06.
## weatherIntensity: 0.0 = sunny, 1.0 = cloudy, 2.0 = stormy.
## Transitions smoothly between states, holds for random durations.
## Keys 1/2/3 manually set weather target.

var intensity := 0.0
var target_intensity := 0.0

var _hold_timer := 0.0
var _hold_duration := 0.0
var _manual_hold := false

# Derived parameters (updated each frame)
var cloud_density := 0.0
var cloud_darkness := 0.0
var wind_multiplier := 1.0
var fog_multiplier := 1.0
var rain_intensity := 0.0
var light_dimming := 0.0
var sky_darkening := 0.0
var wave_amplitude := 1.0
var wetness := 0.0

var _state_name := "Clear"


func _init() -> void:
	# Start with a random hold before first transition
	_hold_duration = Config.WEATHER_HOLD_MIN + randf() * (Config.WEATHER_HOLD_MAX - Config.WEATHER_HOLD_MIN)


func update(delta: float) -> void:
	_handle_input()
	_update_state(delta)
	_compute_derived()
	_update_wetness(delta)


func _handle_input() -> void:
	if Input.is_action_just_pressed("weather_sunny"):
		_set_manual_target(0.0)
	elif Input.is_action_just_pressed("weather_cloudy"):
		_set_manual_target(1.0)
	elif Input.is_action_just_pressed("weather_stormy"):
		_set_manual_target(2.0)


func _set_manual_target(target: float) -> void:
	target_intensity = target
	_manual_hold = true
	_hold_timer = 0.0
	_hold_duration = Config.WEATHER_HOLD_MAX + 60.0 + randf() * (Config.WEATHER_HOLD_MAX - Config.WEATHER_HOLD_MIN)


func _update_state(delta: float) -> void:
	if not is_equal_approx(intensity, target_intensity):
		var step: float = Config.WEATHER_TRANSITION_RATE * delta * 120.0
		if intensity < target_intensity:
			intensity = minf(intensity + step, target_intensity)
		else:
			intensity = maxf(intensity - step, target_intensity)
	else:
		_hold_timer += delta
		if _hold_timer >= _hold_duration:
			# Pick a new target excluding current
			var current_state := roundi(intensity)
			var candidates: Array[int] = []
			for s in [0, 1, 2]:
				if s != current_state:
					candidates.append(s)
			target_intensity = float(candidates[randi() % candidates.size()])
			_hold_duration = Config.WEATHER_HOLD_MIN + randf() * (Config.WEATHER_HOLD_MAX - Config.WEATHER_HOLD_MIN)
			_hold_timer = 0.0
			_manual_hold = false


func _compute_derived() -> void:
	var w := intensity

	if w <= 1.0:
		cloud_density = w * 0.8
		cloud_darkness = w * 0.65
		wind_multiplier = 0.3 + w * 0.7
		fog_multiplier = 1.0 - w * 0.5
		light_dimming = w * 0.35
		sky_darkening = w * 0.35
		wave_amplitude = 1.0 + w * 0.15
	else:
		var w1 := w - 1.0
		cloud_density = 0.8 + w1 * 0.1
		cloud_darkness = 0.65 + w1 * 0.25
		wind_multiplier = 1.0 + w1 * 1.5
		fog_multiplier = 0.5 - w1 * 0.3
		light_dimming = 0.35 + w1 * 0.15
		sky_darkening = 0.35 + w1 * 0.15
		wave_amplitude = 1.15 + w1 * 0.65

	rain_intensity = maxf(0.0, w - 1.0)
	fog_multiplier = maxf(fog_multiplier, 0.1)

	if w < 0.5:
		_state_name = "Clear"
	elif w < 1.5:
		_state_name = "Cloudy"
	else:
		_state_name = "Stormy"


func _update_wetness(delta: float) -> void:
	if rain_intensity > 0.05:
		wetness += Config.WETNESS_WET_RATE * delta * rain_intensity * 120.0
	else:
		wetness -= Config.WETNESS_DRY_RATE * delta * 120.0
	wetness = clampf(wetness, 0.0, 1.0)


func get_state_name() -> String:
	return _state_name
