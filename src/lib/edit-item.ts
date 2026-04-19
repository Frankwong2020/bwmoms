// Wires up "编辑" buttons on all item cards to open the ItemEditor modal,
// render type-specific form fields, and save changes (with history).
import { supabase, type ItemType } from './supabase';
import { itemCache, refreshItem } from './hydrate-items';

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];      // for 'select'
  placeholder?: string;
  hint?: string;
}

// Field schemas per item type. Drives the dynamic form.
const SCHEMAS: Record<ItemType, FieldSpec[]> = {
  play: [
    { key: 'name', label: '地点名字', type: 'text', required: true, placeholder: 'Kidstreet Playground, Bridgewater, NJ' },
    { key: 'drive', label: '车程', type: 'text', placeholder: '半小时' },
    { key: 'price', label: '价格', type: 'text', placeholder: 'Free / $20 per adult 等' },
    { key: 'tips', label: '小贴士', type: 'textarea', placeholder: '需要疫苗证明、建议买年票等' },
  ],
  doctor: [
    { key: 'name', label: '医生/诊所名字', type: 'text', required: true },
    { key: 'category', label: '科室', type: 'text', placeholder: '儿科医生 / 眼科医生 / 牙医 ...' },
    { key: 'address', label: '地址', type: 'text' },
    { key: 'phone', label: '电话', type: 'text' },
  ],
  service: [
    { key: 'name', label: '师傅/公司名字', type: 'text', required: true },
    { key: 'category', label: '服务类别', type: 'text', placeholder: '空调暖气 / Plumber / 搬家公司 ...' },
    { key: 'phone', label: '电话', type: 'text' },
    { key: 'website', label: '网址', type: 'text' },
  ],
  class: [
    { key: 'org', label: '机构名字', type: 'text', required: true },
    { key: 'category', label: '类别', type: 'text', placeholder: '网球 / 乒乓球 / 游泳 ...' },
    { key: 'location', label: '地点', type: 'text' },
    { key: 'time', label: '时间/季节', type: 'text' },
    { key: 'price', label: '价格', type: 'text' },
    { key: 'link', label: '报名链接', type: 'text' },
  ],
  streaming: [
    { key: 'domain', label: '网站名', type: 'text', required: true },
    { key: 'url', label: 'URL', type: 'text', required: true },
  ],
};

let currentItemType: ItemType | null = null;
let currentItemId: string | null = null;
let modalEl: HTMLElement | null = null;

function renderFields(type: ItemType, data: Record<string, unknown>) {
  const container = document.getElementById('editor-fields')!;
  container.innerHTML = '';
  for (const spec of SCHEMAS[type]) {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.className = 'block text-xs text-ink-muted mb-1 font-medium';
    label.textContent = spec.label + (spec.required ? ' *' : '');
    wrap.appendChild(label);

    let input: HTMLInputElement | HTMLTextAreaElement;
    if (spec.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.name = spec.key;
    if (spec.required) input.required = true;
    if (spec.placeholder) input.placeholder = spec.placeholder;
    input.value = (data[spec.key] as string) || '';
    input.className =
      'w-full px-3 py-2 text-sm border border-black/10 rounded-chip focus:outline-none focus:border-sage resize-y';
    wrap.appendChild(input);

    if (spec.hint) {
      const hint = document.createElement('p');
      hint.className = 'text-xs text-ink-muted mt-1';
      hint.textContent = spec.hint;
      wrap.appendChild(hint);
    }

    container.appendChild(wrap);
  }
}

function openModal(type: ItemType, id: string, data: Record<string, unknown>) {
  currentItemType = type;
  currentItemId = id;
  if (!modalEl) modalEl = document.getElementById('item-editor');
  if (!modalEl) return;

  renderFields(type, data);

  const commentInput = modalEl.querySelector<HTMLInputElement>('input[name="edit_comment"]')!;
  commentInput.value = '';

  const errEl = modalEl.querySelector<HTMLElement>('#editor-error')!;
  errEl.classList.add('hidden');
  errEl.textContent = '';

  modalEl.classList.remove('hidden');
  modalEl.classList.add('flex');
}

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  modalEl.classList.remove('flex');
  currentItemType = null;
  currentItemId = null;
}

function readForm(type: ItemType): Record<string, string> {
  const container = document.getElementById('editor-fields')!;
  const out: Record<string, string> = {};
  for (const spec of SCHEMAS[type]) {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[name="${spec.key}"]`
    );
    if (el) out[spec.key] = el.value.trim();
  }
  return out;
}

async function handleSubmit(ev: Event) {
  ev.preventDefault();
  if (!currentItemType || !currentItemId) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    alert('请先登录');
    return;
  }

  const newFields = readForm(currentItemType);
  const commentInput = modalEl!.querySelector<HTMLInputElement>('input[name="edit_comment"]')!;
  const comment = commentInput.value.trim();
  if (!comment) {
    commentInput.focus();
    return;
  }

  // Fetch current (for before snapshot + to merge any fields we don't edit)
  const { data: currentRow, error: fetchErr } = await supabase
    .from('items')
    .select('*')
    .eq('id', currentItemId)
    .maybeSingle();
  if (fetchErr || !currentRow) {
    showError('读取当前数据失败');
    return;
  }

  const beforeData = currentRow.data as Record<string, unknown>;
  const afterData = { ...beforeData, ...newFields };

  // Skip no-op edits
  if (JSON.stringify(afterData) === JSON.stringify(beforeData)) {
    closeModal();
    return;
  }

  const submitBtn = modalEl!.querySelector<HTMLButtonElement>('#editor-submit')!;
  submitBtn.disabled = true;

  // Update items.data
  const { error: updateErr } = await supabase
    .from('items')
    .update({
      data: afterData,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    })
    .eq('id', currentItemId);

  if (updateErr) {
    showError('保存失败：' + updateErr.message);
    submitBtn.disabled = false;
    return;
  }

  // Log to history
  const { error: editErr } = await supabase.from('item_edits').insert({
    item_id: currentItemId,
    user_id: session.user.id,
    before_data: beforeData,
    after_data: afterData,
    edit_comment: comment,
  });

  if (editErr) {
    console.warn('history insert failed', editErr);
    // Not fatal — the edit saved, just no history row
  }

  // Refresh card display
  await refreshItem(currentItemType, currentItemId);
  submitBtn.disabled = false;
  closeModal();
}

function showError(msg: string) {
  if (!modalEl) return;
  const errEl = modalEl.querySelector<HTMLElement>('#editor-error')!;
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

function bindEditButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-edit-item]').forEach((btn) => {
    if ((btn as unknown as { __bound?: boolean }).__bound) return;
    (btn as unknown as { __bound?: boolean }).__bound = true;
    btn.addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        alert('请先登录才能编辑');
        return;
      }
      const card = btn.closest<HTMLElement>('[data-item-card]');
      if (!card) return;
      const type = card.dataset.itemType as ItemType;
      const id = card.dataset.itemId!;

      // Prefer cached hydrated data, else fetch fresh
      let data = itemCache.get(`${type}:${id}`)?.data;
      if (!data) {
        const { data: row } = await supabase
          .from('items')
          .select('data')
          .eq('id', id)
          .maybeSingle();
        data = (row?.data as Record<string, unknown>) ?? {};
      }
      openModal(type, id, data as Record<string, unknown>);
    });
  });
}

function init() {
  modalEl = document.getElementById('item-editor');
  if (!modalEl) return;

  // Wire modal controls
  modalEl.querySelector('#editor-close')?.addEventListener('click', closeModal);
  modalEl.querySelector('#editor-cancel')?.addEventListener('click', closeModal);
  modalEl.querySelector('#editor-form')?.addEventListener('submit', (e) => void handleSubmit(e));

  // Click on backdrop closes
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl!.classList.contains('hidden')) closeModal();
  });

  bindEditButtons();
  // Rebind if new cards appear (rare, but safe)
  const observer = new MutationObserver(() => bindEditButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
