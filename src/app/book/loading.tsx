/** Route-level skeleton: shown while /book resolves the service list. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-8 sm:px-6">
      <div className="skeleton h-4 w-16" aria-hidden="true" />
      <div className="skeleton mt-10 h-4 w-28" aria-hidden="true" />
      <div className="mt-6 divide-y divide-line border-y border-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-4">
            <div className="skeleton h-6 w-1/3 max-w-52" aria-hidden="true" />
            <div className="skeleton h-4 w-12" aria-hidden="true" />
          </div>
        ))}
      </div>
    </main>
  );
}
