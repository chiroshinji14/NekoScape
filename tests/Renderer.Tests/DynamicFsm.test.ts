import { describe, expect, it, vi } from 'vitest';
import { DynamicFsm } from '@/core/DynamicFsm';

type TestState = 'IDLE' | 'WANDER' | 'STALK' | 'POUNCE';

interface TestContext {
  log: string[];
  ticks: number;
}

describe('DynamicFsm', () => {
  it('runs enter/update/exit hooks and tracks previousState and stateTime', () => {
    const ctx: TestContext = { log: [], ticks: 0 };

    const fsm = new DynamicFsm<TestState, TestContext>('IDLE', ctx, {
      IDLE: {
        onUpdate: (c, dt, stateTime) => {
          c.ticks++;
          c.log.push(`IDLE:update:${dt.toFixed(2)}:${stateTime.toFixed(2)}`);
        },
        onExit: (c, next) => {
          c.log.push(`IDLE:exit->${next}`);
        },
      },
      WANDER: {
        onEnter: (c, prev) => {
          c.log.push(`WANDER:enter<-${prev}`);
        },
        onUpdate: (c) => {
          c.ticks++;
        },
        onExit: (c, next) => {
          c.log.push(`WANDER:exit->${next}`);
        },
      },
    });

    expect(fsm.state).toBe('IDLE');
    expect(fsm.previousState).toBeNull();
    expect(fsm.stateTime).toBe(0);

    fsm.update(0.25);
    expect(fsm.stateTime).toBeCloseTo(0.25, 5);
    expect(ctx.ticks).toBe(1);

    fsm.transition('WANDER');
    expect(fsm.state).toBe('WANDER');
    expect(fsm.previousState).toBe('IDLE');
    expect(fsm.stateTime).toBe(0);
    expect(ctx.log).toEqual([
      'IDLE:update:0.25:0.25',
      'IDLE:exit->WANDER',
      'WANDER:enter<-IDLE',
    ]);
  });

  it('ignores redundant transitions unless force is true', () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();
    const ctx: TestContext = { log: [], ticks: 0 };

    const fsm = new DynamicFsm<TestState, TestContext>('STALK', ctx);
    fsm.register('STALK', { onEnter, onExit });

    fsm.update(0.4);
    fsm.transition('STALK');
    expect(onExit).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(fsm.stateTime).toBeCloseTo(0.4, 5);

    fsm.transition('STALK', true);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(fsm.previousState).toBe('STALK');
    expect(fsm.stateTime).toBe(0);
  });

  it('keeps stateTime at 0 when onUpdate triggers a transition', () => {
    const ctx: TestContext = { log: [], ticks: 0 };
    const fsm = new DynamicFsm<TestState, TestContext>('STALK', ctx);

    fsm.register('STALK', {
      onUpdate: (_c, _dt, stateTime) => {
        if (stateTime >= 0.5) {
          fsm.transition('POUNCE');
        }
      },
    });
    fsm.register('POUNCE', {});

    fsm.update(0.6);
    expect(fsm.state).toBe('POUNCE');
    expect(fsm.stateTime).toBe(0);
  });
});
