// Thin WebSocket client for the R2 relay — HELLO, WELCOME, ping, reconnect.
// Pattern follows r2-notekeeper/index.html R2RelayTransport.

const PING_INTERVAL_MS = 30000;
const RECONNECT_MAX_MS = 60000;

export class RelayClient {
  constructor({ url, trustGroupHex, identity, onFrame, onStatus }) {
    this.url = url;
    this.trustGroupHex = trustGroupHex;
    this.identity = identity;
    this.onFrame = onFrame || (() => {});
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.connected = false;
    this._attempt = 0;
    this._pingTimer = null;
    this._stopped = false;
  }

  connect() {
    this._stopped = false;
    this._open();
  }

  disconnect() {
    this._stopped = true;
    this._stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.onStatus('disconnected');
  }

  send(bytes) {
    if (this.ws && this.connected) {
      this.ws.send(bytes);
    }
  }

  _open() {
    this.onStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = async () => {
      try {
        const ts = Math.floor(Date.now() / 1000);
        const hello = await this.identity.signHello(this.trustGroupHex, ts);
        this.ws.send(hello);
      } catch (e) {
        console.warn('[mp] hello failed:', e);
        try { this.ws.close(); } catch {}
      }
    };

    this.ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'welcome') {
            this.connected = true;
            this._attempt = 0;
            this._startPing();
            this.onStatus(`connected (${msg.peers} peers)`);
          }
        } catch {}
      } else {
        this.onFrame(new Uint8Array(evt.data));
      }
    };

    this.ws.onclose = (evt) => {
      this.connected = false;
      this._stopPing();
      if (evt.code === 4401) {
        this.onStatus('auth failed');
        return;
      }
      this.onStatus('disconnected');
      if (!this._stopped) this._scheduleReconnect();
    };

    this.ws.onerror = () => {};
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  _scheduleReconnect() {
    this._attempt++;
    const base = Math.min(1000 * Math.pow(2, this._attempt - 1), RECONNECT_MAX_MS);
    const jitter = base * (0.8 + Math.random() * 0.4);
    this.onStatus(`reconnect in ${Math.ceil(jitter / 1000)}s`);
    setTimeout(() => { if (!this._stopped) this._open(); }, jitter);
  }
}
