// Persistent Ed25519 identity, stored in localStorage.
// Signs the relay HELLO per R2-TRANSPORT-RELAY §3.1.

const SK_PRIV = 'vrf_mp_priv_pkcs8_b64';
const SK_PUB  = 'vrf_mp_pub_raw_b64';

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class Identity {
  constructor(publicKeyBytes, privateCryptoKey) {
    this.publicKeyBytes = publicKeyBytes;      // Uint8Array(32)
    this.publicKeyHex = toHex(publicKeyBytes);
    this._privKey = privateCryptoKey;
  }

  async sign(bytes) {
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, this._privKey, bytes);
    return new Uint8Array(sig);
  }

  // Builds the HELLO JSON string per r2-relay protocol.
  async signHello(trustGroupHex, timestampSecs) {
    const msg = `${trustGroupHex}:${this.publicKeyHex}:${timestampSecs}`;
    const sig = await this.sign(new TextEncoder().encode(msg));
    return JSON.stringify({
      type: 'hello',
      version: 1,
      trust_group: trustGroupHex,
      device_id: this.publicKeyHex,
      timestamp: timestampSecs,
      signature: toHex(sig),
    });
  }
}

export async function loadOrCreateIdentity() {
  if (!crypto.subtle || !crypto.subtle.generateKey) {
    throw new Error('Web Crypto unavailable');
  }

  const privB64 = localStorage.getItem(SK_PRIV);
  const pubB64  = localStorage.getItem(SK_PUB);

  if (privB64 && pubB64) {
    try {
      const privBytes = b64decode(privB64);
      const pubBytes  = b64decode(pubB64);
      const privKey = await crypto.subtle.importKey(
        'pkcs8', privBytes, { name: 'Ed25519' }, false, ['sign']
      );
      return new Identity(pubBytes, privKey);
    } catch (e) {
      console.warn('[mp] stored identity unusable, regenerating:', e);
    }
  }

  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubRaw  = new Uint8Array(await crypto.subtle.exportKey('raw',   kp.publicKey));
  const privPk8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  localStorage.setItem(SK_PUB,  b64encode(pubRaw));
  localStorage.setItem(SK_PRIV, b64encode(privPk8));
  return new Identity(pubRaw, kp.privateKey);
}
