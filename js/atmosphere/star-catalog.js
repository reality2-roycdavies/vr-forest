// Real star catalog — ~440 brightest stars (mag ≤ 4.5) with accurate J2000 positions
// Packed binary: 5 bytes/star → RA(uint16) + Dec(uint16) + Mag(uint8)
// Sources: Yale Bright Star Catalog, HYG Database

const PACKED = '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';

let _cache = null;

/**
 * Decode packed star catalog.
 * @returns {Array<{ra: number, dec: number, mag: number}>} ra/dec in radians
 */
export function getStarCatalog() {
  if (_cache) return _cache;

  const bin = atob(PACKED);
  const count = (bin.length / 5) | 0;
  _cache = new Array(count);

  for (let i = 0; i < count; i++) {
    const off = i * 5;
    const raInt  = bin.charCodeAt(off) | (bin.charCodeAt(off + 1) << 8);
    const decInt = bin.charCodeAt(off + 2) | (bin.charCodeAt(off + 3) << 8);
    const magInt = bin.charCodeAt(off + 4);

    _cache[i] = {
      ra:  raInt / 65535 * 2 * Math.PI,                      // radians
      dec: (decInt / 65535 * 180 - 90) * (Math.PI / 180),    // radians
      mag: magInt / 31.875 - 1.5,                             // visual magnitude
    };
  }

  return _cache;
}
