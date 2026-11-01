export type SaleGiftItem = { item_id: string; fixed: number; weight: number };
export type SaleGift = { count: number; items: SaleGiftItem[] };

/**
 * What the thank-you letter for selling an adult animal holds (livestock.dat SellingInfo).
 *
 * village.exe build 25640656, 0x140117290 (called from 0x1402c5a70, which mails LETTER_ID_SELL_LIVESTOCK): every
 * listed item gives its fixed amount, then count minus the fixed amounts are drawn one at a time, each draw adding
 * one of an item picked with probability weight / sum of weights. See docs/data-evidence/livestock-sale-gifts.md.
 */
export function saleGiftOdds(gift: SaleGift) {
  const draws = Math.max(0, gift.count - gift.items.reduce((sum, item) => sum + item.fixed, 0));
  const total = gift.items.reduce((sum, item) => sum + item.weight, 0);
  const items = gift.items.map((item) => {
    const perDraw = total ? item.weight / total : 0;
    return {
      ...item,
      perDraw,
      min: item.fixed,
      max: item.fixed + (perDraw ? draws : 0),
      average: item.fixed + draws * perDraw,
      /** Chance of receiving at least one. */
      atLeastOne: item.fixed ? 1 : 1 - (1 - perDraw) ** draws,
    };
  });
  return { draws, items };
}
