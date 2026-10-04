import assert from 'node:assert';

/**
 * Testes Unitários e de Integração: Bloqueio de Acesso via Auth Admin API
 * Valida a integridade da arquitetura de bloqueio oficial, validação de regras de negócio,
 * atomicidade de transação e proteção contra auto-bloqueio de Super Admin.
 */

// Simulação da lógica de validação e execução da Edge Function / Auth Admin API
interface ToggleRequest {
  callerRole: string;
  callerId: string;
  targetUserId: string;
  targetAccessStatus: 'active' | 'blocked';
  authAdminMock: {
    updateUserById: (id: string, attrs: { ban_duration: string }) => Promise<{ success: boolean; error?: string; banned_until?: string | null }>;
  };
  profilesMock: {
    update: (id: string, accessStatus: string) => Promise<{ success: boolean; error?: string }>;
  };
}

async function processToggleAccess(req: ToggleRequest) {
  // 1. Validar role
  if (req.callerRole !== 'super_admin') {
    return { status: 403, success: false, error: 'Permissão negada. Apenas Super Administradores podem bloquear ou liberar acesso de usuários.' };
  }

  // 2. Validar status
  if (req.targetAccessStatus !== 'active' && req.targetAccessStatus !== 'blocked') {
    return { status: 400, success: false, error: 'target_access_status inválido.' };
  }

  // 3. Impedir auto-bloqueio
  if (req.callerId === req.targetUserId && req.targetAccessStatus === 'blocked') {
    return { status: 400, success: false, error: 'Operação não permitida: você não pode bloquear a sua própria conta de Super Administrador.' };
  }

  // 4. Executar no Auth Admin API
  const isBlocking = req.targetAccessStatus === 'blocked';
  const banDuration = isBlocking ? '876000h' : 'none';
  const authRes = await req.authAdminMock.updateUserById(req.targetUserId, { ban_duration: banDuration });

  if (!authRes.success) {
    // REGRA DE CONSISTÊNCIA: NÃO ATUALIZAR PROFILES SE AUTH FALHAR
    return { status: 500, success: false, error: `Falha no Supabase Auth: ${authRes.error}` };
  }

  // 5. Atualizar profiles SOMENTE APÓS sucesso no Auth
  const profRes = await req.profilesMock.update(req.targetUserId, req.targetAccessStatus);
  if (!profRes.success) {
    // Rollback no Auth
    await req.authAdminMock.updateUserById(req.targetUserId, { ban_duration: isBlocking ? 'none' : '876000h' });
    return { status: 500, success: false, error: `Falha ao atualizar perfil: ${profRes.error}. Revertido no Auth.` };
  }

  return {
    status: 200,
    success: true,
    access_status: req.targetAccessStatus,
    banned: isBlocking,
    banned_until: authRes.banned_until,
  };
}

async function runTests() {
  console.log('--- Iniciando Testes de Bloqueio via Supabase Auth Admin API ---');

  // TESTE 1: Bloqueio de usuário por Super Admin
  {
    let authUpdatedWithBan: string | null = null;
    let profileUpdatedStatus: string | null = null;

    const res = await processToggleAccess({
      callerRole: 'super_admin',
      callerId: 'super-admin-1',
      targetUserId: 'user-alvo-123',
      targetAccessStatus: 'blocked',
      authAdminMock: {
        updateUserById: async (id, attrs) => {
          authUpdatedWithBan = attrs.ban_duration;
          return { success: true, banned_until: '2126-09-18T00:00:00Z' };
        }
      },
      profilesMock: {
        update: async (id, status) => {
          profileUpdatedStatus = status;
          return { success: true };
        }
      }
    });

    assert.strictEqual(res.success, true, 'Bloqueio deve retornar sucesso');
    assert.strictEqual(res.status, 200, 'Status HTTP deve ser 200');
    assert.strictEqual(authUpdatedWithBan, '876000h', 'Deve aplicar ban_duration de longa duração oficial');
    assert.strictEqual(profileUpdatedStatus, 'blocked', 'Profile deve ser atualizado para blocked');
    console.log('✔ TESTE 1 PASSOU: Super Admin bloqueia usuário com sucesso via Auth Admin API');
  }

  // TESTE 2: Liberação de usuário por Super Admin
  {
    let authUpdatedWithBan: string | null = null;
    let profileUpdatedStatus: string | null = null;

    const res = await processToggleAccess({
      callerRole: 'super_admin',
      callerId: 'super-admin-1',
      targetUserId: 'user-alvo-123',
      targetAccessStatus: 'active',
      authAdminMock: {
        updateUserById: async (id, attrs) => {
          authUpdatedWithBan = attrs.ban_duration;
          return { success: true, banned_until: null };
        }
      },
      profilesMock: {
        update: async (id, status) => {
          profileUpdatedStatus = status;
          return { success: true };
        }
      }
    });

    assert.strictEqual(res.success, true, 'Liberação deve retornar sucesso');
    assert.strictEqual(authUpdatedWithBan, 'none', 'Deve remover banimento com ban_duration: none');
    assert.strictEqual(profileUpdatedStatus, 'active', 'Profile deve ser atualizado para active');
    console.log('✔ TESTE 2 PASSOU: Super Admin libera usuário com sucesso via Auth Admin API');
  }

  // TESTE 3: Auto-bloqueio de Super Admin deve ser impedido
  {
    const res = await processToggleAccess({
      callerRole: 'super_admin',
      callerId: 'super-admin-1',
      targetUserId: 'super-admin-1',
      targetAccessStatus: 'blocked',
      authAdminMock: {
        updateUserById: async () => ({ success: true })
      },
      profilesMock: {
        update: async () => ({ success: true })
      }
    });

    assert.strictEqual(res.success, false, 'Auto-bloqueio deve falhar');
    assert.strictEqual(res.status, 400, 'Status deve ser 400');
    assert.match(res.error || '', /não pode bloquear a sua própria conta/);
    console.log('✔ TESTE 3 PASSOU: Tentativa de auto-bloqueio de Super Admin é estritamente bloqueada');
  }

  // TESTE 4: Admin comum não tem permissão para bloquear/liberar
  {
    const res = await processToggleAccess({
      callerRole: 'admin',
      callerId: 'admin-comum-1',
      targetUserId: 'user-alvo-123',
      targetAccessStatus: 'blocked',
      authAdminMock: {
        updateUserById: async () => ({ success: true })
      },
      profilesMock: {
        update: async () => ({ success: true })
      }
    });

    assert.strictEqual(res.success, false, 'Admin comum não pode bloquear');
    assert.strictEqual(res.status, 403, 'Status deve ser 403 Forbidden');
    console.log('✔ TESTE 4 PASSOU: Admin comum tem acesso negado ao tentar bloquear');
  }

  // TESTE 5: Professor não tem permissão para bloquear/liberar
  {
    const res = await processToggleAccess({
      callerRole: 'teacher',
      callerId: 'prof-1',
      targetUserId: 'user-alvo-123',
      targetAccessStatus: 'blocked',
      authAdminMock: {
        updateUserById: async () => ({ success: true })
      },
      profilesMock: {
        update: async () => ({ success: true })
      }
    });

    assert.strictEqual(res.success, false, 'Professor não pode bloquear');
    assert.strictEqual(res.status, 403, 'Status deve ser 403 Forbidden');
    console.log('✔ TESTE 5 PASSOU: Professor tem acesso negado ao tentar bloquear');
  }

  // TESTE 6: Se o Supabase Auth falhar, NÃO atualizar profiles.access_status (atomicidade / sem sucesso falso)
  {
    let profileUpdated = false;

    const res = await processToggleAccess({
      callerRole: 'super_admin',
      callerId: 'super-admin-1',
      targetUserId: 'user-alvo-123',
      targetAccessStatus: 'blocked',
      authAdminMock: {
        updateUserById: async () => ({ success: false, error: 'Rate limit excedido no GoTrue Auth' })
      },
      profilesMock: {
        update: async () => {
          profileUpdated = true;
          return { success: true };
        }
      }
    });

    assert.strictEqual(res.success, false, 'Deve retornar falha se o Auth falhar');
    assert.strictEqual(profileUpdated, false, 'Profile NUNCA deve ser atualizado se o Auth falhar');
    console.log('✔ TESTE 6 PASSOU: Atomicidade preservada; profiles não é alterado quando Auth falha');
  }

  console.log('--- TODOS OS TESTES PASSARAM COM SUCESSO ---');
}

runTests().catch(err => {
  console.error('ERRO NOS TESTES:', err);
  process.exit(1);
});
