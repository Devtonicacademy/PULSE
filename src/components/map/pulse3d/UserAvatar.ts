import * as THREE from 'three';
import { ANCHORS } from '../../../theme/tokens';
import { AvatarConfig, AvatarInstance, createAvatar } from '../../avatar/avatarModel';

/** The avatar is ~1.8 m tall; scaled up so it reads from the street-level camera */
const CHARACTER_SCALE = 2.4;

/**
 * The player marker: a glowing orb with a pulsing ground ring, a cyan heading cone
 * on the ground and a direction arrow. Once the user has finished onboarding, setCharacter()
 * swaps the orb for their customized 3D avatar (the ring and heading cone stay).
 */
export class UserAvatar {
  readonly group = new THREE.Group();
  /**
   * The "how accurate is this position" circle. It lives outside `group` (which is scaled with the
   * camera distance) so its radius stays true to the real meters; add it to the scene beside the avatar.
   */
  readonly accuracyGroup = new THREE.Group();
  /** Map meters (x east, y north) */
  position = { x: 0, y: 0 };
  /** Degrees clockwise from north */
  heading = 0;

  private headingGroup = new THREE.Group();
  private ring: THREE.Mesh;
  private orbParts: THREE.Object3D[] = [];
  private character: AvatarInstance | null = null;
  private characterRequest = 0;
  private lastMove = { x: 0, y: 0, time: 0 };
  private speed = 0;
  private lastElapsed = 0;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group.name = 'user-avatar';

    const orbGeometry = new THREE.SphereGeometry(1.6, 24, 16);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: ANCHORS.accent,
      emissive: 0xff5a3d,
      emissiveIntensity: 0.9,
      roughness: 0.3
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    orb.position.y = 2.4;

    const haloGeometry = new THREE.RingGeometry(1.9, 2.5, 32);
    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xb8c4d6, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.y = 2.4;
    halo.onBeforeRender = (_r, _s, camera) => halo.quaternion.copy(camera.quaternion); // billboard

    const ringGeometry = new THREE.RingGeometry(3, 3.6, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: ANCHORS.signal,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.25;

    // Heading cone: a fan on the ground that fades with distance (vertex alpha)
    const coneLength = 26;
    const halfAngle = THREE.MathUtils.degToRad(28);
    const segments = 12;
    const positions: number[] = [];
    const alphas: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = -halfAngle + (2 * halfAngle * i) / segments;
      const a1 = -halfAngle + (2 * halfAngle * (i + 1)) / segments;
      // Scene forward (north) is -z
      positions.push(0, 0, 0, Math.sin(a1) * coneLength, 0, -Math.cos(a1) * coneLength, Math.sin(a0) * coneLength, 0, -Math.cos(a0) * coneLength);
      alphas.push(0.55, 0, 0);
    }
    const coneGeometry = new THREE.BufferGeometry();
    coneGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    coneGeometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
    const coneMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() { gl_FragColor = vec4(0.0, 0.95, 1.0, vAlpha); }`
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.y = 0.3;

    const arrowGeometry = new THREE.ConeGeometry(1.1, 3, 3);
    arrowGeometry.rotateX(-Math.PI / 2); // point along -z (north)
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ANCHORS.signal });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.set(0, 2.4, -3.6);

    this.headingGroup.add(cone, arrow);
    this.orbParts = [orb, halo, arrow];
    this.group.add(this.ring, this.headingGroup, orb, halo);

    const discGeometry = new THREE.CircleGeometry(1, 64);
    const discMaterial = new THREE.MeshBasicMaterial({
      color: ANCHORS.signal, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide
    });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    const edgeGeometry = new THREE.RingGeometry(0.985, 1, 96);
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: ANCHORS.signal, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    for (const mesh of [disc, edge]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
    }
    disc.position.y = 0.15;
    edge.position.y = 0.2;
    this.accuracyGroup.add(disc, edge);
    this.accuracyGroup.visible = false;
    this.accuracyGroup.name = 'user-accuracy';
    this.disposables.push(discGeometry, discMaterial, edgeGeometry, edgeMaterial);
    this.disposables.push(
      orbGeometry, orbMaterial, haloGeometry, haloMaterial, ringGeometry, ringMaterial,
      coneGeometry, coneMaterial, arrowGeometry, arrowMaterial
    );
  }

  /** Shows the customized 3D avatar in place of the orb (pass null to go back to the orb) */
  async setCharacter(config: AvatarConfig | null) {
    const request = ++this.characterRequest;
    if (!config) {
      this.character?.dispose();
      this.character = null;
      this.orbParts.forEach((o) => (o.visible = true));
      return;
    }
    if (this.character) {
      this.character.setConfig(config);
      return;
    }
    try {
      const instance = await createAvatar(config);
      if (request !== this.characterRequest) {
        instance.dispose();
        return;
      }
      instance.object.scale.setScalar(CHARACTER_SCALE);
      instance.object.rotation.y = Math.PI; // the model faces +z, the scene's forward is -z
      this.headingGroup.add(instance.object);
      this.character = instance;
      this.orbParts.forEach((o) => (o.visible = false));
    } catch (err) {
      console.warn('[PULSE 3D] Avatar model failed to load, keeping the orb:', err);
    }
  }

  setPosition(x: number, y: number) {
    this.position = { x, y };
    this.group.position.set(x, 0, -y);
    this.accuracyGroup.position.set(x, 0, -y);
    // Ground speed drives the walk cycle (measured over the time between position updates)
    const now = performance.now();
    const dt = (now - this.lastMove.time) / 1000;
    if (this.lastMove.time && dt > 0.02 && dt < 2) {
      this.speed = Math.hypot(x - this.lastMove.x, y - this.lastMove.y) / dt;
    }
    this.lastMove = { x, y, time: now };
  }

  /** Shows the accuracy circle (radius in meters), or hides it for null. Kept visible-sized: 6 m to 5 km. */
  setAccuracy(meters: number | null) {
    if (meters == null || !Number.isFinite(meters)) {
      this.accuracyGroup.visible = false;
      return;
    }
    const radius = Math.min(5000, Math.max(6, meters));
    this.accuracyGroup.scale.set(radius, 1, radius);
    this.accuracyGroup.visible = true;
  }

  setHeading(degrees: number) {
    this.heading = ((degrees % 360) + 360) % 360;
    // Rotating about +y by -heading turns north (-z) clockwise toward east (+x)
    this.headingGroup.rotation.y = -THREE.MathUtils.degToRad(this.heading);
  }

  /** Pulses the ring and keeps the avatar readable from far away */
  update(elapsedSeconds: number, cameraDistance: number) {
    const t = (elapsedSeconds % 2) / 2;
    this.ring.scale.setScalar(1 + t * 1.8);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
    this.group.scale.setScalar(Math.min(4, Math.max(1, cameraDistance / 140)));
    if (this.character) {
      // Stopped for a moment means standing still
      if (performance.now() - this.lastMove.time > 400) this.speed = 0;
      const dt = Math.min(0.1, Math.max(0, elapsedSeconds - this.lastElapsed));
      this.character.update(dt, this.speed, elapsedSeconds);
    }
    this.lastElapsed = elapsedSeconds;
  }

  dispose() {
    this.characterRequest++;
    this.character?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
    this.accuracyGroup.removeFromParent();
  }
}
