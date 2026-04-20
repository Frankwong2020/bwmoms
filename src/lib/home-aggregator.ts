// Home page aggregator: loads events, recent new items, hot-discussed items.
import { supabase, type ItemType } from './supabase';

type DbItem = {
  id: string;
  item_type: ItemType;
  data: Record<string, unknown>;
  is_hidden: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

function mapLink(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function tabHref(type: ItemType): string {
  switch (type) {
    case 'play': return '/play';
    case 'doctor': return '/doctors';
    case 'service': return '/services';
    case 'class': return '/classes';
    case 'streaming': return '/streaming';
    case 'event': return '/';
  }
}

function itemTypeLabel(type: ItemType): string {
  return ({
    play: '遛娃',
    doctor: '医生',
    service: '维修',
    class: '课外班',
    streaming: '影视',
    event: '活动',
  } as Record<ItemType, string>)[type];
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const wd = weekdays[d.getDay()];
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day}（周${wd}）${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function fmtRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = fmtDateTime(start);
  if (!end) return s;
  // If same day, just show end time
  try {
    const ds = new Date(start!);
    const de = new Date(end);
    if (ds.toDateString() === de.toDateString()) {
      const hh = String(de.getHours()).padStart(2, '0');
      const mm = String(de.getMinutes()).padStart(2, '0');
      return `${s} - ${hh}:${mm}`;
    }
  } catch {}
  return `${s} → ${fmtDateTime(end)}`;
}

// =========================================
// Events section
// =========================================

async function loadEvents() {
  const container = document.getElementById('events-grid');
  const count = document.getElementById('events-count');
  if (!container) return;

  const nowIso = new Date().toISOString();
  // Fetch future/ongoing events (end_date >= now OR start_date >= now if no end_date)
  // Supabase JSON query: fetch all events, filter client-side (small set)
  const { data, error } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, created_at, updated_at')
    .eq('item_type', 'event')
    .eq('is_hidden', false)
    .eq('is_deleted', false)
    .order('data->>start_date', { ascending: true })
    .limit(30);

  if (error) {
    container.innerHTML = `<p class="text-sm text-warm col-span-full py-4 text-center">加载失败：${esc(error.message)}</p>`;
    return;
  }

  const all = (data || []) as DbItem[];
  const upcoming = all.filter((it) => {
    const d = it.data as { start_date?: string; end_date?: string };
    const endIso = d.end_date || d.start_date;
    return endIso && endIso >= nowIso;
  });

  if (count) count.textContent = upcoming.length > 0 ? `(${upcoming.length} 场)` : '';

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-white/60 rounded-card p-8 text-center border-2 border-dashed border-sage-light">
        <p class="text-ink-muted">还没有人发布活动</p>
        <p class="text-xs text-ink-muted mt-2">点右上角 "+ 发布活动" 分享你知道的周末活动</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  for (const it of upcoming) {
    container.appendChild(renderEventCard(it));
  }
}

function renderEventCard(it: DbItem): HTMLElement {
  const d = it.data as {
    title?: string;
    start_date?: string;
    end_date?: string;
    location?: string;
    category?: string;
    age_range?: string;
    price?: string;
    link?: string;
    description?: string;
  };

  const article = document.createElement('article');
  article.className = 'bg-white rounded-card shadow-soft p-5 hover:shadow-hover transition';
  article.setAttribute('data-item-card', '');
  article.setAttribute('data-item-type', 'event');
  article.setAttribute('data-item-id', it.id);

  const title = d.title || '(未命名活动)';
  const timeStr = fmtRange(d.start_date, d.end_date);

  article.innerHTML = `
    <div class="flex items-baseline justify-between gap-2 mb-2">
      <h3 class="font-semibold text-ink leading-tight flex-1" data-field="title">${esc(title)}</h3>
      ${d.category ? `<span class="tag shrink-0" data-field="category">${esc(d.category)}</span>` : ''}
    </div>
    <p class="text-sm font-medium text-sage-dark mb-2" data-field="time_display">🗓️ ${esc(timeStr)}</p>
    ${d.location ? `<p class="text-sm text-ink-light"><a href="${mapLink(d.location)}" target="_blank" rel="noopener" class="hover:text-sage-dark">📍 <span data-field="location">${esc(d.location)}</span></a></p>` : ''}
    <div class="flex flex-wrap gap-2 mt-2 mb-2">
      ${d.age_range ? `<span class="tag"><span data-field="age_range">${esc(d.age_range)}</span></span>` : ''}
      ${d.price ? `<span class="tag tag-warm"><span data-field="price">${esc(d.price)}</span></span>` : ''}
    </div>
    ${d.description ? `<p class="text-sm text-ink-light mt-2 leading-relaxed whitespace-pre-wrap" data-field="description">${esc(d.description)}</p>` : ''}
    ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener" class="text-xs text-sage-dark hover:text-sage font-medium mt-3 inline-block">🔗 报名/详情</a>` : ''}
    <div class="flex flex-wrap gap-2 mt-3 text-xs">
      <button type="button" data-share-item class="text-sage-dark hover:text-sage font-medium">🔗 分享</button>
      <button type="button" data-edit-item class="text-sage-dark hover:text-sage font-medium">✏️ 编辑</button>
      <button type="button" data-history-item data-item-type="event" data-item-id="${esc(it.id)}" class="text-ink-muted hover:text-ink-light font-medium">📜 历史</button>
      <button type="button" data-flag-item data-target-type="item" data-target-id="${esc(it.id)}" class="text-ink-muted hover:text-warm font-medium">🚩 举报</button>
    </div>
  `;
  return article;
}

// =========================================
// Recently added items (non-event)
// =========================================

async function loadNewItems() {
  const container = document.getElementById('new-items-grid');
  const count = document.getElementById('new-items-count');
  if (!container) return;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, created_at, updated_at')
    .neq('item_type', 'event')
    .eq('is_hidden', false)
    .eq('is_deleted', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    container.innerHTML = `<p class="text-sm text-warm col-span-full py-4 text-center">加载失败</p>`;
    return;
  }

  const items = (data || []) as DbItem[];
  if (count) count.textContent = items.length > 0 ? `(最近 2 周 ${items.length} 个)` : '';

  if (items.length === 0) {
    container.innerHTML = '<p class="text-sm text-ink-muted col-span-full py-4 text-center">最近 2 周没有新增</p>';
    return;
  }

  container.innerHTML = '';
  for (const it of items) {
    container.appendChild(renderGenericItemCard(it));
  }
}

// =========================================
// Hot-discussed items (top by comments in last 7 days)
// =========================================

async function loadHotItems() {
  const container = document.getElementById('hot-items-grid');
  if (!container) return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: comments, error: cErr } = await supabase
    .from('comments')
    .select('item_type, item_id')
    .gte('created_at', since)
    .is('deleted_at', null);

  if (cErr) {
    container.innerHTML = `<p class="text-sm text-warm col-span-full py-4 text-center">加载失败</p>`;
    return;
  }

  // Count by item
  const counts = new Map<string, { type: ItemType; id: string; count: number }>();
  for (const c of comments || []) {
    const k = `${c.item_type}:${c.item_id}`;
    const existing = counts.get(k);
    if (existing) existing.count += 1;
    else counts.set(k, { type: c.item_type as ItemType, id: c.item_id, count: 1 });
  }
  const top = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  if (top.length === 0) {
    container.innerHTML = '<p class="text-sm text-ink-muted col-span-full py-4 text-center">最近 1 周还没有评论</p>';
    return;
  }

  // Fetch item details
  const itemIds = top.map((t) => t.id);
  const { data: items } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, created_at, updated_at')
    .in('id', itemIds)
    .eq('is_hidden', false)
    .eq('is_deleted', false);

  const itemMap = new Map<string, DbItem>();
  for (const it of (items || []) as DbItem[]) {
    itemMap.set(it.id, it);
  }

  container.innerHTML = '';
  let shown = 0;
  for (const t of top) {
    const it = itemMap.get(t.id);
    if (!it) continue; // hidden or deleted
    const card = renderGenericItemCard(it, t.count);
    container.appendChild(card);
    shown++;
  }

  if (shown === 0) {
    container.innerHTML = '<p class="text-sm text-ink-muted col-span-full py-4 text-center">暂无可显示的热议条目</p>';
  }
}

// =========================================
// Generic "summary" card (links to the target tab)
// =========================================

function renderGenericItemCard(it: DbItem, commentCount?: number): HTMLElement {
  const article = document.createElement('article');
  article.className = 'bg-white rounded-card shadow-soft p-4 hover:shadow-hover transition';

  const d = it.data as Record<string, string>;
  const title = d.name || d.title || d.org || '(未命名)';
  const typeLabel = itemTypeLabel(it.item_type);
  const subtitle = d.address || d.location || d.phone || d.tips || d.description || '';
  const href = tabHref(it.item_type);

  article.innerHTML = `
    <a href="${href}" class="block">
      <div class="flex items-baseline justify-between gap-2 mb-1">
        <h3 class="font-semibold text-ink leading-tight flex-1">${esc(title)}</h3>
        <span class="tag shrink-0">${esc(typeLabel)}</span>
      </div>
      ${subtitle ? `<p class="text-xs text-ink-light leading-relaxed line-clamp-2">${esc(subtitle)}</p>` : ''}
      <div class="flex items-center gap-3 mt-2 text-xs text-ink-muted">
        ${commentCount ? `<span>💬 ${commentCount} 条评论</span>` : ''}
        <span>${new Date(it.created_at).toLocaleDateString('zh-CN')}</span>
      </div>
    </a>
  `;
  return article;
}

// =========================================
// Init
// =========================================

async function init() {
  await Promise.all([loadEvents(), loadNewItems(), loadHotItems()]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  void init();
}
