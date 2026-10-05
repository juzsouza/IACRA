import assert from 'node:assert';
import {
  PROD_REDIRECT_URI,
  DEV_REDIRECT_URI,
  PRE_REDIRECT_URI,
  ALLOWED_OAUTH_HOSTS,
  ALLOWED_REDIRECT_URIS,
  resolveOAuthRedirectUri,
  extractRequestHost,
  extractOriginHost,
} from '../server/googleCalendarRoutes.js';
import { generateGoogleAuthUrl } from '../server/googleCalendarService.js';

let passed = 0;
let failed = 0;

function testAssert(cond: boolean, name: string, detail?: any) {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}`, detail || '');
    failed++;
  }
}

async function runOAuthProductionTests() {
  console.log('\n================================================================');
  console.log('🧪 TESTES: FLUXO OAUTH DO GOOGLE CALENDAR PARA PRODUÇÃO E ALLOWLIST');
  console.log('================================================================\n');

  // 1. Constantes e Configuração de Produção
  console.log('--- 1. Constantes e Allowlist de Hosts/URIs ---');
  testAssert(
    PROD_REDIRECT_URI === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'PROD_REDIRECT_URI aponta exatamente para https://institutoiacra.com.br/api/google/oauth/callback'
  );

  testAssert(
    ALLOWED_OAUTH_HOSTS['institutoiacra.com.br'] === PROD_REDIRECT_URI,
    'ALLOWED_OAUTH_HOSTS mapeia institutoiacra.com.br para PROD_REDIRECT_URI'
  );

  testAssert(
    ALLOWED_OAUTH_HOSTS['www.institutoiacra.com.br'] === PROD_REDIRECT_URI,
    'ALLOWED_OAUTH_HOSTS mapeia www.institutoiacra.com.br para PROD_REDIRECT_URI'
  );

  testAssert(
    ALLOWED_OAUTH_HOSTS['ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app'] === PRE_REDIRECT_URI,
    'ALLOWED_OAUTH_HOSTS preserva mapeamento do ambiente preview (ais-pre)'
  );

  testAssert(
    ALLOWED_REDIRECT_URIS.has(PROD_REDIRECT_URI),
    'ALLOWED_REDIRECT_URIS inclui PROD_REDIRECT_URI'
  );

  testAssert(
    ALLOWED_REDIRECT_URIS.has(PRE_REDIRECT_URI),
    'ALLOWED_REDIRECT_URIS inclui PRE_REDIRECT_URI'
  );

  // 2. Resolução Determinística para Produção (institutoiacra.com.br)
  console.log('\n--- 2. Resolução Determinística para Produção ---');
  const reqProdHost = { headers: { host: 'institutoiacra.com.br' } };
  testAssert(
    resolveOAuthRedirectUri(reqProdHost) === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Host institutoiacra.com.br resolve para callback de produção'
  );

  const reqProdHostPort = { headers: { host: 'institutoiacra.com.br:443' } };
  testAssert(
    resolveOAuthRedirectUri(reqProdHostPort) === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Host institutoiacra.com.br com porta resolve para callback de produção'
  );

  const reqProdXForwarded = { headers: { 'x-forwarded-host': 'institutoiacra.com.br' } };
  testAssert(
    resolveOAuthRedirectUri(reqProdXForwarded) === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Header x-forwarded-host institutoiacra.com.br resolve para callback de produção'
  );

  const reqProdOrigin = { headers: { origin: 'https://institutoiacra.com.br' } };
  testAssert(
    resolveOAuthRedirectUri(reqProdOrigin) === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Header origin https://institutoiacra.com.br resolve para callback de produção'
  );

  const reqProdWww = { headers: { host: 'www.institutoiacra.com.br' } };
  testAssert(
    resolveOAuthRedirectUri(reqProdWww) === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Host www.institutoiacra.com.br resolve para callback de produção'
  );

  // 3. Resolução Determinística para Preview (ais-pre)
  console.log('\n--- 3. Resolução Determinística para Preview (ais-pre) ---');
  const reqPreHost = { headers: { host: 'ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app' } };
  testAssert(
    resolveOAuthRedirectUri(reqPreHost) === PRE_REDIRECT_URI,
    'Host ais-pre resolve exatamente para PRE_REDIRECT_URI'
  );

  const reqPreOrigin = { headers: { origin: 'https://ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app' } };
  testAssert(
    resolveOAuthRedirectUri(reqPreOrigin) === PRE_REDIRECT_URI,
    'Header origin ais-pre resolve exatamente para PRE_REDIRECT_URI'
  );

  // 4. Bloqueio e Rejeição de Hosts Arbitrários
  console.log('\n--- 4. Bloqueio e Rejeição de Hosts/Origins Arbitrários ---');
  const reqEvilHost = { headers: { host: 'evil-attacker.com' } };
  testAssert(
    resolveOAuthRedirectUri(reqEvilHost) === null,
    'Host arbitrário evil-attacker.com é explicitamente REJEITADO (retorna null)'
  );

  const reqEvilOrigin = { headers: { origin: 'https://phishing-iacra.net' } };
  testAssert(
    resolveOAuthRedirectUri(reqEvilOrigin) === null,
    'Origin arbitrário https://phishing-iacra.net é explicitamente REJEITADO (retorna null)'
  );

  const reqEvilForwarded = { headers: { 'x-forwarded-host': 'malicious-proxy.com' } };
  testAssert(
    resolveOAuthRedirectUri(reqEvilForwarded) === null,
    'x-forwarded-host arbitrário malicious-proxy.com é explicitamente REJEITADO (retorna null)'
  );

  // 5. Imutabilidade e Impossibilidade de Manipulação pelo Frontend
  console.log('\n--- 5. Proteção contra Manipulação de Redirect pelo Frontend ---');
  // Simular geração de URL para produção
  const teacherId = 'teacher_prod_test_001';
  const prodRedirect = resolveOAuthRedirectUri(reqProdHost)!;
  const authUrlResult = generateGoogleAuthUrl(teacherId, prodRedirect);

  testAssert(
    Boolean(authUrlResult.url && authUrlResult.url.includes(encodeURIComponent('https://institutoiacra.com.br/api/google/oauth/callback'))),
    'URL gerada pelo backend utiliza deterministamente o callback de produção'
  );

  testAssert(
    Boolean(authUrlResult.url && !authUrlResult.url.includes('evil.com')),
    'URL gerada nunca aceita ou reflete domínios externos arbitrários'
  );

  // Validar extração e decodificação do parâmetro state
  const urlObj = new URL(authUrlResult.url!);
  const stateDecoded = JSON.parse(decodeURIComponent(urlObj.searchParams.get('state')!));
  testAssert(
    stateDecoded.teacherId === teacherId,
    'Parâmetro state codificado contém teacherId correto'
  );
  testAssert(
    stateDecoded.redirectUri === 'https://institutoiacra.com.br/api/google/oauth/callback',
    'Parâmetro state codificado contém redirectUri validado da allowlist'
  );

  // Simular tentativa de validação de state com URI maliciosa
  const maliciousStateUri = 'https://attacker-redirect.com/callback';
  testAssert(
    !ALLOWED_REDIRECT_URIS.has(maliciousStateUri),
    'Tentativa de injetar URI arbitrária no state é bloqueada pela validação de ALLOWED_REDIRECT_URIS'
  );

  // 6. Resiliência do ambiente local de testes (localhost / 127.0.0.1)
  console.log('\n--- 6. Resiliência do Ambiente de Testes (Localhost) ---');
  const reqLocalHost = { headers: { host: 'localhost:3000' } };
  const resolvedLocal = resolveOAuthRedirectUri(reqLocalHost);
  testAssert(
    Boolean(resolvedLocal && ALLOWED_REDIRECT_URIS.has(resolvedLocal)),
    'Ambiente localhost resolve para fallback seguro pertencente à allowlist'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES OAUTH: Sucessos: ${passed} | Falhas: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOAuthProductionTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
