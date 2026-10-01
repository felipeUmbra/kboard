import { useEffect, useRef, useState } from "react";
import { useViewState } from "../state/viewState";
import { useBoard } from "../state/BoardContext";
import { filterSummary } from "../models/filters";
import type { FilterState, SavedView } from "../models/types";

/**
 * Saved-view menu for the board toolbar, next to the filter trigger.
 *
 * Views are board-scoped (`Board.savedViews`) — there are no global views, so
 * everything here reads the active board and nothing needs to resolve ids
 * across boards.
 *
 * The save semantics follow the plan: when a view is active and the filter has
 * been edited, the primary action is "Update view — <name>", never "Save as
 * new". That distinction is driven by `isDirty`, which `viewState` computes by
 * comparing the live filter against the one the active view was applied with.
 *
 * Filters are the only thing a view stores (sort order is explicitly out of
 * scope), and search text is deliberately NOT saved — a view is a filter, not a
 * query.
 */
export function SavedViewsMenu({ anchorRef }: { anchorRef?: React.RefObject<HTMLElement | null> }) {
  const { activeBoard, saveView, updateView, renameView, deleteView } = useBoard();
  const {
    filter,
    setFilter,
    clearFilter,
    activeViewId,
    setActiveViewId,
    setBaseFilter,
    isDirty,
  } = useViewState();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "save" | "rename">("idle");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const views: SavedView[] = activeBoard?.savedViews ?? [];
  const active = views.find((v) => v.id === activeViewId) ?? null;
  const canSave = Object.keys(filter).length > 0;

  const close = (refocus = true) => {
    setOpen(false);
    setMode("idle");
    setName("");
    setError(null);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus into the name input so the save/rename flow is keyboard-first.
  useEffect(() => {
    if (mode === "save" || mode === "rename") inputRef.current?.focus();
  }, [mode]);

  /** Apply a view: set the filter, remember what it was applied from, and mark
   *  it active so `isDirty` can later detect edits. */
  const applyView = (view: SavedView) => {
    setFilter(view.filter);
    setBaseFilter(view.filter);
    setActiveViewId(view.id);
    close();
  };

  /** Leave the view but keep whatever filter is on screen. */
  const clearView = () => {
    setActiveViewId(null);
    setBaseFilter(null);
    close();
  };

  const clearEverything = () => {
    setActiveViewId(null);
    setBaseFilter(null);
    clearFilter();
    close();
  };

  const submitSave = () => {
    // In a view with unsaved edits, save updates THAT view. A pristine view
    // (or no view) creates a new one.
    if (active && isDirty) {
      updateView(active.id, filter);
      setBaseFilter(filter);
      setError(null);
      close();
      return;
    }
    const result = saveView(name, filter);
    if (result.error || !result.viewId) {
      setError(result.error ?? "Could not save view.");
      return;
    }
    setActiveViewId(result.viewId);
    setBaseFilter(filter);
    close();
  };

  const submitRename = () => {
    if (!active) return;
    const err = renameView(active.id, name);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    close();
  };

  return (
    <div className="saved-views">
      <button
        type="button"
        ref={triggerRef}
        className="btn btn--ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="views-trigger"
      >
        <span aria-hidden="true">▾</span> Views
        {active && (
          <span className="filter-bar__badge" data-testid="views-active-name">
            {active.name}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="filter-bar__backdrop"
            onClick={() => close()}
            data-testid="views-backdrop"
          />
          <div
            className="saved-views__menu"
            role="dialog"
            aria-label="Saved views"
            data-testid="views-menu"
            ref={listRef}
          >
            {views.length === 0 && mode === "idle" && (
              <p className="saved-views__empty">
                No saved views yet. Filter the board, then save it here.
              </p>
            )}

            {mode === "idle" && (
              <>
                <ul className="saved-views__list" data-testid="views-list">
                  {views.map((v) => {
                    const summary = filterSummary(activeBoard!, v.filter);
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          className="saved-views__item"
                          data-active={v.id === activeViewId ? "true" : "false"}
                          data-testid={`view-item-${v.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            applyView(v);
                          }}
                        >
                          <span className="saved-views__item-name">{v.name}</span>
                          <span className="saved-views__item-meta">
                            {summary.length ? summary.join(", ") : "All cards"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="saved-views__rename"
                          aria-label={`Rename ${v.name}`}
                          data-testid={`view-rename-${v.id}`}
                          onClick={(e) => {
                            // The backdrop is a sibling that closes on click;
                            // without this the form would open and the same
                            // click would immediately close the menu.
                            e.stopPropagation();
                            setMode("rename");
                            setName(v.name);
                            setError(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="saved-views__delete"
                          aria-label={`Delete ${v.name}`}
                          data-testid={`view-delete-${v.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeViewId === v.id) {
                              setActiveViewId(null);
                              setBaseFilter(null);
                            }
                            deleteView(v.id);
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="saved-views__footer">
                  {active && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={clearView}
                      data-testid="views-clear-view"
                    >
                      All cards
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={clearEverything}
                    data-testid="views-clear-all"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!canSave}
                    onClick={() => {
                      setMode("save");
                      setName(active ? `${active.name} (edited)` : "");
                      setError(null);
                    }}
                    data-testid="views-save"
                  >
                    {active && isDirty ? `Update view — ${active.name}` : "Save as new…"}
                  </button>
                </div>
              </>
            )}

            {(mode === "save" || mode === "rename") && (
              <form
                className="saved-views__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mode === "save") submitSave();
                  else submitRename();
                }}
              >
                <label className="saved-views__label" htmlFor="saved-view-name">
                  {mode === "save" ? "View name" : "Rename view"}
                </label>
                <input
                  id="saved-view-name"
                  ref={inputRef}
                  className="saved-views__input"
                  value={name}
                  maxLength={60}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  data-testid="views-name-input"
                />
                {error && (
                  <p className="saved-views__error" role="alert" data-testid="views-error">
                    {error}
                  </p>
                )}
                <div className="saved-views__form-actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => close()}
                    data-testid="views-cancel"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" data-testid="views-submit">
                    {mode === "save" ? "Save view" : "Rename"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}