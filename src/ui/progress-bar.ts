/** Progress bar + status line controller. */

export interface ProgressHandle {
  reset(): void;
  setAmount(amount: number): void; // 0..1
  setStatus(text: string): void;
  show(): void;
  hide(): void;
}

export function initProgress(
  wrap: HTMLElement,
  fill: HTMLElement,
  status: HTMLElement,
): ProgressHandle {
  return {
    reset() {
      fill.style.width = '0%';
      status.textContent = '';
    },
    setAmount(amount) {
      const pct = Math.max(0, Math.min(1, amount)) * 100;
      fill.style.width = `${pct.toFixed(1)}%`;
    },
    setStatus(text) {
      status.textContent = text;
    },
    show() {
      wrap.hidden = false;
    },
    hide() {
      wrap.hidden = true;
    },
  };
}