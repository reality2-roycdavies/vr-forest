extends RefCounted
## Astronomical day/night cycle — sun position, palette blending.
## Uses real device time and Auckland, NZ coordinates per SPEC-05.

# --- Sky palettes keyed by sun elevation (hex values from SPEC-05 §2.3) ---
# Each palette: { sky_top, sky_bottom, fog, sun_colour, sun_intensity,
#                 hemi_sky, hemi_ground, hemi_intensity, ambient_intensity }

const PALETTE_DEEP_NIGHT := {
	"sky_top": Color(0x0a / 255.0, 0x10 / 255.0, 0x20 / 255.0),
	"sky_bottom": Color(0x08 / 255.0, 0x0c / 255.0, 0x14 / 255.0),
	"fog": Color(0x10 / 255.0, 0x14 / 255.0, 0x20 / 255.0),
	"sun_colour": Color(0x04 / 255.0, 0x07 / 255.0, 0x0c / 255.0),
	"sun_intensity": 0.0,
	"hemi_sky": Color(0x30 / 255.0, 0x40 / 255.0, 0x60 / 255.0),
	"hemi_ground": Color(0x18 / 255.0, 0x20 / 255.0, 0x2a / 255.0),
	"hemi_intensity": 0.35,
	"ambient_intensity": 0.8,
}

const PALETTE_NIGHT := {
	"sky_top": Color(0x0c / 255.0, 0x18 / 255.0, 0x30 / 255.0),
	"sky_bottom": Color(0x0a / 255.0, 0x10 / 255.0, 0x18 / 255.0),
	"fog": Color(0x10 / 255.0, 0x18 / 255.0, 0x28 / 255.0),
	"sun_colour": Color(0x05 / 255.0, 0x08 / 255.0, 0x10 / 255.0),
	"sun_intensity": 0.0,
	"hemi_sky": Color(0x40 / 255.0, 0x58 / 255.0, 0x80 / 255.0),
	"hemi_ground": Color(0x20 / 255.0, 0x28 / 255.0, 0x35 / 255.0),
	"hemi_intensity": 0.5,
	"ambient_intensity": 0.9,
}

const PALETTE_TWILIGHT := {
	"sky_top": Color(0x1a / 255.0, 0x1a / 255.0, 0x50 / 255.0),
	"sky_bottom": Color(0xd4 / 255.0, 0x72 / 255.0, 0x5c / 255.0),
	"fog": Color(0x8a / 255.0, 0x60 / 255.0, 0x50 / 255.0),
	"sun_colour": Color(0xff / 255.0, 0x68 / 255.0, 0x30 / 255.0),
	"sun_intensity": 0.5,
	"hemi_sky": Color(0x55 / 255.0, 0x44 / 255.0, 0x66 / 255.0),
	"hemi_ground": Color(0x1a / 255.0, 0x10 / 255.0, 0x08 / 255.0),
	"hemi_intensity": 0.35,
	"ambient_intensity": 0.2,
}

const PALETTE_GOLDEN := {
	"sky_top": Color(0x5a / 255.0, 0x80 / 255.0, 0xc0 / 255.0),
	"sky_bottom": Color(0xea / 255.0, 0xb0 / 255.0, 0x70 / 255.0),
	"fog": Color(0xb0 / 255.0, 0xa8 / 255.0, 0x90 / 255.0),
	"sun_colour": Color(0xff / 255.0, 0xcc / 255.0, 0x55 / 255.0),
	"sun_intensity": 0.9,
	"hemi_sky": Color(0x99 / 255.0, 0xaa / 255.0, 0xbb / 255.0),
	"hemi_ground": Color(0x3a / 255.0, 0x30 / 255.0, 0x20 / 255.0),
	"hemi_intensity": 0.55,
	"ambient_intensity": 0.38,
}

const PALETTE_DAY := {
	"sky_top": Color(0x30 / 255.0, 0x68 / 255.0, 0xcc / 255.0),
	"sky_bottom": Color(0x7a / 255.0, 0xac / 255.0, 0xcc / 255.0),
	"fog": Color(0x84 / 255.0, 0xb0 / 255.0, 0xd8 / 255.0),
	"sun_colour": Color(0xff / 255.0, 0xdd / 255.0, 0x66 / 255.0),
	"sun_intensity": 1.0,
	"hemi_sky": Color(0x80 / 255.0, 0xc0 / 255.0, 0xe8 / 255.0),
	"hemi_ground": Color(0x5a / 255.0, 0x50 / 255.0, 0x40 / 255.0),
	"hemi_intensity": 0.6,
	"ambient_intensity": 0.4,
}


## Current sun elevation in radians (updated each frame).
var sun_elevation := 0.0
## Current sun azimuth in radians.
var sun_azimuth := 0.0
## Current blended palette.
var palette := PALETTE_DAY.duplicate()


## Set to >= 0 to override the hour (e.g. 12.0 for noon, -1 for real time).
var time_override := -1.0
## Time offset in hours, adjusted by [ ] keys (SPEC-05 §2.2).
var time_offset := 0.0


func update() -> void:
	var now := Time.get_datetime_dict_from_system()
	var hours: float
	if time_override >= 0.0:
		hours = time_override
	else:
		hours = float(now["hour"]) + float(now["minute"]) / 60.0 + float(now["second"]) / 3600.0
		hours += time_offset
	var day_of_year := _day_of_year(now["year"], now["month"], now["day"])

	_calculate_sun_position(hours, day_of_year)
	_blend_palette()


## Sun position using simplified astronomical algorithm (SPEC-05 §2.1).
func _calculate_sun_position(hours: float, day_of_year: int) -> void:
	var lat := deg_to_rad(Config.DEFAULT_LATITUDE)

	# Solar declination
	var dec := deg_to_rad(-23.44 * cos(TAU * (float(day_of_year) + 10.0) / 365.0))

	# Hour angle (solar noon = 0, afternoon positive)
	var ha := deg_to_rad((hours - 12.0) * 15.0)

	# Altitude (elevation above horizon)
	var sin_alt := sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)
	sun_elevation = asin(clampf(sin_alt, -1.0, 1.0))

	# Azimuth
	var cos_alt := cos(sun_elevation)
	if cos_alt < 0.001:
		sun_azimuth = 0.0
		return

	var cos_az := (sin(dec) - sin(lat) * sin_alt) / (cos(lat) * cos_alt)
	cos_az = clampf(cos_az, -1.0, 1.0)
	sun_azimuth = acos(cos_az)
	if ha > 0.0:
		sun_azimuth = TAU - sun_azimuth


## Get sun direction as a unit Vector3.
## Coordinate system: +X = North (az 0), +Z = East (az 90), +Y = Up.
func get_sun_direction() -> Vector3:
	var cos_el := cos(sun_elevation)
	return Vector3(
		cos(sun_azimuth) * cos_el,
		sin(sun_elevation),
		sin(sun_azimuth) * cos_el
	).normalized()


## Blend between palettes based on sun elevation (SPEC-05 §2.4).
func _blend_palette() -> void:
	var el := sun_elevation

	if el > 0.1:
		palette = PALETTE_DAY.duplicate()
	elif el > 0.02:
		var t := (el - 0.02) / 0.08
		_lerp_palettes(PALETTE_GOLDEN, PALETTE_DAY, t)
	elif el > -0.02:
		var t := (el + 0.02) / 0.04
		_lerp_palettes(PALETTE_TWILIGHT, PALETTE_GOLDEN, t)
	elif el > -0.1:
		var t := (el + 0.1) / 0.08
		_lerp_palettes(PALETTE_NIGHT, PALETTE_TWILIGHT, t)
	elif el > -0.35:
		var t := (el + 0.35) / 0.25
		_lerp_palettes(PALETTE_DEEP_NIGHT, PALETTE_NIGHT, t)
	else:
		palette = PALETTE_DEEP_NIGHT.duplicate()


func _lerp_palettes(a: Dictionary, b: Dictionary, t: float) -> void:
	for key in a.keys():
		var va = a[key]
		var vb = b[key]
		if va is Color:
			palette[key] = va.lerp(vb, t)
		else:
			palette[key] = lerpf(va as float, vb as float, t)


func _day_of_year(year: int, month: int, day: int) -> int:
	var days_in_month := [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	# Leap year
	if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
		days_in_month[2] = 29
	var doy := 0
	for m in range(1, month):
		doy += days_in_month[m]
	doy += day
	return doy
