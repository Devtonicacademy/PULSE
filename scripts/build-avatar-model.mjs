/**
 * Builds the customizable PULSE avatar and writes it as a Draco-compressed GLB.
 *
 *   node scripts/build-avatar-model.mjs
 *
 * Output: public/models/avatar.glb
 *
 * The model is a stylized low-poly figure assembled from Three.js primitives. Customization is
 * driven by names the runtime (src/components/avatar/avatarModel.ts) looks up:
 *   materials  skin, hair, top, bottom, shoes, accent, dark   -> recolored per user
 *   nodes      Hair_*, Acc_*                                  -> shown / hidden per user
 *   nodes      ArmL, ArmR, LegL, LegR, Head, Body             -> animated (walk cycle, idle sway)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'models', 'avatar.glb');

// GLTFExporter reads blobs with FileReader, which Node does not have
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const materials = {};
const material = (name, color, extra = {}) => {
  materials[name] = new THREE.MeshStandardMaterial({ name, color, roughness: 0.72, metalness: 0, ...extra });
  return materials[name];
};
material('skin', 0xc68a62);
material('hair', 0x1c1410);
material('top', 0xff4757);
material('bottom', 0x27324a);
material('shoes', 0xf2f4f8);
material('accent', 0x00f2fe);
material('dark', 0x14161c, { roughness: 0.4 });

const mesh = (name, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
  const m = new THREE.Mesh(geometry, materials[mat]);
  m.name = name;
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.scale.set(...scale);
  return m;
};
const group = (name, position = [0, 0, 0]) => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...position);
  return g;
};

// +z is the front of the avatar, y is up; the figure is ~1.8 m tall (feet at y = 0)
const root = group('Avatar');
const body = group('Body', [0, 0.95, 0]);
root.add(body);

// Torso and hips
body.add(mesh('Torso', new THREE.CapsuleGeometry(0.2, 0.34, 6, 14), 'top', [0, 0.3, 0], [0, 0, 0], [1.1, 1, 0.75]));
body.add(mesh('Hips', new THREE.CapsuleGeometry(0.18, 0.1, 6, 14), 'bottom', [0, 0.02, 0], [0, 0, 0], [1.12, 1, 0.78]));

// Head
const head = group('Head', [0, 0.78, 0]);
body.add(head);
head.add(mesh('Skull', new THREE.SphereGeometry(0.2, 24, 18), 'skin', [0, 0.2, 0], [0, 0, 0], [1, 1.08, 1]));
head.add(mesh('Nose', new THREE.SphereGeometry(0.03, 8, 6), 'skin', [0, 0.18, 0.2]));
head.add(mesh('EyeL', new THREE.SphereGeometry(0.026, 10, 8), 'dark', [-0.07, 0.24, 0.18]));
head.add(mesh('EyeR', new THREE.SphereGeometry(0.026, 10, 8), 'dark', [0.07, 0.24, 0.18]));

// Hair styles (exactly one is visible at runtime)
const hairShort = group('Hair_Short');
hairShort.add(mesh('HairShortCap', new THREE.SphereGeometry(0.215, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), 'hair', [0, 0.22, -0.01], [-0.12, 0, 0], [1, 1.06, 1.03]));
const hairBun = group('Hair_Bun');
hairBun.add(mesh('HairBunCap', new THREE.SphereGeometry(0.215, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), 'hair', [0, 0.22, -0.01], [-0.12, 0, 0], [1, 1.06, 1.03]));
hairBun.add(mesh('HairBun', new THREE.SphereGeometry(0.095, 14, 10), 'hair', [0, 0.46, -0.06]));
const hairAfro = group('Hair_Afro');
hairAfro.add(mesh('HairAfro', new THREE.SphereGeometry(0.3, 22, 16), 'hair', [0, 0.3, -0.03], [0, 0, 0], [1, 0.95, 0.95]));
const hairLong = group('Hair_Long');
hairLong.add(mesh('HairLongCap', new THREE.SphereGeometry(0.22, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), 'hair', [0, 0.22, -0.02], [-0.1, 0, 0], [1, 1.06, 1.05]));
hairLong.add(mesh('HairLongBack', new THREE.CapsuleGeometry(0.16, 0.26, 6, 12), 'hair', [0, 0.04, -0.12], [0, 0, 0], [1.1, 1, 0.7]));
head.add(hairShort, hairBun, hairAfro, hairLong);

// Accessories
const cap = group('Acc_Cap');
cap.add(mesh('CapDome', new THREE.SphereGeometry(0.225, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 'accent', [0, 0.27, 0]));
cap.add(mesh('CapBrim', new THREE.CylinderGeometry(0.2, 0.2, 0.018, 20, 1, false, -Math.PI / 2, Math.PI), 'accent', [0, 0.275, 0.16], [0.08, 0, 0], [1, 1, 1.1]));
const glasses = group('Acc_Glasses');
glasses.add(mesh('LensL', new THREE.TorusGeometry(0.05, 0.009, 8, 18), 'dark', [-0.075, 0.24, 0.195]));
glasses.add(mesh('LensR', new THREE.TorusGeometry(0.05, 0.009, 8, 18), 'dark', [0.075, 0.24, 0.195]));
glasses.add(mesh('Bridge', new THREE.BoxGeometry(0.05, 0.01, 0.01), 'dark', [0, 0.245, 0.2]));
const headphones = group('Acc_Headphones');
headphones.add(mesh('Band', new THREE.TorusGeometry(0.215, 0.014, 8, 24, Math.PI), 'dark', [0, 0.2, 0]));
headphones.add(mesh('CupL', new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), 'accent', [-0.215, 0.2, 0], [0, 0, Math.PI / 2]));
headphones.add(mesh('CupR', new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), 'accent', [0.215, 0.2, 0], [0, 0, Math.PI / 2]));
head.add(cap, glasses, headphones);

const backpack = group('Acc_Backpack');
backpack.add(mesh('PackBody', new THREE.BoxGeometry(0.3, 0.36, 0.14), 'accent', [0, 0.28, -0.2]));
backpack.add(mesh('PackPocket', new THREE.BoxGeometry(0.2, 0.14, 0.05), 'dark', [0, 0.2, -0.28]));
body.add(backpack);

// Arms: sleeves in the top color, hands in the skin color; pivot at the shoulder
for (const [name, side] of [['ArmL', -1], ['ArmR', 1]]) {
  const arm = group(name, [side * 0.27, 0.5, 0]);
  arm.add(mesh(`${name}Sleeve`, new THREE.CapsuleGeometry(0.06, 0.3, 5, 10), 'top', [0, -0.22, 0]));
  arm.add(mesh(`${name}Hand`, new THREE.SphereGeometry(0.058, 10, 8), 'skin', [0, -0.46, 0]));
  body.add(arm);
}

// Legs: pivot at the hip; shoes on the ground
for (const [name, side] of [['LegL', -1], ['LegR', 1]]) {
  const leg = group(name, [side * 0.1, -0.02, 0]);
  leg.add(mesh(`${name}Pants`, new THREE.CapsuleGeometry(0.075, 0.55, 5, 10), 'bottom', [0, -0.4, 0]));
  leg.add(mesh(`${name}Shoe`, new THREE.BoxGeometry(0.13, 0.08, 0.26), 'shoes', [0, -0.88, 0.04]));
  body.add(leg);
}

// Defaults: short hair, nothing else
for (const n of ['Hair_Bun', 'Hair_Afro', 'Hair_Long', 'Acc_Cap', 'Acc_Glasses', 'Acc_Headphones', 'Acc_Backpack']) {
  root.getObjectByName(n).visible = false;
}

const scene = new THREE.Scene();
scene.add(root);

const exported = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
const rawBytes = new Uint8Array(exported);

// Draco-compress every mesh
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const document = await io.readBinary(rawBytes);
await document.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
const compressed = await io.writeBinary(document);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, compressed);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`avatar.glb: ${kb(rawBytes.length)} raw -> ${kb(compressed.length)} with Draco (${OUT})`);
