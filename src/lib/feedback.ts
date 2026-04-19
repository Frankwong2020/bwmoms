// Wires up all .item-feedback blocks on a page:
//   - Fetches rating summaries in bulk (one query, not N)
//   - Fetches user's existing ratings (bulk)
//   - Lazy-loads comments on first panel open
//   - Handles star clicks + comment submissions
import { supabase, type ItemType, type Comment, type RatingSummary } from './supabase';
import type { Session } from '@supabase/supabase-js';

type FB = HTMLElement & { __bound?: boolean };

function renderStars(container: HTMLElement, filled: number) {
  container.querySelectorAll<HTMLElement>('span, button').forEach((el, i) => {
    const isFilled = i < Math.round(filled);
    el.textContent = isFilled ? '★' : '☆';
    el.classList.toggle('text-warm', isFilled);
    el.classList.toggle('text-ink-muted', !isFilled);
  });
}

function renderSummary(block: FB, summary: RatingSummary | undefined) {
  const starsEl = block.querySelector<HTMLElement>('.stars-summary')!;
  const textEl = block.querySelector<HTMLElement>('.summary-text')!;
  if (!summary || summary.rating_count === 0) {
    renderStars(starsEl, 0);
    textEl.textContent = '暂无评分';
  } else {
    renderStars(starsEl, summary.avg_stars);
    textEl.textContent = `${summary.avg_stars.toFixed(1)} · ${summary.rating_count} 人评`;
  }
}

function renderUserRating(block: FB, stars: number | null) {
  const picker = block.querySelector<HTMLElement>('.user-stars')!;
  renderStars(picker, stars ?? 0);
}

const PAGE_SIZE = 5;
// Per-block state: how many comments to show. Keys by item_type:item_id.
const visibleCountMap = new Map<string, number>();
// Per-block state: which comment is currently being edited.
const editingMap = new Map<string, string>(); // key -> comment.id

function blockKey(block: FB): string {
  return `${block.dataset.itemType}:${block.dataset.itemId}`;
}

function renderComments(block: FB, comments: Comment[], currentUserId: string | null) {
  const list = block.querySelector<HTMLElement>('.comments-list')!;
  list.innerHTML = '';

  if (comments.length === 0) {
    list.innerHTML = '<p class="text-xs text-ink-muted">还没有评论，做第一个吧</p>';
    return;
  }

  const key = blockKey(block);
  const visibleCount = visibleCountMap.get(key) ?? PAGE_SIZE;
  const editingId = editingMap.get(key);
  const visible = comments.slice(0, visibleCount);

  for (const c of visible) {
    list.appendChild(renderCommentNode(block, c, currentUserId, editingId === c.id, comments));
  }

  // "Show all" toggle if more comments exist
  if (comments.length > visibleCount) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'text-xs text-sage-dark hover:text-sage font-medium mt-1';
    more.textContent = `显示全部 ${comments.length} 条评论`;
    more.addEventListener('click', () => {
      visibleCountMap.set(key, comments.length);
      renderComments(block, comments, currentUserId);
    });
    list.appendChild(more);
  } else if (visibleCount > PAGE_SIZE && comments.length > PAGE_SIZE) {
    // "Collapse" toggle back to PAGE_SIZE
    const less = document.createElement('button');
    less.type = 'button';
    less.className = 'text-xs text-ink-muted hover:text-ink-light font-medium mt-1';
    less.textContent = '收起';
    less.addEventListener('click', () => {
      visibleCountMap.set(key, PAGE_SIZE);
      renderComments(block, comments, currentUserId);
    });
    list.appendChild(less);
  }
}

function renderCommentNode(
  block: FB,
  c: Comment,
  currentUserId: string | null,
  editing: boolean,
  allComments: Comment[]
): HTMLElement {
  const div = document.createElement('div');
  div.className = 'text-sm border-l-2 border-sage-light pl-3 py-1';

  const name = c.profile?.display_name || '匿名用户';
  const date = new Date(c.created_at).toLocaleDateString('zh-CN');
  const avatar = c.profile?.avatar_url
    ? `<img src="${c.profile.avatar_url}" class="w-5 h-5 rounded-full inline-block mr-1 align-text-bottom" alt="">`
    : '';

  const isOwner = currentUserId === c.user_id;
  const isDeleted = c.deleted_at !== null;
  const isEdited = c.edited_at !== null;

  // Header row: avatar + name + date + (edited tag) + action buttons
  const header = document.createElement('div');
  header.className = 'text-xs text-ink-muted mb-1 flex items-center gap-2 flex-wrap';
  header.innerHTML = `${avatar}<span class="font-medium">${escapeHtml(name)}</span><span>·</span><span>${date}</span>`;
  if (isEdited && !isDeleted) {
    const tag = document.createElement('span');
    tag.className = 'text-ink-muted italic';
    tag.textContent = '（已编辑）';
    header.appendChild(tag);
  }
  if (isOwner && !isDeleted && !editing) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ml-auto text-sage-dark hover:text-sage';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => {
      editingMap.set(blockKey(block), c.id);
      renderComments(block, allComments, currentUserId);
    });
    header.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-warm hover:opacity-70';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => void handleDelete(block, c));
    header.appendChild(delBtn);
  }
  div.appendChild(header);

  // Body
  if (isDeleted) {
    const p = document.createElement('p');
    p.className = 'text-ink-muted italic leading-relaxed';
    p.textContent = '此评论已被作者删除';
    div.appendChild(p);
  } else if (editing) {
    const form = document.createElement('form');
    form.className = 'space-y-2';

    const ta = document.createElement('textarea');
    ta.className =
      'w-full px-3 py-2 text-sm border border-black/10 rounded-chip focus:outline-none focus:border-sage resize-y min-h-[64px]';
    ta.value = c.body;
    ta.maxLength = 2000;
    ta.required = true;
    form.appendChild(ta);

    const row = document.createElement('div');
    row.className = 'flex gap-2 justify-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className =
      'px-3 py-1 rounded-chip bg-white border border-black/10 text-xs hover:bg-sage-light';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      editingMap.delete(blockKey(block));
      renderComments(block, allComments, currentUserId);
    });
    row.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className =
      'px-4 py-1 rounded-chip bg-sage text-white text-xs font-medium hover:bg-sage-dark disabled:opacity-50';
    saveBtn.textContent = '保存';
    row.appendChild(saveBtn);
    form.appendChild(row);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body || body === c.body) {
        editingMap.delete(blockKey(block));
        renderComments(block, allComments, currentUserId);
        return;
      }
      saveBtn.disabled = true;
      await handleEdit(block, c, body);
    });

    div.appendChild(form);
  } else {
    const p = document.createElement('p');
    p.className = 'text-ink-light leading-relaxed whitespace-pre-wrap';
    p.textContent = c.body;
    div.appendChild(p);
  }

  return div;
}

async function handleEdit(block: FB, c: Comment, newBody: string) {
  const { error } = await supabase
    .from('comments')
    .update({ body: newBody, edited_at: new Date().toISOString() })
    .eq('id', c.id);
  if (error) {
    console.error('edit comment', error);
    alert('编辑失败：' + error.message);
    return;
  }
  editingMap.delete(blockKey(block));
  const itemType = block.dataset.itemType as ItemType;
  const itemId = block.dataset.itemId!;
  const comments = await loadComments(itemType, itemId);
  const uid = (await getSession())?.user.id ?? null;
  renderComments(block, comments, uid);
}

async function handleDelete(block: FB, c: Comment) {
  if (!confirm('确定删除这条评论吗？（标记为已删除，历史记录保留）')) return;
  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', c.id);
  if (error) {
    console.error('delete comment', error);
    alert('删除失败：' + error.message);
    return;
  }
  const itemType = block.dataset.itemType as ItemType;
  const itemId = block.dataset.itemId!;
  const comments = await loadComments(itemType, itemId);
  const uid = (await getSession())?.user.id ?? null;
  renderComments(block, comments, uid);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

async function loadComments(itemType: ItemType, itemId: string): Promise<Comment[]> {
  const { data: rows, error } = await supabase
    .from('comments')
    .select('id, user_id, item_type, item_id, body, created_at, updated_at, edited_at, deleted_at')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadComments', error);
    return [];
  }
  const comments = (rows || []) as Comment[];
  const userIds = Array.from(new Set(comments.map((c) => c.user_id)));
  if (userIds.length === 0) return comments;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds);
  const pmap = new Map((profiles || []).map((p) => [p.id, p]));
  return comments.map((c) => ({ ...c, profile: pmap.get(c.user_id) }));
}

async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Re-render login prompts across all blocks on auth change
supabase.auth.onAuthStateChange((_evt, session) => {
  document.querySelectorAll<FB>('.item-feedback').forEach((block) => {
    updateLoginState(block, session);
  });
  // Refetch user ratings
  if (session) {
    void preloadUserRatings();
  } else {
    document.querySelectorAll<FB>('.item-feedback').forEach((block) => {
      renderUserRating(block, null);
    });
  }
});

function updateLoginState(block: FB, session: Session | null) {
  // Note: star buttons are always clickable. Click handler checks session
  // and alerts if not logged in. This avoids race conditions where session
  // hasn't been restored from localStorage yet at bind time.
  const prompt1 = block.querySelector<HTMLElement>('.login-prompt');
  const prompt2 = block.querySelector<HTMLElement>('.login-prompt-comment');
  const form = block.querySelector<HTMLFormElement>('.comment-form');
  if (session) {
    prompt1?.classList.add('hidden');
    prompt2?.classList.add('hidden');
    if (form) form.hidden = false;
  } else {
    prompt1?.classList.remove('hidden');
    prompt2?.classList.remove('hidden');
    if (form) form.hidden = true;
  }
}

async function preloadSummaries() {
  // Bulk fetch rating summaries for all items on page
  const blocks = document.querySelectorAll<FB>('.item-feedback');
  if (blocks.length === 0) return;

  const byType = new Map<ItemType, Set<string>>();
  blocks.forEach((b) => {
    const t = b.dataset.itemType as ItemType;
    const id = b.dataset.itemId!;
    if (!byType.has(t)) byType.set(t, new Set());
    byType.get(t)!.add(id);
  });

  const summaryMap = new Map<string, RatingSummary>();
  for (const [type, ids] of byType) {
    const { data, error } = await supabase
      .from('rating_summary')
      .select('*')
      .eq('item_type', type)
      .in('item_id', Array.from(ids));
    if (error) {
      console.error('preloadSummaries', error);
      continue;
    }
    for (const s of (data as RatingSummary[]) || []) {
      summaryMap.set(`${s.item_type}:${s.item_id}`, s);
    }
  }

  blocks.forEach((b) => {
    const key = `${b.dataset.itemType}:${b.dataset.itemId}`;
    renderSummary(b, summaryMap.get(key));
  });
}

async function preloadUserRatings() {
  const session = await getSession();
  if (!session) return;

  const blocks = document.querySelectorAll<FB>('.item-feedback');
  if (blocks.length === 0) return;

  // Fetch all user's ratings (small set per user)
  const { data, error } = await supabase
    .from('ratings')
    .select('item_type, item_id, stars')
    .eq('user_id', session.user.id);
  if (error) {
    console.error('preloadUserRatings', error);
    return;
  }
  const ratingMap = new Map<string, number>();
  for (const r of data || []) {
    ratingMap.set(`${r.item_type}:${r.item_id}`, r.stars);
  }

  blocks.forEach((b) => {
    const key = `${b.dataset.itemType}:${b.dataset.itemId}`;
    renderUserRating(b, ratingMap.get(key) ?? null);
  });
}

function bindBlock(block: FB) {
  if (block.__bound) return;
  block.__bound = true;

  const itemType = block.dataset.itemType as ItemType;
  const itemId = block.dataset.itemId!;
  const panel = block.querySelector<HTMLElement>('.feedback-panel')!;
  const toggleBtn = block.querySelector<HTMLButtonElement>('.toggle-feedback')!;
  const starBtns = block.querySelectorAll<HTMLButtonElement>('.star-btn');
  const form = block.querySelector<HTMLFormElement>('.comment-form')!;
  const textarea = form?.querySelector<HTMLTextAreaElement>('textarea')!;
  let commentsLoaded = false;

  toggleBtn.addEventListener('click', async () => {
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (wasHidden && !commentsLoaded) {
      commentsLoaded = true;
      const comments = await loadComments(itemType, itemId);
      const uid = (await getSession())?.user.id ?? null;
      renderComments(block, comments, uid);
    }
  });

  starBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const session = await getSession();
      if (!session) {
        alert('请先登录再评分');
        return;
      }
      const stars = parseInt(btn.dataset.star!, 10);
      renderUserRating(block, stars);
      const { error } = await supabase
        .from('ratings')
        .upsert(
          { user_id: session.user.id, item_type: itemType, item_id: itemId, stars, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,item_type,item_id' }
        );
      if (error) {
        console.error('upsert rating', error);
        alert('评分失败：' + error.message);
        return;
      }
      // Refresh summary
      const { data } = await supabase
        .from('rating_summary')
        .select('*')
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .maybeSingle();
      renderSummary(block, (data as RatingSummary) || undefined);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = await getSession();
    if (!session) {
      alert('请先登录');
      return;
    }
    const body = textarea.value.trim();
    if (!body) return;
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    submitBtn.disabled = true;
    const { error } = await supabase.from('comments').insert({
      user_id: session.user.id,
      item_type: itemType,
      item_id: itemId,
      body,
    });
    submitBtn.disabled = false;
    if (error) {
      console.error('insert comment', error);
      alert('发表失败：' + error.message);
      return;
    }
    textarea.value = '';
    const comments = await loadComments(itemType, itemId);
    renderComments(block, comments, session.user.id);
  });
}

export async function initFeedback() {
  const blocks = document.querySelectorAll<FB>('.item-feedback');
  if (blocks.length === 0) return;

  const session = await getSession();
  blocks.forEach((b) => {
    bindBlock(b);
    updateLoginState(b, session);
  });

  await Promise.all([preloadSummaries(), preloadUserRatings()]);
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initFeedback());
} else {
  void initFeedback();
}
