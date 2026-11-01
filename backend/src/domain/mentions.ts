/**
 * Detección de menciones "@usuario" en comentarios.
 *
 * - El @ debe ir al inicio o precedido de un carácter que no sea letra, dígito,
 *   "_" ni "."; así "ana@empresa.pe" (un correo) NO cuenta como mención.
 * - Usernames válidos: 3-40 caracteres [a-z0-9_.], normalizados a minúsculas.
 * - Los puntos finales se descartan ("gracias @mario." menciona a "mario").
 * - Sin duplicados y en orden de aparición.
 */
const MENTION_REGEX = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_.]{3,40})/g;

export function extractMentions(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MENTION_REGEX)) {
    const username = match[2].replace(/\.+$/, '').toLowerCase();
    if (username.length >= 3 && !found.includes(username)) found.push(username);
  }
  return found;
}
