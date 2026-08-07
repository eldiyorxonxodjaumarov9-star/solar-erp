import { USTA_PHOTO_TYPE_OPTIONS } from "../photos/ustaPhotoStorage";
import { formatTashkentDateTime } from "../photos/tashkentTime";

function typeLabel(value) {
  const o = USTA_PHOTO_TYPE_OPTIONS.find((x) => x.value === value);
  return o?.label ?? value;
}

/** @param {{ photo: object; adminActions?: boolean; onEdit?: (p: object) => void; onDelete?: (p: object) => void }} props */
export default function PhotoThumbCard({
  photo,
  adminActions = false,
  onEdit,
  onDelete,
}) {
  const showBar = Boolean(adminActions && (onEdit || onDelete));
  const isVideo =
    String(photo.mediaType || "") === "video" ||
    (photo.videoUrl && !photo.imageData && !photo.imageUrl);

  return (
    <article className="flex flex-col overflow-hidden rounded-[12px] border border-slate-200/85 bg-white shadow-soft-md ring-1 ring-slate-900/[0.03]">
      <div className="aspect-[3/4] w-full shrink-0 overflow-hidden rounded-[12px] bg-slate-100">
        {isVideo ? (
          <video
            src={photo.videoUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={photo.imageData || photo.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-1 p-2.5 text-[11px] leading-snug text-slate-600 sm:text-xs">
        <p className="truncate font-semibold text-slate-900">{photo.ustaName}</p>
        <p className="truncate">{photo.brigadeName || "—"}</p>
        <p className="line-clamp-2 text-slate-600" title={photo.projectName}>
          {photo.projectName}
        </p>
        <p className="text-slate-500">{formatTashkentDateTime(photo.uploadDate)}</p>
        <p className="font-medium text-brand-700">
          {isVideo ? "Bosqich videosi" : typeLabel(photo.type)}
        </p>
        {photo.comment?.trim() ? (
          <p className="line-clamp-3 text-slate-500" title={photo.comment}>
            {photo.comment}
          </p>
        ) : null}
        {showBar ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5 pt-1">
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(photo)}
                className="flex-1 min-w-[4.5rem] rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
              >
                Tahrir
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(photo)}
                className="flex-1 min-w-[4.5rem] rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-100"
              >
                O‘chirish
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
