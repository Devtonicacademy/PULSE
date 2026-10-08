/**
 * Overpass API access for downloading OpenStreetMap data.
 *
 * Shared by scripts/build-map-tiles.mjs and the server's coverage service. The public Overpass
 * servers are a shared, donated resource: requests here are sequential and spaced out, mirrors
 * are rotated on failure, and OVERPASS_URLS can point at your own instance.
 */

export const DEFAULT_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

/** Everything the 3D map draws inside [south, west, north, east] */
export function overpassQuery([s, w, n, e], timeoutSeconds = 180) {
  const bbox = `${s},${w},${n},${e}`;
  return `[out:json][timeout:${timeoutSeconds}];
(
  way["building"](${bbox});
  way["building:part"](${bbox});
  relation["building"]["type"="multipolygon"](${bbox});
  way["highway"](${bbox});
  way["natural"="coastline"](${bbox});
  way["natural"~"^(water|wetland|beach|sand)$"](${bbox});
  relation["natural"~"^(water|wetland)$"](${bbox});
  way["waterway"="riverbank"](${bbox});
  relation["waterway"="riverbank"](${bbox});
  way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"](${bbox});
  relation["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"](${bbox});
  way["leisure"~"^(park|garden|pitch|golf_course|playground|stadium)$"](${bbox});
  relation["leisure"~"^(park|garden|golf_course)$"](${bbox});
);
out body geom;`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a client that downloads bounding boxes one at a time.
 * `fetchImpl` and `sleepImpl` are injectable so tests never touch the network.
 */
export function createOverpassClient({
  mirrors = (process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(',').map((u) => u.trim()).filter(Boolean) : DEFAULT_MIRRORS),
  minGapMs = Number(process.env.OVERPASS_MIN_GAP_MS ?? 2000),
  rounds = 3,
  requestTimeoutMs = 200_000,
  fetchImpl = fetch,
  sleepImpl = sleep,
  log = () => {}
} = {}) {
  // Two lanes, each strictly sequential: tiles somebody is waiting for never queue behind the
  // background download of a whole radius (so at most two requests are ever in flight)
  const chains = { interactive: Promise.resolve(), background: Promise.resolve() };
  let lastRequestAt = 0;
  let mirrorOffset = 0;

  async function download(bounds, label, attempts) {
    const body = new URLSearchParams({ data: overpassQuery(bounds) });
    for (let round = 0; round < attempts; round++) {
      for (let i = 0; i < mirrors.length; i++) {
        const url = mirrors[(mirrorOffset + i) % mirrors.length];
        const gap = lastRequestAt + minGapMs - Date.now();
        if (gap > 0) await sleepImpl(gap);
        lastRequestAt = Date.now();
        try {
          const res = await fetchImpl(url, {
            method: 'POST',
            body,
            headers: { 'User-Agent': 'PULSE-map-coverage/1.0 (+https://pulse-production-2015.up.railway.app)' },
            signal: AbortSignal.timeout(requestTimeoutMs)
          });
          const text = await res.text();
          if (res.ok && text.trimStart().startsWith('{')) {
            const json = JSON.parse(text);
            if (json.remark && /runtime error|timeout|out of memory/i.test(json.remark)) throw new Error(json.remark);
            mirrorOffset = (mirrorOffset + i) % mirrors.length; // stick with the mirror that works
            return json;
          }
          const reason = /too busy|timeout|rate_limited/i.exec(text)?.[0] ?? `HTTP ${res.status}`;
          log(`${label}: ${new URL(url).host} failed (${reason})`);
        } catch (err) {
          log(`${label}: ${new URL(url).host} failed (${err.message})`);
        }
      }
      if (round < attempts - 1) await sleepImpl(20_000 * (round + 1));
    }
    throw new Error(`Overpass download failed for ${label}`);
  }

  return {
    /**
     * Queues a download; resolves with the Overpass JSON ({ elements: [...] }).
     * `background` downloads try fewer times: the coverage job comes back to them later.
     */
    fetchBounds(bounds, label = bounds.join(','), { background = false } = {}) {
      const lane = background ? 'background' : 'interactive';
      const run = chains[lane].then(() => download(bounds, label, background ? Math.min(2, rounds) : rounds));
      chains[lane] = run.catch(() => {});
      return run;
    }
  };
}
