// Admin users: search, view activity, ban/unban, promote/demote.
import { supabase } from '../supabase';
import { esc, fmtDate, logAction, empty, type AdminContext } from './common';

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin' | 'super_admin';
  banned: boolean;
  banned_reason: string | null;
  created_at: string;
}

export async function renderUsers(container: HTMLElement, ctx: AdminContext) {
  container.innerHTML = `
    <div class="mb-4">
      <input
        id="user-search"
        type="text"
        placeholder="搜索用户名…（留空显示最近活跃）"
        class="w-full md:w-96 px-3 py-2 text-sm border border-black/10 rounded-chip focus:outline-none focus:border-sage"
      />
    </div>
    <div id="users-list" class="space-y-3"></div>
  `;

  const searchInput = container.querySelector<HTMLInputElement>('#user-search')!;
  const listEl = container.querySelector<HTMLElement>('#users-list')!;

  await loadUsers(listEl, ctx, '');

  let timer: number | undefined;
  searchInput.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => loadUsers(listEl, ctx, searchInput.value.trim()), 300);
  });
}

async function loadUsers(listEl: HTMLElement, ctx: AdminContext, search: string) {
  listEl.innerHTML = '<p class="text-sm text-ink-muted py-4">加载中…</p>';

  let q = supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, banned, banned_reason, created_at')
    .order('created_at', { ascending: false });

  if (search) {
    q = q.ilike('display_name', `%${search}%`);
  }
  q = q.limit(50);

  const { data, error } = await q;
  if (error) {
    listEl.innerHTML = `<p class="text-warm">加载失败：${esc(error.message)}</p>`;
    return;
  }
  const users = (data || []) as ProfileRow[];
  if (users.length === 0) {
    listEl.innerHTML = empty(search ? '没找到匹配的用户' : '没有用户');
    return;
  }

  listEl.innerHTML = '';
  for (const u of users) {
    listEl.appendChild(renderUserCard(u, ctx));
  }
}

function renderUserCard(u: ProfileRow, ctx: AdminContext): HTMLElement {
  const article = document.createElement('article');
  article.className = 'bg-white rounded-card shadow-soft p-4';

  const isSelf = u.id === ctx.userId;
  const canChangeRole = ctx.role === 'super_admin' && !isSelf;
  const canBan = !isSelf && u.role !== 'super_admin';

  const avatar = u.avatar_url
    ? `<img src="${esc(u.avatar_url)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" class="w-8 h-8 rounded-full" alt="">`
    : `<div class="w-8 h-8 rounded-full bg-sage text-white flex items-center justify-center text-sm font-medium">${esc((u.display_name || '?').charAt(0).toUpperCase())}</div>`;

  article.innerHTML = `
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        ${avatar}
        <div class="min-w-0">
          <div class="font-semibold text-ink">${esc(u.display_name || '(无名字)')}</div>
          <div class="text-xs text-ink-muted">
            注册于 ${fmtDate(u.created_at)}
            ${u.role !== 'user' ? `· <span class="tag">${u.role}</span>` : ''}
            ${u.banned ? `· <span class="tag bg-warm">已封禁</span>` : ''}
          </div>
          ${u.banned && u.banned_reason ? `<div class="text-xs text-warm mt-1">封禁原因：${esc(u.banned_reason)}</div>` : ''}
        </div>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <button type="button" class="btn-view-activity text-xs text-sage-dark hover:text-sage font-medium">📋 查看活动</button>
        ${canBan
          ? u.banned
            ? `<button type="button" class="btn-unban px-2 py-1 rounded-chip bg-white border border-black/10 text-xs hover:bg-sage-light">解封</button>`
            : `<button type="button" class="btn-ban px-2 py-1 rounded-chip bg-warm text-white text-xs hover:opacity-90">封禁</button>`
          : ''
        }
        ${canChangeRole
          ? u.role === 'admin'
            ? `<button type="button" class="btn-demote px-2 py-1 rounded-chip bg-white border border-black/10 text-xs hover:bg-sage-light">降为用户</button>`
            : u.role === 'user'
            ? `<button type="button" class="btn-promote px-2 py-1 rounded-chip bg-sage text-white text-xs hover:bg-sage-dark">升为 Admin</button>`
            : ''
          : ''
        }
      </div>
    </div>
    <div class="activity-panel hidden mt-3 pt-3 border-t border-black/5 text-sm space-y-2"></div>
  `;

  article.querySelector<HTMLButtonElement>('.btn-view-activity')?.addEventListener('click', () => {
    void toggleActivity(article, u);
  });
  article.querySelector<HTMLButtonElement>('.btn-ban')?.addEventListener('click', () => void handleBan(ctx, u, article));
  article.querySelector<HTMLButtonElement>('.btn-unban')?.addEventListener('click', () => void handleUnban(ctx, u, article));
  article.querySelector<HTMLButtonElement>('.btn-promote')?.addEventListener('click', () => void handlePromote(ctx, u, article));
  article.querySelector<HTMLButtonElement>('.btn-demote')?.addEventListener('click', () => void handleDemote(ctx, u, article));

  return article;
}

async function toggleActivity(article: HTMLElement, u: ProfileRow) {
  const panel = article.querySelector<HTMLElement>('.activity-panel')!;
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="text-xs text-ink-muted">加载活动中…</p>';

  const [edits, comments, ratings, flagsReceived] = await Promise.all([
    supabase
      .from('item_edits')
      .select('id, item_id, edit_comment, created_at, is_revert_of')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('comments')
      .select('id, body, item_type, item_id, created_at, deleted_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('ratings')
      .select('id, item_type, item_id, stars, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(20),
    // How many of this user's items/comments have been flagged
    supabase
      .from('flags')
      .select('target_type, target_id', { count: 'exact', head: true })
      .in('target_id', [u.id]), // This isn't quite right; would need item-level join. Skip precise count.
  ]);

  const editList = (edits.data || []) as Array<{ id: string; item_id: string; edit_comment: string | null; created_at: string; is_revert_of: string | null }>;
  const commentList = (comments.data || []) as Array<{ id: string; body: string; item_type: string; item_id: string; created_at: string; deleted_at: string | null }>;
  const ratingList = (ratings.data || []) as Array<{ id: string; item_type: string; item_id: string; stars: number; created_at: string }>;

  panel.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <div class="text-xs font-medium text-ink-muted mb-2">✏️ 编辑 (${editList.length})</div>
        ${editList.length === 0 ? '<p class="text-xs text-ink-muted">无</p>' :
          editList.map((e) => `
            <div class="text-xs border-l-2 border-sage-light pl-2 py-0.5 mb-1">
              ${e.is_revert_of ? '↶ ' : ''}${esc(e.item_id)}<br>
              <span class="text-ink-muted">${fmtDate(e.created_at)}</span>
              ${e.edit_comment ? `<br><em>"${esc(e.edit_comment)}"</em>` : ''}
            </div>
          `).join('')
        }
      </div>
      <div>
        <div class="text-xs font-medium text-ink-muted mb-2">💬 评论 (${commentList.length})</div>
        ${commentList.length === 0 ? '<p class="text-xs text-ink-muted">无</p>' :
          commentList.map((c) => `
            <div class="text-xs border-l-2 border-sage-light pl-2 py-0.5 mb-1 ${c.deleted_at ? 'opacity-60 line-through' : ''}">
              ${esc(c.body.slice(0, 80))}${c.body.length > 80 ? '…' : ''}<br>
              <span class="text-ink-muted">${fmtDate(c.created_at)} · ${esc(c.item_type)}</span>
            </div>
          `).join('')
        }
      </div>
      <div>
        <div class="text-xs font-medium text-ink-muted mb-2">⭐ 评分 (${ratingList.length})</div>
        ${ratingList.length === 0 ? '<p class="text-xs text-ink-muted">无</p>' :
          ratingList.map((r) => `
            <div class="text-xs border-l-2 border-sage-light pl-2 py-0.5 mb-1">
              ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)} · ${esc(r.item_type)}<br>
              <span class="text-ink-muted">${fmtDate(r.created_at)}</span>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;
}

async function handleBan(ctx: AdminContext, u: ProfileRow, article: HTMLElement) {
  const reason = prompt('封禁原因？（可选，会显示在用户面板上）') ?? '';
  if (reason === null) return; // user cancelled

  const { error } = await supabase
    .from('profiles')
    .update({ banned: true, banned_reason: reason || null })
    .eq('id', u.id);
  if (error) {
    alert('封禁失败：' + error.message);
    return;
  }
  await logAction(ctx.userId, 'ban_user', 'user', u.id, { reason });
  // Update UI in place
  u.banned = true;
  u.banned_reason = reason || null;
  const newCard = renderUserCard(u, ctx);
  article.replaceWith(newCard);
}

async function handleUnban(ctx: AdminContext, u: ProfileRow, article: HTMLElement) {
  if (!confirm('解封此用户？')) return;
  const { error } = await supabase
    .from('profiles')
    .update({ banned: false, banned_reason: null })
    .eq('id', u.id);
  if (error) {
    alert('解封失败：' + error.message);
    return;
  }
  await logAction(ctx.userId, 'unban_user', 'user', u.id);
  u.banned = false;
  u.banned_reason = null;
  const newCard = renderUserCard(u, ctx);
  article.replaceWith(newCard);
}

async function handlePromote(ctx: AdminContext, u: ProfileRow, article: HTMLElement) {
  if (!confirm(`升 ${u.display_name || u.id} 为管理员？（他将能处理举报、封禁普通用户、隐藏内容）`)) return;
  const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', u.id);
  if (error) {
    alert('升权失败：' + error.message);
    return;
  }
  await logAction(ctx.userId, 'promote', 'user', u.id);
  u.role = 'admin';
  const newCard = renderUserCard(u, ctx);
  article.replaceWith(newCard);
}

async function handleDemote(ctx: AdminContext, u: ProfileRow, article: HTMLElement) {
  if (!confirm(`降 ${u.display_name || u.id} 为普通用户？`)) return;
  const { error } = await supabase.from('profiles').update({ role: 'user' }).eq('id', u.id);
  if (error) {
    alert('降权失败：' + error.message);
    return;
  }
  await logAction(ctx.userId, 'demote', 'user', u.id);
  u.role = 'user';
  const newCard = renderUserCard(u, ctx);
  article.replaceWith(newCard);
}
