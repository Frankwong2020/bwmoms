// Admin action audit log viewer.
import { supabase } from '../supabase';
import { esc, fmtDate, fetchProfiles, empty, type AdminContext } from './common';

interface LogRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  hide_item: '🙈 隐藏条目',
  unhide_item: '♻️ 解除隐藏',
  delete_item: '🗑️ 删除条目',
  undelete_item: '♻️ 取消删除',
  dismiss_flag: '✓ 驳回举报',
  remove_comment: '🗑️ 删除评论',
  ban_user: '🚫 封禁用户',
  unban_user: '✅ 解封用户',
  promote: '⬆ 升为 Admin',
  demote: '⬇ 降为用户',
};

export async function renderLogs(container: HTMLElement, _ctx: AdminContext) {
  container.innerHTML = '<p class="text-sm text-ink-muted py-6">加载中…</p>';

  const { data, error } = await supabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    container.innerHTML = `<p class="text-warm">加载失败：${esc(error.message)}</p>`;
    return;
  }
  const rows = (data || []) as LogRow[];
  if (rows.length === 0) {
    container.innerHTML = empty('没有操作日志');
    return;
  }

  const profiles = await fetchProfiles(rows.map((r) => r.admin_id));

  container.innerHTML = `<p class="text-xs text-ink-muted mb-3">最近 ${rows.length} 条操作记录</p><div id="logs-list" class="space-y-1"></div>`;
  const list = container.querySelector<HTMLElement>('#logs-list')!;

  for (const r of rows) {
    const admin = profiles.get(r.admin_id);
    const name = admin?.display_name || '匿名管理员';
    const actionLabel = ACTION_LABELS[r.action] || r.action;

    const div = document.createElement('div');
    div.className = 'bg-white rounded p-2 text-xs flex items-start gap-2 border border-black/5';

    div.innerHTML = `
      <span class="font-medium whitespace-nowrap shrink-0">${esc(actionLabel)}</span>
      <span class="text-ink-muted shrink-0">${esc(r.target_type)} ${esc(r.target_id.slice(0, 12))}...</span>
      <span class="text-ink-light flex-1 min-w-0 truncate">${r.detail ? esc(JSON.stringify(r.detail)) : ''}</span>
      <span class="text-ink-muted shrink-0">${esc(name)} · ${fmtDate(r.created_at)}</span>
    `;
    list.appendChild(div);
  }
}
