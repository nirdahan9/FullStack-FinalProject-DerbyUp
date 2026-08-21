/**
 * Every Server Action returns this shape instead of throwing.
 *
 * A rejected sign-in or a duplicate email is an ordinary outcome of the flow,
 * not a fault, and the UI needs to render it as a message. `throw` stays for
 * genuine failures, which error.tsx handles.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionError(
  error: string,
  fieldErrors?: Record<string, string>,
): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}
