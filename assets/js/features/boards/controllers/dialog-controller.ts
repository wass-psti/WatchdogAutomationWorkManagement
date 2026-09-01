import type { BoardDialog, BoardDialogHandle, BoardDialogOptions } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { EscapeHtml, ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import { buttonClass, iconButtonClass } from '../../../platform/ui/primitives.ts';

export interface BoardDialogControllerDependencies {
  readonly toast: ToastRenderer;
  readonly escapeHtml: EscapeHtml;
  readonly overlaySelector?: string;
}

export interface BoardDialogController {
  open: BoardDialog;
  closeAll(): void;
  count(): number;
}

const errorMessage = (error: unknown): string => error instanceof Error
  ? error.message
  : 'This action couldn’t be completed. Review the details and try again.';

/**
 * Shared Work Boards modal controller.
 * Owns focus restoration, keyboard trapping, submit busy state and persistent
 * inline errors so individual board workflows only provide content and actions.
 */
export function createBoardDialogController({ toast, escapeHtml, overlaySelector = '#overlayRoot' }: BoardDialogControllerDependencies): BoardDialogController {
  const esc = escapeHtml;
  const openDialogs = new Set<HTMLElement>();

  function open({ title, body, submitLabel = 'Save', danger = false, onSubmit }: BoardDialogOptions): BoardDialogHandle {
    const overlay = document.querySelector<HTMLElement>(overlaySelector) || document.body;
    const previous = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'wm-modal-backdrop';
    wrap.innerHTML = `<section class="wm-dialog wm-modal" role="dialog" aria-modal="true" aria-labelledby="wmDialogTitle">
      <header class="wm-dialog-header"><div><span class="top-eyebrow">WORK MANAGEMENT</span><h2 id="wmDialogTitle">${esc(title)}</h2></div><button class="${iconButtonClass({ tone: 'ghost' }, 'wm-modal-close')}" type="button" aria-label="Close">×</button></header>
      <form><div class="wm-dialog-body wm-modal-body">${body}<div class="wm-modal-error" data-modal-error role="alert" tabindex="-1" hidden></div></div><footer class="wm-dialog-footer"><button type="button" class="${buttonClass({ tone: 'secondary' }, 'secondary-btn wm-modal-cancel')}">Cancel</button><button type="submit" class="${buttonClass({ tone: danger ? 'danger' : 'primary' }, danger ? 'danger-btn' : 'primary-btn')}">${esc(submitLabel)}</button></footer></form>
    </section>`;
    overlay.appendChild(wrap);
    openDialogs.add(wrap);

    const focusables = (): HTMLElement[] => [...wrap.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')];
    requestAnimationFrame(() => focusables()[0]?.focus());

    let closing = false;
    const finalizeClose = (): void => {
      if (!wrap.isConnected) return;
      openDialogs.delete(wrap);
      wrap.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
    const close = (): void => {
      if (!wrap.isConnected || closing) return;
      closing = true;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (reduced) {
        finalizeClose();
        return;
      }
      wrap.classList.add('is-closing');
      window.setTimeout(finalizeClose, 150);
    };

    wrap.addEventListener('click', (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.target === wrap || target?.closest('.wm-modal-close,.wm-modal-cancel')) close();
    });
    wrap.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const form = wrap.querySelector<HTMLFormElement>('form');
    form?.addEventListener('submit', async (event: SubmitEvent) => {
      event.preventDefault();
      const submit = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      if (!submit || !(event.currentTarget instanceof HTMLFormElement)) return;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      const errorBox = wrap.querySelector<HTMLElement>('[data-modal-error]');
      if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = '';
      }
      try {
        await onSubmit(new FormData(event.currentTarget));
        close();
      } catch (error) {
        const message = errorMessage(error);
        if (errorBox) {
          errorBox.textContent = message;
          errorBox.hidden = false;
          errorBox.focus();
        }
        toast(message, 'warning');
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });

    return Object.freeze({ wrap, close });
  }

  function closeAll(): void {
    for (const wrap of [...openDialogs]) wrap.querySelector<HTMLButtonElement>('.wm-modal-close')?.click();
  }

  return Object.freeze({ open, closeAll, count: () => openDialogs.size });
}
