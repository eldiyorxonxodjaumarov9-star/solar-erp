export default function SectionPage({ title, description }) {
  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {description}
      </p>
      <p className="mt-6 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        Demo sahifa — ma’lumotlar keyinchalik ulanıladi.
      </p>
    </section>
  );
}
