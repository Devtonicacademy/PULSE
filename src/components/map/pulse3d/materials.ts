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
  uniforms: { uTime: { value: number }; uWindowIntensity: { value: number }; uDay: { value: number } };
  dispose: () => void;
}

const HASH_GLSL = /* glsl */ `
  float pulseHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
`;

/**
 * Facade patterns. Kinds: 0 other, 1 residential, 2 commercial, 3 industrial, 4 civic, 5 religious.
 * Untyped buildings ("other") read as offices when tall and as homes when low.
 */
const FACADE_GLSL = /* glsl */ `
  struct FacadeSample {
    float glass;          // window pane coverage 0..1 (anti-aliased)
    float frame;          // window frame / mullion coverage
    float band;           // floor band
    float slab;           // balcony slab (residential)
    float slabShadow;     // shadow under the slab
    float lit;            // this window's light is on (night)
    float detail;         // 1 = close enough to draw the pattern, 0 = average it out
    float avgGlass;       // average pane coverage for this layout (used at a distance)
    float glassRoughness;
    vec3 tint;            // lit window colour
    vec2 variation;       // per-building random values
    float windowRand;     // per-window random value
    float office;
  };

  // Soft rectangle mask with screen-space anti-aliasing
  float pulseBox(vec2 f, vec4 r, vec2 aa) {
    vec2 lo = smoothstep(r.xz - aa, r.xz + aa, f);
    vec2 hi = 1.0 - smoothstep(r.yw - aa, r.yw + aa, f);
    return lo.x * lo.y * hi.x * hi.y;
  }

  FacadeSample sampleFacade(vec4 fac, vec2 surf) {
    FacadeSample s;
    float kind = surf.x;
    float seed = fac.z;
    s.variation = vec2(pulseHash(vec2(seed, 1.7)), pulseHash(vec2(seed, 9.13)));
    s.glass = 0.0; s.frame = 0.0; s.band = 0.0; s.slab = 0.0; s.slabShadow = 0.0;
    s.lit = 0.0; s.detail = 0.0; s.avgGlass = 0.0; s.glassRoughness = 0.3;
    s.tint = vec3(1.0, 0.72, 0.38);
    s.office = 0.0;
    s.windowRand = 0.0;
    if (surf.y > 0.5) return s; // roofs, parapets, rooftop items: no facade

    float roofLevel = fac.w;
    float isOther = 1.0 - step(0.5, kind);
    s.office = max(max(1.0 - step(0.1, abs(kind - 2.0)), 1.0 - step(0.1, abs(kind - 4.0))), isOther * step(18.0, roofLevel));
    float industrial = 1.0 - step(0.1, abs(kind - 3.0));
    float residential = (1.0 - s.office) * (1.0 - industrial);

    // Cell = one window bay x one storey
    vec2 cellSize = mix(mix(vec2(3.2, 3.0), vec2(1.7, 3.6), s.office), vec2(6.5, 4.5), industrial);
    vec2 cell = fac.xy / cellSize;
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    vec2 aa = fwidth(cell) * 1.2;
    float cellPixels = 1.0 / max(max(fwidth(cell.x), fwidth(cell.y)), 1e-4);
    s.detail = smoothstep(1.8, 5.0, cellPixels);

    // Window opening per layout: full-height glass (office), punched windows (homes),
    // a high strip (industrial)
    vec4 pane = mix(mix(vec4(0.27, 0.73, 0.36, 0.76), vec4(0.07, 0.93, 0.16, 0.9), s.office),
                    vec4(0.12, 0.88, 0.62, 0.86), industrial);
    float framePx = mix(0.07, 0.05, s.office);
    float opening = pulseBox(f, pane, aa);
    float outline = pulseBox(f, pane + vec4(-framePx, framePx, -framePx, framePx), aa) - opening;

    // Office mullion (vertical split) and transom (horizontal bar)
    float mullion = s.office * (1.0 - smoothstep(0.012, 0.012 + aa.x, abs(f.x - 0.5)));
    float transom = s.office * (1.0 - smoothstep(0.015, 0.015 + aa.y, abs(f.y - 0.62)));

    // Which bays have windows: industrial only in its top storey; homes skip ~15% of bays;
    // nothing below 2 m (entrances) or in the top 1.2 m / parapet
    float occupied = step(2.0, fac.y) * step(fac.y, roofLevel - 1.2);
    float industrialTop = mix(1.0, step(roofLevel - 4.6, fac.y), industrial);
    float bayOpen = mix(1.0, step(0.15, pulseHash(vec2(id.x, seed * 0.37))), residential);
    float windowsHere = occupied * industrialTop * bayOpen;

    s.glass = opening * (1.0 - max(mullion, transom)) * windowsHere;
    s.frame = clamp(outline + mullion + transom, 0.0, 1.0) * windowsHere;
    s.avgGlass = (s.office * 0.62 + residential * 0.16 + industrial * 0.06) * occupied;

    // Floor bands at every storey line; homes get a balcony slab with a shadow beneath it
    s.band = (1.0 - smoothstep(0.0, 0.045 + aa.y, f.y)) * step(cellSize.y * 0.9, fac.y) * step(fac.y, roofLevel);
    float hasBalcony = residential * step(0.45, s.variation.x) * occupied;
    s.slab = hasBalcony * (1.0 - smoothstep(0.06, 0.06 + aa.y, f.y));
    s.slabShadow = hasBalcony * smoothstep(0.06, 0.06 + aa.y, f.y) * (1.0 - smoothstep(0.06, 0.22, f.y));

    // Night lighting: offices stay busier than homes, warehouses are mostly dark
    float litChance = mix(mix(0.36, 0.48, s.office), 0.14, industrial);
    s.lit = step(1.0 - litChance, pulseHash(id + seed));
    s.windowRand = pulseHash(id * 3.1 + seed * 0.71);
    s.tint = mix(vec3(1.0, 0.72, 0.38), vec3(0.42, 0.82, 1.0),
                 step(mix(0.75, 0.45, s.office), pulseHash(id * 1.7 + seed)));
    s.glassRoughness = mix(0.35, 0.12, s.office);
    return s;
  }

  // Day facade palette: plaster, concrete and painted walls typical of Lagos
  vec3 dayPalette(float r) {
    vec3 c = vec3(0.86, 0.82, 0.72);                    // cream plaster
    c = mix(c, vec3(0.90, 0.89, 0.86), step(0.18, r));  // white render
    c = mix(c, vec3(0.64, 0.64, 0.62), step(0.38, r));  // raw concrete
    c = mix(c, vec3(0.80, 0.70, 0.52), step(0.56, r));  // sand / ochre paint
    c = mix(c, vec3(0.70, 0.47, 0.36), step(0.70, r));  // terracotta
    c = mix(c, vec3(0.62, 0.70, 0.76), step(0.82, r));  // pale blue paint
    c = mix(c, vec3(0.78, 0.80, 0.70), step(0.92, r));  // sage
    return c;
  }

  vec3 facadeColor(FacadeSample s, vec3 nightBase, vec4 fac, vec2 surf, float day) {
    float surface = surf.y;
    if (surface > 2.5) return nightBase; // rooftop items carry their own colour
    vec3 wall = mix(nightBase * (0.82 + 0.36 * s.variation.y),
                    dayPalette(s.variation.x) * (0.9 + 0.16 * s.variation.y), day);
    if (surface > 0.5) {
      // Roofs: dark at night, weathered concrete by day; parapets closer to the wall colour
      vec3 roofDay = vec3(0.56, 0.56, 0.54) * (0.85 + 0.25 * s.variation.y);
      vec3 roofNight = mix(nightBase * 0.8, vec3(0.13, 0.14, 0.17), 0.55) * (0.8 + 0.4 * s.variation.x);
      vec3 roof = mix(roofNight, roofDay, day);
      return surface > 1.5 ? mix(roof, wall, 0.6) * 1.08 : roof;
    }

    vec3 glassDay = mix(vec3(0.12, 0.16, 0.2), vec3(0.22, 0.32, 0.42), s.office);
    vec3 glassNight = vec3(0.025, 0.035, 0.05);
    vec3 glass = mix(glassNight, glassDay, day);
    vec3 frame = mix(wall * 1.18, mix(vec3(0.75), wall * 1.25, 0.5), day * (1.0 - s.office));

    vec3 c = wall;
    c = mix(c, frame, s.frame * s.detail);
    c = mix(c, glass, s.glass * s.detail);
    c = mix(c, glass, s.avgGlass * (1.0 - s.detail) * 0.8);
    c = mix(c, wall * 1.28, s.slab * s.detail);
    c *= 1.0 - 0.35 * s.slabShadow * s.detail;
    c *= 1.0 - 0.18 * s.band * s.detail;
    // Fake ambient occlusion: walls darken toward the street
    c *= mix(0.5, 1.0, smoothstep(0.0, 6.0, fac.y));
    return c;
  }

  vec3 facadeEmission(FacadeSample s, vec4 fac, vec2 surf, float windowIntensity, float day) {
    float night = 1.0 - day;
    if (surf.y > 1.5 && surf.y < 2.5) {
      // Toned-down neon ledge on parapets so outlines still read at night
      return vec3(0.0, 0.55, 0.65) * 0.12 * night;
    }
    if (surf.y > 0.5) return vec3(0.0);
    // Big office panes would glow as one sheet: scale by pane area, and vary each window.
    // Far away, windows average out to ~40% of panes lit.
    float paneScale = mix(1.0, 0.45, s.office);
    float brightness = 0.45 + 0.55 * s.windowRand;
    vec3 e = mix(s.tint * 0.4 * s.avgGlass * paneScale, s.tint * s.glass * s.lit * paneScale * brightness, s.detail) * windowIntensity;
    // Thin ledge glow at the roofline for buildings without a parapet
    e += vec3(0.0, 0.55, 0.65) * smoothstep(fac.w - 0.45, fac.w, fac.y) * step(fac.y, fac.w + 0.01) * 0.18 * night;
    // Shopfront spill at street level on commercial blocks
    e += vec3(0.28, 0.2, 0.45) * (1.0 - smoothstep(0.0, 3.5, fac.y)) * 0.3 * s.office * night;
    return e;
  }
`;

export function createPulseMaterials(): PulseMaterials {
  const uniforms = { uTime: { value: 0 }, uWindowIntensity: { value: 2.0 }, uDay: { value: 0 } };

  // Buildings: procedural facades. Everything here is shading only (no extra geometry):
  // floor bands, framed windows laid out per building kind, balcony slabs, ground
  // occlusion, per-building colour, and lit windows at night.
  //   aFacade  = (meters along wall, meters above ground, building seed 0..100, roof level or 0)
  //   aSurface = (building kind index, surface: 0 wall, 1 roof, 2 parapet, 3 rooftop item)
  const building = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.08
  });
  building.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowIntensity = uniforms.uWindowIntensity;
    shader.uniforms.uDay = uniforms.uDay;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aFacade;\nattribute vec2 aSurface;\nvarying vec4 vFacade;\nvarying vec2 vSurface;'
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade;\nvSurface = aSurface;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vFacade;
        varying vec2 vSurface;
        uniform float uWindowIntensity;
        uniform float uDay;
        ${HASH_GLSL}
        ${FACADE_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        FacadeSample facade = sampleFacade(vFacade, vSurface);
        diffuseColor.rgb = facadeColor(facade, diffuseColor.rgb, vFacade, vSurface, uDay);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.62, 0.95, facade.variation.y);
        roughnessFactor = mix(roughnessFactor, facade.glassRoughness, facade.glass * facade.detail);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += facadeEmission(facade, vFacade, vSurface, uWindowIntensity, uDay);`
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
