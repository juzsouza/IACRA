# IACRA — preparação para publicação oficial (09/11/2026)

Estado: ainda NÃO autorizado para publicação; este arquivo não modifica o sistema.

## Já verificado
- Homologação separada no Cloud Run e Supabase DEV.
- Envio de matrícula testado pela usuária.
- Migração aprovada em simulação com PostgreSQL efêmero e dados fictícios.
- PROD na leitura: 404 alunos, 376 matrículas, 981 transações, 1580 cobranças.
- Backup local foi criado e quatro tabelas foram recuperadas em teste; não é uma restauração integral de produção.

## Pendências antes da versão oficial
1. Testar em cópia completa isolada do PROD, sem usar dados reais no CI público.
2. Instalar e validar em produção as novas funções SQL de matrícula e salas; não aplicar rascunho diretamente.
3. Preparar as funções de Gerenciamento de Permissões: as RPCs da homologação ainda NÃO existem no PROD.
4. Corrigir URL e chave pública de PROD embutidas em código como fallback; não inserir segredo do Supabase no Vite ou frontend.
5. Publicar primeiro com funções novas desabilitadas, validar login, agenda e pagamentos; só depois habilitá-las.
6. Verificar e renovar backup de transações/competências antes da migração e definir procedimento de rollback.
7. Analisar avisos de segurança (SECURITY DEFINER, acesso anon, políticas existentes), sem modificações em lote.
8. Revisar texto contratual, validade, responsável legal e registro de aceite.
9. Testar revisão separada e possível reversão no Cloud Run antes de mudar tráfego do music-school-manager.

Não executar migração PROD, não mesclar DEV em main e não publicar por meio do projeto AI Studio incompleto.