import { useMemo, useState } from "react";
import type { Entity } from "../../data/types";
import { normalizeSearch } from "../../data/clientSearch";

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="wf-field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n))
            onChange(Math.min(max, Math.max(min, Math.floor(n))));
        }}
      />
    </label>
  );
}
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const year = Math.floor((value - 1) / 112) + 1,
    season = Math.floor(((value - 1) % 112) / 28),
    day = ((value - 1) % 28) + 1;
  return (
    <fieldset className="wf-date">
      <legend>{label}</legend>
      <label>
        <span className="wf-sr">{label}年份</span>
        <input
          aria-label={`${label}年份`}
          type="number"
          min={1}
          max={100}
          value={year}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n))
              onChange(
                (Math.max(1, Math.min(100, Math.floor(n))) - 1) * 112 +
                  season * 28 +
                  day,
              );
          }}
        />
      </label>
      <span>年</span>
      <select
        aria-label={`${label}季节`}
        value={season}
        onChange={(e) =>
          onChange((year - 1) * 112 + Number(e.target.value) * 28 + day)
        }
      >
        {["春", "夏", "秋", "冬"].map((s, i) => (
          <option key={s} value={i}>
            {s}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label}日`}
        value={day}
        onChange={(e) =>
          onChange((year - 1) * 112 + season * 28 + Number(e.target.value))
        }
      >
        {Array.from({ length: 28 }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1} 日
          </option>
        ))}
      </select>
    </fieldset>
  );
}
export function EntityPicker({
  label,
  entities,
  value,
  onChange,
}: {
  label: string;
  entities: Entity[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const q = normalizeSearch(query);
    const found = entities
      .filter(
        (e) =>
          !q || normalizeSearch(e.searchText || e.name.zh_hans).includes(q),
      )
      .slice(0, 80);
    const selected = entities.find((e) => e.id === value);
    return selected && !found.some((e) => e.id === value)
      ? [selected, ...found]
      : found;
  }, [entities, query, value]);
  return (
    <div className="wf-picker">
      <label className="wf-field">
        搜索{label}
        <input
          aria-label={`搜索${label}`}
          value={query}
          placeholder="名称 / 拼音"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="wf-field">
        {label}
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name.zh_hans}
            </option>
          ))}
        </select>
      </label>
      {options.length >= 80 && <small>显示前 80 项，可搜索缩小范围</small>}
    </div>
  );
}
