import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';
import { getStarCatalog } from '../js/atmosphere/star-catalog.js';
import { getPlanetPositions } from '../js/atmosphere/planet-ephemeris.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';
import { expectInRange, expectClose } from './helpers/assertions.js';

const vectors = loadVectors('atmosphere');

describe('VF-ATMOSPHERE: atmo-001 — Star catalog count', () => {
  const v = getVector(vectors, 'atmo-001');

  it(`contains exactly ${v.expected.starCount} stars`, () => {
    const stars = getStarCatalog();
    expect(stars.length).toBe(v.expected.starCount);
  });

  it('each star has ra, dec, mag, bv properties', () => {
    const stars = getStarCatalog();
    for (const star of stars) {
      expect(star).toHaveProperty('ra');
      expect(star).toHaveProperty('dec');
      expect(star).toHaveProperty('mag');
      expect(star).toHaveProperty('bv');
    }
  });

  it('RA is in [0, 2*PI]', () => {
    const stars = getStarCatalog();
    for (const star of stars) {
      expectInRange(star.ra, 0, 2 * Math.PI, 'ra');
    }
  });

  it('Dec is in [-PI/2, PI/2]', () => {
    const stars = getStarCatalog();
    for (const star of stars) {
      expectInRange(star.dec, -Math.PI / 2, Math.PI / 2, 'dec');
    }
  });

  it('magnitude is in [-1.5, 5.5]', () => {
    const stars = getStarCatalog();
    for (const star of stars) {
      expectInRange(star.mag, -1.6, 5.6, 'mag');
    }
  });
});

describe('VF-ATMOSPHERE: atmo-004 — Fog density range', () => {
  const v = getVector(vectors, 'atmo-004');

  it('CONFIG.FOG_NEAR and FOG_FAR match', () => {
    expect(CONFIG.FOG_NEAR).toBe(v.expected.baseFogNear);
    expect(CONFIG.FOG_FAR).toBe(v.expected.baseFogFar);
  });
});

describe('VF-ATMOSPHERE: atmo-005 — Cloud count', () => {
  const v = getVector(vectors, 'atmo-005');

  it('CONFIG.CLOUD_COUNT matches', () => {
    expect(CONFIG.CLOUD_COUNT).toBe(v.expected.cloudGroups);
  });

  it('cloud height range matches', () => {
    expect(CONFIG.CLOUD_HEIGHT_MIN).toBe(v.expected.heightRange[0]);
    expect(CONFIG.CLOUD_HEIGHT_MAX).toBe(v.expected.heightRange[1]);
  });

  it('cloud radius range matches', () => {
    expect(CONFIG.CLOUD_MIN_RADIUS).toBe(v.expected.radiusRange[0]);
    expect(CONFIG.CLOUD_MAX_RADIUS).toBe(v.expected.radiusRange[1]);
  });
});

describe('VF-ATMOSPHERE: atmo-006 — Moon visual radius', () => {
  const v = getVector(vectors, 'atmo-006');

  it('CONFIG matches moon parameters', () => {
    expect(CONFIG.MOON_VISUAL_RADIUS).toBe(v.expected.moonVisualRadius);
    expect(CONFIG.MOON_DISTANCE).toBe(v.expected.moonDistance);
  });
});

describe('VF-ATMOSPHERE: atmo-007 — Planet visual radius', () => {
  const v = getVector(vectors, 'atmo-007');

  it('CONFIG matches planet parameters', () => {
    expect(CONFIG.PLANET_VISUAL_RADIUS).toBe(v.expected.planetVisualRadius);
    expect(CONFIG.PLANET_DISTANCE).toBe(v.expected.planetDistance);
  });

  it('getPlanetPositions returns 5 planets with altitude/azimuth/magnitude', () => {
    // getPlanetPositions(JD, T, latitude, longitude, LST)
    // Use J2000 epoch: JD=2451545.0, T=0
    const JD = 2451545.0;
    const T = 0;
    const lat = CONFIG.DEFAULT_LATITUDE;
    const lon = CONFIG.DEFAULT_LONGITUDE;
    const LST = 0;
    const planets = getPlanetPositions(JD, T, lat, lon, LST);
    expect(planets.length).toBe(5);
    for (const p of planets) {
      expect(p).toHaveProperty('altitude');
      expect(p).toHaveProperty('azimuth');
      expect(p).toHaveProperty('magnitude');
      expect(typeof p.altitude).toBe('number');
      expect(typeof p.azimuth).toBe('number');
      expect(typeof p.magnitude).toBe('number');
    }
  });
});
