import express from 'express';
import path from 'path';
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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

  // Vite middleware em desenvolvimento / arquivos estáticos em produção
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
