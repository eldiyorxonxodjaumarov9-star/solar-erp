import { useEffect, useRef, useState } from "react";

/**
 * @param {{
 *   value?: string;
 *   onChange?: (dataUrl: string) => void;
 *   onClear?: () => void;
 *   disabled?: boolean;
 *   height?: number;
 *   maxClears?: number;
 *   clearCount?: number;
 * }} props
 */
export default function SignaturePad({
  value = "",
  onChange,
  onClear,
  disabled = false,
  height = 160,
  maxClears = -1,
  clearCount = 0,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        setEmpty(false);
      };
      img.src = value;
    } else {
      setEmpty(true);
    }
  }, [value, height]);

  const pos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setEmpty(false);
  };

  const move = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange?.(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    if (disabled || (maxClears >= 0 && clearCount >= maxClears)) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    setEmpty(true);
    onChange?.("");
    onClear?.();
  };

  const clearDisabled =
    disabled || (maxClears >= 0 && clearCount >= maxClears);

  return (
    <div className="space-y-2">
      <div
        className={`overflow-hidden rounded-xl border-2 border-dashed bg-white ${
          disabled ? "border-slate-200 opacity-60" : "border-slate-300"
        }`}
      >
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{ height }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={clearDisabled}
          onClick={clear}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Tozalash
          {maxClears >= 0 ? ` (${Math.max(0, maxClears - clearCount)} qoldi)` : ""}
        </button>
        <p className="text-xs text-slate-500">
          {empty ? "Barmoq yoki sichqoncha bilan imzo qo‘ying" : "Imzo qo‘yildi"}
        </p>
      </div>
    </div>
  );
}
