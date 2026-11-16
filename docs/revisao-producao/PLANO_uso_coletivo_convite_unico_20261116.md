# Excecao de uso coletivo de um convite (rascunho para homologacao)

Convite privado identificado pela UUID `ad09e268-a476-463f-95fd-19b2b8f5a228` (o token de acesso não é registrado no repositório).

## Condições obrigatórias

- Permitir vários alunos usando exclusivamente esse convite; preservar a validade até 30/11/2026.
- Preservar o aceite aprovado antes da mudança.
- Cada envio insere uma solicitação separada, inicialmente `pending`.
- A secretaria confere os dados de cada aluno antes da aprovação e do vínculo com a agenda.
- Convites comuns seguem bloqueados após o primeiro aceite.
- Preservar matrícula/financeiro e não gerar cobrança automática só pela submissão.
- Habilitar e encerrar exceção apenas por ação autorizada da administração.

## Requisitos antes da publicação

1. O banco IACRA-DEV não está acessível pela conexão atual; realizar homologação em banco isolado antes de tocar produção.
2. Fazer backup lógico verificável das duas tabelas e definições das RPCs.
3. Em homologação: testar primeiro aceite, segundo aceite, simultaneidade, termo vencido, bloqueio de convites comuns e aprovações distintas.
4. Conferir que **Acompanhamento de Termos** lista cada aluno independentemente (a RPC de acompanhamento gera uma linha por submissão).
5. **Não** implementar edição direta do aceite original: eventuais correções cadastrais devem ter histórico de alterações e permissão específica. A correção de dados pré-aprovação é requisito separado ainda não implementado.
6. No fim, desativar o flag dessa UUID, sem reverter outras alterações na plataforma.
7. Conferir que a autorização do link não depende de mostrar a URL pública do site institucional: a rota válida é da plataforma.

## Evidência

A oferta tinha 1 submissão `approved`, com `submitted_at` preenchido. No momento da leitura, expira em 2026-12-01 03:00 UTC (30/11, horário de São Paulo). A tabela de submissões impõe `UNIQUE (offer_id)`; o SQL proposto substitui por unicidade parcial e restringe múltiplos envios pela whitelist privada verificada nas RPCs.

**Estado:** rascunho em branch isolada; SQL ainda não aplicado.
