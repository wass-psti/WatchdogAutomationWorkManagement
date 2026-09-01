import type { OverlayManager } from '../../../../../src/platform/contracts/overlay.ts';
import { createOverlayManager } from '../../../platform/ui/overlay-manager.ts';

/** Board-specific policy adapter over the shared typed overlay manager. */
export function createBoardOverlayCoordinator(): OverlayManager {
  return createOverlayManager({
    scope: 'boards',
    replacementTrigger: (target) => Boolean(target.closest('[data-board-menu-trigger],[data-edit-cell],[data-edit-item-title],[data-rename-column-inline],[data-rename-group-inline],[data-add-column],[data-column-add-right]')),
    underlyingAction: (target) => target instanceof Element
      ? target.closest('[data-open-item],[data-select-item],[data-select-visible],[data-item-drag],[data-group-drag],[data-column-drag],[data-column-resize]')
      : null,
  });
}
