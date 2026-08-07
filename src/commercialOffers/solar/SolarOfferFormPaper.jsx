import "../../heatPumpForms/heatPumpFormPrint.css";
import { REGIONS, canonicalDistrict, districtOptionsForRegion } from "../../data/regionDistricts.js";
import {
  CheckOption,
  Section,
  UnderlineInput,
  UnderlineSelect,
} from "../OfferPaperParts.jsx";
import PanelSelector from "../../components/PanelSelector.jsx";
import InverterSelector from "../../components/InverterSelector.jsx";
import BatterySelector from "../../components/BatterySelector.jsx";
import MetalConstructionSelector from "../../components/MetalConstructionSelector.jsx";
import { CompanyContactFooter } from "../CompanyContactBlock.jsx";
import {
  SOLAR_FORM_TITLE,
  SOLAR_KV_OPTIONS,
  SOLAR_PHASE_OPTIONS,
  formatTodayUz,
} from "./solarOfferLayout.js";
import { computeSolarOffer, DEFAULT_PANEL_POWER, DEFAULT_PROJECT_PRICE, formatSystemKw } from "./solarOfferSchema.js";
import { formatSomInput, parseSomInput } from "./solarOfferPdfUtils.js";

function KvGrid({ value, onChange }) {
  return (
    <div className="heat-pump-options heat-pump-options--grid" style={{ maxWidth: "320px", margin: "0 auto" }}>
      {SOLAR_KV_OPTIONS.map((kv) => (
        <CheckOption
          key={kv}
          label={`${kv} kV`}
          checked={Number(value) === kv}
          onSelect={() => onChange(kv)}
        />
      ))}
    </div>
  );
}

export default function SolarOfferFormPaper({ form, onFieldChange, onRegionChange }) {
  const districts = districtOptionsForRegion(form.region, form.district);
  const calc = computeSolarOffer(form);
  const today = formatTodayUz();

  const handlePanelSelect = (panel) => {
    onFieldChange("panelType", panel.name);
    onFieldChange("panelImage", panel.image);
    onFieldChange("panelLogo", panel.logo);
  };

  const handleInverterSelect = (inverter) => {
    onFieldChange("inverterType", inverter.name);
    onFieldChange("inverterImage", inverter.image);
  };

  const handleBatterySelect = (battery) => {
    if (form.batteryType === battery.name) {
      onFieldChange("batteryType", "");
      onFieldChange("batteryImage", "");
      onFieldChange("batteryCapacity", "");
      return;
    }
    onFieldChange("batteryType", battery.name);
    onFieldChange("batteryImage", battery.image);
  };

  const handleHasBattery = (value) => {
    onFieldChange("hasBattery", value);
    if (value === "no") {
      onFieldChange("batteryType", "");
      onFieldChange("batteryImage", "");
      onFieldChange("batteryCapacity", "");
    }
  };

  const handleMetalConstructionSelect = (construction) => {
    onFieldChange("metalConstruction", construction.name);
    onFieldChange("metalConstructionImage", construction.image);
  };

  return (
    <div id="solar-offer-form-paper" className="heat-pump-paper">
      <h1 className="heat-pump-title">{SOLAR_FORM_TITLE}</h1>

      <Section num={1} title="Mijoz ismi">
        <div className="heat-pump-inline">
          <UnderlineInput
            value={form.clientName}
            onChange={(e) => onFieldChange("clientName", e.target.value)}
            style={{ width: "70mm", maxWidth: "100%" }}
          />
        </div>
      </Section>

      <Section num={2} title="Telefon">
        <UnderlineInput
          value={form.phone}
          onChange={(e) => onFieldChange("phone", e.target.value)}
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      <Section num={3} title="Viloyat">
        <UnderlineSelect
          value={form.region}
          onChange={(e) => onRegionChange(e.target.value)}
          style={{ width: "70mm", maxWidth: "100%" }}
        >
          <option value="">Tanlang</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </UnderlineSelect>
      </Section>

      <Section num={4} title="Tuman">
        <UnderlineSelect
          value={canonicalDistrict(form.district)}
          disabled={!form.region}
          onChange={(e) => onFieldChange("district", canonicalDistrict(e.target.value))}
          style={{ width: "70mm", maxWidth: "100%" }}
        >
          <option value="">{form.region ? "Tanlang" : "Avval viloyat"}</option>
          {districts.map(({ value, label }) => (
            <option key={`${value}-${label}`} value={value}>
              {label}
            </option>
          ))}
        </UnderlineSelect>
      </Section>

      <Section num={5} title="Stansiya quvvati">
        <KvGrid value={form.stationPower} onChange={(v) => onFieldChange("stationPower", v)} />
      </Section>

      <Section num={6} title="Fazasi">
        <div className="heat-pump-options">
          {SOLAR_PHASE_OPTIONS.map((opt) => (
            <CheckOption
              key={opt.value}
              label={opt.label}
              checked={form.phase === opt.value}
              onSelect={() => onFieldChange("phase", opt.value)}
            />
          ))}
        </div>
      </Section>

      <Section num={7} title="Panel turi">
        <PanelSelector
          selectedPanelType={form.panelType}
          onSelect={handlePanelSelect}
        />
      </Section>

      <Section num={8} title="Panel quvvati (W)">
        <UnderlineInput
          inputMode="numeric"
          value={form.panelPower ?? DEFAULT_PANEL_POWER}
          onChange={(e) => {
            const digits = String(e.target.value).replace(/\D/g, "");
            onFieldChange("panelPower", digits ? Number(digits) : "");
          }}
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      <Section num={9} title="Panel soni">
        <UnderlineInput
          inputMode="numeric"
          value={form.panelCount ?? ""}
          onChange={(e) => {
            const digits = String(e.target.value).replace(/\D/g, "");
            onFieldChange("panelCount", digits ? Number(digits) : "");
          }}
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      <Section num={10} title="Inverter turi">
        <InverterSelector
          selectedInverterType={form.inverterType}
          onSelect={handleInverterSelect}
        />
      </Section>

      <Section num={11} title="Akkumulyator">
        <p
          className="heat-pump-section-title"
          style={{ fontSize: "11pt", marginBottom: "3mm", fontWeight: 600 }}
        >
          Akkumulyator bormi?
        </p>
        <div className="heat-pump-options" style={{ maxWidth: "280px", margin: "0 auto 4mm" }}>
          <CheckOption
            label="Ha"
            checked={form.hasBattery === "yes"}
            onSelect={() => handleHasBattery("yes")}
          />
          <CheckOption
            label="Yo‘q"
            checked={form.hasBattery === "no"}
            onSelect={() => handleHasBattery("no")}
          />
        </div>

        {form.hasBattery === "yes" ? (
          <>
            <p
              className="heat-pump-section-title"
              style={{ fontSize: "11pt", marginBottom: "3mm", fontWeight: 600 }}
            >
              Akkumulyator turi
            </p>
            <BatterySelector
              selectedBatteryType={form.batteryType}
              onSelect={handleBatterySelect}
            />
            {form.batteryType ? (
              <div style={{ marginTop: "6mm" }}>
                <p
                  className="heat-pump-section-title"
                  style={{ fontSize: "11pt", marginBottom: "3mm" }}
                >
                  Akkumulyator quvvati
                </p>
                <UnderlineInput
                  value={form.batteryCapacity ?? ""}
                  onChange={(e) => onFieldChange("batteryCapacity", e.target.value)}
                  placeholder="Masalan: 12V 100Ah"
                  style={{ width: "70mm", maxWidth: "100%" }}
                />
              </div>
            ) : null}
          </>
        ) : form.hasBattery === "no" ? (
          <p style={{ textAlign: "center", fontSize: "10.5pt", color: "#64748b", margin: 0 }}>
            Akkumulyatorsiz — keyingi bosqichga o‘ting
          </p>
        ) : null}
      </Section>

      <Section num={12} title="Metall konstruksiya">
        <MetalConstructionSelector
          selectedConstructionType={form.metalConstruction}
          onSelect={handleMetalConstructionSelect}
        />
      </Section>

      <Section num={13} title="Loyiha ishlari narxi">
        <UnderlineInput
          inputMode="numeric"
          value={formatSomInput(form.projectPrice ?? DEFAULT_PROJECT_PRICE)}
          onChange={(e) =>
            onFieldChange("projectPrice", parseSomInput(e.target.value))
          }
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      <Section num={14} title="O'rnatish muddati">
        <UnderlineInput
          value={form.installationPeriod}
          onChange={(e) => onFieldChange("installationPeriod", e.target.value)}
          style={{ width: "70mm", maxWidth: "100%" }}
        />
      </Section>

      {calc.panelPower > 0 && calc.panelCount > 0 ? (
        <section className="heat-pump-section" style={{ marginTop: "6mm" }}>
          <p className="heat-pump-section-title">Hisob-kitob</p>
          <ul
            style={{
              margin: "3mm auto 0",
              padding: 0,
              listStyle: "none",
              fontSize: "11pt",
              lineHeight: 1.65,
              maxWidth: "100%",
            }}
          >
            <li>Panel quvvati: {calc.panelPower} W</li>
            <li>Panel soni: {calc.panelCount} dona</li>
            <li>
              Haqiqiy sistema quvvati: {formatSystemKw(calc.realSystemPower)} kW
            </li>
            <li>
              Yillik ishlab chiqarish:{" "}
              {calc.yearlyProduction.toLocaleString("uz-UZ")} kVt-soat
            </li>
          </ul>
        </section>
      ) : null}

      <footer className="heat-pump-footer">
        <CompanyContactFooter dateLabel={today} />
      </footer>
    </div>
  );
}
