// InstancedMesh rendering for all trees (3 types x 2 parts = 6 draw calls)
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
      this.scene.add(trunkMesh);
      this.trunkMeshes.push(trunkMesh);

      const canopyMesh = new THREE.InstancedMesh(
        getCanopyGeometry(type),
        getCanopyMaterial(type),
        MAX_TREES_PER_TYPE
      );
      canopyMesh.count = 0;
      canopyMesh.frustumCulled = false;
      this.scene.add(canopyMesh);
      this.canopyMeshes.push(canopyMesh);
    }
  }

  /**
   * Rebuild all instance buffers from active chunks
   */
  rebuild(chunkIterator) {
    // Count trees per type first
    const counts = new Array(CONFIG.TREE_TYPES).fill(0);
    const allTrees = [[], [], []]; // per-type arrays

    for (const chunk of chunkIterator) {
      if (!chunk.active) continue;
      for (const tree of chunk.treePositions) {
        if (counts[tree.type] < MAX_TREES_PER_TYPE) {
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

      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        _position.set(t.x, t.y, t.z);
        // Per-tree Y rotation from position hash for variety
        const angle = (t.x * 73.13 + t.z * 37.17) % (Math.PI * 2);
        _quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, angle);
        const s = t.scale;
        _scale.set(s, s, s);
        _matrix.compose(_position, _quaternion, _scale);

        trunkMesh.setMatrixAt(i, _matrix);
        canopyMesh.setMatrixAt(i, _matrix);
      }

      if (trees.length > 0) {
        trunkMesh.instanceMatrix.needsUpdate = true;
        canopyMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
