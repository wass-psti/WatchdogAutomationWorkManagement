import type { EmbeddedLifecycleEvent, EmbeddedLifecycleState } from '../../../src/platform/contracts/embedded-module.ts';

export class EmbeddedLifecycleTransitionError extends Error {
  readonly state: EmbeddedLifecycleState;
  readonly event: EmbeddedLifecycleEvent;
  constructor(state: EmbeddedLifecycleState, event: EmbeddedLifecycleEvent) {
    super(`Invalid embedded-module lifecycle transition: ${state.kind} -> ${event.type}.`);
    this.name = 'EmbeddedLifecycleTransitionError';
    this.state = state;
    this.event = event;
  }
}

export function transitionEmbeddedLifecycle(state: EmbeddedLifecycleState, event: EmbeddedLifecycleEvent): EmbeddedLifecycleState {
  if (event.type === 'initialize') {
    return Object.freeze({ kind: 'initializing', generation: state.generation + 1, moduleId: event.moduleId });
  }
  if (event.type === 'dispose') {
    return Object.freeze({ kind: 'disposed', generation: state.generation, moduleId: state.moduleId });
  }
  if (!state.moduleId) throw new EmbeddedLifecycleTransitionError(state, event);
  switch (event.type) {
    case 'ready':
      if (state.kind !== 'initializing' && state.kind !== 'suspended') throw new EmbeddedLifecycleTransitionError(state, event);
      return Object.freeze({ kind: 'ready', generation: state.generation, moduleId: state.moduleId });
    case 'suspend':
      if (state.kind !== 'ready') throw new EmbeddedLifecycleTransitionError(state, event);
      return Object.freeze({ kind: 'suspended', generation: state.generation, moduleId: state.moduleId, reason: event.reason });
    case 'resume':
      if (state.kind !== 'suspended') throw new EmbeddedLifecycleTransitionError(state, event);
      return Object.freeze({ kind: 'ready', generation: state.generation, moduleId: state.moduleId });
    case 'fail':
      if (state.kind === 'disposed' || state.kind === 'uninitialized') throw new EmbeddedLifecycleTransitionError(state, event);
      return Object.freeze({ kind: 'failed', generation: state.generation, moduleId: state.moduleId, message: event.message });
  }
}
