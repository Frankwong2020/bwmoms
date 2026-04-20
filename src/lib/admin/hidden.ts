// List hidden / deleted items. Allow admin to restore or permanently delete.
import { supabase } from '../supabase';
import { esc, fmtDate, logAction, empty, type AdminContext } from './common';
import { updateBadges } from './index';

export async function renderHidden(container: HTMLElement, ctx: AdminContext) {
  container.innerHTML = '<p class="text-sm text-ink-muted py-6">加载中…</p>';

  const { data, error } = await supabase
    .from('items')
    .select('id, item_type, data, is_hidden, is_deleted, flagged_count, updated_at')
    .or('is_hidden.eq.true,is_deleted.eq.true')
    .order('updated_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="text-warm">加载失败：${esc(error.message)}</p>`;
    return;
  }
  const rows = (data || []) as Array<{
    id: string; item_type: string; data: Record<string, string>;
    is_hidden: boolean; is_deleted: boolean; flagged_count: number; updated_at: string;
  }>;

  if (rows.length === 0) {
    container.innerHTML = empty('没有被隐藏或删除的条目');
    return;
  }

  container.innerHTML = `<p class="text-xs text-ink-muted mb-3">${rows.length} 个条目被隐藏或删除</p>`;

  for (const it of rows) {
    const article = document.createElement('article');
    article.className = 'bg-white rounded-card shadow-soft p-4 mb-3';

    const title = it.data.name || it.data.org || it.id;

    article.innerHTML = `
      <div class="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-ink">${esc(title)}</div>
          <div class="text-xs text-ink-muted">
            ${esc(it.item_type)} ·
            ${it.is_deleted ? '<span class="text-warm font-medium">已删除</span>' : '<span class="text-warm font-medium">已隐藏</span>'}
            · 被举报 ${it.flagged_count} 次
            · 最后更新 ${fmtDate(it.updated_at)}
          </div>
          ${it.data.address ? `<div class="text-xs text-ink-light mt-1">地址：${esc(it.data.address)}</div>` : ''}
          ${it.data.phone ? `<div class="text-xs text-ink-light">电话：${esc(it.data.phone)}</div>` : ''}
          ${it.data.tips ? `<div class="text-xs text-ink-light mt-1">${esc(it.data.tips)}</div>` : ''}
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/5">
        ${!it.is_deleted ? `<button type="button" class="btn-restore px-3 py-1.5 rounded-chip bg-sage text-white text-xs font-medium hover:bg-sage-dark">♻️ 解除隐藏</button>` : ''}
        ${it.is_deleted ? `<button type="button" class="btn-undelete px-3 py-1.5 rounded-chip bg-sage text-white text-xs font-medium hover:bg-sage-dark">♻️ 取消删除</button>` : `<button type="button" class="btn-delete px-3 py-1.5 rounded-chip bg-white border border-warm/40 text-warm text-xs font-medium hover:bg-warm/10">🗑️ 永久删除</button>`}
      </div>
    `;

    article.querySelector<HTMLButtonElement>('.btn-restore')?.addEventListener('click', async () => {
      await supabase.from('items').update({ is_hidden: false }).eq('id', it.id);
      await logAction(ctx.userId, 'unhide_item', 'item', it.id);
      article.remove();
      await updateBadges();
      ensureEmpty(container);
    });
    article.querySelector<HTMLButtonElement>('.btn-delete')?.addEventListener('click', async () => {
      if (!confirm('永久删除此条目？（软删除，历史保留）')) return;
      await supabase.from('items').update({ is_deleted: true, is_hidden: true }).eq('id', it.id);
      await logAction(ctx.userId, 'delete_item', 'item', it.id);
      article.remove();
      await updateBadges();
      ensureEmpty(container);
    });
    article.querySelector<HTMLButtonElement>('.btn-undelete')?.addEventListener('click', async () => {
      if (!confirm('取消删除此条目？（也将取消隐藏）')) return;
      await supabase.from('items').update({ is_deleted: false, is_hidden: false }).eq('id', it.id);
      await logAction(ctx.userId, 'undelete_item', 'item', it.id);
      article.remove();
      await updateBadges();
      ensureEmpty(container);
    });

    container.appendChild(article);
  }
}

function ensureEmpty(container: HTMLElement) {
  if (container.querySelectorAll('article').length === 0) {
    container.innerHTML = empty('没有被隐藏或删除的条目');
  }
}
