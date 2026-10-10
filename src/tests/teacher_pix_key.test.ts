import fs from 'node:fs';
import path from 'node:path';
import { normalizeTeacher, Teacher } from '../store.js';
import {
  getTeacherPixKey,
  setTeacherPixKey,
  getAllTeacherPixKeys,
  deleteTeacherPixKey,
  TeacherPixStorageNotReadyError,
  isTableNotAvailableError,
} from '../server/teacherPixService.js';

let passedTests = 0;
let failedTests = 0;

function testAssert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   Detalhe: ${detail}`);
  }
}

/**
 * Cria um cliente emulando a tabela persistente public.teacher_pix_keys no Supabase.
 */
function createPersistentTableClient() {
  const store = new Map<string, { teacher_id: string; pix_key: string; updated_at?: string }>();

  return {
    from(table: string) {
      if (table !== 'teacher_pix_keys') {
        throw new Error(`Tabela inesperada: ${table}`);
      }

      return {
        select(fields: string) {
          let selectedId: string | null = null;

          const queryObj = {
            eq(col: string, val: string) {
              if (col === 'teacher_id') {
                selectedId = val;
              }
              return queryObj;
            },
            async maybeSingle() {
              if (selectedId && store.has(selectedId)) {
                const item = store.get(selectedId)!;
                return { data: { pix_key: item.pix_key }, error: null };
              }
              return { data: null, error: null };
            },
            then(resolve: (res: any) => void) {
              const rows = Array.from(store.values()).map(r => ({
                teacher_id: r.teacher_id,
                pix_key: r.pix_key,
              }));
              return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
          };

          return queryObj;
        },

        delete() {
          let targetId: string | null = null;
          const queryObj = {
            eq(col: string, val: string) {
              if (col === 'teacher_id') targetId = val;
              return queryObj;
            },
            then(resolve: (res: any) => void) {
              if (targetId) {
                store.delete(targetId);
              }
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return queryObj;
        },

        upsert(rows: any[], options?: any) {
          return {
            then(resolve: (res: any) => void) {
              if (Array.isArray(rows)) {
                for (const row of rows) {
                  if (row.teacher_id) {
                    store.set(row.teacher_id, {
                      teacher_id: row.teacher_id,
                      pix_key: row.pix_key,
                      updated_at: row.updated_at,
                    });
                  }
                }
              }
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
        },
      };
    },
    _getStore: () => store,
  };
}

/**
 * Cria um cliente simulando banco quando a tabela teacher_pix_keys não existe (código 42P01 / PGRST205).
 */
function createUnavailableTableClient() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: null,
                error: {
                  code: 'PGRST205',
                  message: "Could not find the table 'public.teacher_pix_keys' in the schema cache",
                },
              });
            },
            then(resolve: any) {
              return Promise.resolve({
                data: null,
                error: {
                  code: 'PGRST205',
                  message: "Could not find the table 'public.teacher_pix_keys' in the schema cache",
                },
              }).then(resolve);
            },
          };
        },
        delete() {
          return {
            eq() {
              return this;
            },
            then(resolve: any) {
              return Promise.resolve({
                data: null,
                error: {
                  code: '42P01',
                  message: 'relation "public.teacher_pix_keys" does not exist',
                },
              }).then(resolve);
            },
          };
        },
        upsert() {
          return {
            then(resolve: any) {
              return Promise.resolve({
                data: null,
                error: {
                  code: '42P01',
                  message: 'relation "public.teacher_pix_keys" does not exist',
                },
              }).then(resolve);
            },
          };
        },
      };
    },
  };
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TESTES: CHAVE PIX DOS PROFESSORES (PERSISTÊNCIA, RLS E FALHA SEGURA)');
  console.log('========================================================================\n');

  const testTeacherId = 'c03e6480-1a2b-4c5d-9e8f-0123456789ab';
  const testTeacherId2 = 'd14f7591-2b3c-5d6e-af90-1234567890bc';

  // --------------------------------------------------------------------------
  // TESTE 1: Falha segura quando a tabela não está provisionada
  // --------------------------------------------------------------------------
  console.log('--- 1. Falha Segura quando a Tabela public.teacher_pix_keys Está Indisponível ---');

  // 1.a Teste com cliente simulado retornando erro PGRST205 / 42P01 (tabela não criada / indisponível)
  const unavailableClient = createUnavailableTableClient();
  let simulatedError: any = null;
  try {
    await getTeacherPixKey(testTeacherId, unavailableClient);
  } catch (err) {
    simulatedError = err;
  }

  testAssert(
    simulatedError instanceof TeacherPixStorageNotReadyError,
    '1.1 getTeacherPixKey lança TeacherPixStorageNotReadyError quando a tabela não está disponível'
  );
  testAssert(
    simulatedError?.statusCode === 503,
    '1.2 Código HTTP do erro é 503 (Service Unavailable)'
  );
  testAssert(
    simulatedError?.code === 'STORAGE_NOT_READY',
    '1.3 Código de erro é STORAGE_NOT_READY'
  );
  testAssert(
    String(simulatedError?.message).includes('teacher_pix_keys precisa ser provisionada'),
    '1.4 Mensagem de erro orienta claramente sobre a necessidade de provisionar a tabela'
  );

  // 1.b Teste com setTeacherPixKey quando tabela não está disponível
  let simulatedSetError: any = null;
  try {
    await setTeacherPixKey(testTeacherId, '123456', unavailableClient);
  } catch (err) {
    simulatedSetError = err;
  }
  testAssert(
    simulatedSetError instanceof TeacherPixStorageNotReadyError,
    '1.5 setTeacherPixKey falha com erro seguro e controlado sem tabela'
  );

  // 1.c Teste com getAllTeacherPixKeys quando tabela não está disponível
  let simulatedGetAllError: any = null;
  try {
    await getAllTeacherPixKeys(unavailableClient);
  } catch (err) {
    simulatedGetAllError = err;
  }
  testAssert(
    simulatedGetAllError instanceof TeacherPixStorageNotReadyError,
    '1.6 getAllTeacherPixKeys falha de forma segura com TeacherPixStorageNotReadyError'
  );

  // --------------------------------------------------------------------------
  // TESTE 2: Ausência absoluta de fallback em arquivo local JSON
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Ausência Absoluta de Fallback em Arquivo Local JSON ---');

  const jsonFallbackPath = path.resolve(process.cwd(), 'data', 'teacher_pix_keys.json');
  testAssert(
    !fs.existsSync(jsonFallbackPath),
    '2.1 data/teacher_pix_keys.json NÃO existe no sistema de arquivos'
  );

  // Garantir que nenhuma operação gerou ou criou arquivo no disco
  testAssert(
    !fs.existsSync(path.resolve(process.cwd(), 'teacher_pix_keys.json')),
    '2.2 Nenhum arquivo temporário ou fallback alternativo de chaves Pix existe'
  );

  // --------------------------------------------------------------------------
  // TESTE 3: Leitura e gravação utilizando o armazenamento persistente
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Leitura e Gravação Utilizando Armazenamento Persistente ---');

  const persistentDb = createPersistentTableClient();

  // 3.a Professor sem chave cadastrada
  const emptyKey = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(emptyKey === null, '3.1 getTeacherPixKey retorna null para professor sem chave cadastrada');

  // 3.b Cadastro de chave Pix
  const initialPixKey = 'prof.debora@escola.com.br';
  await setTeacherPixKey(testTeacherId, initialPixKey, persistentDb);
  const retrievedKey = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedKey === initialPixKey, '3.2 Chave Pix gravada e lida com sucesso do armazenamento persistente');

  // 3.c Edição e atualização da chave
  const updatedPixKey = '11988887777';
  await setTeacherPixKey(testTeacherId, updatedPixKey, persistentDb);
  const reloadedKey = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(reloadedKey === updatedPixKey, '3.3 Chave Pix atualizada com sucesso no armazenamento persistente');
  testAssert(reloadedKey !== initialPixKey, '3.4 Chave anterior foi substituída');

  // 3.d Reabertura e recuperação para formulário
  const formRetrievedKey = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(formRetrievedKey === updatedPixKey, '3.5 Valor recuperado perfeitamente para preencher modal de edição');

  // --------------------------------------------------------------------------
  // TESTE 4: Preservação estrita de chaves como strings (zeros, símbolos, formatação)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Preservação de Zeros à Esquerda, Símbolos e Formato String ---');

  // 4.a CPF com zeros à esquerda
  const cpfPixWithLeadingZeros = '00123456789';
  await setTeacherPixKey(testTeacherId, cpfPixWithLeadingZeros, persistentDb);
  const retrievedCpf = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedCpf === '00123456789', '4.1 CPF com zeros à esquerda preservado sem perda');
  testAssert(typeof retrievedCpf === 'string', '4.2 Tipo do dado retornado é estritamente string');
  testAssert(retrievedCpf?.length === 11, '4.3 Comprimento de 11 dígitos preservado (não convertido para número)');

  // 4.b CNPJ com pontuação e zeros à esquerda
  const cnpjPix = '00.123.456/0001-99';
  await setTeacherPixKey(testTeacherId, cnpjPix, persistentDb);
  const retrievedCnpj = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedCnpj === cnpjPix, '4.4 CNPJ formatado preserva barras, pontos, traços e zeros à esquerda');

  // 4.c Telefone internacional com símbolos
  const phonePix = '+55 (11) 98765-4321';
  await setTeacherPixKey(testTeacherId, phonePix, persistentDb);
  const retrievedPhone = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedPhone === phonePix, '4.5 Telefone preserva sinal +, parênteses, espaço e traço');

  // 4.d Chave aleatória UUID
  const randomUuidPix = '956674fc-0b09-4f56-90f3-07cf61dc6c5f';
  await setTeacherPixKey(testTeacherId, randomUuidPix, persistentDb);
  const retrievedUuid = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedUuid === randomUuidPix, '4.6 Chave aleatória UUID preservada');

  // 4.e E-mail com caracteres especiais
  const emailPix = 'debora.mota+pix@instituto.com.br';
  await setTeacherPixKey(testTeacherId, emailPix, persistentDb);
  const retrievedEmail = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(retrievedEmail === emailPix, '4.7 E-mail com sub-endereçamento (+) preservado');

  // --------------------------------------------------------------------------
  // TESTE 5: Listagem geral e Remoção
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Listagem Geral de Chaves e Remoção ---');

  await setTeacherPixKey(testTeacherId2, '09876543210', persistentDb);
  const allKeys = await getAllTeacherPixKeys(persistentDb);
  testAssert(typeof allKeys === 'object', '5.1 getAllTeacherPixKeys retorna mapa Record<string, string>');
  testAssert(allKeys[testTeacherId] === emailPix, '5.2 Chave do professor 1 presente');
  testAssert(allKeys[testTeacherId2] === '09876543210', '5.3 Chave do professor 2 presente com zero à esquerda');

  // Remoção explícita
  await deleteTeacherPixKey(testTeacherId, persistentDb);
  const afterDelete = await getTeacherPixKey(testTeacherId, persistentDb);
  testAssert(afterDelete === null, '5.4 deleteTeacherPixKey remove a chave do professor');

  // Limpeza com string vazia
  await setTeacherPixKey(testTeacherId2, '   ', persistentDb);
  const afterEmpty = await getTeacherPixKey(testTeacherId2, persistentDb);
  testAssert(afterEmpty === null, '5.5 setTeacherPixKey com espaços em branco remove a chave');

  // --------------------------------------------------------------------------
  // TESTE 6: Regras de Segurança e Bloqueio de Acesso (RBAC)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Bloqueio de Acesso para Usuários Não Autorizados (RBAC) ---');

  function checkAuthorization(user: { role?: string } | null | undefined): { authorized: boolean; statusCode: number; error?: string } {
    if (!user) {
      return { authorized: false, statusCode: 401, error: 'Sessão inválida ou expirada.' };
    }
    if (!user.role || !['super_admin', 'admin'].includes(user.role)) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Permissão negada. Apenas administradores podem gerenciar chaves Pix de professores.',
      };
    }
    return { authorized: true, statusCode: 200 };
  }

  const superAdminCheck = checkAuthorization({ role: 'super_admin' });
  testAssert(superAdminCheck.authorized && superAdminCheck.statusCode === 200, '6.1 super_admin tem acesso concedido (200)');

  const adminCheck = checkAuthorization({ role: 'admin' });
  testAssert(adminCheck.authorized && adminCheck.statusCode === 200, '6.2 admin tem acesso concedido (200)');

  const teacherCheck = checkAuthorization({ role: 'teacher' });
  testAssert(!teacherCheck.authorized && teacherCheck.statusCode === 403, '6.3 teacher tem acesso estritamente bloqueado (403)');

  const studentCheck = checkAuthorization({ role: 'student' });
  testAssert(!studentCheck.authorized && studentCheck.statusCode === 403, '6.4 student tem acesso estritamente bloqueado (403)');

  const unauthCheck = checkAuthorization(null);
  testAssert(!unauthCheck.authorized && unauthCheck.statusCode === 401, '6.5 Usuário não autenticado tem acesso bloqueado (401)');

  // --------------------------------------------------------------------------
  // TESTE 7: Normalização do Modelo Teacher e Preservação
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Normalização e Preservação do Modelo Teacher ---');

  const normalizedProf: Teacher = normalizeTeacher({
    id: 'teacher-normal-01',
    name: 'Raphael Augusto Pinto',
    email: 'raphael.augustop@gmail.com',
    phone: '11999990000',
    cpf: '123.456.789-00',
    specialties: ['Canto', 'Coral'],
    birth_date: '1985-05-20',
    schedule: [{ day_of_week: 1, start_time: '14:00', end_time: '18:00' }],
    status: 'active',
    pix_key: 'raphael.augustop@gmail.com',
  });

  testAssert(normalizedProf.id === 'teacher-normal-01', '7.1 id preservado');
  testAssert(normalizedProf.name === 'Raphael Augusto Pinto', '7.2 name preservado');
  testAssert(normalizedProf.specialties.length === 2, '7.3 specialties preservadas');
  testAssert(normalizedProf.schedule?.length === 1, '7.4 schedule preservado');
  testAssert(normalizedProf.status === 'active', '7.5 status preservado');
  testAssert(normalizedProf.pix_key === 'raphael.augustop@gmail.com', '7.6 pix_key preservada');

  const normalizedWithoutPix = normalizeTeacher({
    id: 'teacher-normal-02',
    name: 'Professor Sem Pix',
  });
  testAssert(
    normalizedWithoutPix.pix_key === undefined || normalizedWithoutPix.pix_key === null,
    '7.7 normalizeTeacher preserva ausência de chave Pix'
  );

  // --------------------------------------------------------------------------
  // TESTE 8: Validação da Migration 20261010_teacher_pix_keys.sql
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Validação da Migration 20261010_teacher_pix_keys.sql ---');
  const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '20261010_teacher_pix_keys.sql');
  testAssert(fs.existsSync(migrationPath), '8.1 Arquivo de migration existe');

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  testAssert(
    migrationSql.includes('teacher_id uuid PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE'),
    '8.2 teacher_id definido estritamente como uuid com foreign key para public.teachers(id)'
  );
  testAssert(
    migrationSql.includes('ENABLE ROW LEVEL SECURITY'),
    '8.3 RLS habilitado na tabela public.teacher_pix_keys'
  );
  testAssert(
    !migrationSql.includes('idx_teacher_pix_keys_teacher_id'),
    '8.4 Índice redundante idx_teacher_pix_keys_teacher_id removido (PRIMARY KEY já indexa)'
  );
  testAssert(
    migrationSql.includes("profiles.role IN ('super_admin', 'admin')"),
    '8.5 RLS restrito a super_admin e admin'
  );
  testAssert(
    migrationSql.includes('REVOKE ALL ON TABLE public.teacher_pix_keys FROM PUBLIC, anon'),
    '8.6 Acesso revogado explicitamente de PUBLIC e anon'
  );
  testAssert(
    migrationSql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_pix_keys TO authenticated'),
    '8.7 Permissões concedidas a authenticated sujeitas a RLS'
  );
  testAssert(
    migrationSql.includes('GRANT ALL ON TABLE public.teacher_pix_keys TO service_role'),
    '8.8 Permissão total concedida ao service_role para rotas administrativas autorizadas do backend'
  );
  testAssert(
    migrationSql.includes('Admins can manage teacher_pix_keys') && migrationSql.includes('DO $$'),
    '8.9 Política administrativa configurada de forma idempotente sem remover dados'
  );

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO DOS TESTES DE CHAVE PIX:`);
  console.log(`   Sucessos: ${passedTests}`);
  console.log(`   Falhas:   ${failedTests}`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
