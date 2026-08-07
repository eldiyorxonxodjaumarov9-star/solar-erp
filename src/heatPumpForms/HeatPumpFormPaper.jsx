import "./heatPumpFormPrint.css";
import { CompanyContactFooter } from "../commercialOffers/CompanyContactBlock.jsx";
import { UnderlineInput } from "../commercialOffers/OfferPaperParts.jsx";
import { formatSomInput, parseSomInput } from "../commercialOffers/solar/solarOfferPdfUtils.js";
import SystemPowerSelector from "../components/SystemPowerSelector.jsx";
import { DEFAULT_HEAT_PUMP_PRICE } from "./heatPumpFormSchema.js";
import { normalizeSystemPowerCounts } from "./heatPumpSystemPower.js";
import {
  BOILER_OPTIONS,
  BUFFER_TANK_OPTIONS,
  ELECTRIC_SUPPLY_OPTIONS,
  FORM_TITLE,
  HEATING_SYSTEM_OPTIONS,
  INSTALLATION_OPTIONS,
  OBJECT_TYPE_OPTIONS,
  PACKAGE_OPTIONS,
  REFRIGERANT_OPTIONS,
  WIFI_MONITOR_OPTIONS,
} from "./heatPumpFormLayout.js";

function CheckOption({ label, checked, onSelect }) {
  return (
    <button type="button" className="heat-pump-option" onClick={onSelect}>
      <span className="heat-pump-box" aria-hidden>
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Section({ num, title, children }) {
  return (
    <section className="heat-pump-section">
      <p className="heat-pump-section-title">
        {num}. {title}
      </p>
      {children}
    </section>
  );
}

function RadioGroup({ options, value, onChange, grid = false }) {
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

/**
 * A4 blanka — skaner qilingan forma ko'rinishi.
 */
export default function HeatPumpFormPaper({ form, onFieldChange }) {
  return (
    <div id="heat-pump-form-paper" className="heat-pump-paper">
      <h1 className="heat-pump-title">{FORM_TITLE}</h1>

      <Section num={1} title="Tizim quvvati">
        <SystemPowerSelector
          counts={normalizeSystemPowerCounts(form)}
          onChange={(counts) => onFieldChange("systemPowerCounts", counts)}
        />
      </Section>

      <Section num={2} title="Issiqlik nasosi xladagent turi">
        <RadioGroup
          options={REFRIGERANT_OPTIONS}
          value={form.refrigerant}
          onChange={(v) => onFieldChange("refrigerant", v)}
        />
      </Section>

      <Section num={3} title="Elektr ta'minoti">
        <RadioGroup
          options={ELECTRIC_SUPPLY_OPTIONS}
          value={form.electricSupply}
          onChange={(v) => onFieldChange("electricSupply", v)}
        />
      </Section>

      <Section num={4} title="Obyekt turi">
        <RadioGroup
          options={OBJECT_TYPE_OPTIONS}
          value={form.objectType}
          onChange={(v) => onFieldChange("objectType", v)}
        />
        <div className="heat-pump-inline" style={{ marginTop: "3mm" }}>
          <input
            type="text"
            className="heat-pump-underline"
            style={{ width: "55mm" }}
            value={form.otherObject}
            onChange={(e) => onFieldChange("otherObject", e.target.value)}
            disabled={form.objectType !== "Boshqa"}
          />
        </div>
      </Section>

      <Section num={5} title="Isitiladigan maydon">
        <div className="heat-pump-inline">
          <input
            type="text"
            inputMode="decimal"
            className="heat-pump-underline"
            style={{ width: "28mm" }}
            value={form.heatedArea}
            onChange={(e) => onFieldChange("heatedArea", e.target.value)}
          />
          <span>m²</span>
        </div>
      </Section>

      <Section num={6} title="Shift balandligi">
        <div className="heat-pump-inline">
          <input
            type="text"
            inputMode="decimal"
            className="heat-pump-underline"
            style={{ width: "28mm" }}
            value={form.ceilingHeight}
            onChange={(e) => onFieldChange("ceilingHeight", e.target.value)}
          />
          <span>metr</span>
        </div>
      </Section>

      <Section num={7} title="Isitish tizimi">
        <RadioGroup
          options={HEATING_SYSTEM_OPTIONS}
          value={form.heatingSystem}
          onChange={(v) => onFieldChange("heatingSystem", v)}
        />
      </Section>

      <Section num={8} title="Fancoil soni">
        <div className="heat-pump-inline">
          <input
            type="text"
            inputMode="numeric"
            className="heat-pump-underline"
            style={{ width: "28mm" }}
            value={form.fancoilCount}
            onChange={(e) => onFieldChange("fancoilCount", e.target.value)}
          />
          <span>dona</span>
        </div>
      </Section>

      <Section num={9} title="Bufer tank">
        <RadioGroup
          options={BUFFER_TANK_OPTIONS}
          value={form.bufferTank}
          onChange={(v) => onFieldChange("bufferTank", v)}
        />
      </Section>

      <Section num={10} title="Boiler">
        <RadioGroup
          options={BOILER_OPTIONS}
          value={form.boiler}
          onChange={(v) => onFieldChange("boiler", v)}
        />
      </Section>

      <Section num={11} title="Sensorli monitor (WiFi boshqaruv)">
        <RadioGroup
          options={WIFI_MONITOR_OPTIONS}
          value={form.wifiMonitor}
          onChange={(v) => onFieldChange("wifiMonitor", v)}
        />
      </Section>

      <Section num={12} title="Montaj">
        <RadioGroup
          options={INSTALLATION_OPTIONS}
          value={form.installationType}
          onChange={(v) => onFieldChange("installationType", v)}
        />
      </Section>

      <Section num={13} title="Komplekt turi">
        <RadioGroup
          options={PACKAGE_OPTIONS}
          value={form.packageType}
          onChange={(v) => onFieldChange("packageType", v)}
        />
      </Section>

      <Section num={14} title="Narxi">
        <UnderlineInput
          inputMode="numeric"
          value={formatSomInput(form.offerPrice ?? DEFAULT_HEAT_PUMP_PRICE)}
          onChange={(e) =>
            onFieldChange("offerPrice", parseSomInput(e.target.value))
          }
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      <footer className="heat-pump-footer" style={{ marginBottom: "6mm" }}>
        <CompanyContactFooter />
      </footer>

      <footer className="heat-pump-footer">
        <div className="heat-pump-footer-row">
          <p className="heat-pump-footer-label">Mijoz</p>
          <input
            type="text"
            className="heat-pump-underline"
            style={{ width: "70mm", maxWidth: "100%" }}
            value={form.clientName}
            onChange={(e) => onFieldChange("clientName", e.target.value)}
          />
        </div>

        <div className="heat-pump-footer-row">
          <p className="heat-pump-footer-label">Telefon</p>
          <input
            type="text"
            className="heat-pump-underline"
            style={{ width: "70mm", maxWidth: "100%" }}
            value={form.phone}
            onChange={(e) => onFieldChange("phone", e.target.value)}
          />
        </div>

        <div className="heat-pump-footer-row">
          <p className="heat-pump-footer-label">Sana</p>
          <div className="heat-pump-date-row">
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              className="heat-pump-underline"
              style={{ width: "12mm" }}
              value={form.dateDay}
              onChange={(e) => onFieldChange("dateDay", e.target.value)}
            />
            <span>/</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              className="heat-pump-underline"
              style={{ width: "12mm" }}
              value={form.dateMonth}
              onChange={(e) => onFieldChange("dateMonth", e.target.value)}
            />
            <span>/</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              className="heat-pump-underline"
              style={{ width: "18mm" }}
              value={form.dateYear}
              onChange={(e) => onFieldChange("dateYear", e.target.value)}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
