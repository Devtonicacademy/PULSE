import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { AvatarConfig } from './avatarConfig';

export type { AvatarConfig } from './avatarConfig';

/**
 * The customizable PULSE avatar. The mesh is public/models/avatar.glb (Draco-compressed,
 * built by scripts/build-avatar-model.mjs). Customization is a plain config object that
 * recolors named materials and toggles named nodes, so it stays tiny to store and sync.
 */

// --- Loading -------------------------------------------------------------------------------

let templatePromise: Promise<THREE.Group> | null = null;

/** Loads (once) and returns the shared template; instances clone it */
function loadTemplate(): Promise<THREE.Group> {
  if (!templatePromise) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    templatePromise = loader
      .loadAsync('/models/avatar.glb')
      .then((gltf) => gltf.scene)
      .finally(() => draco.dispose())
      .catch((err) => {
        templatePromise = null; // allow a retry
        throw err;
      });
  }
  return templatePromise;
}

// --- Instances ----------------------------------------------------------------------------

const COLOR_SLOTS = ['skin', 'hair', 'top', 'bottom', 'shoes', 'accent'] as const;

export class AvatarInstance {
  /** Add this to a scene. The feet are at y = 0 and the avatar looks along +z */
  readonly object: THREE.Group;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private nodes = new Map<string, THREE.Object3D>();
  private phase = 0;
  private moving = 0; // smoothed 0..1
  private config: AvatarConfig;

  constructor(template: THREE.Group, config: AvatarConfig) {
    this.object = template.clone(true);
    this.config = config;
    // Give this instance its own materials so recoloring never leaks into other avatars
    const owned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    this.object.traverse((node) => {
      this.nodes.set(node.name, node);
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        const source = mesh.material as THREE.MeshStandardMaterial;
        if (!owned.has(source)) {
          const copy = source.clone();
          owned.set(source, copy);
          this.materials.set(source.name, copy);
        }
        mesh.material = owned.get(source)!;
      }
    });
    this.setConfig(config);
  }

  getConfig() {
    return this.config;
  }

  setConfig(config: AvatarConfig) {
    this.config = config;
    for (const slot of COLOR_SLOTS) {
      const material = this.materials.get(slot);
      if (!material) continue;
      material.color.set(config[slot]);
      // A little self-lighting keeps the figure readable on the dark night streets
      material.emissive.set(config[slot]);
      material.emissiveIntensity = 0.22;
    }

    const show = (name: string, visible: boolean) => {
      const node = this.nodes.get(name);
      if (node) node.visible = visible;
    };
    // A cap would clip through bulky hair; long hair still shows below it
    const hairHiddenByCap = config.cap && config.hairStyle !== 'long';
    show('Hair_Short', config.hairStyle === 'short' && !hairHiddenByCap);
    show('Hair_Bun', config.hairStyle === 'bun' && !hairHiddenByCap);
    show('Hair_Afro', config.hairStyle === 'afro' && !hairHiddenByCap);
    show('Hair_Long', config.hairStyle === 'long');
    show('Acc_Cap', config.cap);
    show('Acc_Glasses', config.glasses);
    show('Acc_Headphones', config.headphones && !config.cap);
    show('Acc_Backpack', config.backpack);
  }

  /** Walk cycle driven by ground speed (meters / second); idles with a gentle sway at 0 */
  update(deltaSeconds: number, speed: number, elapsedSeconds: number) {
    const target = Math.min(1, speed / 1.2);
    this.moving += (target - this.moving) * Math.min(1, deltaSeconds * 8);
    this.phase += deltaSeconds * (3 + Math.min(speed, 8) * 1.6);

    const swing = Math.sin(this.phase) * 0.75 * this.moving;
    const rot = (name: string, x: number) => {
      const node = this.nodes.get(name);
      if (node) node.rotation.x = x;
    };
    rot('LegL', swing);
    rot('LegR', -swing);
    rot('ArmL', -swing * 0.8);
    rot('ArmR', swing * 0.8);

    const body = this.nodes.get('Body');
    if (body) {
      const bob = Math.abs(Math.sin(this.phase)) * 0.04 * this.moving;
      const breathe = Math.sin(elapsedSeconds * 1.8) * 0.006 * (1 - this.moving);
      body.position.y = 0.95 + bob + breathe;
    }
    const head = this.nodes.get('Head');
    if (head) head.rotation.z = Math.sin(elapsedSeconds * 0.9) * 0.025 * (1 - this.moving);
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.object.removeFromParent();
  }
}

/** Resolves once the model is available; instances are independent of each other */
export async function createAvatar(config: AvatarConfig): Promise<AvatarInstance> {
  const template = await loadTemplate();
  return new AvatarInstance(template, config);
}

// --- Portrait (for flat map markers) --------------------------------------------------------

const portraitCache = new Map<string, string>();

/** Renders the avatar's upper body to a small PNG data URL, for the 2D map marker */
export async function renderAvatarPortrait(config: AvatarConfig, size = 96): Promise<string> {
  const key = `${size}:${JSON.stringify(config)}`;
  const cached = portraitCache.get(key);
  if (cached) return cached;

  const avatar = await createAvatar(config);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.7), avatar.object);
  const key1 = new THREE.DirectionalLight(0xffffff, 1.6);
  key1.position.set(1, 2, 3);
  scene.add(key1);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.62, 2.1);
  camera.lookAt(0, 1.46, 0);
  avatar.update(0, 0, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  avatar.dispose();
  portraitCache.set(key, url);
  return url;
}
