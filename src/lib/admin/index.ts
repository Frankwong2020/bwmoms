// Admin page entry: permission gate + tab switching + section loaders.
import { supabase } from '../supabase';
import { renderFlags } from './flags';
import { renderRecent } from './recent';
import { renderHidden } from './hidden';
import { renderUsers } from './users';
import { renderLogs } from './logs';

type Section = 'flags' | 'recent' | 'hidden' | 'users' | 'logs';

interface AdminContext {
  userId: string;
  role: 'admin' | 'super_admin';
  displayName: string;
}

let ctx: AdminContext | null = null;
const sectionLoaded = new Set<Section>();

async function resolvePermission(): Promise<AdminContext | null | 'signed_out'> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return 'signed_out';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, banned')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    console.error('fetch profile', error);
    return null;
  }
  if (data.banned) return null;
  if (data.role !== 'admin' && data.role !== 'super_admin') return null;

  return {
    userId: session.user.id,
    role: data.role as 'admin' | 'super_admin',
    displayName: data.display_name || session.user.email || '管理员',
  };
}

function show(id: string) {
  document.getElementById(id)?.classList.remove('hidden');
}
function hide(id: string) {
  document.getElementById(id)?.classList.add('hidden');
}

function switchSection(name: Section) {
  document.querySelectorAll<HTMLElement>('.admin-section').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`section-${name}`)?.classList.remove('hidden');
  document.querySelectorAll<HTMLButtonElement>('.admin-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.section === name);
  });
  if (!sectionLoaded.has(name)) {
    sectionLoaded.add(name);
    void loadSection(name);
  }
}

async function loadSection(name: Section) {
  if (!ctx) return;
  const container = document.getElementById(`section-${name}`);
  if (!container) return;
  container.innerHTML = '<p class="text-sm text-ink-muted py-6">加载中…</p>';
  switch (name) {
    case 'flags':
      await renderFlags(container, ctx);
      break;
    case 'recent':
      await renderRecent(container, ctx);
      break;
    case 'hidden':
      await renderHidden(container, ctx);
      break;
    case 'users':
      await renderUsers(container, ctx);
      break;
    case 'logs':
      await renderLogs(container, ctx);
      break;
  }
}

export async function updateBadges() {
  // Count unresolved flags
  const { count: flagCount } = await supabase
    .from('flags')
    .select('*', { count: 'exact', head: true })
    .is('resolved_at', null);
  setBadge('flags', flagCount ?? 0);

  // Count hidden items
  const { count: hiddenCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_hidden', true);
  setBadge('hidden', hiddenCount ?? 0);

  // Count edits in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('item_edits')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);
  setBadge('recent', recentCount ?? 0);
}

function setBadge(section: string, n: number) {
  const el = document.querySelector<HTMLElement>(`.badge[data-badge="${section}"]`);
  if (!el) return;
  if (n > 0) {
    el.textContent = String(n);
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

async function init() {
  const result = await resolvePermission();
  hide('admin-loading');

  if (result === 'signed_out') {
    show('admin-signed-out');
    return;
  }
  if (!result) {
    show('admin-forbidden');
    return;
  }

  ctx = result;
  show('admin-panel');

  const roleBadge = document.getElementById('admin-role-badge');
  const nameEl = document.getElementById('admin-name-display');
  if (roleBadge) roleBadge.textContent = ctx.role === 'super_admin' ? 'Super Admin' : 'Admin';
  if (nameEl) nameEl.textContent = ctx.displayName;

  await updateBadges();

  document.querySelectorAll<HTMLButtonElement>('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.section as Section | undefined;
      if (s) switchSection(s);
    });
  });

  // Load default tab (recent activity)
  switchSection('recent');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  void init();
}
