export interface FsmStateHooks<TContext> {
  onEnter?: (ctx: TContext, prevState: string | null) => void;
  onUpdate?: (ctx: TContext, dt: number, stateTime: number) => void;
  onExit?: (ctx: TContext, nextState: string) => void;
}

/**
 * Generic finite state machine tracking elapsed state time and lifecycle hooks.
 */
export class DynamicFsm<TState extends string, TContext> {
  private readonly context: TContext;
  private readonly states = new Map<TState, FsmStateHooks<TContext>>();
  private _state: TState;
  private _previousState: TState | null = null;
  private _stateTime = 0;

  constructor(
    initialState: TState,
    context: TContext,
    states?: Partial<Record<TState, FsmStateHooks<TContext>>>,
  ) {
    this._state = initialState;
    this.context = context;

    if (states) {
      for (const key of Object.keys(states) as TState[]) {
        const hooks = states[key];
        if (hooks) {
          this.states.set(key, hooks);
        }
      }
    }
  }

  register(state: TState, hooks: FsmStateHooks<TContext>): void {
    this.states.set(state, hooks);
  }

  hasState(state: TState): boolean {
    return this.states.has(state);
  }

  getRegisteredStates(): TState[] {
    return Array.from(this.states.keys());
  }

  get state(): TState {
    return this._state;
  }

  get previousState(): TState | null {
    return this._previousState;
  }

  get stateTime(): number {
    return this._stateTime;
  }

  transition(next: TState, force = false): void {
    if (next === this._state && !force) {
      return;
    }

    const prev = this._state;
    const prevHooks = this.states.get(prev);
    prevHooks?.onExit?.(this.context, next);

    this._previousState = prev;
    this._state = next;
    this._stateTime = 0;

    const nextHooks = this.states.get(next);
    nextHooks?.onEnter?.(this.context, prev);
  }

  update(dt: number): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this._stateTime += safeDt;

    const currentHooks = this.states.get(this._state);
    currentHooks?.onUpdate?.(this.context, safeDt, this._stateTime);
  }
}
