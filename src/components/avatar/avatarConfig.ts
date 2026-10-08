/**
 * Avatar customization: the config shape, palettes and per-user storage. No Three.js in here,
 * so the main bundle can use it without pulling the 3D engine in (see avatarModel.ts for the model).
 */

export type HairStyle = 'short' | 'bun' | 'afro' | 'long' | 'none';

export interface AvatarConfig {
  skin: string;
  hairStyle: HairStyle;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  /** Color of the cap, headphones and backpack */
  accent: string;
  cap: boolean;
  glasses: boolean;
  headphones: boolean;
  backpack: boolean;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: '#c68a62',
  hairStyle: 'short',
  hair: '#1c1410',
  top: '#ff4757',
  bottom: '#27324a',
  shoes: '#f2f4f8',
  accent: '#00f2fe',
  cap: false,
  glasses: false,
  headphones: false,
  backpack: false
};

export const SKIN_TONES = ['#f3d2b3', '#e0ac82', '#c68a62', '#8d5a3b', '#5c3a26', '#3b2417'];
export const HAIR_COLORS = ['#0e0b09', '#3b2417', '#7a4a21', '#c9a14a', '#d9d9d9', '#ff4757', '#8b5cf6', '#00b8c4'];
export const OUTFIT_COLORS = ['#ff4757', '#ffa502', '#10b981', '#00b8c4', '#3b82f6', '#8b5cf6', '#f2f4f8', '#27324a', '#14161c'];
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'bun', label: 'Bun' },
  { id: 'afro', label: 'Afro' },
  { id: 'long', label: 'Long' },
  { id: 'none', label: 'Bald' }
];

const HEX = /^#[0-9a-f]{6}$/i;
const HAIR_IDS = new Set(HAIR_STYLES.map((h) => h.id));

/** Accepts anything that came out of storage and returns a safe config */
export function sanitizeAvatar(value: unknown): AvatarConfig {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const color = (key: keyof AvatarConfig) =>
    typeof v[key] === 'string' && HEX.test(v[key] as string) ? (v[key] as string) : (DEFAULT_AVATAR[key] as string);
  const flag = (key: 'cap' | 'glasses' | 'headphones' | 'backpack') => (typeof v[key] === 'boolean' ? (v[key] as boolean) : false);
  return {
    skin: color('skin'),
    hairStyle: HAIR_IDS.has(v.hairStyle as HairStyle) ? (v.hairStyle as HairStyle) : DEFAULT_AVATAR.hairStyle,
    hair: color('hair'),
    top: color('top'),
    bottom: color('bottom'),
    shoes: color('shoes'),
    accent: color('accent'),
    cap: flag('cap'),
    glasses: flag('glasses'),
    headphones: flag('headphones'),
    backpack: flag('backpack')
  };
}

// --- Persistence -----------------------------------------------------------------------------

const storageKey = (userId: string) => `pulse.avatar.${userId}`;

export function loadStoredAvatar(userId: string): AvatarConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? sanitizeAvatar(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storeAvatar(userId: string, config: AvatarConfig) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(config));
  } catch {
    // Private mode / quota: the avatar just won't persist across reloads
  }
}
