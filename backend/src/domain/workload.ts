/**
 * Nivel de carga de una persona = horas estimadas pendientes / capacidad semanal.
 * Es un indicador orientativo para repartir trabajo, no una medición exacta:
 *   < 50 %  → baja        (tiene espacio para más tareas)
 *   ≤ 100 % → normal
 *   ≤ 150 % → alta        (conviene no asignarle más)
 *   > 150 % → sobrecarga  (redistribuir)
 */
export type WorkloadLevel = 'baja' | 'normal' | 'alta' | 'sobrecarga';

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

export function workloadRatio(pendingHours: number, capacityHours = DEFAULT_WEEKLY_CAPACITY_HOURS): number {
  if (capacityHours <= 0) return 0;
  return Math.round((pendingHours / capacityHours) * 1000) / 10;
}

export function workloadLevel(pendingHours: number, capacityHours = DEFAULT_WEEKLY_CAPACITY_HOURS): WorkloadLevel {
  const pct = workloadRatio(pendingHours, capacityHours);
  if (pct < 50) return 'baja';
  if (pct <= 100) return 'normal';
  if (pct <= 150) return 'alta';
  return 'sobrecarga';
}
