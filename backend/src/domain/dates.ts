/**
 * Utilidades de fechas de calendario ('YYYY-MM-DD') sin zona horaria.
 * Se opera en UTC para que "2026-03-01" signifique lo mismo en cualquier servidor.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de `date` (semana laboral peruana: lunes a domingo). */
export function startOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  return addDays(date, -dayFromMonday);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
