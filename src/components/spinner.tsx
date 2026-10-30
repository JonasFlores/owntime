/**
 * Tiny arced spinner (pure CSS, no client JS) for any in-flight feedback:
 * inside buttons, next to status text, or inside loading.tsx skeletons.
 * Sizing is set by the caller via `className`.
 */
export default function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={"spinner " + className} aria-hidden="true" />;
}
