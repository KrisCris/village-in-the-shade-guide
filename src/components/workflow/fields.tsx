import { useEffect, useId, useMemo, useRef, useState } from "react";
import { withBase } from "../../lib/sitePath";
import WorkflowIcon from "./WorkflowIcon";
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = entities.find((e) => e.id === value);
  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    return entities
      .filter(
        (e) =>
          !q || normalizeSearch(e.searchText || e.name.zh_hans).includes(q),
      );
  }, [entities, query]);
  const options = matches.slice(0, 80);
  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    panel?.showModal();
    input.current?.focus();
    return () => {
      panel?.close();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="wf-picker">
      <label className="wf-picker-label" id={`${id}-label`}>
        {label}
      </label>
      <button
        type="button"
        className="wf-picker-trigger"
        ref={trigger}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        onClick={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
      >
        {selected?.icon_path && (
          <img
            src={withBase(selected.icon_path)}
            width={24}
            height={24}
            alt=""
          />
        )}
        <span id={`${id}-value`}>
          {selected?.name.zh_hans ?? "搜索并选择…"}
        </span>
        <WorkflowIcon name="chevron" size={13} />
      </button>
      {open && (
        <dialog
          ref={dialog}
          id={`${id}-dialog`}
          className="wf-picker-dialog"
          aria-labelledby={`${id}-title`}
          onCancel={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom) setOpen(false);
          }}
        >
          <header className="wf-picker-heading">
            <div>
              <h2 id={`${id}-title`}>选择{label === "快速添加的作物" ? "作物" : label}</h2>
              <span>点击一项即可选用，支持名称和拼音搜索</span>
            </div>
            <button type="button" aria-label="关闭选择面板" onClick={() => setOpen(false)}>
              <WorkflowIcon name="close" size={20} />
            </button>
          </header>
          <div className="wf-picker-search">
            <WorkflowIcon name="search" size={20} />
          <input
            ref={input}
            role="combobox"
            aria-label={`搜索${label}`}
            aria-expanded="true"
            aria-controls={`${id}-options`}
            aria-autocomplete="list"
            aria-activedescendant={
              options[active] ? `${id}-${active}` : undefined
            }
            placeholder="输入名称 / 拼音"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    active + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                );
                setActive(next);
                document
                  .getElementById(`${id}-${next}`)
                  ?.scrollIntoView({ block: "nearest" });
              }
              if (e.key === "Enter" && options[active]) {
                e.preventDefault();
                choose(options[active].id);
              }
            }}
          />
          </div>
          <div className="wf-picker-summary" role="status">
            <span>{query ? `找到 ${matches.length} 项` : `共 ${entities.length} 项`}</span>
            {selected && <span>当前选择：{selected.name.zh_hans}</span>}
          </div>
          <div
            className="wf-picker-options"
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
          >
            {options.map((e, i) => (
              <button
                key={e.id}
                id={`${id}-${i}`}
                className={i === active ? "active" : ""}
                type="button"
                role="option"
                aria-selected={e.id === value}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(e.id)}
              >
                {e.icon_path ? (
                  <img
                    src={withBase(e.icon_path)}
                    width={36}
                    height={36}
                    alt=""
                  />
                ) : (
                  <WorkflowIcon name="inventory" size={20} />
                )}
                <span>{e.name.zh_hans}</span>
                {e.id === value && <WorkflowIcon name="check" size={13} />}
              </button>
            ))}
            {!options.length && <p className="wf-note">没有匹配的项目</p>}
          </div>
          <footer className="wf-picker-footer">
            <span>{matches.length > 80 ? "显示前 80 项，搜索可查找其余项目" : "↑ ↓ 选择 · Enter 确认"}</span>
            <span>Esc 关闭</span>
          </footer>
        </dialog>
      )}
    </div>
  );
}
