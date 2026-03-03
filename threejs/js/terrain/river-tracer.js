// Physically-traced rivers: sources in mountains, trace downhill, merge at confluences
import { CONFIG } from '../config.js';
import { getBaseTerrainHeight, getJitterNoise } from './noise.js';

// --- Spatial Hash ---
class RiverSpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  insert(seg) {
    const cs = this.cellSize;
    const minCX = Math.floor(Math.min(seg.x0, seg.x1) / cs);
    const maxCX = Math.floor(Math.max(seg.x0, seg.x1) / cs);
    const minCZ = Math.floor(Math.min(seg.z0, seg.z1) / cs);
    const maxCZ = Math.floor(Math.max(seg.z0, seg.z1) / cs);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = this._key(cx, cz);
        let list = this.cells.get(key);
        if (!list) { list = []; this.cells.set(key, list); }
        list.push(seg);
      }
    }
  }

  queryNearest(x, z) {
    const cs = this.cellSize;
    const ccx = Math.floor(x / cs);
    const ccz = Math.floor(z / cs);
    let bestDist = Infinity;
    let bestSeg = null;
    let bestT = 0;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const segs = this.cells.get(this._key(ccx + dx, ccz + dz));
        if (!segs) continue;
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const res = _ptSegDist(x, z, seg.x0, seg.z0, seg.x1, seg.z1);
          if (res.dist < bestDist) {
            bestDist = res.dist;
            bestSeg = seg;
            bestT = res.t;
          }
        }
      }
    }
    return bestSeg ? { dist: bestDist, seg: bestSeg, t: bestT } : null;
  }

  removeByRiverId(invalidIds) {
    for (const [key, segs] of this.cells) {
      const filtered = segs.filter(s => !invalidIds.has(s.riverId));
      if (filtered.length === 0) {
        this.cells.delete(key);
      } else if (filtered.length < segs.length) {
        this.cells.set(key, filtered);
      }
    }
  }
}

// Point-to-segment distance + parameter t
function _ptSegDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 0.0001) {
    t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / len2));
  }
  const cx = x0 + t * dx - px;
  const cz = z0 + t * dz - pz;
  return { dist: Math.sqrt(cx * cx + cz * cz), t };
}

// --- River Tracer ---
class RiverTracer {
  constructor() {
    this.hash = null;
    this.rivers = [];      // [{points: Float64Array, pointCount, mergedInto}]
    this.centerX = 0;
    this.centerZ = 0;
    this.radius = 0;
    this.sourceCache = new Set(); // evaluated grid keys
    this._ready = false;
  }

  init(cx, cz, radius) {
    this.centerX = cx;
    this.centerZ = cz;
    this.radius = radius;
    this.hash = new RiverSpatialHash(CONFIG.RIVER_HASH_CELL);
    this.rivers = [];
    this.sourceCache.clear();
    this._ready = false;

    const sources = this._discoverSources(cx, cz, radius);
    // Sort highest first for correct confluence order
    sources.sort((a, b) => b.h - a.h);

    for (const src of sources) {
      this._traceOneRiver(src.x, src.z);
    }
    // Log per-river stats before validation
    let totalBreaches = 0;
    for (const r of this.rivers) {
      const endH = getBaseTerrainHeight(r.points[(r.pointCount-1)*3], r.points[(r.pointCount-1)*3+1]);
      console.log(`[RiverTracer]   River ${r.id}: ${r.pointCount} pts, reachedWater=${r.reachedWater}, merged=${r.mergedInto}, endH=${endH.toFixed(1)}`);
    }
    this._validateRivers();
    this._ready = true;
    const totalSegs = Array.from(this.hash.cells.values()).reduce((s, c) => s + c.length, 0);
    console.log(`[RiverTracer] Traced ${this.rivers.length} rivers from ${sources.length} sources, ${totalSegs} segments in spatial hash`);
  }

  checkRetrace(px, pz) {
    const dx = px - this.centerX;
    const dz = pz - this.centerZ;
    if (dx * dx + dz * dz > CONFIG.RIVER_RETRACE_DIST * CONFIG.RIVER_RETRACE_DIST) {
      this._expandTrace(px, pz, CONFIG.RIVER_TRACE_RADIUS);
    }
  }

  _expandTrace(cx, cz, radius) {
    this.centerX = cx;
    this.centerZ = cz;
    this.radius = radius;

    const sources = this._discoverSources(cx, cz, radius);
    sources.sort((a, b) => b.h - a.h);

    let newCount = 0;
    for (const src of sources) {
      this._traceOneRiver(src.x, src.z);
      newCount++;
    }
    if (newCount > 0) {
      this._validateRivers();
      console.log(`[RiverTracer] Expanded: ${newCount} new rivers`);
    }
  }

  _discoverSources(cx, cz, radius) {
    const spacing = CONFIG.RIVER_SOURCE_SPACING;
    const minAlt = CONFIG.RIVER_SOURCE_MIN_ALT;
    const valleyR = CONFIG.RIVER_SOURCE_VALLEY_RADIUS;
    const valleyDrop = CONFIG.RIVER_SOURCE_VALLEY_DROP;
    const sources = [];

    const gridMin = Math.floor((cx - radius) / spacing);
    const gridMax = Math.ceil((cx + radius) / spacing);
    const gridMinZ = Math.floor((cz - radius) / spacing);
    const gridMaxZ = Math.ceil((cz + radius) / spacing);

    let dbgTotal = 0, dbgInCircle = 0, dbgPassAlt = 0, dbgPassValley = 0;
    let dbgMaxH = -Infinity;

    for (let gz = gridMinZ; gz <= gridMaxZ; gz++) {
      for (let gx = gridMin; gx <= gridMax; gx++) {
        const key = `${gx},${gz}`;
        if (this.sourceCache.has(key)) continue;
        this.sourceCache.add(key);

        const baseX = gx * spacing;
        const baseZ = gz * spacing;

        // Deterministic jitter
        const jit = getJitterNoise(baseX * 0.01, baseZ * 0.01);
        const sx = baseX + jit.x * spacing * 0.35;
        const sz = baseZ + jit.z * spacing * 0.35;

        // Check if within trace circle
        const ddx = sx - cx, ddz = sz - cz;
        if (ddx * ddx + ddz * ddz > radius * radius) continue;
        dbgInCircle++;

        const h = getBaseTerrainHeight(sx, sz);
        if (h > dbgMaxH) dbgMaxH = h;
        dbgTotal++;
        if (h < minAlt) continue;
        dbgPassAlt++;

        // Valley check — source must be in a local depression (snowmelt collection)
        let surroundSum = 0;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          surroundSum += getBaseTerrainHeight(
            sx + Math.cos(angle) * valleyR,
            sz + Math.sin(angle) * valleyR
          );
        }
        if (h > surroundSum / 8 - valleyDrop) continue;
        dbgPassValley++;

        sources.push({ x: sx, z: sz, h });
      }
    }
    console.log(`[RiverTracer] Source discovery: ${dbgTotal} candidates in circle, maxH=${dbgMaxH.toFixed(1)}, passAlt(>=${minAlt})=${dbgPassAlt}, passValley=${dbgPassValley}`);
    return sources;
  }

  _traceOneRiver(startX, startZ) {
    const stepSize = CONFIG.RIVER_STEP_SIZE;
    const gradEps = CONFIG.RIVER_GRAD_EPS;
    const maxSteps = CONFIG.RIVER_MAX_STEPS;
    const momentum = CONFIG.RIVER_MOMENTUM;
    const waterLevel = CONFIG.WATER_LEVEL;
    const mergeDist = CONFIG.RIVER_MERGE_DIST;
    const maxPitBreaks = CONFIG.RIVER_PIT_MAX_BREAKS;
    const stuckInterval = CONFIG.RIVER_PIT_STUCK_INTERVAL;
    const minDescent = CONFIG.RIVER_PIT_MIN_DESCENT;

    const riverId = this.rivers.length;
    // Pre-allocate for max steps + breach segments
    const maxBreachExtra = maxPitBreaks * Math.ceil(CONFIG.RIVER_PIT_SEARCH_RADIUS / stepSize);
    const buf = new Float64Array((maxSteps + 1 + maxBreachExtra) * 3);
    buf[0] = startX;
    buf[1] = startZ;
    buf[2] = 1.0; // initial flow
    let count = 1;

    let prevDirX = 0, prevDirZ = 0;
    let reachedWater = false;
    let mergedInto = -1;
    let pitBreakCount = 0;
    let lastCheckH = getBaseTerrainHeight(startX, startZ);
    let stepsSinceCheck = 0;

    for (let step = 0; step < maxSteps; step++) {
      const x = buf[(count - 1) * 3];
      const z = buf[(count - 1) * 3 + 1];
      const flow = buf[(count - 1) * 3 + 2];

      const h = getBaseTerrainHeight(x, z);
      if (h <= waterLevel + 0.5) { reachedWater = true; break; }

      // Descent-rate stuck detection: check if river is making progress
      stepsSinceCheck++;
      if (stepsSinceCheck >= stuckInterval) {
        if (lastCheckH - h < minDescent && pitBreakCount < maxPitBreaks) {
          // Not descending — stuck in a pit, try to breach out
          const escape = this._findEscapePoint(x, z, h);
          if (escape) {
            const added = this._createBreachSegments(
              x, z, h, escape.x, escape.z, escape.h,
              flow, riverId, count, buf
            );
            count += added;
            pitBreakCount++;
            lastCheckH = escape.h;
            stepsSinceCheck = 0;
            prevDirX = 0;
            prevDirZ = 0;
            continue; // resume gradient tracing from escape point
          }
          break; // no escape found — terminate
        }
        lastCheckH = h;
        stepsSinceCheck = 0;
      }

      // Gradient via central differences
      const hL = getBaseTerrainHeight(x - gradEps, z);
      const hR = getBaseTerrainHeight(x + gradEps, z);
      const hD = getBaseTerrainHeight(x, z - gradEps);
      const hU = getBaseTerrainHeight(x, z + gradEps);
      let gx = (hL - hR) / (2 * gradEps);
      let gz = (hD - hU) / (2 * gradEps);
      let glen = Math.sqrt(gx * gx + gz * gz);

      if (glen < 0.001) {
        if (prevDirX === 0 && prevDirZ === 0) break;
        gx = prevDirX;
        gz = prevDirZ;
        glen = 1.0;
      }

      // Normalize
      let dirX = gx / glen;
      let dirZ = gz / glen;

      // Blend with momentum
      if (prevDirX !== 0 || prevDirZ !== 0) {
        dirX = dirX * (1 - momentum) + prevDirX * momentum;
        dirZ = dirZ * (1 - momentum) + prevDirZ * momentum;
        const dlen = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (dlen > 0.001) { dirX /= dlen; dirZ /= dlen; }
      }

      const newX = x + dirX * stepSize;
      const newZ = z + dirZ * stepSize;

      // Check confluence — is there an existing river segment nearby?
      const mergeResult = this.hash.queryNearest(newX, newZ);
      if (mergeResult && mergeResult.seg.riverId !== riverId && mergeResult.dist < mergeDist) {
        // Record final point
        buf[count * 3] = newX;
        buf[count * 3 + 1] = newZ;
        buf[count * 3 + 2] = flow;
        count++;

        // Add this river's flow to the target river from merge point onward
        mergedInto = mergeResult.seg.riverId;
        this._mergeFlow(mergeResult.seg.riverId, mergeResult.seg.segIdx, flow);
        break;
      }

      // Record point
      buf[count * 3] = newX;
      buf[count * 3 + 1] = newZ;
      buf[count * 3 + 2] = flow;
      count++;

      // Insert the new segment into spatial hash
      if (count >= 2) {
        const pi = count - 2;
        this.hash.insert({
          riverId,
          segIdx: pi,
          x0: buf[pi * 3], z0: buf[pi * 3 + 1],
          x1: buf[(pi + 1) * 3], z1: buf[(pi + 1) * 3 + 1],
          flow0: buf[pi * 3 + 2],
          flow1: buf[(pi + 1) * 3 + 2],
          extraCarve0: 0,
          extraCarve1: 0,
        });
      }

      prevDirX = dirX;
      prevDirZ = dirZ;
    }

    // Store river (trim buffer to actual size)
    this.rivers.push({
      id: riverId,
      points: buf.slice(0, count * 3),
      pointCount: count,
      reachedWater,
      mergedInto,
    });
  }

  _findEscapePoint(pitX, pitZ, pitH) {
    const searchStep = CONFIG.RIVER_PIT_SEARCH_STEP;
    const maxRadius = CONFIG.RIVER_PIT_SEARCH_RADIUS;

    let bestPoint = null;
    let bestH = pitH;

    for (let r = searchStep; r <= maxRadius; r += searchStep) {
      const numSamples = Math.max(8, Math.floor(2 * Math.PI * r / searchStep));
      for (let i = 0; i < numSamples; i++) {
        const angle = (i / numSamples) * Math.PI * 2;
        const sx = pitX + Math.cos(angle) * r;
        const sz = pitZ + Math.sin(angle) * r;
        const sh = getBaseTerrainHeight(sx, sz);

        if (sh < bestH) {
          bestH = sh;
          bestPoint = { x: sx, z: sz, h: sh };
        }
      }

      // Early exit: prefer the closest escape that's significantly lower
      if (bestPoint && (pitH - bestH) > 1.0) break;
    }

    return bestPoint;
  }

  _createBreachSegments(pitX, pitZ, pitH, escX, escZ, escH, flow, riverId, startCount, buf) {
    const stepSize = CONFIG.RIVER_STEP_SIZE;
    const dx = escX - pitX;
    const dz = escZ - pitZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const numSteps = Math.max(1, Math.ceil(dist / stepSize));

    let added = 0;
    let prevExtraCarve = 0;

    for (let i = 1; i <= numSteps; i++) {
      const t = i / numSteps;
      const x = pitX + dx * t;
      const z = pitZ + dz * t;

      // Desired bed height: smooth downhill slope from pit to escape
      const desiredBedH = pitH * (1 - t) + escH * t;
      // Actual terrain at this point
      const terrainH = getBaseTerrainHeight(x, z);
      // Extra carving needed to cut through the barrier
      const extraCarve = Math.max(0, terrainH - desiredBedH);

      const idx = (startCount + added) * 3;
      buf[idx] = x;
      buf[idx + 1] = z;
      buf[idx + 2] = flow;

      // Insert breach segment into spatial hash
      const pi = startCount + added - 1;
      this.hash.insert({
        riverId,
        segIdx: pi,
        x0: buf[pi * 3], z0: buf[pi * 3 + 1],
        x1: buf[(pi + 1) * 3], z1: buf[(pi + 1) * 3 + 1],
        flow0: buf[pi * 3 + 2],
        flow1: buf[(pi + 1) * 3 + 2],
        extraCarve0: prevExtraCarve,
        extraCarve1: extraCarve,
      });

      prevExtraCarve = extraCarve;
      added++;
    }

    return added;
  }

  _validateRivers() {
    // A river is valid if it reached water level, or merged into a valid river.
    // Resolve recursively (tributary → river → lake).
    const valid = new Set();
    const checked = new Set();

    const isValid = (id) => {
      if (valid.has(id)) return true;
      if (checked.has(id)) return false; // cycle guard
      checked.add(id);
      const river = this.rivers[id];
      if (!river) return false;
      if (river.reachedWater) { valid.add(id); return true; }
      if (river.mergedInto >= 0 && isValid(river.mergedInto)) { valid.add(id); return true; }
      return false;
    };

    for (let i = 0; i < this.rivers.length; i++) {
      isValid(i);
    }

    // Remove invalid rivers from spatial hash
    const invalidIds = new Set();
    for (let i = 0; i < this.rivers.length; i++) {
      if (!valid.has(i)) invalidIds.add(i);
    }

    if (invalidIds.size > 0) {
      this.hash.removeByRiverId(invalidIds);
      console.log(`[RiverTracer] Pruned ${invalidIds.size} rivers that don't reach water`);
    }
  }

  _mergeFlow(targetRiverId, fromSegIdx, addedFlow) {
    const target = this.rivers[targetRiverId];
    if (!target) return;

    // Add flow from the merge point onward
    for (let i = fromSegIdx; i < target.pointCount; i++) {
      target.points[i * 3 + 2] += addedFlow;
    }

    // Update spatial hash segment references for affected segments
    // The segments in the hash reference the river's points array directly via flow0/flow1.
    // Since those are copies (not references), we need to update them too.
    // Scan the hash for segments belonging to this river from fromSegIdx onward.
    for (const [, segs] of this.hash.cells) {
      for (const seg of segs) {
        if (seg.riverId === targetRiverId && seg.segIdx >= fromSegIdx) {
          const pi = seg.segIdx;
          seg.flow0 = target.points[pi * 3 + 2];
          seg.flow1 = target.points[(pi + 1) * 3 + 2];
        }
      }
    }
  }
}

// --- Singleton + query exports ---
export const riverTracer = new RiverTracer();

export function getRiverFactor(worldX, worldZ) {
  if (!riverTracer._ready) return 0;
  const result = riverTracer.hash.queryNearest(worldX, worldZ);
  if (!result) return 0;

  const { dist, seg, t } = result;
  const flow = seg.flow0 * (1 - t) + seg.flow1 * t;

  const halfWidth = Math.min(
    CONFIG.RIVER_MAX_HALFWIDTH,
    CONFIG.RIVER_MIN_HALFWIDTH + CONFIG.RIVER_WIDTH_SCALE * Math.sqrt(flow)
  );

  // Match carving: deep channels have wider flat zone and banks
  const maxDepth = Math.min(
    CONFIG.RIVER_MAX_CARVE,
    CONFIG.RIVER_CARVE_SCALE * Math.sqrt(flow)
  );
  const flatWidth = Math.max(halfWidth, maxDepth * 1.0);
  const bankWidth = Math.max(CONFIG.RIVER_BANK_WIDTH, maxDepth * 1.5);
  const totalWidth = flatWidth + bankWidth;

  if (dist >= totalWidth) return 0;
  if (dist <= flatWidth) return 1.0;

  // Smoothstep falloff in bank zone
  const bt = (dist - flatWidth) / bankWidth;
  return 1 - bt * bt * (3 - 2 * bt);
}

export function getRiverCarving(worldX, worldZ) {
  if (!riverTracer._ready) return 0;
  const result = riverTracer.hash.queryNearest(worldX, worldZ);
  if (!result) return 0;

  const { dist, seg, t } = result;
  const flow = seg.flow0 * (1 - t) + seg.flow1 * t;

  const halfWidth = Math.min(
    CONFIG.RIVER_MAX_HALFWIDTH,
    CONFIG.RIVER_MIN_HALFWIDTH + CONFIG.RIVER_WIDTH_SCALE * Math.sqrt(flow)
  );

  const maxDepth = Math.min(
    CONFIG.RIVER_MAX_CARVE,
    CONFIG.RIVER_CARVE_SCALE * Math.sqrt(flow)
  );

  // Carve width scales with both water width and depth — deep channels are wide
  const flatWidth = Math.max(halfWidth, maxDepth * 1.0);
  const carveWidth = flatWidth + Math.max(CONFIG.RIVER_BANK_WIDTH, maxDepth * 1.5);
  if (dist >= carveWidth) return 0;

  // Extra carving for breach segments (cutting through terrain barriers)
  const extraCarve = (seg.extraCarve0 || 0) * (1 - t) + (seg.extraCarve1 || 0) * t;

  // Flat-bottomed channel: flat within flatWidth, cosine slopes on banks
  const u = dist / carveWidth;
  const flatRatio = flatWidth / carveWidth;
  let profile;
  if (u <= flatRatio) {
    profile = 1.0; // flat bottom at full depth
  } else {
    const bankU = (u - flatRatio) / (1.0 - flatRatio);
    profile = 0.5 * (1 + Math.cos(Math.PI * bankU));
  }
  return (maxDepth + extraCarve) * profile;
}

// Returns normalized flow direction [dx, dz] for the nearest river segment
const _flowDirResult = [0, 0];
export function getRiverFlowDir(worldX, worldZ) {
  _flowDirResult[0] = 0;
  _flowDirResult[1] = 0;
  if (!riverTracer._ready) return _flowDirResult;
  const result = riverTracer.hash.queryNearest(worldX, worldZ);
  if (!result) return _flowDirResult;

  const seg = result.seg;
  const dx = seg.x1 - seg.x0;
  const dz = seg.z1 - seg.z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0.001) {
    _flowDirResult[0] = dx / len;
    _flowDirResult[1] = dz / len;
  }
  return _flowDirResult;
}

/**
 * Get all unique river segments overlapping an area (for water strip mesh generation).
 */
export function getSegmentsInArea(minX, minZ, maxX, maxZ) {
  if (!riverTracer._ready) return [];
  const cs = CONFIG.RIVER_HASH_CELL;
  const cxMin = Math.floor(minX / cs) - 1;
  const cxMax = Math.floor(maxX / cs) + 1;
  const czMin = Math.floor(minZ / cs) - 1;
  const czMax = Math.floor(maxZ / cs) + 1;
  const seen = new Set();
  const result = [];
  for (let cz = czMin; cz <= czMax; cz++) {
    for (let cx = cxMin; cx <= cxMax; cx++) {
      const segs = riverTracer.hash.cells.get(`${cx},${cz}`);
      if (!segs) continue;
      for (const seg of segs) {
        const key = seg.x0 * 1e6 + seg.z0 * 1e3 + seg.x1;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(seg);
      }
    }
  }
  return result;
}
