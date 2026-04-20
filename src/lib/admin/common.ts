// Shared helpers for admin sub-pages.
import { supabase } from '../supabase';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

// Record an admin action to admin_logs. Never throws (failures shouldn't block UI).
export async function logAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail?: Record<string, unknown>
) {
  try {
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      detail: detail ?? null,
    });
  } catch (e) {
    console.warn('logAction failed', e);
  }
}

// Bulk-fetch profiles by user_ids (for rendering names/avatars).
export async function fetchProfiles(userIds: string[]): Promise<Map<string, { display_name: string | null; avatar_url: string | null }>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', unique);
  return new Map((data || []).map((p) => [p.id, p]));
}

export function empty(msg: string): string {
  return `<p class="text-sm text-ink-muted py-6 text-center">${esc(msg)}</p>`;
}

export interface AdminContext {
  userId: string;
  role: 'admin' | 'super_admin';
  displayName: string;
}
