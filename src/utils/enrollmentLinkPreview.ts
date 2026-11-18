export const ENROLLMENT_SHARE_TITLE = 'TERMO DE CIÊNCIA E RESPONSABILIDADE ATENDIMENTOS - ACEITE ELETRÔNICO';
export const ENROLLMENT_SHARE_DESCRIPTION = 'Instituto de Arte Cristã Raphael Augusto. Leia o termo e confirme o aceite eletrônico.';

const setMeta = (html: string, attr: 'name' | 'property', name: string, value: string): string => {
  const tag = '<meta ' + attr + '="' + name + '" content="' + value + '" />';
  const regex = new RegExp('<meta\\s+[^>]*' + attr + '=["\\\']' + name + '["\\\'][^>]*>', 'i');
  return regex.test(html) ? html.replace(regex, tag) : html.replace(/<\/head>/i, tag + '\n</head>');
};

/** WhatsApp crawlers do not run React: metadata must be present in server HTML.
 * Never load or embed token details, since crawlers visit links without consent.
 */
export function renderEnrollmentShareHtml(html: string): string {
  let result = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + ENROLLMENT_SHARE_TITLE + '</title>');
  result = setMeta(result, 'name', 'description', ENROLLMENT_SHARE_DESCRIPTION);
  result = setMeta(result, 'property', 'og:title', ENROLLMENT_SHARE_TITLE);
  result = setMeta(result, 'property', 'og:description', ENROLLMENT_SHARE_DESCRIPTION);
  result = setMeta(result, 'property', 'og:type', 'website');
  result = setMeta(result, 'property', 'og:url', 'https://institutoiacra.com.br/matricula');
  result = setMeta(result, 'name', 'twitter:title', ENROLLMENT_SHARE_TITLE);
  result = setMeta(result, 'name', 'twitter:description', ENROLLMENT_SHARE_DESCRIPTION);
  return result;
}
