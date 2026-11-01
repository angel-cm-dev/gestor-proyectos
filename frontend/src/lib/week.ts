/** Utilidades de semana (lunes a domingo) sobre fechas 'YYYY-MM-DD' en UTC. */
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function weekDays(monday: string): Array<{ date: string; label: string }> {
  return DAY_LABELS.map((label, i) => {
    const date = addDays(monday, i);
    return { date, label: `${label} ${date.slice(8)}` };
  });
}
