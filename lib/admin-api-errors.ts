/**
 * Avoid showing raw SQL or low-level server text to admins in the browser.
 */
export function userFacingAdminError(detail: string): string {
  const d = (detail || "").trim();
  if (!d) return "Something went wrong. Please try again.";
  if (
    /LINE \d+:/m.test(d) ||
    /FROM-clause entry for table/i.test(d) ||
    /syntax error at or near/i.test(d) ||
    /unterminated quoted string/i.test(d)
  ) {
    return "Couldn’t load data. Please try again.";
  }
  return d;
}
