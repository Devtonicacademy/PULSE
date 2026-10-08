export type Scale = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
export const ANCHORS: { accent: string; accent2: string; signal: string };
export const accent: Scale;
export const accent2: Scale;
export const signal: Scale;
export function rgb(hex: string): string;
export function rgba(hex: string, alpha: number): string;
export const CATEGORY_HEX: Record<string, string>;
