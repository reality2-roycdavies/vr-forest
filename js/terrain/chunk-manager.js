// Chunk lifecycle: load/unload/recycle around player
import { CONFIG } from '../config.js';
import { Chunk } from './chunk.js';

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.activeChunks = new Map();   // key "cx,cz" -> Chunk
    this.chunkPool = [];             // recycled chunks
    this.pendingLoads = [];          // chunks to load (staggered)
    this.pendingPhase2 = [];         // chunks awaiting phase 2 detail generation
    this.pendingLOD = [];            // chunks needing LOD rebuild
    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.isInVR = false;
    this.onChunksChanged = null;     // callback for tree/veg rebuild
  }

  /**
   * Determine the appropriate segment count for a chunk at given distance.
   */
  _getSegments(chunkDist) {
    if (this.isInVR && chunkDist > 2) {
      return CONFIG.CHUNK_SEGMENTS_LOD;
    }
    return CONFIG.CHUNK_SEGMENTS;
  }

  /**
   * Update chunks based on player world position.
   * Call each frame.
   */
  update(playerX, playerZ, isInVR = false) {
    const vrChanged = isInVR !== this.isInVR;
    this.isInVR = isInVR;

    const cx = Math.floor(playerX / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(playerZ / CONFIG.CHUNK_SIZE);

    const chunkChanged = cx !== this.lastPlayerChunkX || cz !== this.lastPlayerChunkZ;

    if (!chunkChanged && !vrChanged) {
      // Still process pending loads/LOD
      this._processQueue();
      return;
    }

    if (chunkChanged) {
      this.lastPlayerChunkX = cx;
      this.lastPlayerChunkZ = cz;
    }

    const loadR = CONFIG.LOAD_RADIUS;
    const unloadR = CONFIG.UNLOAD_RADIUS;

    // Determine which chunks should be active
    const neededKeys = new Set();
    for (let dz = -loadR; dz <= loadR; dz++) {
      for (let dx = -loadR; dx <= loadR; dx++) {
        neededKeys.add(`${cx + dx},${cz + dz}`);
      }
    }

    // Unload chunks that are too far
    const maxPoolSize = (loadR * 2 + 1) * (loadR * 2 + 1); // cap pool to ~1 full load radius
    for (const [key, chunk] of this.activeChunks) {
      const dist = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (dist > unloadR) {
        chunk.deactivate();
        if (this.chunkPool.length < maxPoolSize) {
          this.chunkPool.push(chunk);
        }
        this.activeChunks.delete(key);
      }
    }

    // Queue missing chunks for loading
    this.pendingLoads.length = 0;
    for (const key of neededKeys) {
      if (!this.activeChunks.has(key)) {
        const [kcx, kcz] = key.split(',').map(Number);
        this.pendingLoads.push({ cx: kcx, cz: kcz, key });
      }
    }

    // Sort by distance to player (closest first)
    this.pendingLoads.sort((a, b) => {
      const da = Math.abs(a.cx - cx) + Math.abs(a.cz - cz);
      const db = Math.abs(b.cx - cx) + Math.abs(b.cz - cz);
      return da - db;
    });

    // Queue LOD changes for existing chunks (on chunk boundary cross or VR toggle)
    this.pendingLOD.length = 0;
    for (const [key, chunk] of this.activeChunks) {
      const dist = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      const targetSeg = this._getSegments(dist);
      if (chunk.segments !== targetSeg) {
        this.pendingLOD.push({ cx: chunk.cx, cz: chunk.cz, key, segments: targetSeg });
      }
    }

    this._processQueue();
  }

  _processQueue() {
    const maxPerFrame = this.isInVR ? 1 : CONFIG.MAX_CHUNKS_PER_FRAME;
    let loaded = 0;
    let newChunkLoaded = false;  // track if any non-LOD chunk was loaded/changed

    // New chunk loads take priority (phase 1 only — terrain + trees)
    while (this.pendingLoads.length > 0 && loaded < maxPerFrame) {
      const { cx, cz, key } = this.pendingLoads.shift();

      // Skip if already loaded (race condition protection)
      if (this.activeChunks.has(key)) continue;

      const pcx = this.lastPlayerChunkX;
      const pcz = this.lastPlayerChunkZ;
      const dist = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
      const segments = this._getSegments(dist);

      const chunk = this._getChunk();
      chunk.build(cx, cz, segments);
      chunk.cx = cx;
      chunk.cz = cz;

      if (!chunk.mesh.parent) {
        this.scene.add(chunk.mesh);
      }
      chunk.mesh.updateMatrix();

      this.activeChunks.set(key, chunk);
      loaded++;
      newChunkLoaded = true;

      // Queue phase 2 for full-quality chunks
      if (chunk.needsPhase2) {
        this.pendingPhase2.push(chunk);
      }
    }

    // Phase 2 detail generation: process 1 chunk per frame
    if (this.pendingPhase2.length > 0 && loaded < maxPerFrame) {
      const chunk = this.pendingPhase2.shift();
      if (chunk.active && chunk.needsPhase2) {
        chunk.buildPhase2();
        loaded++;
        newChunkLoaded = true;
      }
    }

    // LOD rebuilds use remaining budget
    while (this.pendingLOD.length > 0 && loaded < maxPerFrame) {
      const { key, segments } = this.pendingLOD.shift();
      const chunk = this.activeChunks.get(key);
      if (!chunk || !chunk.active) continue;
      if (chunk.segments === segments) continue; // already at target

      chunk.build(chunk.cx, chunk.cz, segments);
      chunk.mesh.updateMatrix();
      loaded++;

      // Upgrading from LOD → full quality needs phase 2 + callback
      if (chunk.needsPhase2) {
        this.pendingPhase2.push(chunk);
        newChunkLoaded = true;
      }
      // Downgrading to LOD doesn't need callback (fewer objects, pools will catch up)
    }

    if (newChunkLoaded && this.onChunksChanged) {
      this.onChunksChanged();
    }
  }

  _getChunk() {
    if (this.chunkPool.length > 0) {
      return this.chunkPool.pop();
    }
    return new Chunk();
  }

  /**
   * Get all active chunks (for tree/veg pools to iterate)
   */
  getActiveChunks() {
    return this.activeChunks.values();
  }

  /**
   * Force-load all pending chunks immediately (for initial load)
   */
  forceLoadAll(playerX, playerZ) {
    const cx = Math.floor(playerX / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(playerZ / CONFIG.CHUNK_SIZE);
    this.lastPlayerChunkX = null; // Force recalculation
    this.lastPlayerChunkZ = null;

    // Temporarily increase max chunks per frame
    const original = CONFIG.MAX_CHUNKS_PER_FRAME;
    CONFIG.MAX_CHUNKS_PER_FRAME = 999;
    this.update(playerX, playerZ, false);

    // Also drain phase 2 queue immediately during initial load
    while (this.pendingPhase2.length > 0) {
      const chunk = this.pendingPhase2.shift();
      if (chunk.active && chunk.needsPhase2) {
        chunk.buildPhase2();
      }
    }
    if (this.onChunksChanged) this.onChunksChanged();

    CONFIG.MAX_CHUNKS_PER_FRAME = original;
  }
}
