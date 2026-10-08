import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { googleCalendarRouter } from './src/server/googleCalendarRoutes.js';
import { validateGoogleOAuthConfig } from './src/server/googleCalendarService.js';
import { adminRouter } from './src/server/adminRoutes.js';

dotenv.config({ override: false });

// Garantir que SUPABASE_KEY contenha SOMENTE a chave Supabase limpa (sem rótulos descritivos ou espaços)
if (process.env.SUPABASE_KEY) {
  process.env.SUPABASE_KEY = process.env.SUPABASE_KEY.replace(/^.*?eyJ/, 'eyJ').trim();
}

// Validação segura de inicialização do Google OAuth (sem expor nenhum valor)
const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
const secretMatchesId = Boolean(
  hasClientId &&
  hasClientSecret &&
  process.env.GOOGLE_CLIENT_ID!.trim() === process.env.GOOGLE_CLIENT_SECRET!.trim()
);
const hasRedirectUri = Boolean(process.env.GOOGLE_REDIRECT_URI?.trim());

console.log(`[Google OAuth Startup Audit] GOOGLE_CLIENT_ID configured: ${hasClientId}`);
console.log(`[Google OAuth Startup Audit] GOOGLE_CLIENT_SECRET configured: ${hasClientSecret}`);
console.log(`[Google OAuth Startup Audit] GOOGLE_CLIENT_SECRET matches GOOGLE_CLIENT_ID: ${secretMatchesId}`);
console.log(`[Google OAuth Startup Audit] GOOGLE_REDIRECT_URI configured: ${hasRedirectUri}`);

const oauthValidation = validateGoogleOAuthConfig();
if (!oauthValidation.valid) {
  if (secretMatchesId) {
    console.error('[Google OAuth] Erro de configuração: GOOGLE_CLIENT_SECRET idêntico ao GOOGLE_CLIENT_ID.');
  } else {
    console.warn(`[Google OAuth Warning] ${oauthValidation.error}`);
  }
} else {
  console.log('[Google OAuth] Configuração de credenciais validada com sucesso no startup.');
}

// Script de migração para desativar qualquer Service Worker legado do EAVRA
export const LEGACY_SW_SCRIPT = `/* Legacy Service Worker Migration - EAVRA */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
      if ('caches' in self) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
      if (self.registration && typeof self.registration.unregister === 'function') {
        await self.registration.unregister();
      }
    })()
  );
});
`;

export const handleLegacyServiceWorker = (_req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(LEGACY_SW_SCRIPT);
};

export const PRIVACY_POLICY_CANONICAL_URL = 'https://institutoiacra.com.br/politica-de-privacidade';

export const getPrivacyPolicyHtmlPath = (): string => {
  let baseDir = process.cwd();
  try {
    if (typeof __dirname !== 'undefined') {
      baseDir = __dirname;
    } else if (import.meta?.url) {
      baseDir = path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    baseDir = process.cwd();
  }

  const candidatePaths = [
    path.join(process.cwd(), 'public-site', 'politica-de-privacidade', 'index.html'),
    path.join(process.cwd(), 'dist', 'politica-de-privacidade', 'index.html'),
    path.join(process.cwd(), 'public', 'politica-de-privacidade', 'index.html'),
    path.join(baseDir, 'politica-de-privacidade', 'index.html'),
    path.join(baseDir, '..', 'public-site', 'politica-de-privacidade', 'index.html'),
    path.join(baseDir, '..', 'dist', 'politica-de-privacidade', 'index.html'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(process.cwd(), 'public-site', 'politica-de-privacidade', 'index.html');
};

export const handlePrivacyPolicy = (_req: express.Request, res: express.Response) => {
  const filePath = getPrivacyPolicyHtmlPath();
  if (fs.existsSync(filePath)) {
    const html = fs.readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(html);
  }
  res.status(404).setHeader('Content-Type', 'text/plain; charset=UTF-8').send('Política de Privacidade não encontrada.');
};

export async function createApp() {
  const app = express();

  // Parser JSON para payloads de API
  app.use(express.json());

  // Rotas da API FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Rotas de Integração Google Calendar (Seguras, server-side)
  app.use('/api/google', googleCalendarRouter);

  // Rotas Administrativas Seguras (Validação Super Admin)
  app.use('/api/admin', adminRouter);

  // Rotas explícitas para Service Worker legado (sempre antes de static e do fallback SPA)
  // NUNCA responder index.html ou text/html para essas rotas!
  app.get('/sw.js', handleLegacyServiceWorker);
  app.get('/service-worker.js', handleLegacyServiceWorker);

  // Rota estática direta para a Política de Privacidade (Google Search Console / SEO / LGPD)
  // Serve diretamente o HTML estático completo sem passar pelo fallback SPA ou autenticação
  app.get(['/politica-de-privacidade', '/politica-de-privacidade/'], handlePrivacyPolicy);

  // Vite middleware em desenvolvimento / arquivos estáticos em produção
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test-prod') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // 1. Assets Vite com hash: cache imutável de longo prazo (1 ano)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }));

    // 2. Demais arquivos estáticos da pasta dist
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    // 3. Fallback SPA: index.html SEMPRE revalidado sem cache
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

const isMainModule = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs'))
);

// Iniciar servidor somente quando executado diretamente como arquivo principal
if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer();
}
