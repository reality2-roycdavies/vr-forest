// Keplerian orbital elements for naked-eye planets — computes alt/az positions
// Pure math module (no THREE.js dependency), following star-catalog.js pattern.
// Elements from Standish (1992) / JPL — valid ±few centuries around J2000.

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

// Keplerian elements at J2000.0 and rates per Julian century
// [a, e, I, L, wBar, Omega] and their century rates
// a = semi-major axis (AU), e = eccentricity, I = inclination (deg),
// L = mean longitude (deg), wBar = longitude of perihelion (deg),
// Omega = longitude of ascending node (deg)
const ELEMENTS = {
  mercury: {
    a0: 0.38709927, aR: 0.00000037,
    e0: 0.20563593, eR: 0.00001906,
    I0: 7.00497902, IR: -0.00594749,
    L0: 252.25032350, LR: 149472.67411175,
    wBar0: 77.45779628, wBarR: 0.16047689,
    Om0: 48.33076593, OmR: -0.12534081,
  },
  venus: {
    a0: 0.72333566, aR: 0.00000390,
    e0: 0.00677672, eR: -0.00004107,
    I0: 3.39467605, IR: -0.00078890,
    L0: 181.97909950, LR: 58517.81538729,
    wBar0: 131.60246718, wBarR: 0.00268329,
    Om0: 76.67984255, OmR: -0.27769418,
  },
  earth: {
    a0: 1.00000261, aR: 0.00000562,
    e0: 0.01671123, eR: -0.00004392,
    I0: -0.00001531, IR: -0.01294668,
    L0: 100.46457166, LR: 35999.37244981,
    wBar0: 102.93768193, wBarR: 0.32327364,
    Om0: 0.0, OmR: 0.0,
  },
  mars: {
    a0: 1.52371034, aR: 0.00001847,
    e0: 0.09339410, eR: 0.00007882,
    I0: 1.84969142, IR: -0.00813131,
    L0: -4.55343205, LR: 19140.30268499,
    wBar0: -23.94362959, wBarR: 0.44441088,
    Om0: 49.55953891, OmR: -0.29257343,
  },
  jupiter: {
    a0: 5.20288700, aR: -0.00011607,
    e0: 0.04838624, eR: -0.00013253,
    I0: 1.30439695, IR: -0.00183714,
    L0: 34.39644051, LR: 3034.74612775,
    wBar0: 14.72847983, wBarR: 0.21252668,
    Om0: 100.47390909, OmR: 0.20469106,
  },
  saturn: {
    a0: 9.53667594, aR: -0.00125060,
    e0: 0.05386179, eR: -0.00050991,
    I0: 2.48599187, IR: 0.00193609,
    L0: 49.95424423, LR: 1222.49362201,
    wBar0: 92.59887831, wBarR: -0.41897216,
    Om0: 113.66242448, OmR: -0.28867794,
  },
};

// Planet names in output order (excluding Earth)
const PLANET_NAMES = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// Approximate visual magnitude parameters: H (absolute mag), phase coeff
const MAG_PARAMS = {
  mercury: { H: -0.36, phaseFactor: 0.038 },
  venus:   { H: -4.40, phaseFactor: 0.009 },
  mars:    { H: -1.52, phaseFactor: 0.016 },
  jupiter: { H: -9.40, phaseFactor: 0.005 },
  saturn:  { H: -8.88, phaseFactor: 0.004 },
};

// Pre-allocated output array (avoid allocation per frame)
const _output = new Array(5);
for (let i = 0; i < 5; i++) _output[i] = { altitude: 0, azimuth: 0, magnitude: 0 };

// Pre-allocated heliocentric position vectors
const _earthPos = { x: 0, y: 0, z: 0 };
const _planetPos = { x: 0, y: 0, z: 0 };

/**
 * Solve Kepler's equation M = E - e·sin(E) via Newton's method (3 iterations).
 * Sufficient for e ≤ 0.21 (all naked-eye planets).
 */
function _solveKepler(M, e) {
  let E = M + e * Math.sin(M); // initial guess
  for (let i = 0; i < 3; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
  }
  return E;
}

/**
 * Compute heliocentric ecliptic {x, y, z} from orbital elements at epoch T.
 */
function _helioPos(el, T, out) {
  const a    = el.a0    + el.aR    * T;
  const e    = el.e0    + el.eR    * T;
  const I    = (el.I0   + el.IR    * T) * DEG;
  const L    = (el.L0   + el.LR   * T) * DEG;
  const wBar = (el.wBar0 + el.wBarR * T) * DEG;
  const Om   = (el.Om0  + el.OmR  * T) * DEG;

  // Argument of perihelion
  const w = wBar - Om;
  // Mean anomaly
  let M = L - wBar;
  // Normalize M to [-PI, PI]
  M = M % TWO_PI;
  if (M > Math.PI) M -= TWO_PI;
  if (M < -Math.PI) M += TWO_PI;

  // Solve Kepler's equation
  const E = _solveKepler(M, e);

  // True anomaly
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const sqrtFac = Math.sqrt(1 - e * e);
  const nu = Math.atan2(sqrtFac * sinE, cosE - e);

  // Heliocentric distance
  const r = a * (1 - e * cosE);

  // Position in orbital plane
  const cosNuW = Math.cos(nu + w);
  const sinNuW = Math.sin(nu + w);
  const cosOm = Math.cos(Om);
  const sinOm = Math.sin(Om);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);

  // Heliocentric ecliptic coordinates
  out.x = r * (cosOm * cosNuW - sinOm * sinNuW * cosI);
  out.y = r * (sinOm * cosNuW + cosOm * sinNuW * cosI);
  out.z = r * (sinNuW * sinI);

  return r; // return distance for magnitude calc
}

/**
 * Compute positions of 5 naked-eye planets in horizontal coordinates.
 * @param {number} JD  - Julian Date
 * @param {number} T   - Julian centuries since J2000.0
 * @param {number} latitude  - observer latitude in degrees
 * @param {number} longitude - observer longitude in degrees
 * @param {number} LST - local sidereal time in radians
 * @returns {Array<{altitude, azimuth, magnitude}>} - 5 planets, altitude = sin(alt)
 */
export function getPlanetPositions(JD, T, latitude, longitude, LST) {
  // Obliquity of ecliptic
  const obliquity = (23.4393 - 0.0130 * T) * DEG;
  const sinObl = Math.sin(obliquity);
  const cosObl = Math.cos(obliquity);

  // Earth's heliocentric position (needed to convert to geocentric)
  _helioPos(ELEMENTS.earth, T, _earthPos);

  const latRad = latitude * DEG;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);

  for (let i = 0; i < 5; i++) {
    const name = PLANET_NAMES[i];
    const el = ELEMENTS[name];

    // Heliocentric ecliptic position of planet
    const rHelio = _helioPos(el, T, _planetPos);

    // Geocentric ecliptic
    const geoEclX = _planetPos.x - _earthPos.x;
    const geoEclY = _planetPos.y - _earthPos.y;
    const geoEclZ = _planetPos.z - _earthPos.z;

    // Geocentric distance
    const rGeo = Math.sqrt(geoEclX * geoEclX + geoEclY * geoEclY + geoEclZ * geoEclZ);

    // Ecliptic → equatorial rotation (around x-axis by obliquity)
    const eqX = geoEclX;
    const eqY = geoEclY * cosObl - geoEclZ * sinObl;
    const eqZ = geoEclY * sinObl + geoEclZ * cosObl;

    // RA and Dec
    const RA = Math.atan2(eqY, eqX);
    const dec = Math.asin(eqZ / rGeo);

    // Hour angle
    const HA = LST - RA;

    // Equatorial → horizontal
    const sinDec = Math.sin(dec);
    const cosDec = Math.cos(dec);
    const cosHA = Math.cos(HA);

    const sinAlt = sinLat * sinDec + cosLat * cosDec * cosHA;
    const altAngle = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const cosAz = (sinDec - sinLat * sinAlt) / (cosLat * Math.cos(altAngle) + 0.0001);
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(HA) > 0) azimuth = TWO_PI - azimuth;

    // Approximate visual magnitude
    // Phase angle (angle Sun-Planet-Earth)
    const dotSPE = (geoEclX * _planetPos.x + geoEclY * _planetPos.y + geoEclZ * _planetPos.z);
    const cosPhase = dotSPE / (rGeo * rHelio + 0.0001);
    const phaseAngle = Math.acos(Math.max(-1, Math.min(1, cosPhase)));

    const mp = MAG_PARAMS[name];
    const magnitude = mp.H + 5 * Math.log10(rHelio * rGeo) + mp.phaseFactor * (phaseAngle / DEG);

    _output[i].altitude = sinAlt;
    _output[i].azimuth = azimuth;
    _output[i].magnitude = magnitude;
  }

  return _output;
}
