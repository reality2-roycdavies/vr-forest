// Tiny "relay link + peer count" indicator for both desktop and VR.
// Desktop: top-left fixed div. VR: small canvas sprite parented to the camera.

import * as THREE from 'three';

function peerText(connected, count) {
  if (!connected) return { text: '· no link', color: '#c77' };
  if (count === 0)  return { text: '◦ alone',  color: '#9ab' };
  return { text: `● ${count} nearby`, color: '#7cf' };
}

export class MultiplayerHud {
  constructor(camera) {
    this.camera = camera;
    this.connected = false;
    this.peerCount = 0;

    this._desktopEl = document.createElement('div');
    this._desktopEl.style.cssText = 'position:fixed;top:10px;left:10px;color:#fff;font:12px monospace;z-index:999;background:rgba(0,0,0,0.4);padding:4px 8px;border-radius:4px;';
    document.body.appendChild(this._desktopEl);

    this._canvas = document.createElement('canvas');
    this._canvas.width = 256;
    this._canvas.height = 64;
    this._ctx = this._canvas.getContext('2d');
    this._tex = new THREE.CanvasTexture(this._canvas);
    this._mat = new THREE.SpriteMaterial({
      map: this._tex, transparent: true, depthTest: false, depthWrite: false, fog: false,
    });
    this._sprite = new THREE.Sprite(this._mat);
    this._sprite.scale.set(0.12, 0.03, 1);
    this._sprite.position.set(-0.10, 0.09, -0.3);
    camera.add(this._sprite);

    this._lastText = null;
    this._render();
  }

  setConnected(connected) {
    if (this.connected === connected) return;
    this.connected = connected;
    this._render();
  }

  setPeerCount(count) {
    if (this.peerCount === count) return;
    this.peerCount = count;
    this._render();
  }

  _render() {
    const { text, color } = peerText(this.connected, this.peerCount);
    if (text === this._lastText) return;
    this._lastText = text;

    this._desktopEl.textContent = text;
    this._desktopEl.style.color = color;

    const ctx = this._ctx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 8); ctx.fill(); }
    else ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = color;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    this._tex.needsUpdate = true;
  }
}
