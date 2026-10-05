import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export const adminRouter = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const rawSupabaseKey = (process.env.SUPABASE_KEY || '').replace(/^.*?eyJ/, 'eyJ').trim();
const SUPABASE_ANON_KEY = rawSupabaseKey.startsWith('eyJ')
  ? rawSupabaseKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

// POST /api/admin/create-or-resolve-user
// Garante que public.profiles.id seja rigorosamente idêntico ao auth.users.id
adminRouter.post('/create-or-resolve-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { email, password, role, teacher_id } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'E-mail e role são obrigatórios.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Validar solicitante via JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user: callerUser }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerUser) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }

    // 2. Validar que solicitante é super_admin
    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Permissão negada. Apenas Super Administradores podem criar ou sincronizar usuários.'
      });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({
        success: false,
        error: 'Chave administrativa não configurada no servidor.'
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 3. Buscar se o usuário já existe no Supabase Auth
    let authUserId: string | null = null;
    const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
    if (!listErr && listData?.users) {
      const existing = listData.users.find((u: any) => u.email?.toLowerCase().trim() === cleanEmail);
      if (existing) {
        authUserId = existing.id;
      }
    }

    // 4. Se não existir no Auth e houver senha, criar conta oficial no Supabase Auth
    if (!authUserId) {
      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Para criar um novo usuário no Supabase Auth é necessário fornecer uma senha de no mínimo 6 dígitos.'
        });
      }

      const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
      });

      if (createAuthErr || !createdAuth?.user) {
        return res.status(500).json({
          success: false,
          error: `Falha ao criar usuário no Supabase Auth: ${createAuthErr?.message || 'Erro desconhecido'}`
        });
      }

      authUserId = createdAuth.user.id;
    }

    // 5. Garantir que public.profiles receba EXATAMENTE o authUserId como chave primária
    const profilePayload = {
      id: authUserId,
      email: cleanEmail,
      role: role,
      teacher_id: role === 'teacher' && teacher_id ? teacher_id : null,
      temp_password: password || null,
      access_status: 'active',
      created_at: new Date().toISOString()
    };

    const { data: savedProfile, error: profileErr } = await adminClient
      .from('profiles')
      .upsert([profilePayload])
      .select()
      .single();

    if (profileErr) {
      return res.status(500).json({
        success: false,
        error: `Falha ao salvar perfil sincronizado em public.profiles: ${profileErr.message}`
      });
    }

    return res.json({
      success: true,
      authUserId,
      profile: savedProfile,
      message: 'Usuário sincronizado com sucesso: profiles.id é rigorosamente igual a auth.users.id.'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro interno do servidor.' });
  }
});

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
