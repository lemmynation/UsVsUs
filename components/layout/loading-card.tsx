/** Instant placeholder shown while request-time data (cookies, room state) streams in. */
export function LoadingCard({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
      <span aria-hidden className="border-muted border-t-primary size-10 animate-spin rounded-full border-4" />
      <span className="text-lg">{label}</span>
    </div>
  );
}
