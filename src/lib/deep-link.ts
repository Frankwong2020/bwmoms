// Deep-link support: when URL has #<item_type>-<id>, scroll to and highlight
// the target card. Runs once on load, and after hydration (for dynamically
// added cards like events).
import type { ItemType } from './supabase';

function parseHash(): { type: ItemType; id: string } | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  // Format: "<type>-<uuid or slug>"; type is one of our known types
  const match = hash.match(/^(play|doctor|service|class|streaming|event)-(.+)$/);
  if (!match) return null;
  return { type: match[1] as ItemType, id: match[2] };
}

let highlighted: HTMLElement | null = null;

function highlight(card: HTMLElement) {
  if (highlighted) highlighted.classList.remove('deep-link-highlight');
  highlighted = card;
  card.classList.add('deep-link-highlight');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Remove highlight class after animation
  setTimeout(() => {
    card.classList.remove('deep-link-highlight');
    if (highlighted === card) highlighted = null;
  }, 4000);
}

function tryScrollToTarget() {
  const target = parseHash();
  if (!target) return false;
  const card = document.querySelector<HTMLElement>(
    `[data-item-card][data-item-type="${target.type}"][data-item-id="${CSS.escape(target.id)}"]`
  );
  if (card) {
    highlight(card);
    return true;
  }
  return false;
}

function init() {
  // Inject highlight animation CSS once
  if (!document.getElementById('deep-link-style')) {
    const style = document.createElement('style');
    style.id = 'deep-link-style';
    style.textContent = `
      .deep-link-highlight {
        animation: deep-link-flash 4s ease-out;
      }
      @keyframes deep-link-flash {
        0%, 100% { box-shadow: 0 2px 20px rgba(0,0,0,0.06); }
        10%, 60% { box-shadow: 0 0 0 4px rgba(123, 158, 135, 0.5); }
      }
    `;
    document.head.appendChild(style);
  }

  // Try immediately (for static-rendered cards)
  if (tryScrollToTarget()) return;

  // Retry after hydration / event loading (up to a few seconds)
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (tryScrollToTarget() || attempts >= 10) {
      clearInterval(iv);
    }
  }, 500);

  // Also react to hash changes (in-page navigation)
  window.addEventListener('hashchange', tryScrollToTarget);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
