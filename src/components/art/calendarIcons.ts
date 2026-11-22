// Line icons for calendar events, drawn on a 24×24 viewBox with round strokes (like the daily planner's icons).
export const CALENDAR_ICONS = {
  /** A paper lantern: festivals. */
  festival: 'M12 2.8v2.2M9 5h6M7.2 8.2C7.2 6.4 9.3 5 12 5s4.8 1.4 4.8 3.2v6.6c0 1.8-2.1 3.2-4.8 3.2s-4.8-1.4-4.8-3.2zM7.2 11.5h9.6M9.5 18v2.7h5V18',
  /** A prize rosette: the Evaluation. */
  fair: 'M12 3.2a5.3 5.3 0 1 1 0 10.6a5.3 5.3 0 1 1 0-10.6zM12 6.3l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3zM9.2 13.2 7.6 20.8l4.4-2.3 4.4 2.3-1.6-7.6',
  /** An envelope: a letter arrives. */
  letter: 'M3.5 6.5h17v11h-17zM3.5 6.5 12 13l8.5-6.5',
  /** An hourglass: the last day of the season. */
  end: 'M7 3.5h10M7 20.5h10M8 3.5v2.8l4 5.7-4 5.7v2.8M16 3.5v2.8l-4 5.7 4 5.7v2.8',
  /** A wrapped gift: birthdays and gift limits. */
  gift: 'M4 9.5h16v3.8H4zM5.5 13.3v7.2h13v-7.2M12 9.5v11M12 9.5C10.6 6.7 7 5.8 7 7.9 7 9.2 9.4 9.5 12 9.5c1.4-2.8 5-3.7 5-1.6 0 1.3-2.4 1.6-5 1.6',
  /** A crescent: a late night. */
  night: 'M18.5 14.6A7.2 7.2 0 1 1 9.4 5.5a5.8 5.8 0 0 0 9.1 9.1z',
  /** A crescent with a stroke through it: no late night. */
  noNight: 'M18.5 14.6A7.2 7.2 0 1 1 9.4 5.5a5.8 5.8 0 0 0 9.1 9.1zM4 4l16 16',
} as const;
export type CalendarIconName = keyof typeof CALENDAR_ICONS;
