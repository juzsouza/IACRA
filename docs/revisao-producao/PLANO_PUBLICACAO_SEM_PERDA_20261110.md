# Plano de publicação IACRA — 10/11/2026

## Estado confirmado
- Organização Supabase: Free; sem backup automático diário confirmado.
- Banco oficial PROD está saudável e possui dados reais.
- Migração de matrícula e salas AINDA NÃO aplicada.
- Migração guardada de permissões e allowlist de três Super Admins já aplicada.
- CI SQL fictício aprovado: https://github.com/juzsouza/IACRA/actions/runs/42852396657
- CI da aplicação aprovado: https://github.com/juzsouza/IACRA/actions/runs/42854386574
- Ferramentas novas desligadas por padrão no build; exigem ativação explícita.

## Etapas bloqueadas até o backup
1. Exportar esquema e dados do banco oficial por CLI oficial do Supabase, guardar cópia criptografada fora do Supabase. Nunca enviar senhas ou dados reais ao GitHub ou chat.
2. Verificar conclusão da exportação e testar a restauração em ambiente separado.
3. Revalidar quantidades e integridade das tabelas students, enrollments, competence_billings, transactions, classes.
4. Revisar o SQL candidato RASCUNHO_migracao_termos_salas_20261106.sql contra o estado PROD atual antes de aplicá-lo.
5. Aplicar somente os objetos necessários de matrícula e salas em transação com lock timeout.
6. Conferir privilégios, lista segura de administradores, e preservação das transações existentes.
7. Criar imagem com feature gate habilitada explicitamente e publicar Cloud Run em 0% de tráfego normal.
8. Validar funcionalidades sob conta administrativa autorizada, sem alterar dados reais indevidamente.
9. Após validação, encaminhar tráfego novo monitorando erros e mantendo estratégia de rollback da imagem.

## Bloqueios
- Não publicar antes de backup recuperável comprovado.
- Revisões do Cloud Run não isolam automaticamente o Supabase.
- Não copiar regras de bloqueio ou dados fictícios do DEV.
- Reversão do Cloud Run não reverte migrações SQL.