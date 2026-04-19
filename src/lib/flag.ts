// Flag (report) modal: lets users report items / comments / ratings.
import { supabase } from './supabase';

type TargetType = 'item' | 'comment' | 'rating';

let modalEl: HTMLElement | null = null;
let currentTarget: { type: TargetType; id: string } | null = null;

function openFlag(targetType: TargetType, targetId: string) {
  if (!modalEl) modalEl = document.getElementById('flag-modal');
  if (!modalEl) return;
  currentTarget = { type: targetType, id: targetId };

  const form = modalEl.querySelector<HTMLFormElement>('#flag-form')!;
  form.reset();
  const err = modalEl.querySelector<HTMLElement>('#flag-error')!;
  err.classList.add('hidden');

  modalEl.classList.remove('hidden');
  modalEl.classList.add('flex');
}

function closeFlag() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  modalEl.classList.remove('flex');
  currentTarget = null;
}

async function submitFlag(ev: Event) {
  ev.preventDefault();
  if (!currentTarget || !modalEl) return;

  const { data: sess } = await supabase.auth.getSession();
  const session = sess.session;
  if (!session) {
    alert('请先登录才能举报');
    return;
  }

  const reason = (modalEl.querySelector<HTMLInputElement>('input[name="reason"]:checked'))?.value;
  const detail = (modalEl.querySelector<HTMLTextAreaElement>('textarea[name="detail"]'))?.value.trim() ?? '';
  if (!reason) {
    showError('请选择一个举报原因');
    return;
  }

  const submitBtn = modalEl.querySelector<HTMLButtonElement>('#flag-submit')!;
  submitBtn.disabled = true;

  const { error } = await supabase.from('flags').insert({
    user_id: session.user.id,
    target_type: currentTarget.type,
    target_id: currentTarget.id,
    reason,
    detail: detail || null,
  });
  submitBtn.disabled = false;

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      showError('你已经举报过这条内容了');
    } else {
      showError('举报失败：' + error.message);
    }
    return;
  }

  alert('感谢你的举报！管理员会尽快处理。');
  closeFlag();
}

function showError(msg: string) {
  if (!modalEl) return;
  const err = modalEl.querySelector<HTMLElement>('#flag-error')!;
  err.textContent = msg;
  err.classList.remove('hidden');
}

function bindFlagButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-flag-item]').forEach((btn) => {
    if ((btn as unknown as { __bound?: boolean }).__bound) return;
    (btn as unknown as { __bound?: boolean }).__bound = true;
    btn.addEventListener('click', () => {
      const type = (btn.dataset.targetType || 'item') as TargetType;
      const id = btn.dataset.targetId || btn.closest<HTMLElement>('[data-item-card]')?.dataset.itemId;
      if (!id) return;
      openFlag(type, id);
    });
  });
}

function init() {
  modalEl = document.getElementById('flag-modal');
  if (!modalEl) return;

  modalEl.querySelector('#flag-close')?.addEventListener('click', closeFlag);
  modalEl.querySelector('#flag-cancel')?.addEventListener('click', closeFlag);
  modalEl.querySelector('#flag-form')?.addEventListener('submit', (e) => void submitFlag(e));
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeFlag();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl!.classList.contains('hidden')) closeFlag();
  });

  bindFlagButtons();
  const observer = new MutationObserver(() => bindFlagButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
