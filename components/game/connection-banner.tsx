/** Shown while the phone can't reach the server; the room catches up on its own when it's back. */
export function ConnectionBanner({ reconnecting }: { reconnecting: boolean }) {
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-10 -mx-5 -mt-8 empty:hidden">
      {reconnecting && (
        <p className="bg-destructive/90 px-5 py-2 text-center text-base font-semibold text-white">
          Reconnecting… your answers are safe.
        </p>
      )}
    </div>
  );
}
