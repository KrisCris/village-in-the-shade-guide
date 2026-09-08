import type { NodeKind } from "../../domain/workflow/types";

const paths = {
  purchase: "M3 4h2l2 11h11l3-8H6M9 20h.01M18 20h.01",
  inventory: "m3 7 9-4 9 4-9 4-9-4v10l9 4 9-4V7M12 11v10M7 5l10 5",
  plant:
    "M12 21v-9M12 16C4 16 3 12 3 6c6 0 9 3 9 8M12 12c0-6 3-9 9-9 0 6-3 9-9 9",
  process: "M4 21V10l6 3V8l6 3V3h4v18H4ZM8 17h1m4 0h1m3 0h1",
  reserve: "M5 3h14v18l-7-4-7 4V3ZM9 8h6m-6 4h6",
  delivery:
    "M3 8h18v4H3V8ZM5 12v9h14v-9M12 8v13M12 8C4 8 4 1 8 3c2 1 4 5 4 5Zm0 0c8 0 8-7 4-5-2 1-4 5-4 5Z",
  consume: "M4 3v6c0 3 6 3 6 0V3M7 3v18M19 21V3c-5 3-5 10 0 10",
  sale: "M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M9 21v-7h6v7M3 9c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  hand: "M8 13V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 3Z",
  select: "M4 3v17l5-5 4 7 3-2-4-7h8L4 3Z",
  undo: "M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14",
  redo: "m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14",
  copy: "M9 9h12v12H9V9ZM15 5V3H3v12h2",
  paste: "M9 3h6v4H9V3ZM9 5H5v16h14V5h-4",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  link: "m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  fit: "M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6",
  minus: "M5 12h14",
  layout: "M3 4h6v6H3V4Zm12 10h6v6h-6v-6ZM9 7h9v7M6 10v7h9",
  calendar:
    "M5 5h14v16H5V5ZM8 3v4m8-4v4M5 10h14m-10 4h.01M13 14h.01M9 17h.01M13 17h.01",
  chevron: "m8 5 7 7-7 7",
  expand: "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "m21 21-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  check: "m5 12 4 4L19 6",
  repeat:
    "m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3",
  harvest:
    "M5 21 19 7M7 19c-4-2-4-5-3-8 4 1 6 4 3 8Zm4-4c-4-2-4-5-3-8 4 1 6 4 3 8Zm0 0c2 4 5 4 8 3-1-4-4-6-8-3ZM15 11c-2-4 0-7 4-8 1 4 0 7-4 8Z",
  warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
} satisfies Record<NodeKind | string, string>;
export type IconName = keyof typeof paths;
export default function WorkflowIcon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      className="wf-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
