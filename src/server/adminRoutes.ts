import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getServerDevSupabaseConfig } from './devSupabaseConfig.ts';
import { reviewProvisioningIdentity } from './userProvisioningSafety.js';
import { isActiveAdminCaller } from './adminAuthorization.js';
import {
  getTeacherPixKey,
  getAllTeacherPixKeys,
  setTeacherPixKey,
  deleteTeacherPixKey,
  TeacherPixStorageNotReadyError,
} from './teacherPixService.js';

export const adminRouter = Router();

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getServerDevSupabaseConfig();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

// POST /api/admin/create-or-resolve-user
// Fluxo exclusivamente administrativo. NÃO reconcilia perfis existentes automaticamente.
adminRouter.post('/create-or-resolve-user', async (req, res) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Sessão não informada.' });
    }

    const { email, password, role, teacher_id } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !['super_admin', 'admin', 'teacher'].includes(role) ||
        typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'E-mail, papel válido e senha inicial são obrigatórios.' });
    }
    if (role === 'teacher' && teacher_id != null && typeof teacher_id !== 'string') {
      return res.status(400).json({ success: false, error: 'Professor associado inválido.' });
    }

    const token = authorization.slice('Bearer '.length).trim();
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }
    const { data: callerProfile, error: profileError } = await userClient
      .from('profiles')
      .select('id, role, access_status')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError || !callerProfile || callerProfile.id !== caller.id ||
        callerProfile.role !== 'super_admin' || callerProfile.access_status !== 'active') {
      return res.status(403).json({ success: false, error: 'Apenas Super Admin ativo pode cadastrar usuários.' });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ success: false, error: 'Serviço administrativo não configurado.' });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Percorrer páginas de Auth; falha ao listar => não criar conta duplicada.
    let authUserId: string | null = null;
    let finished = false;
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (error || !data?.users) {
        return res.status(503).json({ success: false, error: 'Não foi possível verificar contas existentes.' });
      }
      const listedUsers: Array<{ id: string; email?: string | null }> = data.users;
      const found = listedUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      if (found) authUserId = found.id;
      if (found || listedUsers.length < 100) {
        finished = true;
        break;
      }
    }
    if (!finished) {
      return res.status(503).json({ success: false, error: 'A busca de contas excedeu o limite de auditoria.' });
    }

    const { data: profilesByEmail, error: lookupError } = await adminClient
      .from('profiles')
      .select('id, email')
      .ilike('email', cleanEmail)
      .limit(2);
    if (lookupError || !profilesByEmail) {
      return res.status(503).json({ success: false, error: 'Não foi possível verificar os perfis existentes.' });
    }
    const decision = reviewProvisioningIdentity(authUserId, cleanEmail, profilesByEmail);
    if (decision !== 'create_new') {
      return res.status(409).json({
        success: false,
        code: decision === 'already_linked' ? 'USER_ALREADY_EXISTS' : 'IDENTITY_REVIEW_REQUIRED',
        error: decision === 'already_linked'
          ? 'Conta e perfil já existem. Use a edição administrativa, sem recriar a conta.'
          : 'Identidade não conciliada. Revisão manual necessária; nenhum ID será modificado.',
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user?.id) {
      return res.status(500).json({ success: false, error: 'Não foi possível criar a conta de autenticação.' });
    }

    // Apenas INSERT, não UPSERT: nunca substituir um perfil ou papel preexistente.
    const { data: saved, error: insertError } = await adminClient
      .from('profiles')
      .insert([{
        id: created.user.id,
        email: cleanEmail,
        role,
        teacher_id: role === 'teacher' ? (teacher_id || null) : null,
        access_status: 'active',
        created_at: new Date().toISOString(),
      }])
      .select('id, email, role, teacher_id, access_status, created_at')
      .single();
    if (insertError || !saved) {
      // Rollback apenas da conta criada nesta própria requisição. Sem tocar em contas antigas.
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (rollbackError) console.error('[ADMIN] Falha no rollback de conta recém-criada. Intervenção manual necessária.');
      return res.status(500).json({
        success: false,
        error: 'Perfil não foi criado; verifique o resultado da operação antes de tentar novamente.',
      });
    }
    return res.status(201).json({ success: true, authUserId: created.user.id, profile: saved });
  } catch (error) {
    console.error('[ADMIN] Erro no cadastro administrativo:', error);
    return res.status(500).json({ success: false, error: 'Falha administrativa. Nenhuma reconciliação automática foi autorizada.' });
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
      .select('id, role, access_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr || !isActiveAdminCaller(callerProfile, user.id, ['super_admin'])) {
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

    // Não alterar Auth se não houver perfil válido para sincronizar.
    const { data: targetProfile, error: targetProfileErr } = await adminClient
      .from('profiles')
      .select('id, access_status')
      .eq('id', target_user_id)
      .maybeSingle();
    if (targetProfileErr || targetProfile?.id !== target_user_id) {
      return res.status(409).json({
        success: false,
        error: 'Conta sem perfil correspondente. Revisão manual necessária; nada foi alterado.',
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
    const { data: updatedProfile, error: profileUpdateErr } = await adminClient
      .from('profiles')
      .update({ access_status: target_access_status })
      .eq('id', target_user_id)
      .select('id, access_status')
      .maybeSingle();

    if (profileUpdateErr || updatedProfile?.id !== target_user_id ||
        updatedProfile?.access_status !== target_access_status) {
      // Reverter alteração no Auth para manter consistência absoluta
      const rollbackBanDuration = isBlocking ? 'none' : '876000h';
      await adminClient.auth.admin.updateUserById(target_user_id, { ban_duration: rollbackBanDuration });

      return res.status(500).json({
        success: false,
        error: 'Falha ao confirmar a alteração do perfil. A reversão no Auth foi solicitada; confira o estado do usuário antes de repetir.'
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

/**
 * Helper para validar autenticação e permissões administrativas (super_admin ou admin)
 */
async function checkAdminPixAuthorization(req: any): Promise<{
  authorized: boolean;
  statusCode: number;
  error?: string;
  user?: any;
  profile?: any;
}> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Token de autenticação não fornecido.',
    };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Token de autenticação não fornecido.',
    };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Sessão inválida ou expirada.',
    };
  }

  const { data: callerProfile, error: profErr } = await userClient
    .from('profiles')
    .select('id, role, teacher_id, access_status')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr || !isActiveAdminCaller(callerProfile, user.id, ['super_admin', 'admin'])) {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Permissão negada. Apenas administradores podem gerenciar chaves Pix de professores.',
    };
  }

  return { authorized: true, statusCode: 200, user, profile: callerProfile };
}

// GET /api/admin/teachers/pix-keys
// Lista todas as chaves Pix dos professores (restrito a super_admin e admin)
adminRouter.get('/teachers/pix-keys', async (req, res) => {
  try {
    const authCheck = await checkAdminPixAuthorization(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        success: false,
        error: authCheck.error,
      });
    }

    const pixKeys = await getAllTeacherPixKeys();
    return res.json({
      success: true,
      pixKeys,
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err instanceof TeacherPixStorageNotReadyError ? 503 : 500);
    return res.status(statusCode).json({
      success: false,
      code: err?.code || (err instanceof TeacherPixStorageNotReadyError ? 'STORAGE_NOT_READY' : undefined),
      error: err?.message || 'Erro ao consultar chaves Pix dos professores.',
    });
  }
});

// GET /api/admin/teachers/:teacherId/pix-key
// Consulta a chave Pix de um professor específico (restrito a super_admin e admin)
adminRouter.get('/teachers/:teacherId/pix-key', async (req, res) => {
  try {
    const authCheck = await checkAdminPixAuthorization(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        success: false,
        error: authCheck.error,
      });
    }

    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId é obrigatório.' });
    }

    const pixKey = await getTeacherPixKey(teacherId);
    return res.json({
      success: true,
      teacherId,
      pix_key: pixKey,
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err instanceof TeacherPixStorageNotReadyError ? 503 : 500);
    return res.status(statusCode).json({
      success: false,
      code: err?.code || (err instanceof TeacherPixStorageNotReadyError ? 'STORAGE_NOT_READY' : undefined),
      error: err?.message || 'Erro ao consultar chave Pix do professor.',
    });
  }
});

// PUT /api/admin/teachers/:teacherId/pix-key
// Cadastra ou atualiza a chave Pix de um professor (restrito a super_admin e admin)
adminRouter.put('/teachers/:teacherId/pix-key', async (req, res) => {
  try {
    const authCheck = await checkAdminPixAuthorization(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        success: false,
        error: authCheck.error,
      });
    }

    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId é obrigatório.' });
    }

    const { pix_key } = req.body;
    // pix_key pode ser string (com zeros à esquerda, símbolos) ou null/undefined se vazio
    const cleanPixKey = typeof pix_key === 'string' ? pix_key.trim() : null;

    await setTeacherPixKey(teacherId, cleanPixKey);

    return res.json({
      success: true,
      teacherId,
      pix_key: cleanPixKey,
      message: cleanPixKey ? 'Chave Pix salva com sucesso.' : 'Chave Pix removida.',
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err instanceof TeacherPixStorageNotReadyError ? 503 : 500);
    return res.status(statusCode).json({
      success: false,
      code: err?.code || (err instanceof TeacherPixStorageNotReadyError ? 'STORAGE_NOT_READY' : undefined),
      error: err?.message || 'Erro ao atualizar chave Pix do professor.',
    });
  }
});

// DELETE /api/admin/teachers/:teacherId/pix-key
// Remove a chave Pix de um professor (restrito a super_admin e admin)
adminRouter.delete('/teachers/:teacherId/pix-key', async (req, res) => {
  try {
    const authCheck = await checkAdminPixAuthorization(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        success: false,
        error: authCheck.error,
      });
    }

    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId é obrigatório.' });
    }

    await deleteTeacherPixKey(teacherId);

    return res.json({
      success: true,
      teacherId,
      message: 'Chave Pix removida com sucesso.',
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err instanceof TeacherPixStorageNotReadyError ? 503 : 500);
    return res.status(statusCode).json({
      success: false,
      code: err?.code || (err instanceof TeacherPixStorageNotReadyError ? 'STORAGE_NOT_READY' : undefined),
      error: err?.message || 'Erro ao remover chave Pix do professor.',
    });
  }
});

