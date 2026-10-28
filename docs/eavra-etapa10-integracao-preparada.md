# EAVRA — Etapa 10: integração da tela de permissões (revisão, não ativar)

**Estado:** código de integração preparado em pacote de revisão na conversa; **não instalado** no projeto GitHub, no Bolt nem em qualquer Supabase.

## O que o pacote de desenvolvimento contém
- Rota de Gerenciamento de Permissões e menu somente de Super Admin, com checagem de `access_status=active`.
- Componente de seleção por perfil/usuário, ação, herança, negação e escopo.
- Leitura e gravação via `supabase.rpc('eavra_admin_permissions_snapshot')` e `supabase.rpc('eavra_admin_save_permission')`.
- Autenticação validada por `auth.getUser()` e conferência de `profiles.id == auth.users.id` antes de cada requisição, além das checagens do servidor nos RPCs.
- Bloqueio de conexão por padrão; somente DEV explicitamente aprovado pode ativar a tela. O IACRA original é recusado.
- Testes locais com servidor RPC simulado, validação de ambiente e rejeição de contas inativas ou sem vínculo.

## Limitações
- As RPCs e o catálogo de permissões ainda NÃO estão instalados em DEV. Etapas 08 e 09 só passaram em PostgreSQL descartável.
- O build completo do EAVRA e os testes ponta a ponta ainda estão pendentes.
- O pacote da Etapa 10 precisa ser conciliado com as revisões 04 e 06 e com o HEAD do GitHub antes da instalação.
- Nenhuma mudança de RLS ou de usuários reais pode ser feita automaticamente.
- Não executar SQL em IACRA nem copiar perfis reais. Google Calendar não deve sincronizar contas pessoais nos ensaios.

## Referência de segurança validada
- [Etapa 09 — GitHub Actions](https://github.com/juzsouza/IACRA/actions/runs/40756653109).
- O ZIP **EAVRA_10_TELA_PERMISSOES_INTEGRACAO_DEV_NAO_ATIVAR.zip** foi preparado na conversa com manifesto SHA-256 e aplicador que recusa branches erradas ou arquivos divergentes.

**Próximo passo:** reconciliar os pacotes em um checkout atualizado, executar npm ci/TypeScript/build e testes RLS no ambiente descartável; depois escolher banco DEV e solicitar aprovação específica antes de instalar SQL ou habilitar a flag. A branch `main` e a produção seguem intactas.
