// Recent edits feed: monitor all item edits in the last 7 days.
import { supabase } from '../supabase';
import { esc, fmtDate, fetchProfiles, empty, type AdminContext } from './common';

interface EditRow {
  id: string;
  item_id: string;
  user_id: string;
  edit_comment: string | null;
  is_revert_of: string | null;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
}

export async function renderRecent(container: HTMLElement, _ctx: AdminContext) {
  container.innerHTML = '<p class="text-sm text-ink-muted py-6">加载中…</p>';

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('item_edits')
    .select('id, item_id, user_id, edit_comment, is_revert_of, created_at, before_data, after_data')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    container.innerHTML = `<p class="text-warm">加载失败：${esc(error.message)}</p>`;
    return;
  }
  const rows = (data || []) as EditRow[];
  if (rows.length === 0) {
    container.innerHTML = empty('最近 7 天没有编辑记录');
    return;
  }

  const profiles = await fetchProfiles(rows.map((r) => r.user_id));

  // Fetch item titles for display
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
  const { data: items } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted')
    .in('id', itemIds);
  const itemsMap = new Map((items || []).map((it: { id: string }) => [it.id, it]));

  container.innerHTML = `<p class="text-xs text-ink-muted mb-3">最近 7 天的 ${rows.length} 条编辑（最多显示 100 条）</p><div id="recent-list" class="space-y-2"></div>`;
  const list = container.querySelector<HTMLElement>('#recent-list')!;

  for (const r of rows) {
    const profile = profiles.get(r.user_id);
    const name = profile?.display_name || '匿名';
    const item = itemsMap.get(r.item_id) as { item_type?: string; data?: Record<string, string>; is_hidden?: boolean; is_deleted?: boolean } | undefined;
    const title = item?.data?.name || item?.data?.org || r.item_id;
    const isRevert = r.is_revert_of !== null;
    const isCreate = r.before_data === null;

    const article = document.createElement('article');
    article.className = 'bg-white rounded-card shadow-soft p-3 text-sm';

    article.innerHTML = `
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div class="min-w-0 flex-1">
          <div class="font-medium text-ink">${esc(title as string)}
            <span class="text-xs text-ink-muted">· ${esc(item?.item_type || '?')}</span>
            ${item?.is_hidden ? '<span class="tag bg-warm ml-1">已隐藏</span>' : ''}
            ${item?.is_deleted ? '<span class="tag bg-warm ml-1">已删除</span>' : ''}
          </div>
          <div class="text-xs text-ink-muted">
            ${isCreate ? '🆕 新建' : isRevert ? '↶ 回滚' : '✏️ 编辑'}
            · <span class="font-medium">${esc(name)}</span>
            · ${fmtDate(r.created_at)}
          </div>
          ${r.edit_comment ? `<div class="text-xs text-ink-light mt-1 italic">"${esc(r.edit_comment)}"</div>` : ''}
        </div>
      </div>
    `;
    list.appendChild(article);
  }
}
