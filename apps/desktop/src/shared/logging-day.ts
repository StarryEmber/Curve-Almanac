/**
 * Local calendar-day key shared by the main log rotator and E2E assertions.
 *
 * Kept under `src/shared` (no Node/Electron imports) so both the main tsconfig
 * and the E2E tsconfig can include it without crossing project references.
 */

/** Local (not UTC) `YYYY-MM-DD`, matching the user's wall clock. */
export function localDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
