/**
 * Route-level skeleton for the admin area: a calm pulse in the app's own
 * calendar shape (tab strip + month grid) so navigation never feels frozen.
 * No text — language is decided by the page, not the loading state.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-16 sm:px-6" aria-busy="true">
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-3" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-4 w-20" />
        ))}
      </nav>
      <div className="mt-10 overflow-hidden rounded-2xl border border-line">
        <div className="grid grid-cols-7 gap-px bg-line">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-panel px-2 py-2.5">
              <div className="skeleton mx-auto h-3 w-10" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px border-t border-line bg-line">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="min-h-[7rem] bg-panel p-1.5">
              <div className="skeleton h-4 w-6" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
