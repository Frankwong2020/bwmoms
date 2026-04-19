// Builds card DOM for dynamically-added items (new items created after
// the static HTML was built). Keeps styling identical to static cards.
import { registerNewCardHandler } from './hydrate-items';
import type { ItemType } from './supabase';

type DbItem = {
  id: string;
  item_type: ItemType;
  data: Record<string, unknown>;
  is_hidden: boolean;
  is_deleted: boolean;
  updated_at: string;
};

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

function mapLink(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

function baseCardOpen(item: DbItem, className: string, extraAttrs = ''): string {
  return `<article class="${className}" data-item-card data-item-type="${item.item_type}" data-item-id="${esc(item.id)}" ${extraAttrs}>`;
}

function actionsAndFeedback(item: DbItem): string {
  const { item_type, id } = item;
  return `
    <div class="flex flex-wrap gap-2 mt-3 text-xs">
      <button type="button" data-edit-item class="text-sage-dark hover:text-sage font-medium">✏️ 编辑</button>
      <button type="button" data-history-item data-item-type="${item_type}" data-item-id="${esc(id)}" class="text-ink-muted hover:text-ink-light font-medium">📜 历史</button>
      <button type="button" data-flag-item data-target-type="item" data-target-id="${esc(id)}" class="text-ink-muted hover:text-warm font-medium">🚩 举报</button>
    </div>
    ${feedbackBlock(item_type, id)}
  `;
}

function feedbackBlock(itemType: ItemType, itemId: string): string {
  return `
    <div class="item-feedback mt-4 pt-4 border-t border-black/5" data-item-type="${itemType}" data-item-id="${esc(itemId)}">
      <button type="button" class="toggle-feedback w-full flex items-center justify-between gap-3 text-left hover:bg-sage-light/40 rounded-chip -mx-1 px-1 py-1 transition" aria-label="展开评分和评论">
        <span class="flex items-center gap-2 text-sm">
          <span class="stars-summary flex gap-0.5 text-lg leading-none text-ink-muted">
            <span>☆</span><span>☆</span><span>☆</span><span>☆</span><span>☆</span>
          </span>
          <span class="text-xs text-ink-muted summary-text">暂无评分</span>
        </span>
        <span class="text-xs text-sage-dark font-medium shrink-0">💬 评分 / 评论</span>
      </button>
      <div class="feedback-panel hidden mt-4 space-y-4">
        <div class="rating-picker">
          <p class="text-xs text-ink-muted mb-2">你的评分（登录后可评）</p>
          <div class="flex gap-1 text-2xl leading-none user-stars" role="radiogroup" aria-label="评分">
            <button type="button" class="star-btn hover:scale-110 transition" data-star="1" aria-label="1 星">☆</button>
            <button type="button" class="star-btn hover:scale-110 transition" data-star="2" aria-label="2 星">☆</button>
            <button type="button" class="star-btn hover:scale-110 transition" data-star="3" aria-label="3 星">☆</button>
            <button type="button" class="star-btn hover:scale-110 transition" data-star="4" aria-label="4 星">☆</button>
            <button type="button" class="star-btn hover:scale-110 transition" data-star="5" aria-label="5 星">☆</button>
          </div>
          <p class="login-prompt text-xs text-warm mt-1 hidden">请先登录</p>
        </div>
        <div class="comments-list space-y-2">
          <p class="text-xs text-ink-muted loading-text">加载评论中…</p>
        </div>
        <form class="comment-form" hidden>
          <textarea class="w-full px-3 py-2 text-sm border border-black/10 rounded-chip focus:outline-none focus:border-sage resize-y min-h-[64px]" placeholder="分享你的体验…" maxlength="2000" required></textarea>
          <div class="flex justify-end mt-2">
            <button type="submit" class="px-4 py-1.5 rounded-chip bg-sage text-white text-xs font-medium hover:bg-sage-dark transition disabled:opacity-50">发表评论</button>
          </div>
        </form>
        <p class="login-prompt-comment text-xs text-warm hidden">登录后可评论</p>
      </div>
    </div>
  `;
}

function playCardHtml(item: DbItem): string {
  const d = item.data as { name?: string; drive?: string; price?: string; tips?: string };
  const name = d.name || '(未命名)';
  return `
    ${baseCardOpen(item, 'play-card bg-white rounded-card shadow-soft p-5 hover:shadow-hover transition')}
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="font-semibold text-ink leading-tight flex-1" data-field="name">${esc(name)}</h3>
        <span class="text-xs text-ink-muted shrink-0">🆕</span>
      </div>
      <div class="flex flex-wrap gap-2 mt-3 mb-3">
        <span class="tag ${d.drive ? '' : 'hidden'}">🚗 <span data-field="drive">${esc(d.drive || '')}</span></span>
        <span class="tag tag-warm ${d.price ? '' : 'hidden'}"><span data-field="price">${esc(d.price || '')}</span></span>
      </div>
      <p class="text-sm text-ink-light mt-2 leading-relaxed ${d.tips ? '' : 'hidden'}" data-field="tips">${esc(d.tips || '')}</p>
      <a href="${mapLink(name)}" target="_blank" rel="noopener" class="text-xs text-sage-dark hover:text-sage font-medium mt-3 inline-flex items-center gap-1">
        <span>📍 Google Maps</span>
      </a>
      ${actionsAndFeedback(item)}
    </article>
  `;
}

function doctorCardHtml(item: DbItem): string {
  const d = item.data as { name?: string; category?: string; address?: string; phone?: string };
  return `
    ${baseCardOpen(item, 'doc-card bg-white rounded-card shadow-soft p-5', `data-cat="${esc(d.category || '')}"`)}
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <h3 class="font-semibold text-ink text-lg leading-tight" data-field="name">${esc(d.name || '(未命名)')}</h3>
        <span class="tag shrink-0" data-field="category">${esc(d.category || '')}</span>
      </div>
      <div class="text-sm text-ink-light space-y-1 mb-3">
        <p class="${d.address ? '' : 'hidden'}">📍 <span data-field="address">${esc(d.address || '')}</span></p>
        <p class="${d.phone ? '' : 'hidden'}">📞 <span data-field="phone">${esc(d.phone || '')}</span></p>
      </div>
      ${actionsAndFeedback(item)}
    </article>
  `;
}

function serviceCardHtml(item: DbItem): string {
  const d = item.data as { name?: string; category?: string; phone?: string; website?: string };
  return `
    ${baseCardOpen(item, 'svc-card bg-white rounded-card shadow-soft p-5', `data-cat="${esc(d.category || '')}"`)}
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <h3 class="font-semibold text-ink text-lg leading-tight" data-field="name">${esc(d.name || '(未命名)')}</h3>
        <span class="tag shrink-0" data-field="category">${esc(d.category || '')}</span>
      </div>
      <div class="text-sm text-ink-light space-y-1 mb-3">
        <p class="${d.phone ? '' : 'hidden'}">📞 <span data-field="phone">${esc(d.phone || '')}</span></p>
        <p class="truncate ${d.website ? '' : 'hidden'}">🌐 <span data-field="website">${esc(d.website || '')}</span></p>
      </div>
      ${actionsAndFeedback(item)}
    </article>
  `;
}

function classCardHtml(item: DbItem): string {
  const d = item.data as { org?: string; category?: string; location?: string; time?: string; price?: string; link?: string };
  const linkHtml = d.link
    ? `<a href="${esc(d.link)}" target="_blank" rel="noopener" class="text-xs text-sage-dark hover:text-sage font-medium mt-3 inline-block">🔗 报名链接</a>`
    : '';
  return `
    ${baseCardOpen(item, 'class-card bg-white rounded-card shadow-soft p-5', `data-cat="${esc(d.category || '')}"`)}
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <span class="tag" data-field="category">${esc(d.category || '')}</span>
      </div>
      <h3 class="font-semibold text-ink leading-tight mb-2" data-field="org">${esc(d.org || '(未命名)')}</h3>
      <p class="text-sm text-ink-light ${d.location ? '' : 'hidden'}">📍 <span data-field="location">${esc(d.location || '')}</span></p>
      <p class="text-sm text-ink-light mt-1 ${d.time ? '' : 'hidden'}">📅 <span data-field="time">${esc(d.time || '')}</span></p>
      <p class="text-sm text-warm mt-1 font-medium ${d.price ? '' : 'hidden'}">💵 <span data-field="price">${esc(d.price || '')}</span></p>
      ${linkHtml}
      ${actionsAndFeedback(item)}
    </article>
  `;
}

// Decide where to append based on page grid containers
function appendToGrid(gridSelector: string, html: string) {
  const grid = document.querySelector(gridSelector);
  if (!grid) return;
  const temp = document.createElement('div');
  temp.innerHTML = html.trim();
  const newCard = temp.firstElementChild as HTMLElement | null;
  if (newCard) grid.appendChild(newCard);
}

export function registerPlayTemplate() {
  registerNewCardHandler('play', (item) => {
    appendToGrid('#play-grid', playCardHtml(item));
  });
}
export function registerDoctorTemplate() {
  registerNewCardHandler('doctor', (item) => {
    appendToGrid('#doc-grid', doctorCardHtml(item));
  });
}
export function registerServiceTemplate() {
  registerNewCardHandler('service', (item) => {
    appendToGrid('#svc-grid', serviceCardHtml(item));
  });
}
export function registerClassTemplate() {
  registerNewCardHandler('class', (item) => {
    appendToGrid('#class-grid', classCardHtml(item));
  });
}
