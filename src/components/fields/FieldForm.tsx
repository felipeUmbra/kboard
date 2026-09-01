import { useState } from "react";
import { COLOR_PALETTE, type CustomField, type FieldType, type PresetOption } from "../../models/types";

export function FieldForm({
  initial,
  initialType,
  onCancel,
  onSubmit,
}: {
  initial: CustomField | null;
  initialType?: FieldType;
  onCancel: () => void;
  onSubmit: (f: Omit<CustomField, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<FieldType>(initial?.type ?? initialType ?? "short_text");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [decimals, setDecimals] = useState<number>(initial?.decimals ?? 0);
  const [options, setOptions] = useState<PresetOption[]>(initial?.options ?? []);
  const [newOptName, setNewOptName] = useState("");
  const [newOptColor, setNewOptColor] = useState<string>(COLOR_PALETTE[0].value);

  const isNumberish = type === "number" || type === "percentage";
  const canSubmit = !!name.trim() && (type !== "preset_list" || options.length > 0);

  return (
    <div>
      <div className="field-row">
        <label className="label" htmlFor="fld-name">Field name</label>
        <input
          id="fld-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Budget, Priority, Due date"
          maxLength={60}
        />
      </div>

      {!initial && (
        <div className="field-row">
          <label className="label" htmlFor="fld-type">Type</label>
          <select
            id="fld-type"
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
          >
            <option value="short_text">Short text</option>
            <option value="long_text">Long text</option>
            <option value="number">Number</option>
            <option value="percentage">Percentage</option>
            <option value="boolean">Checkbox</option>
            <option value="date">Date</option>
            <option value="preset_list">Preset list</option>
          </select>
        </div>
      )}

      {isNumberish && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          {type === "number" && (
            <div className="field-row">
              <label className="label" htmlFor="fld-unit">Unit (optional)</label>
              <input
                id="fld-unit"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. h, $, kg"
                maxLength={8}
              />
            </div>
          )}
          <div className="field-row">
            <label className="label" htmlFor="fld-dec">Decimals</label>
            <input
              id="fld-dec"
              className="input"
              type="number"
              min={0}
              max={4}
              value={decimals}
              onChange={(e) => setDecimals(Math.max(0, Math.min(4, Number(e.target.value) || 0)))}
            />
          </div>
        </div>
      )}
      {type === "preset_list" && (
        <PresetOptionsEditor
          options={options}
          setOptions={setOptions}
          newOptName={newOptName}
          setNewOptName={setNewOptName}
          newOptColor={newOptColor}
          setNewOptColor={setNewOptColor}
        />
      )}

      <FormFooter
        onCancel={onCancel}
        canSubmit={canSubmit}
        onSubmit={() => {
          const field: Omit<CustomField, "id"> = {
            name: name.trim(),
            type,
            decimals: isNumberish ? decimals : undefined,
            unit: type === "number" ? unit || undefined : undefined,
            options: type === "preset_list" ? options : undefined,
          };
          onSubmit(field);
        }}
        isEdit={!!initial}
      />
    </div>
  );
}

function PresetOptionsEditor({
  options,
  setOptions,
  newOptName,
  setNewOptName,
  newOptColor,
  setNewOptColor,
}: {
  options: PresetOption[];
  setOptions: React.Dispatch<React.SetStateAction<PresetOption[]>>;
  newOptName: string;
  setNewOptName: React.Dispatch<React.SetStateAction<string>>;
  newOptColor: string;
  setNewOptColor: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="field-row">
      <label className="label">Options</label>
      {options.length === 0 && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
          Add at least one option.
        </p>
      )}
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {options.map((o) => (
          <li
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <input
              className="input"
              value={o.name}
              onChange={(e) =>
                setOptions((prev) =>
                  prev.map((p) => (p.id === o.id ? { ...p, name: e.target.value } : p)),
                )
              }
              style={{ flex: 1 }}
            />
            <input
              type="color"
              value={o.color}
              onChange={(e) =>
                setOptions((prev) =>
                  prev.map((p) => (p.id === o.id ? { ...p, color: e.target.value } : p)),
                )
              }
              aria-label="Color"
              style={{ width: 32, height: 32, padding: 0, border: "none", background: "transparent" }}
            />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setOptions((prev) => prev.filter((p) => p.id !== o.id))}
              aria-label="Remove option"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <input
          className="input"
          value={newOptName}
          onChange={(e) => setNewOptName(e.target.value)}
          placeholder="Option name"
          style={{ flex: 1 }}
        />
        <select
          className="select"
          value={newOptColor}
          onChange={(e) => setNewOptColor(e.target.value)}
          style={{ width: 120 }}
        >
          {COLOR_PALETTE.map((c) => (
            <option key={c.id} value={c.value}>{c.id}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!newOptName.trim()}
          onClick={() => {
            if (!newOptName.trim()) return;
            setOptions((prev) => [
              ...prev,
              { id: Math.random().toString(36).slice(2), name: newOptName.trim(), color: newOptColor },
            ]);
            setNewOptName("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function FormFooter({
  onCancel,
  canSubmit,
  onSubmit,
  isEdit,
}: {
  onCancel: () => void;
  canSubmit: boolean;
  onSubmit: () => void;
  isEdit: boolean;
}) {
  return (
    <div className="modal__footer" style={{ marginTop: "var(--space-5)" }}>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn--primary"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {isEdit ? "Save changes" : "Create field"}
      </button>
    </div>
  );
}
