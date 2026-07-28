/** Scale picker (2x / 4x) radio group controller. */

import type { Scale } from '../types';

export interface ScalePickerHandle {
  get(): Scale;
  set(scale: Scale): void;
  disable(disabled: boolean): void;
}

export function initScalePicker(
  root: HTMLElement,
  onChange: (scale: Scale) => void,
): ScalePickerHandle {
  const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('.scale-card'));

  function apply(next: Scale) {
    for (const c of cards) {
      const active = Number(c.dataset.scale) === next;
      c.setAttribute('aria-checked', String(active));
      c.tabIndex = active ? 0 : -1;
    }
    onChange(next);
  }

  for (const card of cards) {
    card.addEventListener('click', () => apply(Number(card.dataset.scale) as Scale));
  }

  // Arrow-key navigation within the radiogroup.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const current = cards.findIndex((c) => c.getAttribute('aria-checked') === 'true');
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (current + dir + cards.length) % cards.length;
    const target = cards[next];
    apply(Number(target.dataset.scale) as Scale);
    target.focus();
  });

  return {
    get: () => Number(cards.find((c) => c.getAttribute('aria-checked') === 'true')?.dataset.scale) as Scale,
    set: apply,
    disable: (disabled) => cards.forEach((c) => (c.disabled = disabled)),
  };
}