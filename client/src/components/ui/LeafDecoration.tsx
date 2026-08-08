export function LeafDecoration({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none text-sage-mint ${className}`}
      viewBox="0 0 120 80"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 62C18 38 42 18 72 12C58 28 48 48 44 68C32 66 18 66 8 62Z"
        fill="currentColor"
        fillOpacity="0.55"
      />
      <path
        d="M88 8C98 22 104 40 100 58C92 44 84 28 88 8Z"
        fill="currentColor"
        fillOpacity="0.4"
      />
      <path
        d="M52 72C64 58 78 50 96 48C82 62 68 72 52 72Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
    </svg>
  );
}
