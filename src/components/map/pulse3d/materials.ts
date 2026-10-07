import * as THREE from 'three';

/**
 * Night / neon materials for the Pulse 3D map. Effects are added to stock
 * MeshStandardMaterial via onBeforeCompile so lighting and fog keep working.
 */

export interface PulseMaterials {
  building: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  land: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  /** Shared uniforms: animate uTime from the render loop */
  uniforms: { uTime: { value: number }; uWindowIntensity: { value: number } };
  dispose: () => void;
}

const HASH_GLSL = /* glsl */ `
  float pulseHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
`;

export function createPulseMaterials(): PulseMaterials {
  const uniforms = { uTime: { value: 0 }, uWindowIntensity: { value: 2.0 } };

  // Buildings: dark facades with a procedural grid of lit windows.
  // aFacade = (meters along wall, meters above ground, building seed, wall height or 0 for roofs)
  const building = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.15
  });
  building.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowIntensity = uniforms.uWindowIntensity;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacade;\nvarying vec4 vFacade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec4 vFacade;\nuniform float uWindowIntensity;\n${HASH_GLSL}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        if (vFacade.w > 0.0) {
          vec2 cell = vec2(vFacade.x / 3.4, vFacade.y / 3.1);
          vec2 f = fract(cell);
          float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78);
          float lit = step(0.6, pulseHash(floor(cell) + vFacade.z));
          float floorsOk = step(2.0, vFacade.y) * step(vFacade.y, vFacade.w - 1.2);
          vec3 warm = vec3(1.0, 0.72, 0.38);
          vec3 cool = vec3(0.35, 0.85, 1.0);
          vec3 tint = mix(warm, cool, step(0.72, pulseHash(floor(cell) * 1.7 + vFacade.z)));
          // When a window shrinks below a couple of pixels, fade to the average glow
          // (~30% panes x 40% lit) instead of sparkling and blowing out the bloom
          float cellPixels = 1.0 / max(max(fwidth(cell.x), fwidth(cell.y)), 1e-4);
          float detail = smoothstep(2.0, 6.0, cellPixels);
          vec3 windowGlow = mix(mix(warm, cool, 0.45) * 0.045, tint * pane * lit, detail);
          totalEmissiveRadiance += windowGlow * floorsOk * uWindowIntensity;
          // Neon trim along the roofline so building outlines read at a distance
          totalEmissiveRadiance += vec3(0.0, 0.75, 0.9) * smoothstep(vFacade.w - 1.4, vFacade.w, vFacade.y) * 1.1;
          // Soft ground-floor glow (shopfronts / street light bounce)
          totalEmissiveRadiance += vec3(0.25, 0.18, 0.45) * (1.0 - smoothstep(0.0, 4.0, vFacade.y)) * 0.35;
        }`
      );
  };

  // Roads: dark asphalt ribbons with glowing edges in the vertex colour.
  // uv.x runs 0..1 across the road.
  const road = new THREE.MeshStandardMaterial({
    color: 0x0d1424,
    roughness: 0.9,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  road.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aEdgeColor;\nvarying vec3 vEdgeColor;\nvarying float vAcross;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvEdgeColor = aEdgeColor;\nvAcross = uv.x;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEdgeColor;\nvarying float vAcross;')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        float edge = smoothstep(0.78, 0.98, abs(vAcross * 2.0 - 1.0));
        totalEmissiveRadiance += vEdgeColor * edge * 1.6;`
      );
  };

  const water = new THREE.MeshStandardMaterial({
    color: 0x0b3156,
    emissive: 0x052040,
    roughness: 0.3,
    metalness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nuniform float uTime;\n${HASH_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // Three crossing wave trains -> drifting streaks of reflected city light
        vec2 p = vWorldPos.xz;
        float waves = sin(dot(p, vec2(0.83, 0.55)) * 0.09 + uTime * 0.7)
                    + sin(dot(p, vec2(-0.42, 0.91)) * 0.13 - uTime * 0.5)
                    + sin(dot(p, vec2(0.98, -0.2)) * 0.05 + uTime * 0.3);
        // Fade out where the pattern would alias (far away / grazing angles)
        float waveDetail = 1.0 - smoothstep(0.15, 0.6, fwidth(waves));
        totalEmissiveRadiance += vec3(0.0, 0.3, 0.5) * smoothstep(1.6, 2.6, waves) * waveDetail;`
      );
  };

  const surface = (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  const green = surface(0x0b2418);
  const sand = surface(0x221d14);
  const land = surface(0x0b111d);

  // Ground beyond the mapped areas: a faint neon grid ("no 3D data here")
  const ground = new THREE.MeshStandardMaterial({ color: 0x05080f, roughness: 1, metalness: 0 });
  ground.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        vec2 g = abs(fract(vWorldPos.xz / 50.0 - 0.5) - 0.5) / fwidth(vWorldPos.xz / 50.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        totalEmissiveRadiance += vec3(0.0, 0.35, 0.45) * line * 0.35;`
      );
  };

  const all = [building, road, water, green, sand, land, ground];
  return {
    building,
    road,
    water,
    green,
    sand,
    land,
    ground,
    uniforms,
    dispose: () => all.forEach((m) => m.dispose())
  };
}
