import { describe, expect, it } from 'vitest';
import type { DailyAction } from '../../domain/dailyActions';
import { actionKey } from './TodayList';

describe('TodayList', () => {
  it('keeps the morning jobs apart from tonight’s when remembering ticks', () => {
    const deliver = (later?: boolean): DailyAction => ({ kind: 'deliver', plans: [], ...(later ? { later } : {}) });
    const fetch = (later?: boolean): DailyAction => ({ kind: 'fetch', trip: 'fish', items: [], plans: [], ...(later ? { later } : {}) });
    expect([deliver(), deliver(true), fetch(), fetch(true)].map(actionKey)).toEqual(['deliver', 'deliver:later', 'fetch:fish', 'fetch:fish:later']);
  });
});
