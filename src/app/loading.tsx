/** Route-level skeleton: shown while the home page loads its services. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-16 pb-8 sm:px-6 sm:pt-24">
      <div className="skeleton h-4 w-20" aria-hidden="true" />
      <div className="skeleton mt-4 h-10 w-2/3 max-w-md" aria-hidden="true" />
      <div className="skeleton mt-5 h-5 w-full max-w-md" aria-hidden="true" />
      <div className="mt-14 divide-y divide-line border-y border-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-5">
            <div className="skeleton h-6 w-1/3 max-w-52" aria-hidden="true" />
            <div className="skeleton h-4 w-14" aria-hidden="true" />
          </div>
        ))}
      </div>
    </main>
  );
}
