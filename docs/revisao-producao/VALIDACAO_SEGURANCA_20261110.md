# IACRA — validação de matrícula, salas e permissões (10/11/2026)

## Resultado verificado

- CI SQL isolado aprovado: https://github.com/juzsouza/IACRA/actions/runs/42852396657
- CI da aplicação aprovado: https://github.com/juzsouza/IACRA/actions/runs/42852578132
- Migração candidata: docs/revisao-producao/RASCUNHO_migracao_termos_salas_20261106.sql
- Escopo: ofertas digitais com validade, aceite de termo, responsáveis, conferência/aprovação de matrículas, sete salas e reserva de horários.
- Proteção adicional: 8 verificações administrativas usando app_private.eavra_admin_allowlist já presente em produção.
- Teste negativo novo: alterar o perfil fictício para super_admin não libera matrícula, caixa de entrada ou salas sem allowlist.
- Testes de banco executados exclusivamente com dados fictícios em PostgreSQL temporário.
- Testes de build, contêiner e regras financeiras passaram.

## Produção (não liberar ainda)

- Não houve implantação desta migração de matrícula/salas no Supabase de produção.
- Não alterar o tráfego atual do Cloud Run sem validação de ambiente e nova revisão.
- Frontend continua com VITE_IACRA_FEATURES_ENABLED=false na configuração de build.
- Validar um backup/restauração independente antes de executar mudanças reais.
- O banco real tem permissões amplas pré-existentes em public.profiles e outras tabelas; esta migração protege suas RPCs administrativas via allowlist mas não corrige automaticamente todo o legado.
- Não copiar dados reais nem regras de bloqueio fictícias do DEV.
- Aplicar somente em janela segura, com verificação de contagem de pagamentos/matrículas antes e depois e checagem de privilégios das RPCs.
- Confirmar criação/consulta/envio/aprovação de convite com ambiente isolado e sem exposição indevida de dados reais.
- Depois publicar nova imagem com feature gate habilitada, mantendo 0% do tráfego normal até aprovação funcional.
- Verificar erros 401 em endpoints administrativos separadamente.

## Regra de liberação

Não anunciar disponibilização aos alunos até confirmar backup, migração, acesso permitido/negado, zero regressão financeira, fluxo de matrícula e revisão Cloud Run em 0% antes da mudança de tráfego.
