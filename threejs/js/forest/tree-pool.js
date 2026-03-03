// InstancedMesh rendering for all trees (4 types x 2 parts = 8 draw calls)
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import {
  initTreeGeometries,
  getTrunkGeometry, getCanopyGeometry,
  getTrunkMaterial, getCanopyMaterial
} from './tree-factory.js';

const MAX_TREES_PER_TYPE = 2000;
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _slopeQuat = new THREE.Quaternion();
const _slopeAxis = new THREE.Vector3();

// Base HSL values for per-instance canopy color variation
const CANOPY_BASE_HSL = [
  { h: 0.35, s: 0.50, l: 0.38 },  // Pine: cool green
  { h: 0.30, s: 0.45, l: 0.42 },  // Oak: warm rich green
  { h: 0.27, s: 0.40, l: 0.48 },  // Birch: bright yellow-green
  { h: 0.10, s: 0.50, l: 0.42 },  // Tussock: golden straw
];

export class TreePool {
  constructor(scene) {
    this.scene = scene;
    this.trunkMeshes = [];   // InstancedMesh per type
    this.canopyMeshes = [];  // InstancedMesh per type

    initTreeGeometries();
    this._createInstancedMeshes();
  }

  _createInstancedMeshes() {
    for (let type = 0; type < CONFIG.TREE_TYPES; type++) {
      const trunkMesh = new THREE.InstancedMesh(
        getTrunkGeometry(type),
        getTrunkMaterial(type),
        MAX_TREES_PER_TYPE
      );
      trunkMesh.count = 0;
      trunkMesh.frustumCulled = false;
      trunkMesh.castShadow = true;
      this.scene.add(trunkMesh);
      this.trunkMeshes.push(trunkMesh);

      const canopyMesh = new THREE.InstancedMesh(
        getCanopyGeometry(type),
        getCanopyMaterial(type),
        MAX_TREES_PER_TYPE
      );
      canopyMesh.count = 0;
      canopyMesh.frustumCulled = false;
      canopyMesh.castShadow = true;
      this.scene.add(canopyMesh);
      this.canopyMeshes.push(canopyMesh);
    }
  }

  /**
   * Rebuild all instance buffers from active chunks.
   * playerX/Z used to prioritise nearby chunks when instance cap is hit.
   */
  rebuild(chunkIterator, playerX, playerZ) {
    // Collect and sort chunks by distance from player (closest first)
    const chunks = [];
    for (const chunk of chunkIterator) {
      if (!chunk.active) continue;
      const dx = chunk.cx * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE * 0.5 - (playerX || 0);
      const dz = chunk.cz * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE * 0.5 - (playerZ || 0);
      chunk._sortDist = dx * dx + dz * dz;
      chunks.push(chunk);
    }
    chunks.sort((a, b) => a._sortDist - b._sortDist);

    const counts = new Array(CONFIG.TREE_TYPES).fill(0);
    const allTrees = Array.from({ length: CONFIG.TREE_TYPES }, () => []);

    const MAX_TUSSOCK = 800; // lighter cap for high-poly tussock
    for (const chunk of chunks) {
      for (const tree of chunk.treePositions) {
        const cap = tree.type === 3 ? MAX_TUSSOCK : MAX_TREES_PER_TYPE;
        if (counts[tree.type] < cap) {
          allTrees[tree.type].push(tree);
          counts[tree.type]++;
        }
      }
    }

    // Update each type's instanced meshes
    for (let type = 0; type < CONFIG.TREE_TYPES; type++) {
      const trees = allTrees[type];
      const trunkMesh = this.trunkMeshes[type];
      const canopyMesh = this.canopyMeshes[type];

      trunkMesh.count = trees.length;
      canopyMesh.count = trees.length;

      const baseHSL = CANOPY_BASE_HSL[type] || CANOPY_BASE_HSL[0];

      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        _position.set(t.x, t.y, t.z);
        // Per-tree Y rotation from position hash for variety
        const angle = (t.x * 73.13 + t.z * 37.17) % (Math.PI * 2);
        _quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, angle);

        // Tussock (type 3): tilt with terrain slope
        if (type === 3 && t.slopeX !== undefined) {
          const sMag = Math.sqrt(t.slopeX * t.slopeX + t.slopeZ * t.slopeZ);
          if (sMag > 0.02) {
            const tiltAmt = Math.min(sMag * 0.25, 0.35);
            // Tilt axis perpendicular to slope gradient (cross product with up)
            _slopeAxis.set(-t.slopeZ / sMag, 0, t.slopeX / sMag);
            _slopeQuat.setFromAxisAngle(_slopeAxis, tiltAmt);
            _quaternion.premultiply(_slopeQuat);
          }
        }

        const s = t.scale;
        _scale.set(s, s, s);
        _matrix.compose(_position, _quaternion, _scale);

        trunkMesh.setMatrixAt(i, _matrix);
        canopyMesh.setMatrixAt(i, _matrix);

        // Per-instance canopy color variation (wider range for tussock)
        const isTussock = type === 3;
        const hRange = isTussock ? 0.30 : 0.12;  // golden → reddish → greenish
        const sRange = isTussock ? 0.20 : 0.08;
        const lRange = isTussock ? 0.18 : 0.06;
        const hueShift = ((t.x * 73.13 + t.z * 37.17) % 1.0) * hRange - hRange * 0.5;
        const satShift = ((t.x * 17.31 + t.z * 91.73) % 1.0) * sRange - sRange * 0.5;
        const lumShift = ((t.x * 41.57 + t.z * 63.29) % 1.0) * lRange - lRange * 0.5;
        _color.setHSL(
          baseHSL.h + hueShift,
          Math.max(0, Math.min(1, baseHSL.s + satShift)),
          Math.max(0, Math.min(1, baseHSL.l + lumShift))
        );
        canopyMesh.setColorAt(i, _color);
      }

      if (trees.length > 0) {
        trunkMesh.instanceMatrix.needsUpdate = true;
        canopyMesh.instanceMatrix.needsUpdate = true;
        if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
      }
    }
  }
}
