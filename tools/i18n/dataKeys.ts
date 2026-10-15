/**
 * Authored strings that reach t() from data files rather than literals.
 * Each entry lists the source strings a page or module translates at run
 * time; keep it in step with the call sites named below.
 */
import nightExchanges from '../../data/sources/game-night-exchanges.json';
import kappa from '../../data/sources/game-kappa-exchange.json';

const hasCjk = (value: string) => /[぀-ヿ㐀-鿿]/.test(value);

/** Also shipped to the browser: relations.ts runs in islands. */
export function extraDataKeys(): string[] {
  return [
    // src/pages/guides/night-preparation.astro, src/domain/relations.ts
    ...nightExchanges.exchanges.flatMap((exchange) => [exchange.name, exchange.reward_mode, exchange.condition]),
    ...kappa.rewards.map((reward) => reward.condition),
    kappa.condition,
  ].filter(hasCjk);
}
