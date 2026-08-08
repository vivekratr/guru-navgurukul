import type { HTMLAttributes } from "react";

type PillTagProps = HTMLAttributes<HTMLSpanElement> & {
  accent?: boolean;
};

export function PillTag({
  children,
  accent = false,
  className = "",
  ...props
}: PillTagProps) {
  return (
    <span
      className={`${accent ? "pill-tag-accent" : "pill-tag"} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
