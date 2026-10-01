import { useLayoutEffect, useMemo, useState } from "react";
import { filterSummary } from "../models/filters";
import { todayIso } from "../models/dateValidation";
import type {
  Board,
  CardType,
  CustomField,
  DatePreset,
  FieldFilter,
  FilterState,
} from "../models/types";

/** Which custom field types we offer a filter control for. Text is excluded —
 *  the user asked that title/description/comments not be filterable, and the
 *  same reasoning applies to free-text custom fields. */
const PRESET_LIST = "preset_list";
const BOOLEAN = "boolean";
const NUMBERY = new Set(["number", "percentage"]);

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This week" },
  { value: "next-week", label: "Next week" },
  { value: "next-30-days", label: "Next 30 days" },
  { value: "no-date", label: "No date" },
];

/** Add or remove `value` from `list`, preserving the rest. Shared by every
 *  multi-select control, so the OR-within-one-dimension behaviour is
 *  identical everywhere. */
function toggleIn<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((x) => x !== value)
    : [...current, value];
}

export function FilterMenu({
  board,
  filter,
  onChange,
  onClose,
  anchorRef,
}: {
  board: Board;
  filter: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  onClose: () => void;
  /** The trigger button. The menu is `position: fixed` and positioned from
   *  this rect, so it stays put when the chip row below the trigger grows. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  // The menu is `position: fixed` (see components.css) so its position is not
  // affected by .filter-bar's height changing when chips appear. Position it
  // from the trigger's viewport rect instead.
  //
  // The mobile bottom sheet overrides top/left/right/bottom in CSS, so those
  // inline offsets are applied only above the mobile breakpoint. A media query
  // is the honest check here: we need the CSS's own decision, and duplicating
  // its 640px threshold in JS would let the two drift apart silently.
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    const place = () => {
      if (window.matchMedia("(max-width: 640px)").matches) {
        // Bottom sheet: let the stylesheet own the position.
        setStyle({});
        return;
      }
      const el = anchorRef?.current;
      if (!el) {
        setStyle({});
        return;
      }
      const rect = el.getBoundingClientRect();
      // Clamp to the viewport so the menu can never be pushed off-screen by a
      // trigger near the right edge on a narrow desktop window.
      const width = Math.min(360, window.innerWidth - 32);
      const right = Math.max(16, window.innerWidth - rect.right);
      setStyle({ top: rect.bottom + 8, right, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  const enabledTypes = board.cardTypes.filter((c) => c.enabled);

  // Board-level plus per-type fields. A field id is unique board-wide, so
  // concatenating cannot produce a collision in practice; de-dupe anyway so a
  // field defined at both levels appears once.
  const fields = useMemo(() => {
    const seen = new Set<string>();
    const out: CustomField[] = [];
    for (const f of [...board.customFields, ...board.cardTypes.flatMap((c) => c.customFields)]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    return out.filter((f) => f.type === PRESET_LIST || f.type === BOOLEAN || NUMBERY.has(f.type));
  }, [board]);

  const setFieldFilter = (fieldId: string, patch: Partial<FieldFilter>) => {
    onChange((prev) => {
      const rest = (prev.fieldFilters ?? []).filter((f) => f.fieldId !== fieldId);
      const existing = prev.fieldFilters?.find((f) => f.fieldId === fieldId);
      // Merge over the existing filter for this field so changing a preset
      // option does not wipe a min/max the user already set.
      const merged: FieldFilter = { ...existing, ...patch, fieldId };
      // An entirely empty field filter is dropped, so "no options ticked" does
      // not leave a phantom constraint behind.
      const isEmpty =
        !merged.optionIds?.length &&
        merged.bool === undefined &&
        !merged.num &&
        !merged.date;
      return {
        ...prev,
        fieldFilters: isEmpty ? rest : [...rest, merged],
      };
    });
  };

  const getFieldFilter = (fieldId: string): FieldFilter | undefined =>
    filter.fieldFilters?.find((f) => f.fieldId === fieldId);

  return (
    <div
      className="filter-menu"
      style={style}
      role="dialog"
      aria-label="Filter cards"
      data-testid="filter-menu"
    >
      <div className="filter-menu__header">
        <h2 className="filter-menu__title">Filter cards</h2>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClose}
          aria-label="Close filters"
          data-testid="filter-menu-close"
        >
          ✕
        </button>
      </div>

      <div className="filter-menu__body">
        <Section title="Card type" testId="filter-section-type">
          {enabledTypes.map((cfg) => (
            <Check
              key={cfg.type}
              label={cfg.label}
              checked={filter.cardTypes?.includes(cfg.type) ?? false}
              onChange={() =>
                onChange((p) => ({ ...p, cardTypes: toggleIn<CardType>(p.cardTypes, cfg.type) }))
              }
              testId={`filter-type-${cfg.type}`}
            />
          ))}
        </Section>

        {board.labels.length > 0 && (
          <Section title="Tags" testId="filter-section-labels">
            {board.labels.map((l) => (
              <Check
                key={l.id}
                label={l.name}
                swatch={l.color}
                checked={filter.labelIds?.includes(l.id) ?? false}
                onChange={() =>
                  onChange((p) => ({ ...p, labelIds: toggleIn(p.labelIds, l.id) }))
                }
                testId={`filter-label-${l.id}`}
              />
            ))}
            <p className="filter-menu__hint">
              A card must carry every selected tag.
            </p>
          </Section>
        )}

        <Section title="Column" testId="filter-section-columns">
          {board.columns.map((c) => (
            <Check
              key={c.id}
              label={c.name}
              checked={filter.columnIds?.includes(c.id) ?? false}
              onChange={() =>
                onChange((p) => ({ ...p, columnIds: toggleIn(p.columnIds, c.id) }))
              }
              testId={`filter-column-${c.id}`}
            />
          ))}
        </Section>

        <Section title="Status" testId="filter-section-done">
          <Check
            label="Done"
            checked={filter.done === "done"}
            onChange={() => onChange((p) => ({ ...p, done: p.done === "done" ? undefined : "done" }))}
            testId="filter-done"
          />
          <Check
            label="Not done"
            checked={filter.done === "not-done"}
            onChange={() =>
              onChange((p) => ({ ...p, done: p.done === "not-done" ? undefined : "not-done" }))
            }
            testId="filter-not-done"
          />
        </Section>

        {fields.length > 0 && (
          <Section title="Fields" testId="filter-section-fields">
            {fields.map((f) => (
              <FieldControl
                key={f.id}
                field={f}
                value={getFieldFilter(f.id)}
                onChange={(patch) => setFieldFilter(f.id, patch)}
              />
            ))}
          </Section>
        )}

        <DateSection
          title="Start date"
          testId="filter-section-start"
          value={filter.startDate}
          onChange={(v) => onChange((p) => ({ ...p, startDate: v }))}
        />
        <DateSection
          title="Due date"
          testId="filter-section-due"
          value={filter.dueDate}
          onChange={(v) => onChange((p) => ({ ...p, dueDate: v }))}
        />
      </div>

      <div className="filter-menu__footer">
        <span className="filter-menu__summary" data-testid="filter-menu-summary">
          {filterSummary(board, filter).length} active
        </span>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          data-testid="filter-menu-done"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <fieldset className="filter-menu__section" data-testid={testId}>
      <legend className="filter-menu__legend">{title}</legend>
      <div className="filter-menu__options">{children}</div>
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
  swatch,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  swatch?: string;
  testId: string;
}) {
  return (
    <label className="filter-menu__check">
      <input type="checkbox" checked={checked} onChange={onChange} data-testid={testId} />
      {swatch && (
        <span
          className="filter-menu__swatch"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </label>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: FieldFilter | undefined;
  onChange: (patch: Partial<FieldFilter>) => void;
}) {
  if (field.type === PRESET_LIST) {
    const options = field.options ?? [];
    if (options.length === 0) return null;
    return (
      <fieldset className="filter-menu__fieldgroup" data-testid={`filter-field-${field.id}`}>
        <legend className="filter-menu__legend filter-menu__legend--nested">
          {field.name}
        </legend>
        {options.map((o) => (
          <Check
            key={o.id}
            label={o.name}
            swatch={o.color}
            checked={value?.optionIds?.includes(o.id) ?? false}
            onChange={() =>
              onChange({ optionIds: toggleIn(value?.optionIds, o.id) })
            }
            testId={`filter-field-${field.id}-${o.id}`}
          />
        ))}
      </fieldset>
    );
  }

  if (field.type === BOOLEAN) {
    return (
      <fieldset className="filter-menu__fieldgroup" data-testid={`filter-field-${field.id}`}>
        <legend className="filter-menu__legend filter-menu__legend--nested">
          {field.name}
        </legend>
        <Check
          label="Yes"
          checked={value?.bool === true}
          onChange={() => onChange({ bool: value?.bool === true ? undefined : true })}
          testId={`filter-field-${field.id}-yes`}
        />
        <Check
          label="No"
          checked={value?.bool === false}
          onChange={() => onChange({ bool: value?.bool === false ? undefined : false })}
          testId={`filter-field-${field.id}-no`}
        />
      </fieldset>
    );
  }

  // number / percentage
  const min = value?.num?.min;
  const max = value?.num?.max;
  const commit = (key: "min" | "max", raw: string) => {
    const parsed = raw.trim() === "" ? undefined : Number(raw);
    const num = { ...(value?.num ?? {}) };
    // An unparseable value clears the bound rather than storing NaN, which
    // would silently exclude every card.
    if (parsed === undefined || Number.isNaN(parsed)) delete num[key];
    else num[key] = parsed;
    onChange({ num: Object.keys(num).length ? num : undefined });
  };
  return (
    <fieldset className="filter-menu__fieldgroup" data-testid={`filter-field-${field.id}`}>
      <legend className="filter-menu__legend filter-menu__legend--nested">
        {field.name}
      </legend>
      <div className="filter-menu__range">
        {/* Controlled, not defaultValue: a defaultValue input is frozen at its
            first render, so clearing the menu and reopening it — or undoing a
            bound — would show a stale number that no longer matches the filter
            actually applied. */}
        <input
          type="number"
          className="input"
          placeholder="Min"
          aria-label={`${field.name} minimum`}
          value={min ?? ""}
          onChange={(e) => commit("min", e.target.value)}
          data-testid={`filter-field-${field.id}-min`}
        />
        <span aria-hidden="true">–</span>
        <input
          type="number"
          className="input"
          placeholder="Max"
          aria-label={`${field.name} maximum`}
          value={max ?? ""}
          onChange={(e) => commit("max", e.target.value)}
          data-testid={`filter-field-${field.id}-max`}
        />
        {field.unit && <span className="filter-menu__unit">{field.unit}</span>}
      </div>
    </fieldset>
  );
}

function DateSection({
  title,
  value,
  onChange,
  testId,
}: {
  title: string;
  value: FilterState["startDate"];
  onChange: (v: FilterState["startDate"]) => void;
  testId: string;
}) {
  const today = todayIso();
  return (
    <fieldset className="filter-menu__section" data-testid={testId}>
      <legend className="filter-menu__legend">{title}</legend>
      <div className="filter-menu__options">
        {DATE_PRESETS.map((p) => (
          <Check
            key={p.value}
            label={p.label}
            checked={value?.preset === p.value}
            onChange={() =>
              onChange(value?.preset === p.value ? undefined : { preset: p.value })
            }
            testId={`${testId}-${p.value}`}
          />
        ))}
        <div className="filter-menu__range">
          <label className="filter-menu__inline">
            <span>From</span>
            <input
              type="date"
              className="input"
              min={value?.from}
              value={value?.from ?? ""}
              onChange={(e) => onChange({ ...(value ?? {}), from: e.target.value || undefined, preset: undefined })}
              data-testid={`${testId}-from`}
            />
          </label>
          <label className="filter-menu__inline">
            <span>To</span>
            <input
              type="date"
              className="input"
              min={value?.to ?? today}
              value={value?.to ?? ""}
              onChange={(e) => onChange({ ...(value ?? {}), to: e.target.value || undefined, preset: undefined })}
              data-testid={`${testId}-to`}
            />
          </label>
        </div>
      </div>
    </fieldset>
  );
}
