// Date badge for the card face.
//
// Shows the start/due date as a colored chip. The color reflects how
// imminent the due date is (overdue = danger, ≤7 days = warning,
// >7 days = success, no due date = muted). The icon switches between
// 📅 (regular) and ⚠ (overdue).
//
// Extracted from Card.tsx so CardChips (and any future place that
// needs to render a date badge) can import it without pulling in the
// full Card tree.

export function DateBadge({
  startDate,
  dueDate,
  done = false,
}: {
  startDate: string | null;
  dueDate: string | null;
  /** When true, the card lives in a done/final column and the due
   *  date is no longer treated as a deadline (no overdue flag). */
  done?: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = dueDate ? new Date(dueDate + "T00:00:00") : null;
  const start = startDate ? new Date(startDate + "T00:00:00") : null;
  const msPerDay = 86400000;
  const daysUntilDue = due ? Math.round((due.getTime() - today.getTime()) / msPerDay) : null;

  let color: string;
  let icon: string;
  if (daysUntilDue === null) {
    color = "var(--color-text-muted)";
    icon = "📅";
  } else if (done) {
    // In a done/final column: show the date neutrally, never as overdue.
    color = "var(--color-text-muted)";
    icon = "✓";
  } else if (daysUntilDue < 0) {
    color = "var(--color-danger, #eb5a46)";
    icon = "⚠";
  } else if (daysUntilDue <= 7) {
    color = "var(--color-warning, #f2d600)";
    icon = "⏰";
  } else {
    color = "var(--color-success, #4bce97)";
    icon = "📅";
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  let text: string;
  if (start && due) {
    text = `${fmt(start)} → ${fmt(due)}`;
  } else if (due) {
    text = fmt(due);
  } else if (start) {
    text = `Start ${fmt(start)}`;
  } else {
    return null;
  }

  return (
    <div
      className="kanban-card__date"
      title={
        done
          ? "Completed"
          : daysUntilDue !== null
            ? daysUntilDue < 0
              ? `Overdue by ${-daysUntilDue} day(s)`
              : daysUntilDue === 0
                ? "Due today"
                : `Due in ${daysUntilDue} day(s)`
            : "Start date"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color,
        background: "var(--color-bg-elevated)",
        border: `1px solid ${color}`,
        borderRadius: "var(--radius-sm)",
        alignSelf: "flex-start",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
