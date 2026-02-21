// Procedural ramshackle log cabin geometry — stacked log walls with vertex colors
// Each cottage is unique via a seed-based hash for variation
// Walls are split around door/window openings so they're visible
import * as THREE from 'three';

let _cottageMaterial = null;

function hash(seed) {
  const h = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function hashRange(seed, min, max) {
  return min + hash(seed) * (max - min);
}

/**
 * Build a single log cabin BufferGeometry with vertex colors.
 * Logs are split around door and window openings.
 * @param {number} seed — unique per cottage for variation
 * @returns {{ geometry: THREE.BufferGeometry, chimneyTop: THREE.Vector3, windowGeometry: THREE.BufferGeometry|null }}
 */
export function createCottageGeometry(seed) {
  const parts = [];

  // --- Variation from seed ---
  const widthX = hashRange(seed + 1, 2.5, 5.0);
  const widthZ = hashRange(seed + 2, 2.0, 4.0);
  const logRadius = hashRange(seed + 3, 0.10, 0.16);
  const logDiameter = logRadius * 2;
  const logStep = logDiameter * 0.76;
  const logCount = Math.floor(hashRange(seed + 4, 10, 14));
  const wallH = logCount * logStep;
  const roofPitch = hashRange(seed + 5, 0.5, 1.1);
  const roofOverhang = hashRange(seed + 6, 0.2, 0.6);
  const leanX = hashRange(seed + 7, -0.04, 0.04);
  const leanZ = hashRange(seed + 8, -0.04, 0.04);
  const chimneyIdx = Math.floor(hash(seed + 9) * 4);
  const chimneyLean = hashRange(seed + 10, -0.05, 0.05);
  const doorSide = hash(seed + 11) > 0.5 ? 1 : -1;
  const logOverhang = hashRange(seed + 13, 0.08, 0.2);

  // --- Colors ---
  const woodBase = new THREE.Color().setHSL(
    hashRange(seed + 20, 0.06, 0.10),
    hashRange(seed + 21, 0.3, 0.5),
    hashRange(seed + 22, 0.2, 0.3)
  );
  const roofColor = new THREE.Color().setHSL(
    hashRange(seed + 23, 0.20, 0.32),
    hashRange(seed + 24, 0.25, 0.45),
    hashRange(seed + 25, 0.18, 0.30)
  );
  const stoneColor = new THREE.Color(0x666660);
  const windowColor = new THREE.Color(0.18, 0.24, 0.35); // dusty blue-grey glass

  const hx = widthX / 2;
  const hz = widthZ / 2;

  // --- Pre-calculate openings (door + windows) for log splitting ---
  const doorZ = doorSide * hz * 0.3;
  const doorW = 0.7, doorH = 1.9;
  const paneW = 0.28, paneH = 0.20, frameT = 0.012;
  const winW = paneW * 2 + frameT + 0.02;  // tight fit around the 2x2 pane grid
  const winH = paneH * 2 + frameT + 0.005;
  const wy = wallH * 0.42;
  const openGap = 0.03;
  const winYGap = logRadius * 0.4; // Y margin so borderline logs get cut around windows

  // Window center positions (pre-calculated for both log splitting and window geometry)
  const zWinPos = [];
  for (let wi = 0; wi < 2; wi++) {
    zWinPos.push({ side: wi === 0 ? 1 : -1, cx: hashRange(seed + 40 + wi, -hx * 0.45, hx * 0.45) });
  }
  const backWz = hashRange(seed + 45, -hz * 0.4, hz * 0.4);

  // Openings on each wall face (along the log's local axis)
  const frontOpenings = [
    { min: doorZ - doorW / 2 - openGap, max: doorZ + doorW / 2 + openGap, minY: -0.1, maxY: doorH + openGap },
  ];
  const backOpenings = [
    { min: backWz - winW / 2, max: backWz + winW / 2, minY: wy - winH / 2 - winYGap, maxY: wy + winH / 2 + winYGap },
  ];
  const leftOpenings = [], rightOpenings = [];
  for (const sw of zWinPos) {
    const op = { min: sw.cx - winW / 2, max: sw.cx + winW / 2, minY: wy - winH / 2 - winYGap, maxY: wy + winH / 2 + winYGap };
    if (sw.side === -1) leftOpenings.push(op); else rightOpenings.push(op);
  }

  // Split a log (spanning -halfLen..+halfLen) into segments that avoid openings
  function splitLog(halfLen, openings, logY, logR) {
    let segs = [{ s: -halfLen, e: halfLen }];
    for (const op of openings) {
      if (logY < op.minY || logY > op.maxY) continue;
      const next = [];
      for (const seg of segs) {
        if (op.max <= seg.s || op.min >= seg.e) { next.push(seg); continue; }
        if (seg.s < op.min) next.push({ s: seg.s, e: op.min });
        if (op.max < seg.e) next.push({ s: op.max, e: seg.e });
      }
      segs = next;
    }
    return segs.filter(seg => seg.e - seg.s > logR * 3);
  }

  // --- Stacked log walls (split around door/window openings) ---
  for (let row = 0; row < logCount; row++) {
    const rowSeed = seed + 100 + row * 31;
    const logR = logRadius * hashRange(rowSeed + 7, 0.95, 1.05);
    const logR2 = logR * hashRange(rowSeed + 8, 0.96, 1.04);
    const wobble = (hash(rowSeed) - 0.5) * 0.015;

    const fbY = logRadius + row * logStep + wobble;
    const fbHalf = (widthZ + logOverhang * 2) / 2;

    // Front wall — split around door
    for (const seg of splitLog(fbHalf, frontOpenings, fbY, logR)) {
      const log = new THREE.CylinderGeometry(logR, logR2, seg.e - seg.s, 6, 3);
      jitterLog(log, 0.012, rowSeed + 10 + Math.floor(seg.s * 50));
      log.rotateX(Math.PI / 2);
      log.translate(hx, fbY, (seg.s + seg.e) / 2);
      addLogColors(log, woodBase, rowSeed + 1);
      parts.push(log);
    }

    // Back wall — split around back window
    for (const seg of splitLog(fbHalf, backOpenings, fbY, logR)) {
      const log = new THREE.CylinderGeometry(logR2, logR, seg.e - seg.s, 6, 3);
      jitterLog(log, 0.012, rowSeed + 20 + Math.floor(seg.s * 50));
      log.rotateX(Math.PI / 2);
      log.translate(-hx, fbY, (seg.s + seg.e) / 2);
      addLogColors(log, woodBase, rowSeed + 2);
      parts.push(log);
    }

    // Side logs — offset up by half a step to interlock at corners
    const sideY = fbY + logStep * 0.5;
    if (sideY > wallH + logRadius) continue;
    const sideHalf = (widthX + logOverhang * 2) / 2;

    // Left wall — split around window
    for (const seg of splitLog(sideHalf, leftOpenings, sideY, logR)) {
      const log = new THREE.CylinderGeometry(logR, logR2, seg.e - seg.s, 6, 3);
      jitterLog(log, 0.012, rowSeed + 30 + Math.floor(seg.s * 50));
      log.rotateZ(Math.PI / 2);
      log.translate((seg.s + seg.e) / 2, sideY, -hz);
      addLogColors(log, woodBase, rowSeed + 3);
      parts.push(log);
    }

    // Right wall — split around window
    for (const seg of splitLog(sideHalf, rightOpenings, sideY, logR)) {
      const log = new THREE.CylinderGeometry(logR2, logR, seg.e - seg.s, 6, 3);
      jitterLog(log, 0.012, rowSeed + 40 + Math.floor(seg.s * 50));
      log.rotateZ(Math.PI / 2);
      log.translate((seg.s + seg.e) / 2, sideY, hz);
      addLogColors(log, woodBase, rowSeed + 4);
      parts.push(log);
    }
  }

  // --- Gable triangles (log ends stacked shorter toward ridge) ---
  const ridgeY = wallH + roofPitch;
  const gableRows = Math.ceil(roofPitch / logStep);
  for (let g = 0; g < gableRows; g++) {
    const gy = wallH + logRadius + g * logStep;
    if (gy > ridgeY) break;
    const fraction = 1 - (gy - wallH) / roofPitch;
    const gableLen = widthZ * fraction;
    if (gableLen < logRadius * 3) break;
    const gSeed = seed + 500 + g * 17;
    const gR = logRadius * hashRange(gSeed, 0.8, 1.1);
    const gR2 = gR * hashRange(gSeed + 5, 0.93, 1.07);

    const gFront = new THREE.CylinderGeometry(gR, gR2, gableLen, 6, 2);
    jitterLog(gFront, 0.018, gSeed + 10);
    gFront.rotateX(Math.PI / 2);
    gFront.translate(hx, gy, 0);
    addLogColors(gFront, woodBase, gSeed + 1);
    parts.push(gFront);

    const gBack = new THREE.CylinderGeometry(gR2, gR, gableLen, 6, 2);
    jitterLog(gBack, 0.018, gSeed + 20);
    gBack.rotateX(Math.PI / 2);
    gBack.translate(-hx, gy, 0);
    addLogColors(gBack, woodBase, gSeed + 2);
    parts.push(gBack);
  }

  // --- Roof: two angled box slabs with gentle sag ---
  const roofHalfSpan = hz + roofOverhang;
  const roofLen = widthX + roofOverhang;
  const slopeLen = Math.sqrt(roofHalfSpan * roofHalfSpan + roofPitch * roofPitch);
  const roofAngle = Math.atan2(roofPitch, roofHalfSpan);
  const roofThick = 0.2;

  const roofL = new THREE.BoxGeometry(roofLen, roofThick, slopeLen, 8, 3, 6);
  jitterThatch(roofL, 0.03, seed + 600);
  sagRoof(roofL, 0.04, seed + 601);
  roofL.rotateX(-roofAngle);
  roofL.translate(0, wallH + roofPitch / 2, -roofHalfSpan / 2);
  addThatchColors(roofL, roofColor, seed + 800);
  parts.push(roofL);

  const roofR = new THREE.BoxGeometry(roofLen, roofThick, slopeLen, 8, 3, 6);
  jitterThatch(roofR, 0.03, seed + 700);
  sagRoof(roofR, 0.04, seed + 701);
  roofR.rotateX(roofAngle);
  roofR.translate(0, wallH + roofPitch / 2, roofHalfSpan / 2);
  addThatchColors(roofR, roofColor, seed + 900);
  parts.push(roofR);

  // --- Chimney: stone box ---
  const chimneyW = 0.35;
  const chimneyH = roofPitch + 0.5 + hashRange(seed + 30, 0, 0.4);
  const corners = [
    [hx * 0.4, hz * 0.4],
    [-hx * 0.4, hz * 0.4],
    [-hx * 0.4, -hz * 0.4],
    [hx * 0.4, -hz * 0.4],
  ];
  const chimneyCX = corners[chimneyIdx][0];
  const chimneyCZ = corners[chimneyIdx][1];
  const chimney = new THREE.BoxGeometry(chimneyW, chimneyH, chimneyW, 2, 3, 2);
  const cPos = chimney.getAttribute('position');
  for (let i = 0; i < cPos.count; i++) {
    const y = cPos.getY(i);
    const t = y / chimneyH;
    cPos.setX(i, cPos.getX(i) + t * chimneyLean);
    cPos.setZ(i, cPos.getZ(i) + t * chimneyLean * 0.5);
  }
  cPos.needsUpdate = true;
  chimney.computeVertexNormals();
  chimney.translate(chimneyCX, wallH + chimneyH * 0.35, chimneyCZ);
  addStoneColors(chimney, stoneColor, seed + 1000);
  parts.push(chimney);

  const chimneyTopY = wallH + chimneyH * 0.85;
  const chimneyTop = new THREE.Vector3(
    chimneyCX + chimneyTopY * chimneyLean,
    chimneyTopY,
    chimneyCZ + chimneyTopY * chimneyLean * 0.5
  );

  // --- Door: visible slab in the wall opening ---
  const door = new THREE.BoxGeometry(0.06, doorH, doorW);
  door.translate(hx, doorH / 2, doorZ);
  const doorVisibleColor = new THREE.Color(0x2a1e10);
  addFlatColor(door, doorVisibleColor, 0.03, seed + 1200);
  parts.push(door);

  // Door wooden frame (non-emissive — fills gap around door opening)
  const doorFrameColor = new THREE.Color(0x3a2810);
  const dfW = 0.05; // frame width
  const dfDp = 0.05; // frame depth
  const doorVertH = logStep + logRadius; // thick lintel to bridge to nearest log above
  // Lintel (top)
  const dfLintel = new THREE.BoxGeometry(dfDp, doorVertH, doorW + dfW * 2);
  dfLintel.translate(hx, doorH + doorVertH / 2, doorZ);
  addFlatColor(dfLintel, doorFrameColor, 0.03, seed + 1210);
  parts.push(dfLintel);
  // Left jamb
  const dfJambL = new THREE.BoxGeometry(dfDp, doorH + doorVertH, dfW);
  dfJambL.translate(hx, (doorH + doorVertH) / 2, doorZ - doorW / 2 - dfW / 2);
  addFlatColor(dfJambL, doorFrameColor, 0.03, seed + 1213);
  parts.push(dfJambL);
  // Right jamb
  const dfJambR = new THREE.BoxGeometry(dfDp, doorH + doorVertH, dfW);
  dfJambR.translate(hx, (doorH + doorVertH) / 2, doorZ + doorW / 2 + dfW / 2);
  addFlatColor(dfJambR, doorFrameColor, 0.03, seed + 1214);
  parts.push(dfJambR);

  // Door light seep: thin strip down latch side + keyhole (emissive geometry)
  const doorFrameParts = [];
  const dfColor = new THREE.Color(0.25, 0.18, 0.08);
  const latchSide = doorSide > 0 ? 1 : -1;
  const stripH = doorH * 0.6;
  const strip = new THREE.BoxGeometry(0.05, stripH, 0.01);
  strip.translate(hx, doorH * 0.45, doorZ + latchSide * (doorW / 2 + 0.005));
  addFlatColor(strip, dfColor, 0.02, seed + 1211);
  doorFrameParts.push(strip);
  const keyhole = new THREE.BoxGeometry(0.04, 0.03, 0.01);
  keyhole.translate(hx + 0.01, doorH * 0.48, doorZ + latchSide * doorW * 0.35);
  addFlatColor(keyhole, dfColor, 0.02, seed + 1212);
  doorFrameParts.push(keyhole);

  // --- Windows with thin cross-frame (4 panes each) ---
  const emissiveParts = [...doorFrameParts];
  const frameColor = new THREE.Color(0x1a1208);
  const frameWoodColor = new THREE.Color(0x3a2810);
  const winInset = logRadius + 0.06;
  const frameTh = 0.035; // wooden frame side thickness
  const frameVert = logStep + logRadius; // top/bottom frame: thick enough to bridge to nearest log
  const frameDp = 0.03;  // wooden frame depth (thin so it stays behind logs)
  const innerW = paneW * 2 + frameT + 0.01;
  const innerH = paneH * 2 + frameT + 0.01;
  const fullH = innerH + frameVert * 2; // total frame height including thick top/bottom

  // Window on a Z-facing wall (side walls)
  function addWindowZ(cx, cy, wallZ, sign, wSeed) {
    const wz = wallZ - sign * winInset;
    // Glass panes (emissive for night glow)
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const px = (gx - 0.5) * (paneW + frameT);
        const py = (gy - 0.5) * (paneH + frameT);
        const pane = new THREE.BoxGeometry(paneW, paneH, 0.02);
        pane.translate(cx + px, cy + py, wz);
        addDirtyGlassColor(pane, windowColor, wSeed + gy * 2 + gx);
        emissiveParts.push(pane);
      }
    }
    // Cross bars at inset depth (same as glass)
    const barW = paneW * 2 + frameT + 0.02;
    const barH = paneH * 2 + frameT + 0.02;
    const hBar = new THREE.BoxGeometry(barW, frameT, 0.015);
    hBar.translate(cx, cy, wz);
    addFlatColor(hBar, frameColor, 0.01, wSeed + 10);
    parts.push(hBar);
    const vBar = new THREE.BoxGeometry(frameT, barH, 0.015);
    vBar.translate(cx, cy, wz);
    addFlatColor(vBar, frameColor, 0.01, wSeed + 20);
    parts.push(vBar);
    // Wooden frame surround (top/bottom thick to bridge log gaps)
    const fTop = new THREE.BoxGeometry(innerW + frameTh * 2, frameVert, frameDp);
    fTop.translate(cx, cy + innerH / 2 + frameVert / 2, wz);
    addFlatColor(fTop, frameWoodColor, 0.03, wSeed + 30);
    parts.push(fTop);
    const fBot = new THREE.BoxGeometry(innerW + frameTh * 2, frameVert, frameDp);
    fBot.translate(cx, cy - innerH / 2 - frameVert / 2, wz);
    addFlatColor(fBot, frameWoodColor, 0.03, wSeed + 31);
    parts.push(fBot);
    const fL = new THREE.BoxGeometry(frameTh, fullH, frameDp);
    fL.translate(cx - innerW / 2 - frameTh / 2, cy, wz);
    addFlatColor(fL, frameWoodColor, 0.03, wSeed + 32);
    parts.push(fL);
    const fR = new THREE.BoxGeometry(frameTh, fullH, frameDp);
    fR.translate(cx + innerW / 2 + frameTh / 2, cy, wz);
    addFlatColor(fR, frameWoodColor, 0.03, wSeed + 33);
    parts.push(fR);
  }

  // Window on an X-facing wall (front/back walls)
  function addWindowX(cy, cz, wallX, sign, wSeed) {
    const wx = wallX - sign * winInset;
    // Glass panes
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const pz = (gx - 0.5) * (paneW + frameT);
        const py = (gy - 0.5) * (paneH + frameT);
        const pane = new THREE.BoxGeometry(0.02, paneH, paneW);
        pane.translate(wx, cy + py, cz + pz);
        addDirtyGlassColor(pane, windowColor, wSeed + gy * 2 + gx);
        emissiveParts.push(pane);
      }
    }
    // Cross bars at inset depth
    const barW = paneW * 2 + frameT + 0.02;
    const barH = paneH * 2 + frameT + 0.02;
    const hBar = new THREE.BoxGeometry(0.015, frameT, barW);
    hBar.translate(wx, cy, cz);
    addFlatColor(hBar, frameColor, 0.01, wSeed + 10);
    parts.push(hBar);
    const vBar = new THREE.BoxGeometry(0.015, barH, frameT);
    vBar.translate(wx, cy, cz);
    addFlatColor(vBar, frameColor, 0.01, wSeed + 20);
    parts.push(vBar);
    // Wooden frame surround (top/bottom thick to bridge log gaps)
    const fTop = new THREE.BoxGeometry(frameDp, frameVert, innerW + frameTh * 2);
    fTop.translate(wx, cy + innerH / 2 + frameVert / 2, cz);
    addFlatColor(fTop, frameWoodColor, 0.03, wSeed + 30);
    parts.push(fTop);
    const fBot = new THREE.BoxGeometry(frameDp, frameVert, innerW + frameTh * 2);
    fBot.translate(wx, cy - innerH / 2 - frameVert / 2, cz);
    addFlatColor(fBot, frameWoodColor, 0.03, wSeed + 31);
    parts.push(fBot);
    const fL = new THREE.BoxGeometry(frameDp, fullH, frameTh);
    fL.translate(wx, cy, cz - innerW / 2 - frameTh / 2);
    addFlatColor(fL, frameWoodColor, 0.03, wSeed + 32);
    parts.push(fL);
    const fR = new THREE.BoxGeometry(frameDp, fullH, frameTh);
    fR.translate(wx, cy, cz + innerW / 2 + frameTh / 2);
    addFlatColor(fR, frameWoodColor, 0.03, wSeed + 33);
    parts.push(fR);
  }

  // Z-side walls: one window each
  for (let wi = 0; wi < 2; wi++) {
    const sw = zWinPos[wi];
    const wSurface = sw.side * (hz + logRadius);
    addWindowZ(sw.cx, wy, wSurface, sw.side, seed + 1300 + wi * 50);
  }

  // Back wall window (opposite the door)
  const backWallX = -(hx + logRadius);
  addWindowX(wy, backWz, backWallX, -1, seed + 1500);

  // --- Merge ---
  const geometry = mergeAll(parts);
  const windowGeometry = emissiveParts.length > 0 ? mergeAll(emissiveParts) : null;

  // Global lean — apply to both main and window geometry
  if (Math.abs(leanX) > 0.001 || Math.abs(leanZ) > 0.001) {
    for (const geom of [geometry, windowGeometry]) {
      if (!geom) continue;
      const pos = geom.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setX(i, pos.getX(i) + y * leanX);
        pos.setZ(i, pos.getZ(i) + y * leanZ);
      }
      pos.needsUpdate = true;
    }
  }

  geometry.computeVertexNormals();
  if (windowGeometry) windowGeometry.computeVertexNormals();

  return { geometry, chimneyTop, windowGeometry };
}

export function getCottageMaterial() {
  if (!_cottageMaterial) {
    _cottageMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });
  }
  return _cottageMaterial;
}

let _windowMaterial = null;
export function getWindowMaterial() {
  if (!_windowMaterial) {
    _windowMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: new THREE.Color(0.9, 0.65, 0.2),
      emissiveIntensity: 0,
    });
  }
  return _windowMaterial;
}

// --- Helpers ---

function jitterLog(geometry, amount, seed) {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (hash(seed + i * 7) - 0.5) * amount);
    pos.setY(i, pos.getY(i) + (hash(seed + i * 13 + 30) - 0.5) * amount);
    pos.setZ(i, pos.getZ(i) + (hash(seed + i * 19 + 60) - 0.5) * amount * 0.6);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function addLogColors(geometry, baseColor, seed) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const logTint = (hash(seed) - 0.5) * 0.12;
  let minAx = Infinity, maxAx = -Infinity;
  for (let i = 0; i < count; i++) {
    const ax = pos.getY(i);
    if (ax < minAx) minAx = ax;
    if (ax > maxAx) maxAx = ax;
  }
  const axRange = maxAx - minAx || 1;
  for (let i = 0; i < count; i++) {
    const n1 = (hash(seed + i * 7) - 0.5) * 0.10;
    const n2 = (hash(seed + i * 13 + 50) - 0.5) * 0.06;
    const axT = (pos.getY(i) - minAx) / axRange;
    const endDarken = (1 - Math.sin(axT * Math.PI)) * 0.04;
    const knot = hash(seed + i * 31) > 0.92 ? -0.08 : 0;
    const r = baseColor.r + logTint + n1 + knot - endDarken;
    const g = baseColor.g + logTint * 0.8 + n1 * 0.7 + n2 + knot - endDarken;
    const b = baseColor.b + logTint * 0.5 + n2 * 0.5 + knot - endDarken * 0.5;
    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function sagRoof(geometry, amount, seed) {
  const pos = geometry.getAttribute('position');
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const rangeX = maxX - minX || 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = (x - minX) / rangeX;
    const sag = Math.sin(t * Math.PI) * amount;
    const noise = (hash(seed + i * 7) - 0.5) * amount * 0.3;
    pos.setY(i, pos.getY(i) - sag - noise);
  }
  pos.needsUpdate = true;
}

function jitterThatch(geometry, amount, seed) {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (hash(seed + i * 13) - 0.5) * amount);
    pos.setY(i, pos.getY(i) + (hash(seed + i * 17 + 50) - 0.5) * amount * 1.5);
    pos.setZ(i, pos.getZ(i) + (hash(seed + i * 23 + 100) - 0.5) * amount);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function addThatchColors(geometry, baseColor, seed) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const green = baseColor.clone().offsetHSL(0.06, 0.12, 0.05);
  const darkGreen = baseColor.clone().offsetHSL(0.04, 0.05, -0.06);
  const brown = baseColor.clone().offsetHSL(-0.06, -0.08, -0.05);
  const dryStraw = baseColor.clone().offsetHSL(-0.02, -0.15, 0.08);
  const moss = baseColor.clone().offsetHSL(0.12, 0.18, 0.03);
  const palette = [green, darkGreen, brown, dryStraw, moss, baseColor];
  for (let i = 0; i < count; i++) {
    const h = hash(seed + i * 11);
    const c = palette[Math.floor(h * palette.length) % palette.length];
    const n1 = (hash(seed + i * 7 + 50) - 0.5) * 0.12;
    const n2 = (hash(seed + i * 19 + 80) - 0.5) * 0.06;
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const edgeFade = (hash(seed + Math.floor(px * 3) * 7 + Math.floor(pz * 3) * 13) - 0.5) * 0.05;
    colors[i * 3] = Math.max(0, Math.min(1, c.r + n1 + edgeFade));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, c.g + n1 * 1.2 + n2));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, c.b + n2 * 0.6 + edgeFade * 0.3));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function addDirtyGlassColor(geometry, baseColor, seed) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const streak = (hash(seed + i * 11) - 0.5) * 0.15;
    const grime = hash(seed + i * 23 + 50) > 0.7 ? -0.06 : 0;
    colors[i * 3] = Math.max(0, Math.min(1, baseColor.r + streak + grime));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, baseColor.g + streak * 0.8 + grime));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, baseColor.b + streak * 0.6 + grime));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function addFlatColor(geometry, color, variation, seed) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const n = (hash(seed + i * 11) - 0.5) * variation;
    colors[i * 3] = Math.max(0, Math.min(1, color.r + n));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, color.g + n));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, color.b + n));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function addStoneColors(geometry, baseColor, seed) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shift = (hash(seed + i * 7) - 0.5) * 0.12;
    colors[i * 3] = Math.max(0, Math.min(1, baseColor.r + shift));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, baseColor.g + shift * 0.9));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, baseColor.b + shift * 0.8));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function mergeAll(geometries) {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geometries) {
    totalVerts += g.getAttribute('position').count;
    totalIdx += g.getIndex() ? g.getIndex().count : 0;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const indices = totalIdx > 0 ? new Uint32Array(totalIdx) : null;

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const col = g.getAttribute('color');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);
      normals[(vOffset + i) * 3] = norm.getX(i);
      normals[(vOffset + i) * 3 + 1] = norm.getY(i);
      normals[(vOffset + i) * 3 + 2] = norm.getZ(i);
      if (col) {
        colors[(vOffset + i) * 3] = col.getX(i);
        colors[(vOffset + i) * 3 + 1] = col.getY(i);
        colors[(vOffset + i) * 3 + 2] = col.getZ(i);
      } else {
        colors[(vOffset + i) * 3] = 0.3;
        colors[(vOffset + i) * 3 + 1] = 0.25;
        colors[(vOffset + i) * 3 + 2] = 0.15;
      }
    }

    const idx = g.getIndex();
    if (idx && indices) {
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.array[i] + vOffset;
      }
      iOffset += idx.count;
    }
    vOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (indices) merged.setIndex(new THREE.BufferAttribute(indices, 1));

  return merged;
}
