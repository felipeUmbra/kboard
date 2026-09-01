import { useState } from "react";
import { Modal } from "../Modal";
import type { CustomField, FieldType, PresetOption } from "../../models/types";
import { FIELD_TYPE_META, FIELD_TYPE_ORDER } from "../../models/fieldTypes";
import { FieldForm } from "./FieldForm";

interface Props {
  fields: CustomField[];
  onClose: () => void;
  onAdd: (field: Omit<CustomField, "id">) => string | null;
  onUpdate: (fieldId: string, patch: Partial<CustomField>) => void;
  onRemove: (fieldId: string) => void;
  onAddOption: (fieldId: string, name: string, color: string) => void;
  onUpdateOption: (fieldId: string, optionId: string, patch: Partial<PresetOption>) => void;
  onRemoveOption: (fieldId: string, optionId: string) => void;
}

export function FieldManager(props: Props) {
  const [creating, setCreating] = useState<FieldType | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Modal title="Custom fields" onClose={props.onClose} size="md">
      {creating || editing ? (
        <FieldForm
          initial={editing ? props.fields.find((f) => f.id === editing) ?? null : null}
          initialType={creating ?? undefined}
          onCancel={() => {
            setCreating(null);
            setEditing(null);
          }}
          onSubmit={(f) => {
            if (editing) props.onUpdate(editing, f);
            else props.onAdd(f);
            setCreating(null);
            setEditing(null);
          }}
        />
      ) : (
        <FieldList
          fields={props.fields}
          onCreate={setCreating}
          onEdit={setEditing}
          onRemove={props.onRemove}
        />
      )}
    </Modal>
  );
}

function FieldList({
  fields,
  onCreate,
  onEdit,
  onRemove,
}: {
  fields: CustomField[];
  onCreate: (t: FieldType) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <label className="label">Add a field</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "var(--space-2)",
        }}
      >
        {FIELD_TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className="btn"
            onClick={() => onCreate(t)}
            style={{ flexDirection: "column", alignItems: "flex-start", padding: "var(--space-3)" }}
          >
            <strong style={{ fontSize: "var(--text-base)" }}>{FIELD_TYPE_META[t].label}</strong>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {FIELD_TYPE_META[t].icon}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-5)" }}>
        <label className="label">Existing fields</label>
        {fields.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
            No fields yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {fields.map((f) => (
              <li
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <span style={{ flex: 1, fontWeight: 500 }}>{f.name}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  {FIELD_TYPE_META[f.type].label}
                </span>
                <button type="button" className="btn btn--ghost" onClick={() => onEdit(f.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    if (confirm(`Delete field "${f.name}"? Values on all cards will be removed.`)) {
                      onRemove(f.id);
                    }
                  }}
                  aria-label="Delete field"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
