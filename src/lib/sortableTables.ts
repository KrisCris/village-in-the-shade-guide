/** Click-to-sort for server-rendered wiki tables (React tables sort their own state). */
export type SortKey = number | string | null;

/** A cell's sort key: a leading number ("12.5%", "≈22.4", "3 种", "11–20"), else its text; blank or "—" is null. */
export function sortKey(text: string): SortKey {
  const value = text.trim();
  if (!value || /^[—–-]$/.test(value)) return null;
  const number = /^[≈~]?\s*(-?[\d,]*\.?\d+)/.exec(value);
  return number ? Number(number[1].replace(/,/g, '')) : value;
}

/** Numbers before text; empty cells always last, whichever the direction. */
export function compareKeys(a: SortKey, b: SortKey, descending: boolean, collator: Intl.Collator): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const diff = typeof a === 'number' && typeof b === 'number' ? a - b
    : typeof a === 'number' ? -1 : typeof b === 'number' ? 1 : collator.compare(a, b);
  return descending ? -diff : diff;
}

const cellText = (cell: Element | undefined) => cell instanceof HTMLElement ? cell.dataset.sort ?? cell.innerText : '';

/**
 * Turns each header of a simple table (one header row, no colspans) into a sort button.
 * Rows sort within their own tbody; rows with a colspan header (group titles) and rows
 * marked data-sort-pin keep their place at the start or end. The first click on a number
 * column sorts high to low, on a text column A to Z; clicking again flips it.
 */
export function enhanceSortableTables(root: ParentNode, lang: string): void {
  const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
  for (const table of root.querySelectorAll<HTMLTableElement>('main table')) {
    if (table.dataset.sort === 'off' || table.closest('astro-island') || table.tHead?.rows.length !== 1) continue;
    const headers = [...table.tHead.rows[0].cells];
    if (headers.some(cell => cell.colSpan > 1) || [...table.tBodies].some(body => body.querySelector('[rowspan]'))) continue;
    let column = -1, descending = false;
    const sort = (index: number) => {
      const keys = (row: HTMLTableRowElement) => sortKey(cellText(row.cells[index]));
      if (index === column) descending = !descending;
      else {
        column = index;
        const sample = [...table.tBodies].flatMap(body => [...body.rows]).map(keys).find(key => key !== null);
        descending = typeof sample === 'number';
      }
      for (const body of table.tBodies) {
        const rows = [...body.rows];
        const fixed = (row: HTMLTableRowElement) => row.dataset.sortPin !== undefined || !!row.querySelector('th[colspan]');
        const first = rows.findIndex(row => !fixed(row));
        const head = first < 0 ? rows : rows.slice(0, first);
        const tail = rows.filter(row => row.dataset.sortPin === 'end');
        const sorted = rows.filter(row => !head.includes(row) && !tail.includes(row))
          .map(row => ({ row, key: keys(row) }))
          .sort((a, b) => compareKeys(a.key, b.key, descending, collator));
        body.append(...head, ...sorted.map(entry => entry.row), ...tail);
      }
      headers.forEach((cell, i) => {
        if (i === column) cell.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
        else cell.removeAttribute('aria-sort');
        const mark = cell.querySelector('.sort-mark');
        if (mark) mark.textContent = i === column ? (descending ? ' ▼' : ' ▲') : '';
      });
    };
    headers.forEach((cell, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sort-header';
      button.append(...cell.childNodes);
      const mark = document.createElement('span');
      mark.className = 'sort-mark';
      mark.setAttribute('aria-hidden', 'true');
      button.append(mark);
      button.addEventListener('click', () => sort(index));
      cell.append(button);
    });
    table.classList.add('is-sortable');
  }
}
