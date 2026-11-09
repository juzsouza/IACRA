/** Marcação simples de negrito para a prévia do termo no IACRA-DEV.
 * Trata o texto como conteúdo puro, nunca como HTML.
 */
export type BoldSegment = { text: string; bold: boolean };

export function splitBoldSegments(input: string): BoldSegment[] {
  return input.split(/(\*\*[\s\S]*?\*\*)/g).filter(Boolean).map(part =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? { text: part.slice(2, -2), bold: true }
      : { text: part, bold: false }
  );
}

export function toggleBoldSelection(
  value: string,
  start: number,
  end: number,
): { text: string; start: number; end: number } {
  if (start < 0 || end < start || end > value.length) throw new Error('Seleção inválida');
  const left = value.slice(0, start);
  const selected = value.slice(start, end);
  const right = value.slice(end);
  if (start >= 2 && value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return { text: value.slice(0, start - 2) + selected + value.slice(end + 2), start: start - 2, end: end - 2 };
  }
  if (!selected.length) {
    const placeholder = 'trecho importante';
    return {
      text: left + '**' + placeholder + '**' + right,
      start: start + 2,
      end: start + 2 + placeholder.length,
    };
  }
  return { text: left + '**' + selected + '**' + right, start: start + 2, end: end + 2 };
}
