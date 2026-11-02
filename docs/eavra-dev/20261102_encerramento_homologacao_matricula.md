# Encerramento da homologação — matrícula digital IACRA-DEV

**Data:** 02/11/2026  
**Branch isolada:** `eavra-dev-visual-isolado`  
**Ambiente:** IACRA-DEV — não se aplica ao banco de produção.

## Escopo funcional concluído no DEV

- Preparação do convite com professor, plano, grupo, vencimento e mensalidade configurável, inclusive R$ 0,00.
- Preenchimento de matrícula fictícia e aceite do termo armazenado no banco de testes.
- Aprovação pelo Super Admin com criação e vínculo de aluno e matrícula.
- Consulta de histórico e texto integral do termo somente por função de leitura autorizada.
- Comprovante de homologação preparado para impressão / salvamento em PDF pelo navegador.
- Telas de matrícula, confirmação e pagamentos verificadas na homologação; o usuário confirmou a abertura correta do comprovante.

## Evidências verificadas no banco DEV (02/11/2026)

- Total de solicitações: 2; uma aprovada com aceite, aprovação, responsável e vínculos registrados; uma pendente.
- RLS habilitado nas tabelas privadas de ofertas e solicitações.
- A função `eavra_dev_admin_read_term(uuid)` **não** concede execução ao papel anônimo.
- A execução da função por usuários autenticados exige, internamente, perfil Super Admin ativo.

A consulta acima foi feita somente por leitura. Não houve alterações em matrículas nem em pagamentos neste encerramento.

## Observações sobre o teste financeiro

- Matrículas gratuitas (R$ 0,00) não aparecem na lista de cobranças pendentes, conforme teste observado.
- O usuário alterou intencionalmente o valor do Aluno Teste para R$ 100,00 para conferir a apresentação em Pagamentos.
- O comprovante da matrícula mostra o valor originalmente acordado no convite; não substitui o histórico financeiro posterior.

## Pendências obrigatórias antes da produção

1. Revisar com prioridade os avisos de segurança do Supabase sobre funções `SECURITY DEFINER` executáveis por usuários anônimos e autenticados. Algumas funções públicas usam tokens deliberadamente, mas é necessário revisar acesso, escopo, abuso e limites.
   - https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
   - https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
2. Confirmar políticas e privilégios das tabelas privadas; o aviso `RLS Enabled No Policy` pode ser intencional na arquitetura de acesso exclusivamente por RPC, mas deve ser documentado.
   - https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
3. Validar requisitos jurídicos do aceite eletrônico e proteção de dados pessoais antes de incluir pessoas reais.
4. Testar com diferentes perfis e casos de erro; verificar novamente o pipeline automatizado, cuja conclusão não foi confirmada nesta revisão.
5. Definir plano de migração e implantação separado; não promover diretamente a branch ou os registros fictícios para produção.

## Decisão

**Homologação funcional no ambiente DEV: concluída.**
**Liberação para produção e uso real: não autorizada nesta etapa.**
