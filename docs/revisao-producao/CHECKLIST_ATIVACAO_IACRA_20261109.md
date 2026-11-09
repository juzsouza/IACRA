# IACRA — Checklist de ativação segura (09/11/2026)

**Estado:** PR em rascunho; não publicar, mesclar ou ativar antes das validações abaixo.

## O que já está incluído
- Telas de matrícula digital, aceite, histórico, confirmação e salas integradas ao aplicativo da branch `main`.
- Links de formulário em `/matricula?convite=...`.
- Editor de termos reais, sem texto fictício automático; negrito por `**trecho**`.
- Formulário público inicia vazio e exige dados de responsável para menores.
- Entradas de menu novas só aparecem ao `super_admin` depois de habilitar as funções.
- Nenhuma alteração nos módulos financeiros existentes.
- Compilação e testes automatizados de regressão passaram no GitHub Actions.

## Antes de implantar
1. Fazer backup **atualizado** do banco original (prioridade: `transactions`, `competence_billings`, `enrollments`, `students`, `classes`, `financial_plans`) e verificar que os arquivos realmente abrem.
2. Revisar com responsável pela instituição o texto efetivo dos contratos, o método de confirmação do responsável e regras de privacidade.
3. Revisar o SQL de `docs/revisao-producao/RASCUNHO_migracao_termos_salas_20261106.sql` da branch `preparacao-iacra-prod-20261106`; **ainda não homologado em cópia completa de produção**.
4. Aplicar/validar migração em ambiente isolado que reproduza a produção. Garantir índices, funções, permissões e RPCs com controle de acesso.
5. Testes ponta a ponta com contas e registros fictícios: convite, validade, aluno existente, responsável, aprovação, PDF, salas e conflitos, antes de tocar no sistema real.
6. Preparar implantação do app com `VITE_IACRA_FEATURES_ENABLED=false` e testar login, agenda e pagamentos, sem alterar o app que está no ar antes de ter rollback.
7. Somente depois de SQL instalado, verificações, backup e análise dos logs: habilitar `VITE_IACRA_FEATURES_ENABLED=true`, `VITE_IACRA_PRODUCTION_PROJECT_REF=ldumzwrwbhjtrnlioigg`, `VITE_SUPABASE_URL=https://ldumzwrwbhjtrnlioigg.supabase.co`. Essas variáveis são **de build do Vite**; mudança exige novo build/deploy.
8. Testar `/matricula`, acesso restrito ao Super Admin, aprovações e rotina de pagamentos na versão implantada; documentar procedimento de reversão para o Cloud Run.
9. Após validação funcional, retirar eventuais comandos/telas de teste não utilizados da versão pública.

## Regras de segurança
- Nunca usar chaves secretas ou `service_role` em variáveis `VITE_*`.
- Nunca apontar uma prévia DEV para a produção.
- A flag do frontend é apenas controle de exibição. A autorização real é feita no Supabase pelas funções RPC.
- Nunca publicar o aplicativo a partir do ZIP incompleto do AI Studio ou sincronizar exclusões com `main`.
- Nunca copiar os registros fictícios do IACRA-DEV para o banco original.
