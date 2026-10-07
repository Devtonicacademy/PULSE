import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { NavigationRoute, WaypointCue } from '../../../utils/wayfindingUtils';
import { lngLatToMeters } from '../../../utils/mapProjection';
import { escapeHtml } from '../../../utils/htmlUtils';

/**
 * Walking route: a glowing ribbon with chevrons flowing toward the destination,
 * turn-cue labels, and a light-pillar beacon at the end.
 */

const RIBBON_WIDTH = 3.6; // street level; widens when zoomed out so it stays visible
const RIBBON_PIXEL_SCALE = 0.006; // half-width as a share of camera distance
const RIBBON_HEIGHT = 1.0; // above road surfaces
const BEACON_HEIGHT = 90;

const CUE_ICONS: Record<WaypointCue['cueType'], string> = {
  straight: '⬆',
  'turn-left': '↰',
  'turn-right': '↱',
  destination: '🎯'
};

export class RouteLayer {
  readonly group = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private labels: CSS2DObject[] = [];
  private material: THREE.ShaderMaterial | null = null;

  constructor() {
    this.group.name = 'route';
  }

  setRoute(route: NavigationRoute | null) {
    this.clear();
    if (!route || route.pathCoordinates.length < 2) return;

    const path = route.pathCoordinates.map(([lng, lat]) => {
      const [x, y] = lngLatToMeters(lng, lat);
      return new THREE.Vector2(x, y);
    });
    this.group.add(this.buildRibbon(path));

    for (const cue of route.waypoints) {
      if (cue.cueType === 'straight' && cue.index === 0) continue;
      const [x, y] = lngLatToMeters(cue.coordinates[0], cue.coordinates[1]);
      if (cue.cueType === 'destination') this.group.add(this.buildBeacon(x, y));
      this.addLabel(cue, x, y);
    }
  }

  /** Advance the flowing chevrons and keep the ribbon readable at the current zoom */
  update(elapsedSeconds: number, cameraDistance: number) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = elapsedSeconds;
    this.material.uniforms.uHalfWidth.value = Math.max(RIBBON_WIDTH / 2, cameraDistance * RIBBON_PIXEL_SCALE);
  }

  clear() {
    this.labels.forEach((label) => {
      label.element.remove();
      label.removeFromParent();
    });
    this.labels = [];
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.material = null;
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }

  private buildRibbon(path: THREE.Vector2[]): THREE.Mesh {
    // Centerline vertices + an offset direction; the vertex shader pushes them out to
    // the current half-width (uHalfWidth), so width can follow the zoom level
    const positions: number[] = [];
    const offsets: number[] = [];
    const uvs: number[] = [];
    const normals: THREE.Vector2[] = [];
    const distances: number[] = [];
    let along = 0;

    for (let i = 0; i < path.length; i++) {
      if (i > 0) along += path[i].distanceTo(path[i - 1]);
      distances.push(along);
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const tangent = new THREE.Vector2().subVectors(next, prev).normalize();
      normals.push(new THREE.Vector2(-tangent.y, tangent.x));
    }

    for (let i = 0; i < path.length - 1; i++) {
      const quad: [number, number][] = [[i, 1], [i, -1], [i + 1, -1], [i, 1], [i + 1, -1], [i + 1, 1]];
      for (const [k, side] of quad) {
        positions.push(path[k].x, RIBBON_HEIGHT, -path[k].y);
        // Offset in scene space (map y north -> scene -z)
        offsets.push(normals[k].x * side, -normals[k].y * side);
        uvs.push(side > 0 ? 0 : 1, distances[k]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aOffset', new THREE.Float32BufferAttribute(offsets, 2));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      // Roads and ground use polygon offset to avoid z-fighting, which pulls them toward
      // the camera at a distance; out-offset them so the ribbon always draws on top
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      uniforms: { uTime: { value: 0 }, uHalfWidth: { value: RIBBON_WIDTH / 2 } },
      vertexShader: /* glsl */ `
        attribute vec2 aOffset;
        uniform float uHalfWidth;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position + vec3(aOffset.x, 0.0, aOffset.y) * uHalfWidth;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uHalfWidth;
        varying vec2 vUv;
        void main() {
          float across = abs(vUv.x * 2.0 - 1.0);
          float edge = smoothstep(0.65, 1.0, across);
          // Chevrons spaced relative to the ribbon width, flowing toward the destination
          float phase = fract(vUv.y / (uHalfWidth * 4.5) - uTime * 0.9);
          float chevron = 1.0 - smoothstep(0.0, 0.12, abs(phase - 0.5 - across * 0.25));
          vec3 color = vec3(0.0, 0.95, 1.0) * (0.35 + edge * 0.9) + vec3(0.6, 1.0, 1.0) * chevron * 0.9;
          gl_FragColor = vec4(color, 0.55 + chevron * 0.4);
        }`
    });
    this.disposables.push(geometry, this.material);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = false; // vertices move in the shader; the CPU bounds don't know
    mesh.renderOrder = 5;
    return mesh;
  }

  private buildBeacon(x: number, y: number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(1.4, 2.2, BEACON_HEIGHT, 16, 1, true);
    geometry.translate(0, BEACON_HEIGHT / 2, 0);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying float vHeight;
        void main() {
          vHeight = position.y / ${BEACON_HEIGHT.toFixed(1)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vHeight;
        void main() {
          gl_FragColor = vec4(mix(vec3(1.0, 0.28, 0.34), vec3(0.0, 0.95, 1.0), vHeight), (1.0 - vHeight) * 0.75);
        }`
    });
    this.disposables.push(geometry, material);
    const beacon = new THREE.Mesh(geometry, material);
    beacon.position.set(x, 0, -y);
    beacon.renderOrder = 6;
    return beacon;
  }

  private addLabel(cue: WaypointCue, x: number, y: number) {
    const el = document.createElement('div');
    el.className = 'pulse-route-cue';
    const isDestination = cue.cueType === 'destination';
    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 9999px; font-size: 10px; font-weight: 800; white-space: nowrap;
        background: ${isDestination ? 'linear-gradient(135deg, #FF4757, #FFA502)' : 'rgba(10, 14, 23, 0.9)'};
        color: ${isDestination ? '#FFFFFF' : '#00F2FE'}; border: 1px solid ${isDestination ? '#FFFFFF' : 'rgba(0, 242, 254, 0.6)'};
        box-shadow: 0 2px 10px rgba(0,0,0,0.7);">
        <span style="font-size: 12px;">${CUE_ICONS[cue.cueType]}</span>
        <span>${escapeHtml(cue.label)}</span>
      </div>`;
    const label = new CSS2DObject(el);
    label.center.set(0.5, 1);
    label.position.set(x, isDestination ? BEACON_HEIGHT * 0.35 : 6, -y);
    this.group.add(label);
    this.labels.push(label);
  }
}
