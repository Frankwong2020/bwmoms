// Admin flags queue: show unresolved flags, let admin hide/dismiss.
import { supabase } from '../supabase';
import { esc, fmtDate, logAction, fetchProfiles, empty, type AdminContext } from './common';
import { updateBadges } from './index';

interface FlagRow {
  id: string;
  user_id: string;
  target_type: 'item' | 'comment' | 'rating';
  target_id: string;
  reason: string;
  detail: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  spam: '广告/垃圾',
  wrong: '信息错误',
  malicious: '恶意篡改',
  offensive: '冒犯/不当',
  other: '其他',
};

export async function renderFlags(container: HTMLElement, ctx: AdminContext) {
  container.innerHTML = '<p class="text-sm text-ink-muted py-6">加载中…</p>';

  const { data: flags, error } = await supabase
    .from('flags')
    .select('*')
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="text-warm">加载失败：${esc(error.message)}</p>`;
    return;
  }

  const list = (flags || []) as FlagRow[];
  if (list.length === 0) {
    container.innerHTML = empty('🎉 当前没有待处理的举报');
    return;
  }

  // Group by target_type + target_id so we can show one row per reported target
  const grouped = new Map<string, FlagRow[]>();
  for (const f of list) {
    const key = `${f.target_type}:${f.target_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  // Collect target details
  const itemIds = list.filter((f) => f.target_type === 'item').map((f) => f.target_id);
  const commentIds = list.filter((f) => f.target_type === 'comment').map((f) => f.target_id);

  const [itemsResp, commentsResp, reporterMap] = await Promise.all([
    itemIds.length
      ? supabase.from('items').select('id, item_type, data, is_hidden, is_deleted').in('id', itemIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? supabase.from('comments').select('id, user_id, item_type, item_id, body, deleted_at').in('id', commentIds)
      : Promise.resolve({ data: [] }),
    fetchProfiles(list.map((f) => f.user_id)),
  ]);

  const itemsById = new Map((itemsResp.data || []).map((r: { id: string }) => [r.id, r]));
  const commentsById = new Map((commentsResp.data || []).map((r: { id: string }) => [r.id, r]));

  container.innerHTML = '';
  for (const [key, group] of grouped) {
    const [targetType, targetId] = key.split(':', 2) as ['item' | 'comment' | 'rating', string];
    const article = document.createElement('article');
    article.className = 'bg-white rounded-card shadow-soft p-5 mb-4';

    // Target preview
    let targetHtml = '';
    if (targetType === 'item') {
      const it = itemsById.get(targetId) as { item_type?: string; data?: Record<string, string>; is_hidden?: boolean; is_deleted?: boolean } | undefined;
      if (it) {
        const d = it.data || {};
        const title = d.name || d.org || '(未命名)';
        const status = it.is_deleted ? '已删除' : it.is_hidden ? '已隐藏' : '可见';
        targetHtml = `
          <div class="text-sm text-ink-muted mb-1">📍 条目 · ${esc(it.item_type || '')} · 状态：${status}</div>
          <div class="font-semibold text-ink">${esc(title)}</div>
          ${d.address ? `<div class="text-xs text-ink-light">地址：${esc(d.address)}</div>` : ''}
          ${d.phone ? `<div class="text-xs text-ink-light">电话：${esc(d.phone)}</div>` : ''}
          ${d.tips ? `<div class="text-xs text-ink-light mt-1">${esc(d.tips)}</div>` : ''}
        `;
      } else {
        targetHtml = `<div class="text-sm text-warm">条目 ${esc(targetId)} 不存在</div>`;
      }
    } else if (targetType === 'comment') {
      const c = commentsById.get(targetId) as { user_id?: string; body?: string; deleted_at?: string | null } | undefined;
      if (c) {
        targetHtml = `
          <div class="text-sm text-ink-muted mb-1">💬 评论 · 状态：${c.deleted_at ? '已软删除' : '可见'}</div>
          <div class="text-sm text-ink-light whitespace-pre-wrap border-l-2 border-sage-light pl-3">${esc(c.body || '')}</div>
        `;
      } else {
        targetHtml = `<div class="text-sm text-warm">评论 ${esc(targetId)} 不存在</div>`;
      }
    } else {
      targetHtml = `<div class="text-sm text-ink-muted">${esc(targetType)} ${esc(targetId)}</div>`;
    }

    // Reports summary
    const reportsHtml = group
      .map((f) => {
        const reporter = reporterMap.get(f.user_id);
        const name = reporter?.display_name || '匿名';
        return `
          <li class="text-xs border-l-2 border-warm/30 pl-2 py-1">
            <span class="font-medium">${esc(name)}</span>
            · ${fmtDate(f.created_at)}
            · 原因：<span class="text-warm">${esc(REASON_LABELS[f.reason] || f.reason)}</span>
            ${f.detail ? `<br><span class="text-ink-light">"${esc(f.detail)}"</span>` : ''}
          </li>
        `;
      })
      .join('');

    article.innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex-1 min-w-0">${targetHtml}</div>
        <span class="tag shrink-0 bg-warm text-white">${group.length} 次举报</span>
      </div>
      <details class="mt-2">
        <summary class="text-sm text-sage-dark cursor-pointer select-none">举报详情</summary>
        <ul class="mt-2 space-y-1">${reportsHtml}</ul>
      </details>
      <div class="flex flex-wrap gap-2 mt-4 pt-3 border-t border-black/5">
        ${targetType === 'item'
          ? `<button type="button" class="btn-hide px-3 py-1.5 rounded-chip bg-warm text-white text-xs font-medium hover:opacity-90">🙈 隐藏条目</button>
             <button type="button" class="btn-delete px-3 py-1.5 rounded-chip bg-white border border-warm/40 text-warm text-xs font-medium hover:bg-warm/10">🗑️ 永久删除</button>`
          : targetType === 'comment'
          ? `<button type="button" class="btn-remove-comment px-3 py-1.5 rounded-chip bg-warm text-white text-xs font-medium hover:opacity-90">🗑️ 删除评论</button>`
          : ''
        }
        <button type="button" class="btn-dismiss px-3 py-1.5 rounded-chip bg-white border border-black/10 text-xs font-medium hover:bg-sage-light">✓ 驳回举报</button>
      </div>
    `;

    // Wire buttons
    article.querySelector<HTMLButtonElement>('.btn-hide')?.addEventListener('click', async () => {
      await handleHideItem(ctx, targetId, group);
      article.remove();
      await updateBadges();
      ensureEmptyState(container);
    });
    article.querySelector<HTMLButtonElement>('.btn-delete')?.addEventListener('click', async () => {
      if (!confirm('永久删除此条目？（软删除：设置 is_deleted=true，历史保留）')) return;
      await handleDeleteItem(ctx, targetId, group);
      article.remove();
      await updateBadges();
      ensureEmptyState(container);
    });
    article.querySelector<HTMLButtonElement>('.btn-remove-comment')?.addEventListener('click', async () => {
      if (!confirm('软删除此评论？')) return;
      await handleRemoveComment(ctx, targetId, group);
      article.remove();
      await updateBadges();
      ensureEmptyState(container);
    });
    article.querySelector<HTMLButtonElement>('.btn-dismiss')?.addEventListener('click', async () => {
      await handleDismiss(ctx, group);
      article.remove();
      await updateBadges();
      ensureEmptyState(container);
    });

    container.appendChild(article);
  }
}

function ensureEmptyState(container: HTMLElement) {
  if (container.querySelectorAll('article').length === 0) {
    container.innerHTML = empty('🎉 当前没有待处理的举报');
  }
}

async function resolveFlags(flags: FlagRow[], resolution: string, adminId: string) {
  const nowIso = new Date().toISOString();
  const ids = flags.map((f) => f.id);
  await supabase.from('flags').update({
    resolved_at: nowIso,
    resolved_by: adminId,
    resolution,
  }).in('id', ids);
}

async function handleHideItem(ctx: AdminContext, itemId: string, flags: FlagRow[]) {
  await supabase.from('items').update({ is_hidden: true }).eq('id', itemId);
  await resolveFlags(flags, 'removed', ctx.userId);
  await logAction(ctx.userId, 'hide_item', 'item', itemId, { flag_count: flags.length });
}

async function handleDeleteItem(ctx: AdminContext, itemId: string, flags: FlagRow[]) {
  await supabase.from('items').update({ is_deleted: true, is_hidden: true }).eq('id', itemId);
  await resolveFlags(flags, 'removed', ctx.userId);
  await logAction(ctx.userId, 'delete_item', 'item', itemId, { flag_count: flags.length });
}

async function handleRemoveComment(ctx: AdminContext, commentId: string, flags: FlagRow[]) {
  await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
  await resolveFlags(flags, 'removed', ctx.userId);
  await logAction(ctx.userId, 'remove_comment', 'comment', commentId, { flag_count: flags.length });
}

async function handleDismiss(ctx: AdminContext, flags: FlagRow[]) {
  await resolveFlags(flags, 'dismissed', ctx.userId);
  await logAction(ctx.userId, 'dismiss_flag', flags[0].target_type, flags[0].target_id, {
    flag_count: flags.length,
  });
}
