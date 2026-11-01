import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from '../../src/domain/csv';
import { extractMentions } from '../../src/domain/mentions';

describe('menciones @usuario', () => {
  it('extrae menciones en orden, sin duplicados y en minúsculas', () => {
    expect(extractMentions('@Carla revisa esto con @mario y otra vez @carla')).toEqual(['carla', 'mario']);
  });

  it('ignora correos electrónicos', () => {
    expect(extractMentions('escribe a ana@empresa.pe por favor')).toEqual([]);
  });

  it('descarta el punto final y respeta puntuación alrededor', () => {
    expect(extractMentions('Gracias @mario. (cc: @lucia.ramos)')).toEqual(['mario', 'lucia.ramos']);
  });

  it('ignora usernames demasiado cortos', () => {
    expect(extractMentions('hola @ab')).toEqual([]);
  });

  it('acepta menciones al inicio de línea y tras saltos de línea', () => {
    expect(extractMentions('línea 1\n@diego mira')).toEqual(['diego']);
  });
});

describe('CSV', () => {
  it('escapa comas, comillas y saltos de línea (RFC 4180)', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(escapeCsvField('l1\nl2')).toBe('"l1\nl2"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(1.5)).toBe('1.5');
  });

  it('neutraliza inyección de fórmulas', () => {
    expect(escapeCsvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('los números negativos no se alteran', () => {
    expect(escapeCsvField(-3)).toBe('-3');
  });

  it('genera encabezado, filas con CRLF y BOM opcional', () => {
    const rows = [{ name: 'Mario Quispe', h: 2.5 }];
    const csv = toCsv([{ header: 'Nombre', value: (r: (typeof rows)[0]) => r.name }, { header: 'Horas', value: (r) => r.h }], rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1)).toBe('Nombre,Horas\r\nMario Quispe,2.5\r\n');
    expect(toCsv([{ header: 'x', value: () => 1 }], [], { bom: false })).toBe('x\r\n');
  });
});
