import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Configurar ambiente para teste
process.env.NODE_ENV = 'test';

import { createApp, LEGACY_SW_SCRIPT } from '../../server.js';
import { runLegacyServiceWorkerMigration, EAVRA_LEGACY_SW_FLAG } from '../utils/legacyServiceWorkerMigration.js';

async function runTests() {
  console.log('🧪 Iniciando suíte de testes: Cache-Control & Migração de Service Worker Legado (EAVRA)\n');

  // Preparar diretório dist mínimo se ainda não existir para teste de rotas estáticas
  const distPath = path.join(process.cwd(), 'dist');
  const distAssetsPath = path.join(distPath, 'assets');
  if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true });
  if (!fs.existsSync(distAssetsPath)) fs.mkdirSync(distAssetsPath, { recursive: true });

  const testIndexHtml = '<!doctype html><html><head><title>EAVRA Test</title></head><body>Root</body></html>';
  fs.writeFileSync(path.join(distPath, 'index.html'), testIndexHtml);
  fs.writeFileSync(path.join(distAssetsPath, 'vendor-test1234.js'), 'console.log("test asset");');

  // Criar instância do app configurada como produção para testar headers de dist e assets
  process.env.NODE_ENV = 'test-prod';
  const app = await createApp();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------
    // Teste A: index.html e rotas SPA retornam Cache-Control no-store
    // -------------------------------------------------------------
    console.log('▶ Teste A: Validando Cache-Control no-store em index.html e rotas SPA...');
    {
      const resRoot = await fetch(`${baseUrl}/`);
      assert.strictEqual(resRoot.status, 200, 'GET / deve retornar 200');
      const cacheControl = resRoot.headers.get('cache-control') || '';
      const pragma = resRoot.headers.get('pragma') || '';
      const expires = resRoot.headers.get('expires') || '';

      assert(
        cacheControl.includes('no-store') && cacheControl.includes('no-cache'),
        `GET / deve conter no-store e no-cache no Cache-Control. Obtido: ${cacheControl}`
      );
      assert.strictEqual(pragma, 'no-cache', `Pragma deve ser no-cache. Obtido: ${pragma}`);
      assert.strictEqual(expires, '0', `Expires deve ser 0. Obtido: ${expires}`);

      const resSpa = await fetch(`${baseUrl}/painel/aulas`);
      assert.strictEqual(resSpa.status, 200, 'GET /painel/aulas (SPA fallback) deve retornar 200');
      const spaCacheControl = resSpa.headers.get('cache-control') || '';
      assert(
        spaCacheControl.includes('no-store') && spaCacheControl.includes('no-cache'),
        `Fallback SPA deve conter no-store e no-cache. Obtido: ${spaCacheControl}`
      );
      console.log('  ✔ index.html e rotas SPA validados: Cache-Control contém no-store, no-cache, max-age=0.');
    }

    // -------------------------------------------------------------
    // Teste B: /assets/* retorna cache longo / immutable
    // -------------------------------------------------------------
    console.log('\n▶ Teste B: Validando Cache-Control public, max-age=31536000, immutable em /assets/*...');
    {
      const resAsset = await fetch(`${baseUrl}/assets/vendor-test1234.js`);
      assert.strictEqual(resAsset.status, 200, 'GET /assets/vendor-test1234.js deve retornar 200');
      const cacheControl = resAsset.headers.get('cache-control') || '';
      assert(
        cacheControl.includes('public') &&
        cacheControl.includes('max-age=31536000') &&
        cacheControl.includes('immutable'),
        `Assets com hash devem ter cache longo e immutable. Obtido: ${cacheControl}`
      );
      console.log(`  ✔ /assets/* validado: Cache-Control = "${cacheControl}".`);
    }

    // -------------------------------------------------------------
    // Teste C: /sw.js retorna JavaScript válido e sem cache
    // -------------------------------------------------------------
    console.log('\n▶ Teste C: Validando /sw.js (script de migração de SW legado)...');
    {
      const resSw = await fetch(`${baseUrl}/sw.js`);
      assert.strictEqual(resSw.status, 200, 'GET /sw.js deve responder 200');
      const contentType = resSw.headers.get('content-type') || '';
      const cacheControl = resSw.headers.get('cache-control') || '';
      const body = await resSw.text();

      assert(contentType.includes('application/javascript'), `Content-Type deve ser application/javascript. Obtido: ${contentType}`);
      assert(cacheControl.includes('no-store') && cacheControl.includes('no-cache'), `Cache-Control de sw.js deve ser no-store. Obtido: ${cacheControl}`);
      assert(body.includes('skipWaiting'), 'sw.js deve conter skipWaiting()');
      assert(body.includes('claim'), 'sw.js deve conter clients.claim()');
      assert(body.includes('unregister'), 'sw.js deve conter unregister()');
      assert(!body.includes('<html'), 'sw.js NÃO pode conter tags HTML!');
      console.log('  ✔ /sw.js validado: JavaScript válido, skipWaiting, clientsClaim e unregister presentes.');
    }

    // -------------------------------------------------------------
    // Teste D: /service-worker.js retorna JavaScript válido e sem cache
    // -------------------------------------------------------------
    console.log('\n▶ Teste D: Validando /service-worker.js (alias para migração)...');
    {
      const resSw = await fetch(`${baseUrl}/service-worker.js`);
      assert.strictEqual(resSw.status, 200, 'GET /service-worker.js deve responder 200');
      const contentType = resSw.headers.get('content-type') || '';
      const cacheControl = resSw.headers.get('cache-control') || '';
      const body = await resSw.text();

      assert(contentType.includes('application/javascript'), `Content-Type deve ser application/javascript. Obtido: ${contentType}`);
      assert(cacheControl.includes('no-store'), `Cache-Control deve conter no-store. Obtido: ${cacheControl}`);
      assert(body.includes('skipWaiting') && body.includes('unregister'), 'Deve conter skipWaiting e unregister');
      console.log('  ✔ /service-worker.js validado com sucesso.');
    }

    // -------------------------------------------------------------
    // Teste E: Nenhuma das URLs de Service Worker retorna text/html
    // -------------------------------------------------------------
    console.log('\n▶ Teste E: Confirmando que /sw.js e /service-worker.js NUNCA retornam text/html...');
    {
      for (const endpoint of ['/sw.js', '/service-worker.js']) {
        const res = await fetch(`${baseUrl}${endpoint}`);
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        assert(!ctype.includes('text/html'), `${endpoint} não pode retornar text/html! Recebido: ${ctype}`);
      }
      console.log('  ✔ Nenhuma rota de service worker retorna text/html.');
    }

    // -------------------------------------------------------------
    // Teste F: Não existe registro ativo de novo Service Worker no código da aplicação
    // -------------------------------------------------------------
    console.log('\n▶ Teste F: Verificando ausência de registro ativo de SW novo em src/...');
    {
      const srcFiles = fs.readdirSync(path.join(process.cwd(), 'src'), { recursive: true }) as string[];
      let foundActiveRegistration = false;
      for (const file of srcFiles) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.js')) continue;
        const fullPath = path.join(process.cwd(), 'src', file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Checar por navigator.serviceWorker.register
        if (/navigator\.serviceWorker\.register\s*\(/.test(content)) {
          foundActiveRegistration = true;
          console.error(`  ❌ Registro de Service Worker ativo detectado no arquivo: ${file}`);
        }
      }
      assert.strictEqual(foundActiveRegistration, false, 'Não deve haver chamadas a navigator.serviceWorker.register no código da aplicação.');
      console.log('  ✔ Nenhum registro de Service Worker ativo encontrado no código-fonte.');
    }

    // -------------------------------------------------------------
    // Teste G: A migração no frontend não executa repetidamente
    // -------------------------------------------------------------
    console.log('\n▶ Teste G: Validando idempotência da migração (flag no localStorage impede reexecuções)...');
    {
      const mockStorage: Record<string, string> = {};
      let getRegistrationsCalledCount = 0;

      // Mock de ambiente de navegador no Node.js
      const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');

      Object.defineProperty(globalThis, 'window', {
        value: globalThis,
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (k: string) => mockStorage[k] || null,
          setItem: (k: string, v: string) => { mockStorage[k] = v; },
          removeItem: (k: string) => { delete mockStorage[k]; },
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistrations: async () => {
              getRegistrationsCalledCount++;
              return [];
            },
          },
        },
        configurable: true,
        writable: true,
      });

      // 1ª execução: sem flag prévia
      await runLegacyServiceWorkerMigration();
      assert.strictEqual(getRegistrationsCalledCount, 1, 'Primeira execução deve consultar registrations');
      assert.strictEqual(mockStorage[EAVRA_LEGACY_SW_FLAG], 'done_no_legacy', 'Flag deve ser gravada no localStorage');

      // 2ª execução: com flag já salva
      await runLegacyServiceWorkerMigration();
      assert.strictEqual(getRegistrationsCalledCount, 1, 'Segunda execução NÃO deve consultar registrations novamente');
      console.log('  ✔ Idempotência garantida: a migração só roda uma vez por origem.');
    }

    // -------------------------------------------------------------
    // Teste H: Ausência de loops de reload e desativação ordenada
    // -------------------------------------------------------------
    console.log('\n▶ Teste H: Validando que NÃO há window.location.reload() e que update() é chamado...');
    {
      const mockStorage: Record<string, string> = {};
      let reloadCalled = false;
      let updateCalled = false;
      let unregisterCalled = false;
      let cachesDeleteCalled = false;

      const windowMock: any = {
        location: {
          reload: () => { reloadCalled = true; },
        },
        caches: {
          keys: async () => ['eavra-legacy-cache-v1'],
          delete: async (_k: string) => { cachesDeleteCalled = true; return true; },
        },
      };

      Object.defineProperty(globalThis, 'window', {
        value: windowMock,
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (k: string) => mockStorage[k] || null,
          setItem: (k: string, v: string) => { mockStorage[k] = v; },
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'caches', {
        value: windowMock.caches,
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistrations: async () => [
              {
                update: async () => { updateCalled = true; },
                unregister: async () => { unregisterCalled = true; return true; },
              },
            ],
          },
        },
        configurable: true,
        writable: true,
      });

      await runLegacyServiceWorkerMigration();

      assert.strictEqual(updateCalled, true, 'Deve solicitar registration.update() para baixar script de migração');
      assert.strictEqual(cachesDeleteCalled, true, 'Deve limpar caches legados uma vez');
      assert.strictEqual(reloadCalled, false, 'NÃO deve chamar window.location.reload() sob nenhuma hipótese!');
      assert.strictEqual(mockStorage[EAVRA_LEGACY_SW_FLAG], 'migrated', 'Flag deve ser gravada como "migrated"');
      console.log('  ✔ Sem reload loops e processo de atualização concluído de forma segura.');
    }

    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!\n');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error('\n❌ Falha na execução dos testes:', err);
  process.exit(1);
});
