import { describe, expect, it } from 'vitest';
import rewards from '../../data/generated/build-25640656/entities/hunt-rewards.json';
import { huntRewardOdds } from './huntRewards';

const byId = new Map(rewards.map((reward) => [reward.id, reward]));

describe('huntRewardOdds', () => {
  it('gives the pheasant plume 10% per draw and 1 - 0.9^3 per certificate', () => {
    const pheasant = byId.get('HUNT_REWARD_PHEASANT')!;
    expect(pheasant.certificate_item_id).toBe('ITEM_ID_HUNTING_CERTIFICATE_PHEASANT');
    expect(pheasant.draw_count).toBe(3);
    const plume = huntRewardOdds(pheasant).find((entry) => entry.item_id === 'ITEM_ID_HUNTING_PHEASANT_FEATHER')!;
    expect(plume.perDraw).toBeCloseTo(0.1);
    expect(plume.perCertificate).toBeCloseTo(0.271);
  });
  it('keeps the same item at different quantities as separate entries', () => {
    const fangs = huntRewardOdds(byId.get('HUNT_REWARD_WILD_BOAR')!).filter((entry) => entry.item_id === 'ITEM_ID_HUNTING_WILD_BOAR_FANG');
    expect(fangs.map(({ quantity, perDraw }) => [quantity, perDraw])).toEqual([[1, 0.07], [2, 0.03]]);
  });
  it('sums to one draw for every certificate', () => {
    for (const reward of rewards) {
      expect(huntRewardOdds(reward).reduce((sum, entry) => sum + entry.perDraw, 0)).toBeCloseTo(1);
      expect(reward.draw_count).toBeGreaterThan(0);
    }
  });
  it('gives zero chances when there is nothing to draw', () => {
    expect(huntRewardOdds({ draw_count: 3, rewards: [{ item_id: 'ITEM_ID_X', quantity: 1, weight: 0 }] })[0]).toMatchObject({ perDraw: 0, perCertificate: 0 });
    expect(huntRewardOdds({ draw_count: 0, rewards: [{ item_id: 'ITEM_ID_X', quantity: 1, weight: 5 }] })[0]).toMatchObject({ perDraw: 1, perCertificate: 0 });
  });
});
