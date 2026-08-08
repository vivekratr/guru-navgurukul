import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiClientError } from "@/lib/api-error";

export function LoadingMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="body-copy-muted" role="status">
      {children}
    </p>
  );
}

export function ErrorMessage({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof ApiClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong";

  const retryable =
    error instanceof ApiClientError ? error.retryable : Boolean(onRetry);

  return (
    <Card className="border-charcoal/30" role="alert">
      <p className="text-body-sm text-ink-black">{message}</p>
      {retryable && onRetry && (
        <Button variant="text" className="mt-3 !p-0" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed border-charcoal/25 text-center">
      <p className="text-subheading-sm font-medium text-ink-black">{title}</p>
      {description && (
        <p className="body-copy-muted mx-auto mt-2">{description}</p>
      )}
    </Card>
  );
}
