/**
 * Generación de CSV (RFC 4180) segura para abrir en Excel.
 *
 * - Campos con coma, comillas o saltos de línea van entre comillas y las
 *   comillas internas se duplican.
 * - Prevención de "CSV/formula injection": un texto que empieza con = + - @ o
 *   tabulador podría ejecutarse como fórmula en Excel; se le antepone un apóstrofo.
 * - BOM UTF-8 opcional para que Excel muestre bien tildes y eñes.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[], options: { bom?: boolean } = {}): string {
  const bom = options.bom ?? true;
  const lines = [columns.map((c) => escapeCsvField(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvField(c.value(row))).join(','));
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}
