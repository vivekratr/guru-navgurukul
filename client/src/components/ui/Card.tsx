import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div className={`card-surface ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
