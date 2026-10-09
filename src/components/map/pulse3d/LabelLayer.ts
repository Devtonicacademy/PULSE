import * as THREE from 'three';
import type { TileLabels } from './TileManager';
import { PLACE_KIND_NAMES } from './tileFormat';

/**
 * Street names and place names drawn on one 2D canvas over the WebGL view.
 * One canvas (not one DOM node per label) keeps hundreds of names cheap. Each pass the visible
 * candidates are projected, ranked and placed greedily: a label that would overlap one already
 * placed is dropped, so the map never crowds. Street names sit along the street's on-screen
 * direction; places float over their building.
 */

// Street range by road class (motorway ... track): the big roads stay readable from far away
const STREET_RANGE = [2600, 2400, 2000, 1500, 1000, 650, 500, 400, 300];
const PLACE_RANGE = 650;
const LANDMARK_RANGE = 1400;
const MAX_STREET_LABELS = 70;
const MAX_PLACE_LABELS = 45;
/** The same street name must be at least this far apart on screen, px */
const SAME_NAME_GAP = 260;
const PAD = 4;
/** The view is re-labelled every N frames while it moves */
const FRAME_STRIDE = 2;
const GRID_CELL = 96;

const kindIndex = (name: (typeof PLACE_KIND_NAMES)[number]) => PLACE_KIND_NAMES.indexOf(name);
/** Places that deserve a label from further away */
const LANDMARK_KINDS = new Set(
  (['building', 'education', 'health', 'worship', 'leisure', 'civic', 'lodging'] as const).map(kindIndex)
);

const PLACE_COLORS: Record<string, string> = {
  building: '#c4b5fd', food: '#fdba74', shop: '#f9a8d4', health: '#fca5a5', education: '#93c5fd',
  worship: '#fde68a', lodging: '#a5b4fc', leisure: '#86efac', transport: '#7dd3fc', finance: '#6ee7b7', civic: '#d8b4fe'
};

interface Rect { x0: number; y0: number; x1: number; y1: number }
type Point = [number, number];
interface StreetCandidate { name: string; cls: number; d: number; pts: Point[] }
interface PlaceCandidate { name: string; kind: number; d: number; x: number; y: number; landmark: boolean; priority: number }

export class LabelLayer {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null;
  private widths = new Map<string, number>();
  private frame = 0;
  private lastSignature = '';
  private lastVersion = -1;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private enabled = true;
  private v = new THREE.Vector3();
  private matrix = new THREE.Matrix4();
  private frustum = new THREE.Frustum();
  /** Labels drawn in the last pass (diagnostics) */
  stats = { streets: 0, places: 0 };

  constructor(private container: HTMLElement, private tiles: { labels: Map<string, TileLabels>; labelVersion: number }) {
    this.canvas.className = 'pulse3d-labels';
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.ctx = this.canvas.getContext('2d');
    container.appendChild(this.canvas);
  }

  /** Sits between the WebGL canvas and the HTML cards */
  placeAfter(element: HTMLElement) {
    element.after(this.canvas);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.canvas.style.display = enabled ? 'block' : 'none';
    this.lastSignature = '';
  }

  dispose() {
    this.canvas.remove();
  }

  private measure(text: string, font: string): number {
    const key = `${font}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      w = this.ctx!.measureText(text).width;
      if (this.widths.size > 4000) this.widths.clear();
      this.widths.set(key, w);
    }
    return w;
  }

  /** Projects a world point to CSS pixels; null when it is behind the camera */
  private project(x: number, y: number, z: number): Point | null {
    const e = this.matrix.elements;
    const wClip = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (wClip <= 0.01) return null;
    this.v.set(x, y, z).applyMatrix4(this.matrix);
    return [(this.v.x * 0.5 + 0.5) * this.width, (-this.v.y * 0.5 + 0.5) * this.height];
  }

  /** Call once per frame after the camera has moved */
  update(camera: THREE.PerspectiveCamera, daylight: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (this.frame++ % FRAME_STRIDE) return;

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resized = w !== this.width || h !== this.height || ratio !== this.ratio;
    if (resized) {
      this.width = w;
      this.height = h;
      this.ratio = ratio;
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }

    // Nothing moved and nothing loaded: the last drawing is still right
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements;
    const signature = `${m[12].toFixed(1)},${m[13].toFixed(1)},${m[14].toFixed(1)},${m[0].toFixed(3)},${m[2].toFixed(3)},${m[6].toFixed(3)},${daylight.toFixed(2)}`;
    if (!resized && signature === this.lastSignature && this.tiles.labelVersion === this.lastVersion) return;
    this.lastSignature = signature;
    this.lastVersion = this.tiles.labelVersion;

    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    const cam = camera.position;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';

    const night = daylight < 0.5;
    const halo = night ? 'rgba(5,7,13,0.85)' : 'rgba(255,255,255,0.9)';
    const ink = night ? '#e6ecff' : '#1f2937';

    // Spatial hash of the boxes already taken, so overlap tests stay cheap with hundreds of candidates
    const grid = new Map<number, Rect[]>();
    const cellsOf = (r: Rect) => {
      const out: number[] = [];
      for (let cx = Math.floor(r.x0 / GRID_CELL); cx <= Math.floor(r.x1 / GRID_CELL); cx++) {
        for (let cy = Math.floor(r.y0 / GRID_CELL); cy <= Math.floor(r.y1 / GRID_CELL); cy++) out.push(cx * 10007 + cy);
      }
      return out;
    };
    const free = (r: Rect) => {
      if (r.x1 < 0 || r.y1 < 0 || r.x0 > w || r.y0 > h) return false;
      for (const c of cellsOf(r)) {
        for (const o of grid.get(c) ?? []) if (r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) return false;
      }
      return true;
    };
    const claim = (r: Rect) => {
      for (const c of cellsOf(r)) {
        const list = grid.get(c);
        if (list) list.push(r);
        else grid.set(c, [r]);
      }
    };

    // --- candidates: distance and view-frustum culling happen here, before any text is measured ----
    const streets: StreetCandidate[] = [];
    const places: PlaceCandidate[] = [];

    this.tiles.labels.forEach((tile) => {
      const [ox, oy] = tile.origin;

      for (const [name, cls, flat] of tile.streets) {
        const midI = Math.floor(flat.length / 4) * 2;
        const mx = ox + flat[midI] / 10;
        const mz = -(oy + flat[midI + 1] / 10);
        const d = Math.hypot(mx - cam.x, cam.y, mz - cam.z);
        if (d > (STREET_RANGE[cls] ?? 300)) continue;
        const inView =
          this.frustum.containsPoint(this.v.set(mx, 0, mz)) ||
          this.frustum.containsPoint(this.v.set(ox + flat[0] / 10, 0, -(oy + flat[1] / 10))) ||
          this.frustum.containsPoint(this.v.set(ox + flat[flat.length - 2] / 10, 0, -(oy + flat[flat.length - 1] / 10)));
        if (!inView) continue;
        const pts: Point[] = [];
        for (let i = 0; i < flat.length; i += 2) {
          const p = this.project(ox + flat[i] / 10, 0.2, -(oy + flat[i + 1] / 10));
          if (p) pts.push(p);
        }
        if (pts.length >= 2) streets.push({ name, cls, d, pts });
      }

      for (const [name, kind, xdm, ydm, hdm] of tile.places) {
        const x = ox + xdm / 10;
        const z = -(oy + ydm / 10);
        const top = hdm / 10 + 3;
        const d = Math.hypot(x - cam.x, top - cam.y, z - cam.z);
        const landmark = LANDMARK_KINDS.has(kind);
        if (d > (landmark ? LANDMARK_RANGE : PLACE_RANGE)) continue;
        if (!this.frustum.containsPoint(this.v.set(x, top, z))) continue;
        const p = this.project(x, top, z);
        if (!p) continue;
        // Landmarks and tall buildings first, then whatever is closest
        places.push({ name, kind, d, x: p[0], y: p[1], landmark, priority: (landmark ? 1000 : 0) + Math.min(hdm / 10, 150) - d * 0.05 });
      }
    });

    // --- places first (they anchor the map), streets fill what is left -----------------------------
    places.sort((a, b) => b.priority - a.priority);
    let placeCount = 0;
    for (const p of places) {
      if (placeCount >= MAX_PLACE_LABELS) break;
      const size = Math.round(THREE.MathUtils.clamp(15 - p.d / 150, 10, 14));
      const font = `600 ${size}px system-ui, sans-serif`;
      ctx.font = font;
      const tw = this.measure(p.name, font);
      const rect = { x0: p.x - tw / 2 - PAD - 8, y0: p.y - size - 14, x1: p.x + tw / 2 + PAD + 8, y1: p.y + 4 };
      if (!free(rect)) continue;
      claim(rect);
      ctx.globalAlpha = THREE.MathUtils.clamp(1.2 - p.d / (p.landmark ? LANDMARK_RANGE : PLACE_RANGE), 0.35, 1);
      const color = PLACE_COLORS[PLACE_KIND_NAMES[p.kind]] ?? ink;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(p.name, p.x, p.y - size / 2 - 5);
      ctx.fillStyle = night ? color : ink;
      ctx.fillText(p.name, p.x, p.y - size / 2 - 5);
      placeCount++;
    }

    // Bigger roads first, then nearer ones
    streets.sort((a, b) => a.cls - b.cls || a.d - b.d);
    const nameSpots = new Map<string, Point[]>();
    let streetCount = 0;
    for (const s of streets) {
      if (streetCount >= MAX_STREET_LABELS) break;
      const size = Math.round(THREE.MathUtils.clamp(13 - s.d / 260 + (s.cls < 3 ? 1 : 0), 9, 13));
      const font = `600 ${size}px system-ui, sans-serif`;
      ctx.font = font;
      const tw = this.measure(s.name, font);
      const spot = this.alongPath(s.pts, tw + 8);
      if (!spot) continue;
      const { x, y, angle } = spot;
      // Rotated text: its box is approximated by the axis-aligned bounds of the rotated rectangle
      const hw = (tw / 2 + PAD) * Math.abs(Math.cos(angle)) + (size / 2 + PAD) * Math.abs(Math.sin(angle));
      const hh = (tw / 2 + PAD) * Math.abs(Math.sin(angle)) + (size / 2 + PAD) * Math.abs(Math.cos(angle));
      const rect = { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
      if (!free(rect)) continue;
      const others = nameSpots.get(s.name);
      if (others?.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < SAME_NAME_GAP)) continue;
      claim(rect);
      if (others) others.push([x, y]);
      else nameSpots.set(s.name, [[x, y]]);
      ctx.globalAlpha = THREE.MathUtils.clamp(1.15 - s.d / (STREET_RANGE[s.cls] ?? 300), 0.4, 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(s.name, 0, 0);
      ctx.fillStyle = ink;
      ctx.fillText(s.name, 0, 0);
      ctx.restore();
      streetCount++;
    }
    ctx.globalAlpha = 1;
    this.stats = { streets: streetCount, places: placeCount };
  }

  /**
   * Where text of the given length fits along a screen-space polyline: the middle if it is on
   * screen and the street is straight enough under the text, else a few other offsets, else nothing.
   */
  private alongPath(pts: Point[], textLength: number): { x: number; y: number; angle: number } | null {
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = lens[lens.length - 1];
    if (total < textLength) return null;
    const at = (s: number): Point => {
      let i = 1;
      while (i < lens.length - 1 && lens[i] < s) i++;
      const t = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    };
    const onScreen = (p: Point) => p[0] > 4 && p[0] < this.width - 4 && p[1] > 4 && p[1] < this.height - 4;
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const s = Math.min(total - textLength / 2, Math.max(textLength / 2, total * f));
      const a = at(s - textLength / 2);
      const b = at(s + textLength / 2);
      const c = at(s);
      if (!onScreen(a) || !onScreen(b) || !onScreen(c)) continue;
      // A tight bend means the chord is much shorter than the text: it would leave the road
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < textLength * 0.85) continue;
      let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (angle > Math.PI / 2) angle -= Math.PI;
      else if (angle < -Math.PI / 2) angle += Math.PI;
      return { x: c[0], y: c[1], angle };
    }
    return null;
  }
}
