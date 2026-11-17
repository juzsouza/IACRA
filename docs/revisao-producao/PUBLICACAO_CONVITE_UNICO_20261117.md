# Publicação da exceção de convite — 17/11/2026

**Banco oficial:** `ldumzwrwbhjtrnlioigg` (IACRA).  
**Migração aplicada:** `iacra_one_offer_multiple_students_20261117`.  
**Oferta excepcional:** `ad09e268-a476-463f-95fd-19b2b8f5a228`.

## Estado verificado após publicação

- Aplicação da migração retornou `success: true`.
- Ofertas existentes: **15** (inalteradas).
- Aceites existentes: **7**, todos **approved** (inalterados).
- Oferta excepcional: **1 aceite aprovado anterior preservado**, nenhum novo aceite ainda.
- `app_private.eavra_multi_use_offer_whitelist` contém exatamente **1** registro ativo, referente ao UUID escolhido.
- Restrição exclusiva `UNIQUE(offer_id)` substituída por índice parcial restrito aos outros convites.
- RLS na whitelist: **habilitado**.
- Funções públicas de abertura e submissão atualizadas; acessos `anon` e `authenticated` preservados.
- Acesso à função `eavra_dev_get_enrollment_offer` em produção testado com a permissão **anon** e o token real: `public_form_available = true`.
- Validade do convite: até **30/11/2026, 23h59** no horário de São Paulo.
- Nenhuma linha de aluno, matrícula, pagamento ou aceite foi modificada pela migração.

## Observações

- O fluxo da própria plataforma envia cada aceite como `pending`, que requer aprovação manual.
- A correção direta dos dados da proposta antes da aprovação **ainda não está implementada**; usar a conferência/match atual e não alterar documentos assinados.
- O ajuste visual de chave por `submission_id` do componente `EnrollmentInvitationTracking.tsx` está no branch de testes, mas **não foi implantado no frontend de produção**. A RPC de acompanhamento já retorna linha individual por aceite.
- O domínio da aplicação é `https://sistema.institutoiacra.com.br`, distinto do site institucional. Validar abertura da rota `/matricula` no navegador.
- A aceitação real pelo navegador e a conferência da listagem visual permanecem pendentes de teste ponta a ponta.
- **Não** publicar todo o branch de testes no site sem comparar com a revisão efetivamente no ar.

## Encerramento autorizado quando finalizar

Executar separadamente com autorização:

```sql
UPDATE app_private.eavra_multi_use_offer_whitelist
SET active=false
WHERE offer_id='ad09e268-a476-463f-95fd-19b2b8f5a228'::uuid;
```

Isso fecha a exceção; a validade também encerra automaticamente em 01/12/2026, 00h, horário de São Paulo.

## Restauração

As funções originais tinham MD5:
- Abertura: `e298651a9a8273cfcad260ab1267e88f`
- Envio: `a34bef05fb4dd6c64c50a5b7bb5bc624`

As definições originais podem ser recuperadas do histórico de auditoria/migração; não remover novos aceites caso surjam, pois isso causaria perda de dados. A reversão estrutural com retorno à restrição original só é segura se houver no máximo um aceite por oferta.
