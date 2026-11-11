import { splitBoldSegments } from './termBoldMarkup';

/**
 * Document text stays in the existing term_body column.
 * Old plain-text/**bold** terms are never rewritten.
 * The prefix is an explicit signal to render the new, restricted markup.
 */
export const RICH_TERM_PREFIX = 'IACRA_RICH_HTML_V1:';
export const isRichTerm = (value: string): boolean => value.startsWith(RICH_TERM_PREFIX);
export const MAX_TERM_LENGTH = 20000;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function legacyToSafeHtml(value: string): string {
  return splitBoldSegments(value).map(segment => {
    const escaped = escapeHtml(segment.text).replace(/\r\n?|\n/g, '<br>');
    return segment.bold ? '<strong>' + escaped + '</strong>' : escaped;
  }).join('');
}

function normalizeFont(raw: string): string | null {
  const first = raw.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (first === 'arial' || first === 'sans-serif') return 'Arial';
  if (first === 'georgia') return 'Georgia';
  if (first === 'times new roman' || first === 'times') return 'Times New Roman';
  return null;
}

function normalizeSize(raw: string): string | null {
  const sizes: Record<string,string> = {
    '1':'10px', '2':'12px', '3':'14px', '4':'16px',
    '5':'18px', '6':'22px', '7':'26px',
    '10px':'10px', '12px':'12px', '14px':'14px',
    '16px':'16px', '18px':'18px', '22px':'22px', '26px':'26px',
  };
  return sizes[raw.trim().toLowerCase()] || null;
}

function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return '#' + value.slice(1).split('').map(x => x+x).join('');
  }
  const rgb = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (rgb) {
    const values = rgb.slice(1).map(Number);
    if (values.every(x => x <= 255)) {
      return '#' + values.map(x => x.toString(16).padStart(2,'0')).join('');
    }
  }
  return null;
}

const allowedElements = new Set([
  'strong','b','em','i','u','s','p','div','br','ul','ol','li','span','font',
]);
const blockedElements = new Set([
  'script','style','iframe','object','embed','svg','math','noscript',
  'form','input','button','textarea','select','video','audio','img','link','meta',
]);

/** Reconstructs each node from an allowlist. No URLs, event handlers, arbitrary
 * inline CSS, script, forms, or embedded content are copied into the output.
 */
export function sanitizeTermHtml(html: string): string {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') {
    // Server rendering must fail closed rather than trust unexamined HTML.
    return escapeHtml(html);
  }
  const source = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');

  function copy(node: Node, target: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent || ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (blockedElements.has(tag)) return;
    const clean = document.createElement(allowedElements.has(tag)
      ? (tag === 'font' ? 'span' : tag) : 'span');
    if (tag === 'font') {
      const font = normalizeFont(element.getAttribute('face') || '');
      const size = normalizeSize(element.getAttribute('size') || '');
      const color = normalizeColor(element.getAttribute('color') || '');
      if (font) clean.style.fontFamily = font;
      if (size) clean.style.fontSize = size;
      if (color) clean.style.color = color;
    }
    const styles = (element as HTMLElement).style;
    const font = normalizeFont(styles.fontFamily || '');
    const size = normalizeSize(styles.fontSize || '');
    const color = normalizeColor(styles.color || '');
    const alignment = styles.textAlign?.toLowerCase();
    if (font) clean.style.fontFamily = font;
    if (size) clean.style.fontSize = size;
    if (color) clean.style.color = color;
    if (alignment && ['left','center','right','justify'].includes(alignment)) {
      clean.style.textAlign = alignment;
    }
    if (['bold','700','800','900'].includes(styles.fontWeight)) {
      clean.style.fontWeight = 'bold';
    }
    if (styles.fontStyle === 'italic') clean.style.fontStyle = 'italic';
    if (styles.textDecoration.includes('underline')) {
      clean.style.textDecoration = 'underline';
    }
    if (tag === 'br') {
      target.appendChild(clean);
      return;
    }
    for (const child of Array.from(node.childNodes)) copy(child,clean);
    target.appendChild(clean);
  }

  for (const node of Array.from(source.body.childNodes)) copy(node,output);
  return output.innerHTML;
}

export function termToSafeHtml(value: string): string {
  if (!isRichTerm(value)) return legacyToSafeHtml(value);
  return sanitizeTermHtml(value.slice(RICH_TERM_PREFIX.length));
}

export function termPlainText(value: string): string {
  if (!isRichTerm(value)) return splitBoldSegments(value).map(x => x.text).join('');
  if (typeof document === 'undefined') return '';
  const container = document.createElement('div');
  container.innerHTML = sanitizeTermHtml(value.slice(RICH_TERM_PREFIX.length));
  return (container.textContent || '').trim();
}

export function richTermFromEditor(html: string): string {
  return RICH_TERM_PREFIX + sanitizeTermHtml(html);
}
