# Conferência das funções IACRA-DEV (16/11/2026)

O SQL fornecido pela secretaria confirma que ambas as funções públicas já usam `SECURITY DEFINER`, `search_path=''`, conferência de validade do token e bloqueio do segundo envio por `submitted_at`.

## Diferenças perante IACRA oficial

- `eavra_dev_get_enrollment_offer`: DEV **não retorna** `instrument`; produção inclui essa informação.
- `eavra_dev_submit_enrollment`: DEV utiliza `p_student->>'instrument'`; produção prefere o instrumento definido na oferta, com fallback para o aluno.
- Portanto, **nunca copiar a definição do DEV para produção**.
- As travas atuais são em duas camadas: verificação de `submitted_at` em ambas as funções e índice/constraint `UNIQUE(offer_id)` em `app_private.eavra_dev_enrollment_submissions`.

## Escopo da exceção

- Somente a oferta `ad09e268-a476-463f-95fd-19b2b8f5a228`, identificada no **banco de produção** pelo hash do token que a usuária enviou.
- O ambiente DEV contém outras três ofertas. **Não usar esse UUID de produção como oferta de teste DEV**.
- Manter o primeiro aceite aprovado sem alteração; cada novo aceite deve inserir outra solicitação `pending`.
- Cada CPF poderá aceitar no máximo uma vez pelo mesmo link.
- Após fechamento do período, desativar a permissão. Os demais convites continuam bloqueados após um uso.
- Conferência manual e aprovação individual já existem. **Edição de dados antes da aprovação não está implementada no fluxo atual; preservar o aceite original e implementar edição auditável separadamente.**

## Cuidados de homologação

1. Antes de executar SQL de alteração em DEV, conferir as colunas e constraints das duas tabelas, sem ler CPF, e-mail ou tokens.
2. Preparar os novos testes com as funções de DEV (sem apagar `instrument` da função de produção).
3. Testar com **oferta sintética**, em transação revertida com `ROLLBACK`, para que os três aceites já existentes do DEV permaneçam intactos.
4. Cobrir duas pessoas distintas no mesmo convite, bloqueio da repetição de CPF, segundo uso de convite normal, validade expirada, preservação da aprovação e a listagem do acompanhamento.
5. Só após os testes, preparar migração de produção com backup, validação e rollback planejado.
6. O endereço da plataforma é `https://sistema.institutoiacra.com.br/matricula`; o domínio raiz agora hospeda o site institucional.

Este documento é apenas um registro de análise. **Nenhuma migração foi executada.**
