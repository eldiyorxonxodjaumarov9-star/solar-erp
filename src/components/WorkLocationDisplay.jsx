import {
  formatLocationFull,
  formatLocationShort,
  mapsEmbedUrl,
  mapsLink,
} from "../../shared/workLocationFormat.js";

/**
 * Joylashuv — Google Maps xaritasi va manzil matni.
 * @param {{ location?: object; label?: string; compact?: boolean }} props
 * compact=true — faqat havola (jadval uchun)
 */
export default function WorkLocationDisplay({
  location,
  label = "Joylashuv",
  compact = false,
}) {
  if (!location?.latitude && !location?.longitude) {
    return <span className="text-slate-400">—</span>;
  }

  const href = mapsLink(location);
  const shortText = formatLocationShort(location);
  const fullAddress = formatLocationFull(location);
  const embedUrl = mapsEmbedUrl(location);
  const isApprox = location.source === "ip";
  const isGps = location.source === "device";

  if (compact) {
    return (
      <div className="text-xs text-slate-600">
        <span className="font-medium text-slate-500">{label}: </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
            title={fullAddress}
          >
            {shortText || "Google Maps"}
          </a>
        ) : (
          <span>{shortText}</span>
        )}
        {isApprox ? (
          <span className="ml-1 text-[10px] font-medium text-amber-700">(taxminiy)</span>
        ) : null}
        {isGps ? (
          <span className="ml-1 text-[10px] font-medium text-emerald-700">(aniq, GPS)</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label ? (
        <p className="text-xs font-semibold text-slate-700">{label}</p>
      ) : null}

      {embedUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
          <iframe
            title={`${label} — Google Maps`}
            src={embedUrl}
            className="h-40 w-full border-0 sm:h-48"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2">
        <p className="text-xs font-medium leading-relaxed text-slate-800">{fullAddress}</p>
        {isApprox ? (
          <p className="mt-1 text-[10px] font-medium text-amber-700">
            Taxminiy joy (internet orqali, ±5 km atrofida)
          </p>
        ) : null}
        {isGps ? (
          <p className="mt-1 text-[10px] font-medium text-emerald-700">
            Aniq joy (GPS, ±{Math.round(Number(location.accuracy) || 0)} m)
          </p>
        ) : null}
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
        >
          Google Maps'da ochish
        </a>
      ) : null}
    </div>
  );
}
