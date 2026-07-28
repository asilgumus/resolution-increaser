/**
 * Before/after compare slider.
 * Two stacked layers: `after` (full) underneath, `before` (clipped) on top.
 * A draggable, keyboard-operable handle divides them.
 */

export interface CompareHandle {
  setImages(beforeUrl: string, afterUrl: string, afterW: number, afterH: number): void;
  reset(): void;
}

export function initCompare(
  container: HTMLElement,
  beforeImg: HTMLImageElement,
  afterImg: HTMLImageElement,
  handle: HTMLButtonElement,
): CompareHandle {
  let pos = 50; // 0..100 — percentage from the left
  let raf = 0;

  function apply() {
    const p = pos;
    beforeImg.parentElement!.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
    handle.style.left = `${p}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(p)));
    raf = 0;
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  function setPos(next: number) {
    pos = Math.max(0, Math.min(100, next));
    schedule();
  }

  function posFromEvent(e: PointerEvent): number {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return (x / rect.width) * 100;
  }

  // Pointer dragging — works for mouse + touch via Pointer Events.
  let dragging = false;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    setPos(posFromEvent(e));
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    setPos(posFromEvent(e));
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);

  // Keyboard on the handle (role=slider).
  handle.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        setPos(pos - 2);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        setPos(pos + 2);
        e.preventDefault();
        break;
      case 'Home':
        setPos(0);
        e.preventDefault();
        break;
      case 'End':
        setPos(100);
        e.preventDefault();
        break;
    }
  });

  return {
    setImages(beforeUrl, afterUrl, afterW, afterH) {
      beforeImg.src = beforeUrl;
      afterImg.src = afterUrl;
      // Drive the container height from the after-image aspect ratio.
      container.style.aspectRatio = `${afterW} / ${afterH}`;
      pos = 50;
      apply();
    },
    reset() {
      pos = 50;
      apply();
    },
  };
}