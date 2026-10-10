/**
 * On a slow phone the form shows up before its JavaScript runs, and people start
 * typing straight away. React doesn't see those keystrokes, so the field shows a
 * nickname while the form's state is still empty (and "Create" stays disabled).
 * Call this once after mount to pick up whatever was already typed.
 */
export function takeTypedValue(id: string, set: (value: string) => void): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement && el.value) set(el.value);
}
