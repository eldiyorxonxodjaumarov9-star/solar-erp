export function Section({ num, title, children }) {
  return (
    <section className="heat-pump-section">
      <p className="heat-pump-section-title">
        {num}. {title}
      </p>
      {children}
    </section>
  );
}

export function CheckOption({ label, checked, onSelect }) {
  return (
    <button type="button" className="heat-pump-option" onClick={onSelect}>
      <span className="heat-pump-box" aria-hidden>
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function RadioGroup({ options, value, onChange, grid = false }) {
  return (
    <div className={grid ? "heat-pump-options heat-pump-options--grid" : "heat-pump-options"}>
      {options.map((opt) => (
        <CheckOption
          key={opt}
          label={opt}
          checked={value === opt}
          onSelect={() => onChange(opt)}
        />
      ))}
    </div>
  );
}

export function UnderlineInput({
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  style,
  disabled,
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      disabled={disabled}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={onChange}
      className="heat-pump-underline"
      style={style}
    />
  );
}

export function UnderlineSelect({ value, onChange, disabled, children, style }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="heat-pump-underline"
      style={style}
    >
      {children}
    </select>
  );
}
