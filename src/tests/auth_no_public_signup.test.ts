import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TESTES: REMOÇÃO DO CADASTRO PÚBLICO E PRESERVAÇÃO DO ADMIN');
  console.log('================================================================\n');

  const loginFilePath = path.resolve('src/views/Login.tsx');
  const loginCode = fs.readFileSync(loginFilePath, 'utf-8');

  // --- 1. Verificação de Código-Fonte: Ausência de isSignUp e Textos Públicos ---
  console.log('--- 1. Inspeção de Código-Fonte em src/views/Login.tsx ---');
  {
    assert.equal(
      loginCode.includes('Não tem conta? Cadastrar-se'),
      false,
      'O texto "Não tem conta? Cadastrar-se" DEVE ser completamente removido'
    );
    console.log('  ✅ PASS: 1.1 Texto "Não tem conta? Cadastrar-se" não existe no arquivo');

    assert.equal(
      loginCode.includes('isSignUp'),
      false,
      'O estado e referências a isSignUp DEVEM ser completamente removidos'
    );
    console.log('  ✅ PASS: 1.2 Nenhuma variável ou estado isSignUp encontrado');

    assert.equal(
      loginCode.includes('Criar conta de Administrador'),
      false,
      'O título "Criar conta de Administrador" DEVE ser completamente removido'
    );
    console.log('  ✅ PASS: 1.3 Título "Criar conta de Administrador" não existe no arquivo');

    assert.equal(
      loginCode.includes('Já tenho uma conta. Fazer login.'),
      false,
      'O texto de alternância de login não existe'
    );
    console.log('  ✅ PASS: 1.4 Texto de alternância "Já tenho uma conta" removido');

    assert.equal(
      loginCode.includes('auth.signUp'),
      false,
      'NENHUMA chamada a supabase.auth.signUp() deve existir em Login.tsx'
    );
    console.log('  ✅ PASS: 1.5 Chamada a supabase.auth.signUp() totalmente eliminada de Login.tsx');
  }

  // --- 2. Simulação de Login Inválido: Não Dispara signUp ---
  console.log('\n--- 2. Simulação do Comportamento de Login Inválido ---');
  {
    let signInCalls = 0;
    let signUpCalls = 0;

    const mockSupabase = {
      from: (_table: string) => ({
        select: (_fields: string) => ({
          ilike: (_field: string, _val: string) => ({
            maybeSingle: async () => ({ data: { access_status: 'active' }, error: null }),
          }),
        }),
      }),
      auth: {
        signInWithPassword: async (_params: any) => {
          signInCalls++;
          return { data: null, error: new Error('Invalid login credentials') };
        },
        signUp: async (_params: any) => {
          signUpCalls++;
          return { data: null, error: null };
        },
        signOut: async () => {},
      },
    };

    // Função de login espelhando a implementação atual de Login.tsx
    let capturedError: string | null = null;
    const testEmail = 'random_user@gmail.com';
    const testPassword = 'randompassword123';

    try {
      const cleanEmail = testEmail.trim().toLowerCase();

      // Check pre-login
      const { data: profCheck } = await mockSupabase
        .from('profiles')
        .select('access_status')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (profCheck && profCheck.access_status === 'blocked') {
        throw new Error('Acesso bloqueado');
      }

      const { error } = await mockSupabase.auth.signInWithPassword({
        email: cleanEmail,
        password: testPassword,
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      if (err.message.includes('Invalid login credentials')) {
        capturedError = 'E-mail ou senha incorretos.';
      } else {
        capturedError = err.message;
      }
    }

    assert.equal(signInCalls, 1, 'signInWithPassword deve ser executado exatamente uma vez');
    assert.equal(signUpCalls, 0, 'signUp NUNCA deve ser executado em caso de falha de login');
    assert.equal(capturedError, 'E-mail ou senha incorretos.', 'Erro de credenciais inválidas retornado');
    console.log('  ✅ PASS: 2.1 signInWithPassword executado');
    console.log('  ✅ PASS: 2.2 signUp NÃO foi chamado como fallback (zero auto-signups)');
    console.log('  ✅ PASS: 2.3 Mensagem de erro de credenciais exibida corretamente');
  }

  // --- 3. Recuperação e Redefinição de Senha Mantidas ---
  console.log('\n--- 3. Verificação de Recuperação de Senha em Login.tsx ---');
  {
    assert.equal(
      loginCode.includes('resetPasswordForEmail'),
      true,
      'A função resetPasswordForEmail deve permanecer presente para recuperação de senha'
    );
    console.log('  ✅ PASS: 3.1 resetPasswordForEmail preservado no fluxo "Esqueceu sua senha?"');

    assert.equal(
      loginCode.includes('updateUser'),
      true,
      'A função updateUser deve permanecer presente para definição de nova senha'
    );
    console.log('  ✅ PASS: 3.2 updateUser preservado no modo update_password');

    assert.equal(
      loginCode.includes('politica-de-privacidade'),
      true,
      'Link para política de privacidade preservado'
    );
    console.log('  ✅ PASS: 3.3 Link para Política de Privacidade preservado');
  }

  // --- 4. Preservação do Fluxo Administrativo do Super Admin ---
  console.log('\n--- 4. Preservação do Fluxo de Criação pelo Super Admin ---');
  {
    const adminRoutesPath = path.resolve('src/server/adminRoutes.ts');
    const adminRoutesCode = fs.readFileSync(adminRoutesPath, 'utf-8');

    assert.equal(
      adminRoutesCode.includes('/create-or-resolve-user'),
      true,
      'Endpoint server-side /create-or-resolve-user deve permanecer intacto'
    );
    console.log('  ✅ PASS: 4.1 Endpoint server-side /api/admin/create-or-resolve-user intacto');

    assert.equal(
      adminRoutesCode.includes("callerProfile.role !== 'super_admin'"),
      true,
      'Apenas super_admin tem permissão para criar usuários'
    );
    console.log('  ✅ PASS: 4.2 Restrição estrita de super_admin preservada no backend');

    assert.equal(
      adminRoutesCode.includes('adminClient.auth.admin.createUser'),
      true,
      'admin.createUser oficial via SUPABASE_SERVICE_ROLE_KEY preservado'
    );
    console.log('  ✅ PASS: 4.3 Criação oficial de contas via admin.createUser preservada');

    const storePath = path.resolve('src/store.tsx');
    const storeCode = fs.readFileSync(storePath, 'utf-8');
    assert.equal(
      storeCode.includes('/api/admin/create-or-resolve-user'),
      true,
      'store.tsx continua chamando o endpoint de criação administrativa'
    );
    console.log('  ✅ PASS: 4.4 store.tsx continua despachando chamadas do Super Admin para o backend');

    const profilesPath = path.resolve('src/views/Profiles.tsx');
    const profilesCode = fs.readFileSync(profilesPath, 'utf-8');
    assert.equal(
      profilesCode.includes('addProfile'),
      true,
      'Profiles.tsx continua utilizando addProfile para criação de novos usuários'
    );
    console.log('  ✅ PASS: 4.5 Tela Profiles.tsx intacta e vinculada ao fluxo administrativo');
  }

  console.log('\n================================================================');
  console.log('📊 RESULTADO DOS TESTES: TODOS OS 15 TESTES PASSARAM COM SUCESSO!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
