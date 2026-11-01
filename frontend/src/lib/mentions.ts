/**
 * Divide un comentario en segmentos de texto y menciones para resaltarlas.
 * Usa la misma regla que el backend: el @ no debe ir pegado a letras (correos).
 */
export type Segment = { type: 'text'; value: string } | { type: 'mention'; value: string };

const MENTION_REGEX = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_.]{3,40})/g;

export function splitMentions(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_REGEX)) {
    const username = match[2].replace(/\.+$/, '');
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
    segments.push({ type: 'mention', value: username });
    last = start + 1 + username.length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

/** Devuelve el término de mención que se está escribiendo al final del texto (para autocompletar). */
export function currentMentionQuery(text: string): string | null {
  const match = /(?:^|\s)@([A-Za-z0-9_.]{0,40})$/.exec(text);
  return match ? match[1] : null;
}
