export type MotionInputMode = 'coarse' | 'fine';
export type MotionIndicatorMode = 'vertical' | 'horizontal';
export type MotionTransitionKind = 'route' | 'state' | string;
export type MotionPulseTone = 'neutral' | 'success' | string;
export type MotionScope = Document | Element;

export interface MotionExitOptions {
  readonly selector?: string;
  readonly kind?: MotionTransitionKind;
  readonly duration?: number;
}

export interface WorkManagementMotionApi {
  readonly version: string;
  reduced(): boolean;
  inputMode(): MotionInputMode;
  exitThen(update: () => void, options?: MotionExitOptions): Promise<boolean>;
  cancelTransitions(): void;
  pulse(element: HTMLElement, tone?: MotionPulseTone): void;
  enhance(scope?: MotionScope): void;
  refreshIndicators(scope?: MotionScope): void;
  nextFrame(): Promise<void>;
  wait(ms: number): Promise<void>;
}
