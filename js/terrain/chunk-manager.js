// Chunk lifecycle: load/unload/recycle around player
import { CONFIG } from '../config.js';
import { Chunk } from './chunk.js';

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.activeChunks = new Map();   // key "cx,cz" -> Chunk
    this.chunkPool = [];             // recycled chunks
    this.pendingLoads = [];          // chunks to load (staggered)
    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.onChunksChanged = null;     // callback for tree/veg rebuild
  }

  /**
   * Update chunks based on player world position.
   * Call each frame.
   */
  update(playerX, playerZ) {
    const cx = Math.floor(playerX / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(playerZ / CONFIG.CHUNK_SIZE);

    // Only recalculate when player enters a new chunk
    if (cx === this.lastPlayerChunkX && cz === this.lastPlayerChunkZ) {
      // Still process pending loads
      this._processQueue();
      return;
    }

    this.lastPlayerChunkX = cx;
    this.lastPlayerChunkZ = cz;

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
    for (const [key, chunk] of this.activeChunks) {
      const dist = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (dist > unloadR) {
        chunk.deactivate();
        this.chunkPool.push(chunk);
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

    this._processQueue();
  }

  _processQueue() {
    let loaded = 0;
    while (this.pendingLoads.length > 0 && loaded < CONFIG.MAX_CHUNKS_PER_FRAME) {
      const { cx, cz, key } = this.pendingLoads.shift();

      // Skip if already loaded (race condition protection)
      if (this.activeChunks.has(key)) continue;

      const chunk = this._getChunk();
      chunk.build(cx, cz);
      chunk.cx = cx;
      chunk.cz = cz;

      if (!chunk.mesh.parent) {
        this.scene.add(chunk.mesh);
      }
      chunk.mesh.updateMatrix();

      this.activeChunks.set(key, chunk);
      loaded++;
    }

    if (loaded > 0 && this.onChunksChanged) {
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
    this.update(playerX, playerZ);
    CONFIG.MAX_CHUNKS_PER_FRAME = original;
  }
}
