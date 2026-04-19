// Client-side hydration: fetch latest item data from Supabase and update
// the DOM after the static HTML renders. Runs on every page load.
//
// Cards are marked with `data-item-card` + `data-item-type` + `data-item-id`,
// and individual editable fields are marked with `data-field="<key>"`.
import { supabase, type ItemType } from './supabase';

type DbItem = {
  id: string;
  item_type: ItemType;
  data: Record<string, unknown>;
  is_hidden: boolean;
  is_deleted: boolean;
  updated_at: string;
};

// Exposed so other modules (edit form) can trigger a refresh after save.
export const itemCache = new Map<string, DbItem>();

function cardsOnPage(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-item-card]'));
}

function cardKey(type: string, id: string): string {
  return `${type}:${id}`;
}

// Map a DOM card to its item_type/item_id
function cardMeta(card: HTMLElement): { type: ItemType; id: string } {
  return {
    type: card.dataset.itemType as ItemType,
    id: card.dataset.itemId!,
  };
}

// Apply updated fields into the card DOM
function applyFields(card: HTMLElement, item: DbItem) {
  if (item.is_hidden || item.is_deleted) {
    // Replace the card body with a placeholder message
    const placeholder = card.querySelector<HTMLElement>('[data-hidden-placeholder]');
    if (!placeholder) {
      card.innerHTML = `
        <p class="text-sm text-ink-muted italic">此条目因被举报已隐藏，等待管理员审核</p>
      `;
    }
    return;
  }

  const fields = card.querySelectorAll<HTMLElement>('[data-field]');
  fields.forEach((el) => {
    const key = el.dataset.field!;
    const val = (item.data as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      // Preserve simple text content. For elements with children (e.g. the name
      // cell with a "#{num}" badge sibling), only touch the first text node.
      el.textContent = val;
    }
  });
}

export async function fetchAllItems(): Promise<DbItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, updated_at');
  if (error) {
    console.warn('fetchAllItems failed', error);
    return [];
  }
  return (data || []) as DbItem[];
}

// Each page calls registerNewCardHandler so hydration knows where/how
// to append cards for items that exist in DB but not in static HTML.
type NewCardHandler = (item: DbItem) => void;
const newCardHandlers = new Map<ItemType, NewCardHandler>();

export function registerNewCardHandler(type: ItemType, handler: NewCardHandler) {
  newCardHandlers.set(type, handler);
}

export async function hydrateItems() {
  const cards = cardsOnPage();
  const items = await fetchAllItems();
  for (const it of items) {
    itemCache.set(cardKey(it.item_type, it.id), it);
  }

  // 1. Update existing cards
  const existingKeys = new Set<string>();
  for (const c of cards) {
    const { type, id } = cardMeta(c);
    if (!type || !id) continue;
    existingKeys.add(cardKey(type, id));
    const item = itemCache.get(cardKey(type, id));
    if (item) applyFields(c, item);
  }

  // 2. Append new cards for DB items that aren't in the static HTML
  for (const it of items) {
    const k = cardKey(it.item_type, it.id);
    if (existingKeys.has(k)) continue;
    if (it.is_hidden || it.is_deleted) continue;
    const handler = newCardHandlers.get(it.item_type);
    if (handler) handler(it);
  }
}

// Re-fetch one item and re-apply to DOM (used after user edits)
export async function refreshItem(itemType: ItemType, itemId: string) {
  const { data, error } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, updated_at')
    .eq('id', itemId)
    .maybeSingle();
  if (error) {
    console.warn('refreshItem', error);
    return;
  }
  if (!data) return;
  const item = data as DbItem;
  itemCache.set(cardKey(item.item_type, item.id), item);

  const card = document.querySelector<HTMLElement>(
    `[data-item-card][data-item-type="${itemType}"][data-item-id="${CSS.escape(itemId)}"]`
  );
  if (card) applyFields(card, item);
}

// Auto-hydrate on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void hydrateItems());
} else {
  void hydrateItems();
}
