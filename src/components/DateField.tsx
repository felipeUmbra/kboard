// Date picker with popover, validation, and shortcuts.

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  formatIso,
  parseIso,
  todayIso,
  validateDates,
  type DateIssue,
} from "../models/dateValidation";

export function DateField({
  label,
  value,
  onChange,
  isNewCard = false,
  partnerValue,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  /** If true, an "in the past" start date on a brand-new card becomes an info-level issue. */
  isNewCard?: boolean;
  /** The other date (for cross-validation). */
  partnerValue?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Validation — run live so warnings show as soon as the user picks.
  const issue: DateIssue | null = (() => {
    if (label === "Start date") {
      return validateDates(value, partnerValue ?? null, { isNewCard }).startIssue;
    }
    return validateDates(partnerValue ?? null, value, { isNewCard }).dueIssue;
  })();

  const selected = value ? parseIso(value) ?? undefined : undefined;
  const today = parseIso(todayIso()) ?? undefined;

  const setTo = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className="field-row" ref={containerRef}>
      <label className="label">{label}</label>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className="date-field"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background: "var(--color-surface)",
            border: `1px solid ${
              issue ? "var(--color-warning, #f2d600)" : "var(--color-border)"
            }`,
            borderRadius: "var(--radius-md)",
            color: "var(--color-text)",
            fontSize: "var(--text-sm)",
            minWidth: 160,
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true">📅</span>
            {value ? (
              formatHuman(value)
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>—</span>
            )}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                setTo(null);
              }}
              aria-label="Clear date"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                padding: "0 2px",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </span>
          )}
        </button>

        {open && (
          <div
            role="dialog"
            aria-label={`Pick ${label.toLowerCase()}`}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 50,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              padding: 8,
            }}
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => setTo(d ? formatIso(d) : null)}
              showOutsideDays
              weekStartsOn={1}
              defaultMonth={selected ?? new Date()}
            />
            <div
              style={{
                display: "flex",
                gap: 4,
                marginTop: 4,
                paddingTop: 4,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setTo(todayIso())}
                style={{ flex: 1, fontSize: "var(--text-xs)" }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setTo(nextMondayIso())}
                style={{ flex: 1, fontSize: "var(--text-xs)" }}
              >
                Next Mon
              </button>
              {value && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setTo(null)}
                  style={{
                    flex: 1,
                    fontSize: "var(--text-xs)",
                    color: "var(--color-danger, #eb5a46)",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <input type="hidden" value={value ?? ""} aria-hidden tabIndex={-1} readOnly />
            <input
              type="hidden"
              value={today?.toISOString() ?? ""}
              aria-hidden
              tabIndex={-1}
              readOnly
            />
          </div>
        )}
      </div>
      {issue && (
        <div
          className={`validation-msg validation-msg--${issue.level}`}
          role={issue.level === "warning" ? "alert" : "status"}
          style={{
            marginTop: 4,
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)",
            background:
              issue.level === "warning"
                ? "rgba(242, 214, 0, 0.15)"
                : "rgba(0, 121, 191, 0.10)",
            color:
              issue.level === "warning"
                ? "#8a6d00"
                : "var(--color-accent)",
            border: `1px solid ${
              issue.level === "warning"
                ? "rgba(242, 214, 0, 0.4)"
                : "rgba(0, 121, 191, 0.25)"
            }`,
          }}
        >
          {issue.message}
        </div>
      )}
    </div>
  );
}

/** "Sep 15" / "Sep 15, 2026" if a different year. */
function formatHuman(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function nextMondayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  return formatIso(d);
}