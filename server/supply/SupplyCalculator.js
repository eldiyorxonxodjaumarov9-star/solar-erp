/**
 * SupplyCalculator — formulalar (narxlar repository dan).
 *
 * panelCount = ceil(systemKW * 1000 / panelPower)
 * metalMeter = panelCount * metal_meter_per_panel
 * mc4 = panelCount * mc4_per_panel
 * ortaShayba = panelCount
 * chekkaShayba = chekka_shayba_fixed (default 15)
 * kabel = systemKW * cable_meter_per_kw
 * surge = surge_qty
 * dc breaker qty = ceil(panelCount / panels_per_pv_string)
 */
function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ruleNum(rules, key, fallback = null) {
  const v = rules?.[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bySubtype(list, subtype) {
  return (list || []).find((x) => x.subtype === subtype) || null;
}

function line(name, qty, unitPrice, unitLabel = "dona") {
  const quantity = Number(qty) || 0;
  const unit = Number(unitPrice);
  if (!Number.isFinite(unit)) {
    throw new Error(`Narx topilmadi: ${name}`);
  }
  return {
    name,
    quantity,
    unitLabel,
    unitPrice: money(unit),
    total: money(quantity * unit),
  };
}

export class SupplyCalculator {
  /**
   * @param {object} catalog — SupplyRepository.load()
   */
  constructor(catalog) {
    this.catalog = catalog;
  }

  calcPanelCount(systemKw, panelPowerW) {
    const mode = this.catalog.rules?.panel_count_mode || "ceil";
    const raw = (Number(systemKw) * 1000) / Number(panelPowerW);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return mode === "floor" ? Math.max(1, Math.floor(raw)) : Math.max(1, Math.ceil(raw));
  }

  /**
   * @param {object} input
   */
  calculate(input = {}) {
    const cat = this.catalog;
    if (!cat?.ok) {
      return { ok: false, error: cat?.error || "Taminot ma’lumotlar bazasi topilmadi" };
    }

    const systemKw = Number(input.requestedSystemKw) || Number(input.systemKw) || 0;
    if (systemKw < 1 || systemKw > 100) {
      return { ok: false, error: "Tizim quvvati 1–100 kW oralig‘ida bo‘lishi kerak" };
    }

    const panel = (cat.panels || []).find((p) => p.id === input.panelId);
    if (!panel) return { ok: false, error: "Panel tanlanmadi" };
    if (panel.price == null) return { ok: false, error: "Panel narxi data/supply da yo‘q" };

    const inverter = (cat.inverters || []).find((i) => i.id === input.inverterId);
    if (!inverter) return { ok: false, error: "Inverter tanlanmadi" };
    if (inverter.price == null) return { ok: false, error: "Inverter narxi data/supply da yo‘q" };
    if (Number(inverter.powerKw) < systemKw) {
      return {
        ok: false,
        error: `Inverter quvvati tizimdan kichik bo‘lmasligi kerak (≥ ${systemKw} kW)`,
      };
    }

    const rules = cat.rules || {};
    const panelCount = this.calcPanelCount(systemKw, panel.powerW);
    const panelsLine = line(panel.name, panelCount, panel.price, "dona");

    const metalRequired = Boolean(input.metalConstructionRequired);
    let metalLine = null;
    if (metalRequired) {
      const metersPerPanel = ruleNum(rules, "metal_meter_per_panel", null);
      const metalPrice = cat.metal?.price;
      if (metersPerPanel == null || metalPrice == null) {
        return { ok: false, error: "Metal narxi/qoidasi data/supply da yo‘q" };
      }
      const meters = panelCount * metersPerPanel;
      metalLine = line("Metal konstruktsiya", meters, metalPrice, "metr");
    }

    const inverterLine = line(inverter.name, 1, inverter.price, "dona");

    const ac = bySubtype(cat.breakers, "ac");
    const dc = bySubtype(cat.breakers, "dc");
    const surge = bySubtype(cat.breakers, "surge");
    const cable = (cat.cables || [])[0];
    const perString = ruleNum(rules, "panels_per_pv_string", null);
    const cablePerKw = ruleNum(rules, "cable_meter_per_kw", null);
    const surgeQty = ruleNum(rules, "surge_qty", null);
    const acQty = ruleNum(rules, "ac_breaker_qty", null);

    if (!ac || !dc || !surge || !cable) {
      return { ok: false, error: "Breaker/kabel mahsulotlari data/supply da to‘liq emas" };
    }
    if (perString == null || cablePerKw == null || surgeQty == null || acQty == null) {
      return { ok: false, error: "Hisoblash qoidalari settings.json da yo‘q" };
    }

    const dcQty = Math.max(1, Math.ceil(panelCount / perString));
    const cableM = Math.round(systemKw * cablePerKw);

    const breakers = [
      line(ac.name, acQty, ac.price, ac.unit || "dona"),
      line(dc.name, dcQty, dc.price, dc.unit || "dona"),
      line(cable.name, cableM, cable.price, cable.unit || "metr"),
      line(surge.name, surgeQty, surge.price, surge.unit || "dona"),
    ];

    const mc4Per = ruleNum(rules, "mc4_per_panel", 1);
    const ortaPer = ruleNum(rules, "orta_shayba_per_panel", 1);
    const chekkaFixed = ruleNum(rules, "chekka_shayba_fixed", 15);
    const mc4 = bySubtype(cat.accessories, "mc4");
    const orta = bySubtype(cat.accessories, "orta_shayba");
    const chekka = bySubtype(cat.accessories, "chekka_shayba");
    if (!mc4 || !orta || !chekka) {
      return { ok: false, error: "Aksessuarlar data/supply da to‘liq emas" };
    }

    const accessories = [
      line(mc4.name, panelCount * mc4Per, mc4.price, "dona"),
      line(orta.name, panelCount * ortaPer, orta.price, "dona"),
      line(chekka.name, chekkaFixed, chekka.price, "dona"),
    ];

    let batteryLine = null;
    let batteryConfig = null;
    const needsBattery =
      inverter.type === "hybrid" || inverter.type === "offgrid";
    if (needsBattery && input.batteryRequired) {
      const bat = (cat.batteries || []).find((b) => b.id === input.batteryId);
      if (!bat) return { ok: false, error: "Akkumulyator tanlanmadi" };
      if (bat.price == null) return { ok: false, error: "Akkumulyator narxi yo‘q" };
      const count = Math.max(1, Number(input.batteryCount) || 1);
      batteryLine = line(bat.name, count, bat.price, "dona");
      batteryConfig = { ...bat, count };
    }

    const parts = [
      panelsLine.total,
      metalLine?.total || 0,
      inverterLine.total,
      ...breakers.map((b) => b.total),
      ...accessories.map((a) => a.total),
      batteryLine?.total || 0,
    ];
    const totalUsd = money(parts.reduce((s, n) => s + n, 0));
    const exchangeRate = Number(cat.currency?.usd_to_uzs);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return { ok: false, error: "Valyuta kursi currency.json da yo‘q" };
    }
    const totalUzs = Math.round(totalUsd * exchangeRate);

    const createdAt = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const createdAtText = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())} ${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}:${pad(createdAt.getSeconds())}`;

    const report = {
      ok: true,
      createdAt: createdAt.toISOString(),
      createdAtText,
      companyName: cat.companyName || cat.settings?.companyName || "Sunnur Energy",
      reportTitle: cat.reportTitle || cat.settings?.reportTitle || "Tijoriy taklif",
      systemKw,
      panel: {
        id: panel.id,
        name: panel.name,
        powerW: panel.powerW,
        count: panelCount,
        unitPrice: panelsLine.unitPrice,
        total: panelsLine.total,
      },
      metal: metalRequired
        ? {
            required: true,
            meters: metalLine.quantity,
            unitPrice: metalLine.unitPrice,
            total: metalLine.total,
          }
        : { required: false, meters: 0, total: 0 },
      inverter: {
        id: inverter.id,
        name: inverter.name,
        type: inverter.type,
        powerKw: inverter.powerKw,
        unitPrice: inverterLine.unitPrice,
        total: inverterLine.total,
      },
      breakers,
      accessories,
      battery: batteryLine
        ? {
            ...batteryConfig,
            unitPrice: batteryLine.unitPrice,
            total: batteryLine.total,
            quantity: batteryLine.quantity,
          }
        : null,
      totalUsd,
      exchangeRate,
      totalUzs,
      clientName: String(input.clientName || "").trim(),
      phone: String(input.phone || "").trim(),
      warranty: cat.warranty,
      notes: cat.notes || [],
    };

    report.telegramText = formatTelegramReport(report);
    return report;
  }
}

export function formatMoneyUsd(n) {
  return `${money(n).toFixed(2)}$`;
}

export function formatMoneyUzs(n) {
  const v = Math.round(Number(n) || 0);
  // Telegram bot: bo‘shliqsiz (masalan 47024250 so'm)
  return `${v} so'm`;
}

/**
 * Telegram bot formatidagi matn.
 */
export function formatTelegramReport(r) {
  const lines = [];
  lines.push("────────────────────────");
  lines.push("");
  lines.push("Hisobot yaratilgan sana:");
  lines.push(r.createdAtText);
  lines.push("");
  lines.push(`📞 ${r.companyName}`);
  lines.push(r.reportTitle);
  lines.push("");
  lines.push("Tizim quvvati:");
  lines.push(`${r.systemKw} kVt`);
  lines.push("");
  lines.push("Tanlangan panel:");
  lines.push(r.panel.name);
  lines.push("");
  lines.push("Panellar:");
  lines.push(`${r.panel.count} dona — ${formatMoneyUsd(r.panel.total)}`);
  lines.push("");
  if (r.metal?.required) {
    lines.push("Metal konstruktsiya:");
    lines.push(`${r.metal.meters} metr — ${formatMoneyUsd(r.metal.total)}`);
    lines.push("");
  }
  lines.push("Inverter:");
  lines.push(`${r.inverter.name} — ${formatMoneyUsd(r.inverter.total)}`);
  lines.push("");
  lines.push("──────── Breakerlar ────────");
  lines.push("");
  r.breakers.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.name}`);
    lines.push(`${b.quantity} ${b.unitLabel} — ${formatMoneyUsd(b.total)}`);
    lines.push("");
  });
  lines.push("──────── Aksessuarlar ────────");
  lines.push("");
  r.accessories.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.name}`);
    lines.push(`${a.quantity} ${a.unitLabel} — ${formatMoneyUsd(a.total)}`);
    lines.push("");
  });
  if (r.battery) {
    lines.push("Akkumulyator:");
    lines.push(`${r.battery.name}`);
    lines.push(`${r.battery.quantity} dona — ${formatMoneyUsd(r.battery.total)}`);
    lines.push("");
  }
  lines.push("────────────────────────");
  lines.push("");
  lines.push("Jami xarajat");
  lines.push("");
  lines.push(formatMoneyUsd(r.totalUsd));
  lines.push("");
  lines.push(formatMoneyUzs(r.totalUzs));
  lines.push("");
  lines.push("────────────────────────");
  lines.push("");
  lines.push("Ism:");
  lines.push(r.clientName || "...");
  lines.push("");
  lines.push("Telefon:");
  lines.push(r.phone || "...");
  lines.push("");
  lines.push("📦 Kafolat");
  lines.push("");
  lines.push("Panel");
  lines.push(`${r.warranty?.panelYears ?? 25} yil`);
  lines.push("");
  lines.push("Invertor");
  lines.push("");
  lines.push(`Hybrid — ${r.warranty?.inverter?.hybrid ?? 2} yil`);
  lines.push("");
  lines.push(`OnGrid — ${r.warranty?.inverter?.ongrid ?? 5} yil`);
  lines.push("");
  lines.push("Akkumulyator");
  lines.push("");
  lines.push(`AGM/GEL — ${r.warranty?.battery?.AGM ?? 1} yil`);
  lines.push("");
  lines.push(`LiFePO4 — ${r.warranty?.battery?.LiFePO4 ?? "5–8"} yil`);
  lines.push("");
  lines.push("────────────────────────");
  lines.push("");
  lines.push("📌 Eslatma");
  lines.push("");
  (r.notes || []).forEach((n, i) => {
    lines.push(`${i + 1}.`);
    lines.push(n);
    lines.push("");
  });
  lines.push("────────────────────────");
  return lines.join("\n");
}
