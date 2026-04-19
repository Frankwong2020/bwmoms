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

type Mode = 'edit' | 'create';
let currentMode: Mode = 'edit';
let currentItemType: ItemType | null = null;
let currentItemId: string | null = null;
let modalEl: HTMLElement | null = null;

// rate limit thresholds
const NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000;  // 24 hours
const NEW_USER_DAILY_LIMIT = 3;
const ESTABLISHED_USER_DAILY_LIMIT = 10;

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

const TYPE_LABELS: Record<ItemType, string> = {
  play: '遛娃地点',
  doctor: '医生/诊所',
  service: '维修师傅',
  class: '课外班',
  streaming: '影视网站',
};

function openModal(
  mode: Mode,
  type: ItemType,
  id: string | null,
  data: Record<string, unknown>
) {
  currentMode = mode;
  currentItemType = type;
  currentItemId = id;
  if (!modalEl) modalEl = document.getElementById('item-editor');
  if (!modalEl) return;

  // Swap title and button text by mode
  const title = modalEl.querySelector<HTMLElement>('#editor-title')!;
  const submitBtn = modalEl.querySelector<HTMLButtonElement>('#editor-submit')!;
  const historyLink = modalEl.querySelector<HTMLElement>('#editor-history-link')!;
  const commentLabel = modalEl.querySelector<HTMLElement>('#editor-comment-label')!;
  const commentInput = modalEl.querySelector<HTMLInputElement>('input[name="edit_comment"]')!;

  if (mode === 'create') {
    title.textContent = `新增${TYPE_LABELS[type]}`;
    submitBtn.textContent = '发布';
    historyLink.classList.add('hidden');
    commentLabel.textContent = '来源说明';
    commentInput.placeholder = '例：亲身体验 / 朋友推荐 / 桥水群 XX 提到 / 官网 ...';
  } else {
    title.textContent = '编辑条目';
    submitBtn.textContent = '保存';
    historyLink.classList.remove('hidden');
    commentLabel.textContent = '编辑说明';
    commentInput.placeholder = '例：修正电话号码、店铺已搬家、地址更新...';
  }

  renderFields(type, data);

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
  if (!currentItemType) return;

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

  if (currentMode === 'create') {
    await handleCreate(session.user.id, currentItemType, newFields, comment);
    return;
  }

  if (!currentItemId) return;

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

async function checkRateLimit(userId: string, userCreatedAt: string): Promise<string | null> {
  // Returns error message if over limit, null if OK
  const accountAge = Date.now() - new Date(userCreatedAt).getTime();
  const isNewUser = accountAge < NEW_USER_WINDOW_MS;
  const limit = isNewUser ? NEW_USER_DAILY_LIMIT : ESTABLISHED_USER_DAILY_LIMIT;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', userId)
    .gte('created_at', since);

  if (error) {
    console.warn('checkRateLimit', error);
    return null; // don't block on query failure
  }
  if ((count ?? 0) >= limit) {
    return `你今天已经新增了 ${count} 个条目（${isNewUser ? '新用户' : '老用户'}每天限 ${limit} 个）。明天再来吧。`;
  }
  return null;
}

async function handleCreate(
  userId: string,
  type: ItemType,
  fields: Record<string, string>,
  sourceNote: string
) {
  // Basic validation: at least one required field must be non-empty
  const requiredKeys = SCHEMAS[type].filter((s) => s.required).map((s) => s.key);
  for (const key of requiredKeys) {
    if (!fields[key]) {
      showError(`请填写 "${SCHEMAS[type].find((s) => s.key === key)!.label}"`);
      return;
    }
  }

  const submitBtn = modalEl!.querySelector<HTMLButtonElement>('#editor-submit')!;
  submitBtn.disabled = true;

  // Rate limit check
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const rateErr = await checkRateLimit(userId, user.created_at);
    if (rateErr) {
      showError(rateErr);
      submitBtn.disabled = false;
      return;
    }
  }

  const newId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Insert into items
  const { error: insertErr } = await supabase.from('items').insert({
    id: newId,
    item_type: type,
    data: fields,
    created_by: userId,
    updated_by: userId,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (insertErr) {
    showError('发布失败：' + insertErr.message);
    submitBtn.disabled = false;
    return;
  }

  // Log first edit (creation) to history
  await supabase.from('item_edits').insert({
    item_id: newId,
    user_id: userId,
    before_data: null,
    after_data: fields,
    edit_comment: `新建：${sourceNote}`,
  });

  submitBtn.disabled = false;
  closeModal();

  // Reload page so the new card appears (simplest reliable way)
  alert('🎉 发布成功！页面即将刷新显示新条目。');
  window.location.reload();
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
      openModal('edit', type, id, data as Record<string, unknown>);
    });
  });
}

function bindCreateButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-create-item]').forEach((btn) => {
    if ((btn as unknown as { __bound?: boolean }).__bound) return;
    (btn as unknown as { __bound?: boolean }).__bound = true;
    btn.addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        alert('请先登录才能新增');
        return;
      }
      const type = btn.dataset.itemType as ItemType;
      if (!type) return;
      openModal('create', type, null, {});
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
  bindCreateButtons();
  // Rebind if new cards appear (rare, but safe)
  const observer = new MutationObserver(() => {
    bindEditButtons();
    bindCreateButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
