import { Moment, MomentCategory } from '../../types/pulse';
import { escapeHtml, safeImageUrl } from '../../utils/htmlUtils';

/**
 * Moment "street flyer" card used as a map marker by every map engine.
 * All moment fields come from other users, so they go through escapeHtml / safeImageUrl.
 */

export const CATEGORY_ICONS: Record<MomentCategory, string> = {
  events: '🎉',
  alerts: '🚨',
  food_drinks: '🍔',
  lost_found: '🔍',
  recommendations: '💡',
  activities: '⚽',
  deals: '🏷️',
  community: '👥'
};

const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80';

export function createMomentFlyerElement(moment: Moment): HTMLDivElement {
  const icon = CATEGORY_ICONS[moment.category] || '⚡';
  const isBiz = Boolean(moment.isBusiness);

  const el = document.createElement('div');
  el.className = 'pulse-3d-moment-marker';
  el.style.cursor = 'pointer';
  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
      <!-- Flyer Card Frame -->
      <div style="width: 150px; background: rgba(10, 14, 23, 0.92); border: 1.5px solid ${isBiz ? '#FCD34D' : 'rgba(var(--signal-rgb), 0.6)'}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,0.8), 0 0 12px ${isBiz ? 'rgba(252, 211, 77, 0.4)' : 'rgba(var(--signal-rgb), 0.3)'}; backdrop-filter: blur(12px);">
        <div style="position: relative; width: 100%; height: 74px; overflow: hidden; background: #080D16;">
          <img src="${safeImageUrl(moment.photoUrl, FALLBACK_PHOTO)}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          <div style="position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.75); border-radius: 6px; padding: 2px 6px; font-size: 10px; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 3px;">
            <span>${icon}</span>
            <span style="font-size: 9px; text-transform: uppercase;">${escapeHtml(moment.category)}</span>
          </div>
        </div>
        <div style="padding: 5px 8px; text-align: left; background: rgba(10, 14, 23, 0.95);">
          <div style="color: #FFF; font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(moment.title)}</div>
          <div style="color: #94A3B8; font-size: 9px; margin-top: 1px; display: flex; align-items: center; justify-content: space-between;">
            <span>⚡ ${escapeHtml(moment.viewsCount || 12)} nearby</span>
            <span style="color: var(--signal); font-weight: 700;">Tap to open</span>
          </div>
        </div>
      </div>
      <!-- Street Anchor Post -->
      <div style="width: 2.5px; height: 14px; background: ${isBiz ? '#FCD34D' : 'var(--signal)'}; box-shadow: 0 0 8px ${isBiz ? '#FCD34D' : 'var(--signal)'};"></div>
      <div style="width: 8px; height: 8px; border-radius: 9999px; background: ${isBiz ? '#FCD34D' : 'var(--signal)'}; box-shadow: 0 0 10px var(--signal);"></div>
    </div>
  `;
  return el;
}
