import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export const adminRouter = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const rawSupabaseKey = (process.env.SUPABASE_KEY || '').replace(/^.*?eyJ/, 'eyJ').trim();
const SUPABASE_ANON_KEY = rawSupabaseKey.startsWith('eyJ')
  ? rawSupabaseKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// POST /api/admin/toggle-user-access
adminRouter.post('/toggle-user-access', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { target_user_id, target_access_status } = req.body;

    if (!target_user_id || !target_access_status) {
      return res.status(400).json({ success: false, error: 'target_user_id e target_access_status são obrigatórios.' });
    }

    if (target_access_status !== 'active' && target_access_status !== 'blocked') {
      return res.status(400).json({ success: false, error: 'Status deve ser "active" ou "blocked".' });
    }

    // Criar cliente autenticado com o JWT do solicitante
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }

    // Validar se o solicitante possui role super_admin
    const { data: callerProfile, error: profErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr || !callerProfile || callerProfile.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Permissão negada. Apenas Super Administradores podem alterar o status de acesso de usuários.'
      });
    }

    // Impedir auto-bloqueio
    if (user.id === target_user_id && target_access_status === 'blocked') {
      return res.status(400).json({
        success: false,
        error: 'Operação não permitida: você não pode bloquear seu próprio acesso de Super Administrador.'
      });
    }

    // 1. Execução direta via Supabase Auth Admin API (Mecanismo Oficial Server-Side)
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({
        success: false,
        error: 'Chave SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Utilize a Supabase Edge Function ou configure a chave secreta de serviço nas variáveis de ambiente do backend.',
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validar se o usuário existe no Auth do Supabase
    const { data: targetAuthUser, error: getAuthErr } = await adminClient.auth.admin.getUserById(target_user_id);
    if (getAuthErr || !targetAuthUser?.user) {
      return res.status(404).json({
        success: false,
        error: `Usuário não encontrado no Supabase Auth: ${getAuthErr?.message || 'ID inexistente'}`
      });
    }

    // Atualizar Supabase Auth com ban_duration
    const isBlocking = target_access_status === 'blocked';
    const banDuration = isBlocking ? '876000h' : 'none';

    const { data: updatedAuthUser, error: authErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
      ban_duration: banDuration,
    });

    if (authErr || !updatedAuthUser?.user) {
      return res.status(500).json({
        success: false,
        error: `Falha ao sincronizar estado no Supabase Auth via Admin API: ${authErr?.message || 'Erro desconhecido'}`
      });
    }

    // Atualizar profiles.access_status SOMENTE APÓS confirmação de sucesso no Auth
    const { error: profileUpdateErr } = await adminClient
      .from('profiles')
      .update({ access_status: target_access_status })
      .eq('id', target_user_id);

    if (profileUpdateErr) {
      // Reverter alteração no Auth para manter consistência absoluta
      const rollbackBanDuration = isBlocking ? 'none' : '876000h';
      await adminClient.auth.admin.updateUserById(target_user_id, { ban_duration: rollbackBanDuration });

      return res.status(500).json({
        success: false,
        error: `Falha ao atualizar public.profiles: ${profileUpdateErr.message}. Ação revertida no Supabase Auth por consistência.`
      });
    }

    return res.json({
      success: true,
      message: isBlocking
        ? 'Usuário bloqueado com sucesso no Supabase Auth e no perfil.'
        : 'Acesso do usuário liberado com sucesso no Supabase Auth e no perfil.',
      access_status: target_access_status,
      banned: isBlocking,
      user_id: target_user_id,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro interno do servidor.' });
  }
});
