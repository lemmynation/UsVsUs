/**
 * Error text and paths go into analytics, so strip anything that could identify
 * a person or a room: query strings, UUIDs, emails, long tokens. Keep it short.
 */
export function sanitizeErrorText(text: string, max = 300): string {
  return text
    .replace(/[?#][^\s"']*/g, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ":email")
    .replace(/\b(sk|pk|sb|whsk)_[A-Za-z0-9_]{6,}/g, ":key")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, ":token")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "/room/:id", "/join/:code" — route shape only, never the actual room. */
export function sanitizePath(path: string): string {
  const clean = sanitizeErrorText(path, 120);
  return clean.replace(/^\/join\/[A-Za-z0-9]{6}\b/, "/join/:code");
}
