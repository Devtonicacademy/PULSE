import * as THREE from 'three';

export type CameraMode = 'fpv' | 'aerial' | 'overview';

/**
 * Camera pose in map terms: look-at point (meters, x east / y north), heading in
 * degrees clockwise from north, pitch in degrees from straight down (map style:
 * 0 = top-down, 72 = street level), and distance from the look-at point.
 */
export interface RigPose {
  x: number;
  y: number;
  heading: number;
  pitch: number;
  distance: number;
}

/** Mode framings matched to PulseMap (FPV 72° / aerial 58° / 2D top-down) */
export const MODE_FRAMING: Record<CameraMode, { pitch: number; distance: number }> = {
  fpv: { pitch: 72, distance: 85 },
  aerial: { pitch: 58, distance: 480 },
  overview: { pitch: 0, distance: 1700 }
};

const MIN_PITCH = 0.5; // exactly top-down makes lookAt degenerate
const MAX_PITCH = 82;
const MIN_DISTANCE = 20;
const MAX_DISTANCE = 3200;

interface Tween {
  from: RigPose;
  to: RigPose;
  start: number;
  duration: number;
  /** Extra distance at mid-flight so long jumps arc up and back down like map flyTo */
  arc: number;
  resolve: () => void;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const shortestAngle = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Drives the Three.js camera from a map-style pose, with eased transitions and
 * Map-like input: drag to pan, right-drag / ctrl-drag to rotate & tilt,
 * wheel or pinch to zoom, two-finger twist to rotate.
 */
export class CameraRig {
  pose: RigPose;
  /** Fired when the user moves the camera by hand (cancels transitions) */
  onUserInteract: (() => void) | null = null;

  private tween: Tween | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragMode: 'pan' | 'rotate' | null = null;
  private lastPinch: { dist: number; angle: number; mid: { x: number; y: number } } | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement, initial: RigPose) {
    this.pose = { ...initial };
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('pointercancel', this.handlePointerUp);
    dom.addEventListener('wheel', this.handleWheel, { passive: false });
    dom.addEventListener('contextmenu', this.preventDefault);
    this.apply();
  }

  get isAnimating() {
    return this.tween !== null;
  }

  /** Moves to a pose; resolves when the transition completes (or is interrupted) */
  flyTo(target: Partial<RigPose>, durationMs = 1200): Promise<void> {
    this.tween?.resolve();
    const to: RigPose = { ...this.pose, ...target };
    to.pitch = clamp(to.pitch, MIN_PITCH, MAX_PITCH);
    to.distance = clamp(to.distance, MIN_DISTANCE, MAX_DISTANCE);
    if (durationMs <= 0) {
      this.pose = to;
      this.tween = null;
      this.apply();
      return Promise.resolve();
    }
    const travel = Math.hypot(to.x - this.pose.x, to.y - this.pose.y);
    return new Promise((resolve) => {
      this.tween = {
        from: { ...this.pose },
        to,
        start: performance.now(),
        duration: durationMs,
        arc: travel > 300 ? Math.min(2400, travel * 0.55) : 0,
        resolve
      };
    });
  }

  /** Instantly sets the pose (walking, simulated walk) */
  jumpTo(target: Partial<RigPose>) {
    void this.flyTo(target, 0);
  }

  update() {
    const tween = this.tween;
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
      const e = easeInOutCubic(t);
      const { from, to } = tween;
      this.pose = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        heading: from.heading + shortestAngle(from.heading, to.heading) * e,
        pitch: from.pitch + (to.pitch - from.pitch) * e,
        distance: from.distance + (to.distance - from.distance) * e + tween.arc * Math.sin(Math.PI * e)
      };
      if (t >= 1) {
        this.pose = { ...to, heading: ((to.heading % 360) + 360) % 360 };
        this.tween = null;
        tween.resolve();
      }
    }
    this.apply();
  }

  /** Approximate ground meters covered by one screen pixel at the look-at point */
  metersPerPixel(): number {
    const height = this.dom.clientHeight || 1;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    return (2 * this.pose.distance * Math.tan(fov / 2)) / height;
  }

  dispose() {
    this.tween?.resolve();
    this.dom.removeEventListener('pointerdown', this.handlePointerDown);
    this.dom.removeEventListener('pointermove', this.handlePointerMove);
    this.dom.removeEventListener('pointerup', this.handlePointerUp);
    this.dom.removeEventListener('pointercancel', this.handlePointerUp);
    this.dom.removeEventListener('wheel', this.handleWheel);
    this.dom.removeEventListener('contextmenu', this.preventDefault);
  }

  private apply() {
    const { x, y, heading, pitch, distance } = this.pose;
    const h = THREE.MathUtils.degToRad(heading);
    const p = THREE.MathUtils.degToRad(clamp(pitch, MIN_PITCH, MAX_PITCH));
    const horizontal = distance * Math.sin(p);
    // Camera sits behind the look-at point, opposite the heading
    const camX = x - Math.sin(h) * horizontal;
    const camY = y - Math.cos(h) * horizontal;
    this.camera.position.set(camX, distance * Math.cos(p), -camY);
    this.camera.lookAt(x, 0, -y);
    // Keep "up" on screen pointing along the heading when looking straight down
    if (pitch < 5) this.camera.up.set(Math.sin(h), 0, -Math.cos(h));
    else this.camera.up.set(0, 1, 0);
  }

  private interrupt() {
    if (this.tween) {
      this.tween.resolve();
      this.tween = null;
    }
    this.onUserInteract?.();
  }

  private pan(dxPixels: number, dyPixels: number) {
    const mpp = this.metersPerPixel();
    // Tilted views cover more ground per pixel vertically
    const tilt = 1 / Math.max(0.35, Math.cos(THREE.MathUtils.degToRad(this.pose.pitch)));
    const h = THREE.MathUtils.degToRad(this.pose.heading);
    const right = [Math.cos(h), -Math.sin(h)];
    const forward = [Math.sin(h), Math.cos(h)];
    this.pose.x += -dxPixels * mpp * right[0] + dyPixels * mpp * tilt * forward[0];
    this.pose.y += -dxPixels * mpp * right[1] + dyPixels * mpp * tilt * forward[1];
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragMode = e.button === 2 || e.ctrlKey || e.shiftKey ? 'rotate' : 'pan';
    } else {
      this.dragMode = null;
      this.lastPinch = this.pinchState();
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dx && !dy) return;
    this.interrupt();

    if (this.pointers.size >= 2) {
      const pinch = this.pinchState();
      if (pinch && this.lastPinch) {
        this.pose.distance = clamp(this.pose.distance * (this.lastPinch.dist / pinch.dist), MIN_DISTANCE, MAX_DISTANCE);
        this.pose.heading -= THREE.MathUtils.radToDeg(pinch.angle - this.lastPinch.angle);
        this.pan(pinch.mid.x - this.lastPinch.mid.x, pinch.mid.y - this.lastPinch.mid.y);
      }
      this.lastPinch = pinch;
      return;
    }

    if (this.dragMode === 'rotate') {
      this.pose.heading = (this.pose.heading + dx * 0.35 + 360) % 360;
      this.pose.pitch = clamp(this.pose.pitch - dy * 0.3, MIN_PITCH, MAX_PITCH);
    } else if (this.dragMode === 'pan') {
      this.pan(dx, dy);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = null;
    if (!this.pointers.size) this.dragMode = null;
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.interrupt();
    this.pose.distance = clamp(this.pose.distance * Math.exp(e.deltaY * 0.0012), MIN_DISTANCE, MAX_DISTANCE);
  };

  private pinchState() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    };
  }

  private preventDefault = (e: Event) => e.preventDefault();
}
