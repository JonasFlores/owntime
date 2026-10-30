/**
 * Route-level skeleton for the admin area: a calm pulse in the app's own
 * calendar shape so navigation never feels frozen. The tab strip belongs to
 * the persistent layout and must not be replaced during page transitions.
 * No text — language is decided by the page, not the loading state.
 */
export default function Loading() {
  return (
    <div aria-busy="true">
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
    </div>
  );
}
