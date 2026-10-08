import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Configurar ambiente para teste
process.env.NODE_ENV = 'test';

import { createApp, PRIVACY_POLICY_CANONICAL_URL, getPrivacyPolicyHtmlPath } from '../../server.js';

async function runPrivacyPolicyTests() {
  console.log('🧪 Iniciando suíte de testes: Indexação e Rota Estática da Política de Privacidade\n');

  // Preparar diretório dist mínimo para simular ambiente de produção/fallback SPA
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  const testSpaIndexHtml = '<!doctype html><html><head><title>EAVRA SPA Shell</title></head><body><div id="root">SPA Fallback</div></body></html>';
  fs.writeFileSync(path.join(distPath, 'index.html'), testSpaIndexHtml);

  // Inicializar servidor em modo test-prod para testar roteamento estático e fallback SPA
  process.env.NODE_ENV = 'test-prod';
  const app = await createApp();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------
    // Teste 1: Arquivo HTML estático existe e contém canonical correta
    // -------------------------------------------------------------
    console.log('▶ Teste 1: Validando integridade física do arquivo HTML estático da Política...');
    {
      const filePath = getPrivacyPolicyHtmlPath();
      assert(fs.existsSync(filePath), `Arquivo HTML deve existir no caminho: ${filePath}`);

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      assert(fileContent.includes('<link rel="canonical" href="https://institutoiacra.com.br/politica-de-privacidade" />'),
        'Arquivo HTML deve conter a tag canonical exata para https://institutoiacra.com.br/politica-de-privacidade');
      assert(fileContent.includes('Política de Privacidade'), 'Arquivo HTML deve conter o título textual');
      assert(fileContent.includes('Instituto de Arte e Vocal Raphael Augusto'), 'Arquivo HTML deve conter o nome do instituto');
      assert(fileContent.includes('LGPD'), 'Arquivo HTML deve citar a LGPD');
      assert(!fileContent.includes('<script'), 'Arquivo HTML não deve exigir ou conter tags <script> para leitura do conteúdo');

      console.log('  ✔ Arquivo HTML estático validado: canonical, título, texto integral e sem dependência de scripts.');
    }

    // -------------------------------------------------------------
    // Teste 2: GET /politica-de-privacidade retorna 200, text/html e conteúdo completo
    // -------------------------------------------------------------
    console.log('\n▶ Teste 2: Validando GET /politica-de-privacidade (sem trailing slash)...');
    {
      const response = await fetch(`${baseUrl}/politica-de-privacidade`);
      assert.strictEqual(response.status, 200, 'GET /politica-de-privacidade deve retornar HTTP 200');

      const contentType = response.headers.get('content-type') || '';
      assert(contentType.includes('text/html'), `Content-Type deve ser text/html. Obtido: ${contentType}`);

      const body = await response.text();
      assert(body.includes('<!DOCTYPE html>') || body.includes('<html'), 'Resposta deve ser documento HTML completo');
      assert(body.includes('<link rel="canonical" href="https://institutoiacra.com.br/politica-de-privacidade" />'),
        'Resposta deve conter a tag canonical correta');
      assert(body.includes('Política de Privacidade — EAVRA'), 'Resposta deve conter o título oficial no HTML');
      assert(body.includes('LGPD'), 'Resposta deve conter o conteúdo da LGPD');
      assert(body.includes('institutoiacra.com.br'), 'Resposta deve conter menção ao domínio oficial');
      assert(!body.includes('SPA Fallback'), 'Não deve passar pelo fallback SPA');

      console.log('  ✔ GET /politica-de-privacidade validado: 200 OK, text/html, canonical correto e conteúdo completo.');
    }

    // -------------------------------------------------------------
    // Teste 3: GET /politica-de-privacidade/ retorna 200, text/html e conteúdo completo
    // -------------------------------------------------------------
    console.log('\n▶ Teste 3: Validando GET /politica-de-privacidade/ (com trailing slash)...');
    {
      const response = await fetch(`${baseUrl}/politica-de-privacidade/`);
      assert.strictEqual(response.status, 200, 'GET /politica-de-privacidade/ deve retornar HTTP 200');

      const contentType = response.headers.get('content-type') || '';
      assert(contentType.includes('text/html'), `Content-Type deve ser text/html. Obtido: ${contentType}`);

      const body = await response.text();
      assert(body.includes('<link rel="canonical" href="https://institutoiacra.com.br/politica-de-privacidade" />'),
        'Resposta com trailing slash deve conter a mesma tag canonical');
      assert(body.includes('Política de Privacidade — EAVRA'), 'Resposta deve conter o título oficial no HTML');
      assert(!body.includes('SPA Fallback'), 'Não deve passar pelo fallback SPA');

      console.log('  ✔ GET /politica-de-privacidade/ validado: 200 OK, text/html e canonical preservado.');
    }

    // -------------------------------------------------------------
    // Teste 4: Ausência de autenticação ou redirecionamento de login
    // -------------------------------------------------------------
    console.log('\n▶ Teste 4: Validando que a rota é 100% pública (sem auth/login/sessão)...');
    {
      // Fazer requisição sem nenhum header Authorization ou Cookie de sessão
      const response = await fetch(`${baseUrl}/politica-de-privacidade`, {
        redirect: 'manual'
      });
      assert.strictEqual(response.status, 200, 'A rota pública não deve redirecionar (status deve ser 200 direto)');
      assert(!response.headers.get('location'), 'Não deve haver header Location ou redirect para /login');

      console.log('  ✔ Acesso público validado: sem redirect para login, sem 401/403, 100% público.');
    }

    // -------------------------------------------------------------
    // Teste 5: /privacy e /privacy/ continuam acessíveis e preservadas
    // -------------------------------------------------------------
    console.log('\n▶ Teste 5: Validando compatibilidade de /privacy e /privacy/...');
    {
      const resPrivacy = await fetch(`${baseUrl}/privacy`);
      assert.strictEqual(resPrivacy.status, 200, 'GET /privacy deve retornar 200');

      const resPrivacySlash = await fetch(`${baseUrl}/privacy/`);
      assert.strictEqual(resPrivacySlash.status, 200, 'GET /privacy/ deve retornar 200');

      console.log('  ✔ Rotas /privacy e /privacy/ preservadas com sucesso.');
    }

    // -------------------------------------------------------------
    // Teste 6: Outras rotas SPA continuam usando o fallback normal (index.html)
    // -------------------------------------------------------------
    console.log('\n▶ Teste 6: Validando que outras rotas SPA continuam caindo no fallback normal...');
    {
      const resDashboard = await fetch(`${baseUrl}/painel/aulas`);
      assert.strictEqual(resDashboard.status, 200, 'GET /painel/aulas deve retornar 200');
      const bodyDashboard = await resDashboard.text();
      assert(bodyDashboard.includes('SPA Fallback'), 'Rotas SPA devem continuar recebendo o shell do index.html');

      const resLogin = await fetch(`${baseUrl}/login`);
      assert.strictEqual(resLogin.status, 200, 'GET /login deve retornar 200');
      const bodyLogin = await resLogin.text();
      assert(bodyLogin.includes('SPA Fallback'), 'Rota /login deve continuar recebendo o shell do index.html');

      console.log('  ✔ Fallback SPA permanece intacto para todas as outras rotas do aplicativo.');
    }

    console.log('\n🎉 Todos os testes de indexação e rota estática da Política de Privacidade PASSARAM com sucesso!');
  } finally {
    server.close();
  }
}

runPrivacyPolicyTests().catch((err) => {
  console.error('\n❌ Falha na suíte de testes da Política de Privacidade:', err);
  process.exit(1);
});
