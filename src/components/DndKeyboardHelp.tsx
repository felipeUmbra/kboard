// Keyboard shortcut help for drag-and-drop.
//
// WCAG 2.1.1 (Keyboard) is satisfied by dnd-kit's KeyboardSensor, which is
// already wired up in both KanbanDndContext and PlannerDndContext. What was
// missing is discoverability: there is no way for a keyboard user to find out
// that dragging is possible at all, which is the intent of 3.2.1 / 3.3.1 and
// part of 1.3.1 (info and relationships — the shortcut list is a description
// of the widget, so it is wired to the board with aria-describedby).
//
// A native <details> is used rather than a custom disclosure: it is
// keyboard-operable, announces its expanded state, and works before JS runs.

/**
 * The keys the KeyboardSensor is actually configured with, in the order
 * dnd-kit uses them. Keep in sync with `keyboardCodes` in KanbanDndContext.
 *
 * Enter is deliberately NOT a drag key: it opens the card editor, which is
 * the card's primary action. dnd-kit's default binds Enter to start AND end
 * a drag, so the two collided (bug #18) — Space is the drag key throughout.
 */
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Enter", action: "Open the focused card" },
  { keys: "Space", action: "Pick up the focused card" },
  { keys: "Arrow keys", action: "Move it between columns and positions" },
  { keys: "Space", action: "Drop it in the new spot" },
  { keys: "Escape", action: "Cancel the move and return it" },
];

export function DndKeyboardHelp({ id }: { id: string }) {
  return (
    <details className="dnd-help" id={id}>
      <summary className="dnd-help__summary">Keyboard shortcuts</summary>
      <dl className="dnd-help__list">
        {SHORTCUTS.map((s, i) => (
          // The list has two Space entries, so index is the only stable key.
          <div className="dnd-help__row" key={`${s.keys}-${i}`}>
            <dt className="dnd-help__keys">
              <kbd>{s.keys}</kbd>
            </dt>
            <dd className="dnd-help__action">{s.action}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Stable id so the board region can reference this help text. */
export const DND_HELP_ID = "dnd-keyboard-help";
