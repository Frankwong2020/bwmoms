// Share button: Web Share API on mobile; clipboard fallback on desktop.
// Builds a formatted message with title + key facts + deep-link URL.
import { supabase, type ItemType } from './supabase';

const PROD_BASE = 'https://bridgewaterkids.netlify.app';

function esc(s: string): string {
  return s.replace(/[\n\r]+/g, ' ').trim();
}

// Compute deep link per item type
function deepLink(type: ItemType, id: string): string {
  const hash = `#${type}-${id}`;
  switch (type) {
    case 'event':
      return `${PROD_BASE}/${hash}`;
    case 'play':
      return `${PROD_BASE}/play${hash}`;
    case 'doctor':
      return `${PROD_BASE}/doctors${hash}`;
    case 'service':
      return `${PROD_BASE}/services${hash}`;
    case 'class':
      return `${PROD_BASE}/classes${hash}`;
    case 'streaming':
      return `${PROD_BASE}/streaming${hash}`;
  }
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const wd = weekdays[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}（周${wd}）${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

// Build shareable preview text per item type
function buildMessage(type: ItemType, data: Record<string, string>): string {
  const lines: string[] = [];
  switch (type) {
    case 'event': {
      lines.push(`🎈 ${esc(data.title || '活动')}`);
      if (data.start_date) {
        let timeLine = `📅 ${fmtDateTime(data.start_date)}`;
        if (data.end_date) timeLine += ` → ${fmtDateTime(data.end_date)}`;
        lines.push(timeLine);
      }
      if (data.location) lines.push(`📍 ${esc(data.location)}`);
      if (data.age_range) lines.push(`👶 ${esc(data.age_range)}`);
      if (data.price) lines.push(`💵 ${esc(data.price)}`);
      if (data.description) lines.push(esc(data.description).slice(0, 120));
      break;
    }
    case 'play': {
      lines.push(`🎈 ${esc(data.name || '遛娃地点')}`);
      if (data.drive) lines.push(`🚗 ${esc(data.drive)}`);
      if (data.price) lines.push(`💵 ${esc(data.price)}`);
      if (data.tips) lines.push(esc(data.tips).slice(0, 120));
      break;
    }
    case 'doctor': {
      lines.push(`👨‍⚕️ ${esc(data.name || '医生')}`);
      if (data.category) lines.push(`🏥 ${esc(data.category)}`);
      if (data.address) lines.push(`📍 ${esc(data.address)}`);
      if (data.phone) lines.push(`📞 ${esc(data.phone)}`);
      break;
    }
    case 'service': {
      lines.push(`🔧 ${esc(data.name || '师傅')}`);
      if (data.category) lines.push(`🛠 ${esc(data.category)}`);
      if (data.phone) lines.push(`📞 ${esc(data.phone)}`);
      break;
    }
    case 'class': {
      lines.push(`🎨 ${esc(data.org || '课外班')}`);
      if (data.category) lines.push(`⭐ ${esc(data.category)}`);
      if (data.location) lines.push(`📍 ${esc(data.location)}`);
      if (data.time) lines.push(`📅 ${esc(data.time)}`);
      if (data.price) lines.push(`💵 ${esc(data.price)}`);
      break;
    }
    case 'streaming': {
      lines.push(`📺 ${esc(data.domain || '影视网站')}`);
      break;
    }
  }
  return lines.join('\n');
}

let toastEl: HTMLElement | null = null;

function showToast(msg: string) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-4 py-2 rounded-chip shadow-hover text-sm z-50 transition-opacity opacity-0 pointer-events-none';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.remove('opacity-0');
  toastEl.classList.add('opacity-100');
  setTimeout(() => {
    toastEl?.classList.remove('opacity-100');
    toastEl?.classList.add('opacity-0');
  }, 2500);
}

async function fetchItemData(id: string): Promise<{ item_type: ItemType; data: Record<string, string> } | null> {
  const { data } = await supabase
    .from('items')
    .select('item_type, data')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return { item_type: data.item_type as ItemType, data: (data.data as Record<string, string>) || {} };
}

async function handleShare(card: HTMLElement) {
  const type = card.dataset.itemType as ItemType | undefined;
  const id = card.dataset.itemId;
  if (!type || !id) return;

  // Try to read data from the card DOM first (fast), else fetch from DB
  let itemData: Record<string, string> = {};
  card.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
    const k = el.dataset.field!;
    itemData[k] = el.textContent?.trim() || '';
  });

  // For missing fields that are important for share, fetch from DB
  const hasEssentials = itemData.name || itemData.title || itemData.org || itemData.domain;
  if (!hasEssentials) {
    const fetched = await fetchItemData(id);
    if (fetched) {
      itemData = fetched.data;
    }
  }

  const url = deepLink(type, id);
  const text = buildMessage(type, itemData);
  const fullMessage = `${text}\n${url}`;

  // Prefer Web Share API on supported browsers (mobile Safari, Chrome on Android)
  if (navigator.share) {
    try {
      await navigator.share({
        title: itemData.name || itemData.title || itemData.org || itemData.domain || '桥水小娃群',
        text,
        url,
      });
      return;
    } catch (err) {
      // User cancelled or API unavailable — fall through to clipboard
      if ((err as Error).name === 'AbortError') return;
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(fullMessage);
    showToast('📋 已复制到剪贴板，可粘贴到微信群');
  } catch {
    // Last resort: prompt (legacy fallback)
    window.prompt('请手动复制以下内容分享', fullMessage);
  }
}

function bindShareButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-share-item]').forEach((btn) => {
    if ((btn as unknown as { __bound?: boolean }).__bound) return;
    (btn as unknown as { __bound?: boolean }).__bound = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest<HTMLElement>('[data-item-card]');
      if (!card) return;
      void handleShare(card);
    });
  });
}

function init() {
  bindShareButtons();
  const observer = new MutationObserver(() => bindShareButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
