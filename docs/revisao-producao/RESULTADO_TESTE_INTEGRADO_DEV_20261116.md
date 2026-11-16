# Resultado da validação integrada — 16/11/2026

**Ambiente:** Supabase IACRA-DEV (`xuyimfugcdkqovqelrfz`).

## Teste executado

Executado em uma transação com `BEGIN` e `ROLLBACK` o arquivo
`docs/revisao-producao/TESTE_TRANSACIONAL_IACRA_DEV_SO_ROLLBACK_20261116.sql`.

O comando finalizou sem exceções. O próprio script executou assertivas para:

- Duas submissões distintas com status `pending` para um convite fictício marcado como excepcional;
- Recusa do envio repetido do mesmo CPF nesse convite;
- Recusa do segundo envio em convite comum;
- Preservação dos 3 aceites anteriores.

## Verificação independente após ROLLBACK

Consulta de leitura executada após o teste:

| Indicador | Antes | Depois |
| --- | --- | --- |
| Total de convites DEV | 3 | 3 |
| Total de aceites DEV | 3 | 3 |
| Hash função abertura | `738219a39179367077b70bad952a5f5a` | igual |
| Hash função envio | `ec082e0ff56873688664b4cbc14b685c` | igual |
| Constraint de uso único | 1 | 1 |
| Tabela de exceções | inexistente | inexistente |
| Convites fictícios residuais | 0 | 0 |
| Aceites fictícios residuais | 0 | 0 |

## Escopo e pendências

- Não houve alteração do Supabase oficial nem publicação do site.
- A oferta oficial `ad09e268-a476-463f-95fd-19b2b8f5a228` continuava válida até 30/11/2026, porém com 1 submissão aprovada e bloqueada para novo uso.
- Ainda é necessário validar a interface de acompanhamento com vários alunos associados à mesma oferta e o processo de edição cadastral antes de aprovação.
- O roteiro de produção é separado, e não deve ser aplicado sem autorização de publicação e preparação de backup.
