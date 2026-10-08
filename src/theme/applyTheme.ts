import { ANCHORS, rgb } from './tokens';

/** Publishes the accent anchors as CSS variables, for inline styles, CSS and map marker HTML */
export function applyTheme(root: HTMLElement = document.documentElement) {
  const vars: Record<string, string> = {
    '--accent': ANCHORS.accent,
    '--accent-rgb': rgb(ANCHORS.accent),
    '--accent2': ANCHORS.accent2,
    '--accent2-rgb': rgb(ANCHORS.accent2),
    '--signal': ANCHORS.signal,
    '--signal-rgb': rgb(ANCHORS.signal)
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}
