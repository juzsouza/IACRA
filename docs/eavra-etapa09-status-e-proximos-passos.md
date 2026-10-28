# EAVRA — Etapa 09: permissões persistentes e auditoria (revisão isolada)

**Status:** testes PostgreSQL descartáveis PASS; **NÃO INSTALAR NO SUPABASE**; **NÃO ATIVADO NO APLICATIVO**.

## Referência
- Branch: `bolt-migration-test`.
- Teste CI: [Execução da Etapa 09](https://github.com/juzsouza/IACRA/actions/runs/40756653109).
- Modelo base: `review/eavra-e08/`.
- Arquivo SQL de revisão: `review/eavra-e09/09_permission_rpc.sql.txt`.
- Casos de teste: `review/eavra-e09/09_permission_rpc_checks.sql.txt`.
- Workflow: `.github/workflows/validate-eavra-permissions-e09.yml`.

## O que já foi testado

1. Super Admin **ativo**, com `profiles.id = auth.uid()::text`, consulta o catálogo e salva regras.
2. Admin, professor, bloqueado, usuário sem perfil correspondente e requisição sem identidade verificada não conseguem usar os RPCs administrativos.
3. Negação individual prevalece sobre permissão do papel; retirar exceção passa a herdar a regra do papel.
4. Permissões reservadas ao Super Admin não podem ser delegadas; professores não podem receber permissão administrativa nem escopo `all`.
5. Cada alteração real gera entrada na auditoria; repetição da mesma regra não gera evento novo.
6. Gravação indevida nas tabelas privadas pelos papéis do navegador é bloqueada.
7. A base v9 e os scripts da e08 foram carregados no PostgreSQL descartável e destruídos ao fim do workflow.

## Limites importantes

- **Não foram alterados** o Supabase IACRA original, IACRA-DEV, o Bolt Database, a branch `main` nem o aplicativo publicado.
- As funções de gravação só existem no teste descartável. **Não há endpoint de aplicação nem botão Salvar funcional**.
- O catálogo completo (52 ações), as permissões iniciais por papel e a compatibilidade dos 49 usuários originais ainda precisam de homologação.
- As políticas RLS da v9 ainda contêm regras fixas e a gestão de `profiles.role` necessita proteção adicional no banco real.
- A regra `scope='own'` depende de predicados RLS de titularidade por tabela; uma autorização de ação **não** equivale a acesso à linha.
- Google Calendar deve ficar desconectado das contas reais durante testes.
- Não existe teste de build completo do frontend/backend nesta etapa.

## Próxima etapa (10)

1. Integrar `GET`/ `POST` server-side usando sessão Supabase validada e RPCs somente após preparar um ambiente DEV isolado.
2. Conectar a tela do Super Admin à consulta e gravação reais com estados de salvamento, falhas e revisão de alterações.
3. Revisar/ajustar RLS de todas as operações, inclusive fechamento financeiro, dados próprios dos professores e `profiles.role`.
4. Testar compilação completa, RLS e regressões. Somente depois avaliar a implantação DEV. **Produção permanece intocada.**

**ATENÇÃO:** arquivos `.sql.txt` deste pacote são documentação/teste, não migrações prontas para execução.
