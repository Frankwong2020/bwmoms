// Edit history modal: lists versions, shows diff, allows revert.
import { supabase, type ItemType } from './supabase';
import { refreshItem } from './hydrate-items';

interface EditRow {
  id: string;
  item_id: string;
  user_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  edit_comment: string | null;
  is_revert_of: string | null;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null };
}

let modalEl: HTMLElement | null = null;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

function renderDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): string {
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after)]);
  const rows: string[] = [];
  for (const key of allKeys) {
    const bv = before ? (before[key] as string | undefined) : undefined;
    const av = after[key] as string | undefined;
    if (bv === av) continue; // skip unchanged
    rows.push(`
      <div class="text-xs border border-black/5 rounded p-2 bg-white">
        <div class="font-medium text-ink-light mb-1">${escapeHtml(key)}</div>
        ${bv !== undefined ? `<div class="text-warm line-through opacity-70">${escapeHtml(bv || '(空)')}</div>` : ''}
        ${av !== undefined ? `<div class="text-sage-dark">${escapeHtml(av || '(空)')}</div>` : ''}
      </div>
    `);
  }
  if (rows.length === 0) {
    return '<p class="text-xs text-ink-muted italic">没有字段变化（可能是元数据更新）</p>';
  }
  return rows.join('');
}

async function loadHistory(itemId: string): Promise<EditRow[]> {
  const { data, error } = await supabase
    .from('item_edits')
    .select('id, item_id, user_id, before_data, after_data, edit_comment, is_revert_of, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadHistory', error);
    return [];
  }
  const rows = (data || []) as EditRow[];
  // Fetch profiles
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    const pmap = new Map((profiles || []).map((p) => [p.id, p]));
    for (const r of rows) {
      r.profile = pmap.get(r.user_id) as EditRow['profile'];
    }
  }
  return rows;
}

async function openHistory(itemType: ItemType, itemId: string) {
  if (!modalEl) modalEl = document.getElementById('item-history');
  if (!modalEl) return;

  modalEl.classList.remove('hidden');
  modalEl.classList.add('flex');

  const list = modalEl.querySelector<HTMLElement>('#history-list')!;
  list.innerHTML = '<p class="text-sm text-ink-muted">加载中…</p>';

  const rows = await loadHistory(itemId);

  if (rows.length === 0) {
    list.innerHTML =
      '<p class="text-sm text-ink-muted">此条目还没有编辑历史。任何人登录后都可以点"✏️ 编辑"来改进它。</p>';
    return;
  }

  list.innerHTML = '';
  rows.forEach((r, i) => {
    const div = document.createElement('article');
    div.className = 'border-l-2 border-sage-light pl-4 py-2';

    const name = r.profile?.display_name || '匿名用户';
    const date = new Date(r.created_at).toLocaleString('zh-CN');
    const avatar = r.profile?.avatar_url
      ? `<img src="${r.profile.avatar_url}" referrerpolicy="no-referrer" onerror="this.style.display='none'" class="w-5 h-5 rounded-full inline-block mr-1 align-text-bottom" alt="">`
      : '';

    const isRevert = r.is_revert_of !== null;
    const isCurrent = i === 0;

    const header = `
      <div class="text-xs text-ink-muted mb-2 flex flex-wrap items-center gap-2">
        ${avatar}<span class="font-medium text-ink-light">${escapeHtml(name)}</span>
        <span>·</span>
        <span>${date}</span>
        ${isCurrent ? '<span class="tag text-[10px] py-0 px-2 bg-sage text-white">当前</span>' : ''}
        ${isRevert ? '<span class="tag text-[10px] py-0 px-2 bg-warm-light text-warm">回滚</span>' : ''}
      </div>
      ${r.edit_comment ? `<p class="text-sm text-ink-light mb-2 italic">"${escapeHtml(r.edit_comment)}"</p>` : ''}
    `;

    const diff = `
      <div class="space-y-2 mt-2">
        ${renderDiff(r.before_data, r.after_data)}
      </div>
    `;

    const revertBtn =
      !isCurrent && !isRevert
        ? `<button type="button" class="revert-btn text-xs text-sage-dark hover:text-sage font-medium mt-3" data-edit-id="${r.id}">↶ 回滚到此版本</button>`
        : '';

    div.innerHTML = header + diff + revertBtn;
    list.appendChild(div);
  });

  // Wire revert buttons
  list.querySelectorAll<HTMLButtonElement>('.revert-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const editId = btn.dataset.editId;
      const target = rows.find((r) => r.id === editId);
      if (!target) return;
      await handleRevert(itemType, itemId, target);
    });
  });
}

async function handleRevert(itemType: ItemType, itemId: string, target: EditRow) {
  if (!confirm('确定回滚到此版本吗？（这会创建一条新的历史记录）')) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    alert('请先登录才能回滚');
    return;
  }

  // Fetch current (to capture before snapshot)
  const { data: current } = await supabase
    .from('items')
    .select('data')
    .eq('id', itemId)
    .maybeSingle();
  if (!current) {
    alert('读取当前版本失败');
    return;
  }

  // Update item to target's after_data
  const { error: updateErr } = await supabase
    .from('items')
    .update({
      data: target.after_data,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    })
    .eq('id', itemId);
  if (updateErr) {
    alert('回滚失败：' + updateErr.message);
    return;
  }

  // Append history row flagged as revert
  await supabase.from('item_edits').insert({
    item_id: itemId,
    user_id: session.user.id,
    before_data: current.data,
    after_data: target.after_data,
    edit_comment: `回滚到 ${new Date(target.created_at).toLocaleString('zh-CN')} 的版本`,
    is_revert_of: target.id,
  });

  await refreshItem(itemType, itemId);

  // Re-render history list
  await openHistory(itemType, itemId);
}

function closeHistory() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  modalEl.classList.remove('flex');
}

function bindHistoryButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-history-item]').forEach((btn) => {
    if ((btn as unknown as { __bound?: boolean }).__bound) return;
    (btn as unknown as { __bound?: boolean }).__bound = true;
    btn.addEventListener('click', () => {
      const type = btn.dataset.itemType as ItemType;
      const id = btn.dataset.itemId!;
      void openHistory(type, id);
    });
  });
}

function init() {
  modalEl = document.getElementById('item-history');
  if (!modalEl) return;
  modalEl.querySelector('#history-close')?.addEventListener('click', closeHistory);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeHistory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl!.classList.contains('hidden')) closeHistory();
  });
  bindHistoryButtons();
  const observer = new MutationObserver(() => bindHistoryButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
