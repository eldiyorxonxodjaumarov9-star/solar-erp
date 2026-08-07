import { SOLAR_COMPANY } from "./solar/solarOfferLayout.js";

const INSTAGRAM_COLOR = "#E1306C";

export function CompanyInstagramLink() {
  return (
    <a
      href={SOLAR_COMPANY.instagramUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: INSTAGRAM_COLOR,
        textDecoration: "underline",
        fontWeight: 500,
      }}
    >
      {SOLAR_COMPANY.instagramHandle}
    </a>
  );
}

/** Quyosh paneli va issiqlik nasosi formalaridagi kompaniya kontaktlari. */
export function CompanyContactFooter({ dateLabel = null }) {
  return (
    <>
      <p className="heat-pump-footer-label">Kompaniya:</p>
      <p style={{ fontWeight: 600 }}>{SOLAR_COMPANY.name}</p>
      <p className="heat-pump-footer-label" style={{ marginTop: "4mm" }}>
        Telefon:
      </p>
      <p>{SOLAR_COMPANY.phone}</p>
      <p className="heat-pump-footer-label" style={{ marginTop: "3mm" }}>
        Instagram:
      </p>
      <p>
        <CompanyInstagramLink />
      </p>
      {dateLabel ? (
        <>
          <p className="heat-pump-footer-label" style={{ marginTop: "4mm" }}>
            Sana:
          </p>
          <p>{dateLabel}</p>
        </>
      ) : null}
    </>
  );
}
