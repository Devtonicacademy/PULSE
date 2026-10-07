import * as THREE from 'three';

/**
 * The player marker: a glowing orb with a pulsing ground ring, a cyan heading cone
 * on the ground and a direction arrow — the 3D counterpart of MapboxMap's avatar.
 */
export class UserAvatar {
  readonly group = new THREE.Group();
  /** Map meters (x east, y north) */
  position = { x: 0, y: 0 };
  /** Degrees clockwise from north */
  heading = 0;

  private headingGroup = new THREE.Group();
  private ring: THREE.Mesh;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group.name = 'user-avatar';

    const orbGeometry = new THREE.SphereGeometry(1.6, 24, 16);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4757,
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
      color: 0x00f2fe,
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
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.set(0, 2.4, -3.6);

    this.headingGroup.add(cone, arrow);
    this.group.add(this.ring, this.headingGroup, orb, halo);
    this.disposables.push(
      orbGeometry, orbMaterial, haloGeometry, haloMaterial, ringGeometry, ringMaterial,
      coneGeometry, coneMaterial, arrowGeometry, arrowMaterial
    );
  }

  setPosition(x: number, y: number) {
    this.position = { x, y };
    this.group.position.set(x, 0, -y);
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
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}
