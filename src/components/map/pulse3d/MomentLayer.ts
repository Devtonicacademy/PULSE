import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Moment } from '../../../types/pulse';
import { lngLatToMeters } from '../../../utils/mapProjection';
import { createMomentFlyerElement } from '../momentFlyer';

/**
 * Moment flyer cards as HTML labels anchored at their ground position.
 * Cards behind the camera are hidden by CSS2DRenderer; far ones are hidden here.
 */
export class MomentLayer {
  readonly group = new THREE.Group();
  private items = new Map<string, CSS2DObject>();
  private latest = new Map<string, Moment>();

  /** Receives the freshest copy of the clicked moment */
  constructor(private onSelect: (moment: Moment) => void) {
    this.group.name = 'moments';
  }

  get count() {
    return this.items.size;
  }

  sync(moments: Moment[]) {
    this.latest = new Map(moments.map((m) => [m.id, m]));

    this.items.forEach((object, id) => {
      if (!this.latest.has(id)) {
        object.element.remove();
        object.removeFromParent();
        this.items.delete(id);
      }
    });

    for (const moment of moments) {
      const [x, y] = lngLatToMeters(moment.longitude, moment.latitude);
      const existing = this.items.get(moment.id);
      if (existing) {
        existing.position.set(x, 0, -y);
        continue;
      }
      const el = createMomentFlyerElement(moment);
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelect(this.latest.get(moment.id) ?? moment);
      });
      const object = new CSS2DObject(el);
      object.center.set(0.5, 1); // anchor the post's foot on the ground point
      object.position.set(x, 0, -y);
      object.name = `moment_${moment.id}`;
      this.group.add(object);
      this.items.set(moment.id, object);
    }
  }

  /** Hide cards beyond the useful range for the current zoom */
  updateVisibility(camera: THREE.Camera, maxDistance: number) {
    this.items.forEach((object) => {
      object.visible = camera.position.distanceTo(object.position) <= maxDistance;
    });
  }

  dispose() {
    this.items.forEach((object) => {
      object.element.remove();
      object.removeFromParent();
    });
    this.items.clear();
  }
}
