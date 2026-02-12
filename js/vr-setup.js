// Renderer, WebXR, camera rig (dolly pattern)
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';

export class VRSetup {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.dolly = null;        // Group that holds camera + controllers
    this.controllers = [];
    this.session = null;
    this.onSessionStart = null;
    this.onSessionEnd = null;
  }

  init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    document.body.appendChild(this.renderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );
    this.camera.position.set(0, CONFIG.TERRAIN_FOLLOW_OFFSET, 0);

    // Dolly (camera rig)
    this.dolly = new THREE.Group();
    this.dolly.add(this.camera);

    // Controllers
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      this.dolly.add(controller);
      this.controllers.push(controller);
    }

    // VR Button
    const vrButton = VRButton.createButton(this.renderer);
    document.body.appendChild(vrButton);

    // Session events
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.session = this.renderer.xr.getSession();
      // Enable foveated rendering if available
      const gl = this.renderer.getContext();
      if (gl.getExtension) {
        const ext = gl.getExtension('OVR_multiview2');
        // Quest 3 foveation
        if (this.renderer.xr.getFoveation) {
          try { this.renderer.xr.setFoveation(1); } catch(e) {}
        }
      }
      if (this.onSessionStart) this.onSessionStart();
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      this.session = null;
      if (this.onSessionEnd) this.onSessionEnd();
    });

    // Handle resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return this;
  }

  isInVR() {
    return this.renderer.xr.isPresenting;
  }
}
