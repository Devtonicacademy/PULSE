import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createPulseMaterials, PulseMaterials } from './materials';
import { TileManager } from './TileManager';

export interface PulseSceneOptions {
  /** Cap on devicePixelRatio (mobile performance) */
  maxPixelRatio?: number;
  bloom?: boolean;
}

type FrameCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

export type LightPreset = 'night' | 'dusk' | 'dawn' | 'day';

const NIGHT_SKY = 0x05070d;
const FOG_DENSITY = 0.0011;

// Atmosphere per MapboxMap light preset. Windows switch off in daylight.
const LIGHT_PRESETS: Record<
  LightPreset,
  { sky: number; fog: number; hemiSky: number; hemiGround: number; hemi: number; sun: number; sunColor: number; windows: number; exposure: number }
> = {
  night: { sky: NIGHT_SKY, fog: FOG_DENSITY, hemiSky: 0x5a6ea8, hemiGround: 0x0a0d18, hemi: 1.5, sun: 1.3, sunColor: 0xa9bcff, windows: 2.0, exposure: 1.05 },
  dusk: { sky: 0x2a1530, fog: 0.0009, hemiSky: 0xff9a6a, hemiGround: 0x1a1020, hemi: 1.6, sun: 1.6, sunColor: 0xffa070, windows: 1.4, exposure: 1.0 },
  dawn: { sky: 0x3a2a40, fog: 0.0009, hemiSky: 0xffb6c8, hemiGround: 0x1a1a28, hemi: 1.7, sun: 1.8, sunColor: 0xffc0a0, windows: 0.8, exposure: 1.0 },
  day: { sky: 0x8fb4d9, fog: 0.0006, hemiSky: 0xdfeaff, hemiGround: 0x3a4250, hemi: 2.4, sun: 2.6, sunColor: 0xffffff, windows: 0, exposure: 0.9 }
};

/**
 * Owns the Three.js renderer, scene graph, post-processing and render loop.
 * Map coordinates (x east, y north, meters) map to scene (x, 0, -y).
 */
export class PulseScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly materials: PulseMaterials;
  readonly tiles: TileManager;

  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass | null = null;
  private clock = new THREE.Clock();
  private frameCallbacks = new Set<FrameCallback>();
  private resizeObserver: ResizeObserver;
  private animationId: number | null = null;
  private ground: THREE.Mesh;
  private hemiLight: THREE.HemisphereLight;
  private baseFogDensity = FOG_DENSITY;
  private sunLight: THREE.DirectionalLight;

  /** Rolling frame stats for diagnostics / adaptive quality */
  readonly stats = { frames: 0, fps: 0, lastSample: performance.now(), sampleFrames: 0 };

  constructor(private container: HTMLElement, options: PulseSceneOptions = {}) {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Count draw calls across all post-processing passes of a frame, not just the last one
    this.renderer.info.autoReset = false;
    this.renderer.domElement.className = 'pulse3d-canvas';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(NIGHT_SKY);
    this.scene.fog = new THREE.FogExp2(NIGHT_SKY, FOG_DENSITY);

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 6000);

    // Moonlight + cool ambient; city glow comes from emissive windows and road edges
    this.hemiLight = new THREE.HemisphereLight(0x5a6ea8, 0x0a0d18, 1.5);
    this.sunLight = new THREE.DirectionalLight(0xa9bcff, 1.3);
    this.sunLight.position.set(-300, 600, 200);
    this.scene.add(this.hemiLight, this.sunLight);

    this.materials = createPulseMaterials();

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), this.materials.ground);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.name = 'ground-grid';
    this.scene.add(this.ground);

    this.tiles = new TileManager(this.materials);
    this.scene.add(this.tiles.root);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (options.bloom ?? true) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.85, 0.45, 0.62);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    this.composer.setSize(width, height);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => this.frameCallbacks.delete(callback);
  }

  setLightPreset(preset: LightPreset) {
    const p = LIGHT_PRESETS[preset];
    (this.scene.background as THREE.Color).setHex(p.sky);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(p.sky);
    this.baseFogDensity = p.fog;
    fog.density = p.fog;
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemi;
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sun;
    this.materials.uniforms.uWindowIntensity.value = p.windows;
    this.renderer.toneMappingExposure = p.exposure;
  }

  /** Thins the fog as the camera rises so overview shots aren't washed out */
  setViewDistance(cameraDistance: number) {
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = this.baseFogDensity * Math.min(1, 600 / Math.max(1, cameraDistance));
  }

  setBuildingsVisible(visible: boolean) {
    this.materials.building.visible = visible;
  }

  setBloomEnabled(enabled: boolean) {
    if (this.bloomPass) this.bloomPass.enabled = enabled;
  }

  start() {
    if (this.animationId !== null) return;
    this.clock.start();
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;
      this.materials.uniforms.uTime.value = elapsed;
      this.frameCallbacks.forEach((cb) => cb(delta, elapsed));
      this.tiles.tick();
      this.renderer.info.reset();
      this.composer.render(delta);
      this.sampleFps();
    };
    loop();
  }

  dispose() {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.resizeObserver.disconnect();
    this.frameCallbacks.clear();
    this.tiles.dispose();
    this.ground.geometry.dispose();
    this.materials.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  private sampleFps() {
    this.stats.frames++;
    this.stats.sampleFrames++;
    const now = performance.now();
    if (now - this.stats.lastSample >= 1000) {
      this.stats.fps = Math.round((this.stats.sampleFrames * 1000) / (now - this.stats.lastSample));
      this.stats.sampleFrames = 0;
      this.stats.lastSample = now;
    }
  }
}
