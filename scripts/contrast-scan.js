// Paste into the browser console (or run through a browser tool) on any page.
// Lists visible text whose contrast against its effective background is below WCAG AA.
(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const page = document.documentElement.classList.contains('light') ? { r: 244, g: 246, b: 250, a: 1 } : { r: 10, g: 14, b: 23, a: 1 };
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 1) break;
    }
    return layers.reverse().reduce((under, layer) => over(layer, under), page);
  };
  const seen = new Map();
  document.querySelectorAll('body *').forEach((el) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) return;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === 'hidden' || cs.display === 'none') return;
    let fg = parse(cs.color);
    if (!fg) return;
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const bg = backdrop(el);
    fg = over({ ...fg, a: fg.a * opacity }, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(fg, bg);
    if (r < (large ? 3 : 4.5)) {
      const text = el.textContent.trim().slice(0, 32);
      const key = `${cs.color}|${size}|${text}`;
      if (!seen.has(key)) seen.set(key, { text, ratio: +r.toFixed(2), size, color: cs.color, cls: String(el.className).slice(0, 70) });
    }
  });
  return [...seen.values()].sort((a, b) => a.ratio - b.ratio);
})();
