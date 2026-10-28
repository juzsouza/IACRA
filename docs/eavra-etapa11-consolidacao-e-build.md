# EAVRA — Etapa 11: consolidação offline e diagnóstico de build

**Estado:** pacote único de código preparado e testado em clone descartável; **ainda não ativado no GitHub/Bolt/Supabase**.

## Entrega
- Arquivo entregue na conversa: `EAVRA_11_CODIGO_CONSOLIDADO_REVISAO_NAO_INSTALAR.zip`
- SHA-256: `aade946ee758feff550a4ca534eeb0ffb487df85d1922784359d79f1fbd39da4`
- Contém 33 arquivos alterados (18 novos), manifesto de hash, instalador de leitura por padrão, README e relatório.
- Base `IACRA-bolt-migration-test.rar`: blobs de `App.tsx`, `Layout.tsx`, `navigation.ts`, `store.tsx`, `supabase.ts` e `package-lock.json` comparados e idênticos à branch atual.
- Segurança do pacote 04 mantida no `App.tsx`; tela de permissões integrada da etapa 10 adicionada, substituindo protótipo da etapa 06.

## Testes desta etapa
- Cinco suítes locais de autenticação, isolamento de banco, identidade administrativa, perfil e serviço de permissões passaram.
- Os 32 arquivos TS/TSX alterados não apresentaram erros de sintaxe na transpilação do compilador TypeScript.
- O aplicador de revisão passou em clone Git offline na branch `bolt-migration-test`; nenhum banco real foi acessado.
- **Build da BASE GitHub**, não do pacote integrado: [Github Actions PASS](https://github.com/juzsouza/IACRA/actions/runs/40767440574). Passaram `npm ci --ignore-scripts`, `npm run lint`, `npm run build`.

## O que impede ativar
- **Não existe ainda comprovação de typecheck nem de build completo do pacote integrado 11**. O build do GitHub testou apenas a base não alterada.
- A função visual permanece desligada por padrão e as RPCs 08/09 não estão instaladas no banco DEV.
- É necessário escolher, isolar e configurar um único banco DEV antes de instalar qualquer SQL, sem acesso ao IACRA original.
- Revisão do RLS por titularidade, restrição de alterações de `profiles.role`, homologação dos dados de 49 contas (12 sem perfil por ID), e Google Calendar de teste pendentes.
- Não publicar na branch `main` nem conectar agendas reais aos testes.

## Próximo passo
Em clone descartável obtido da `bolt-migration-test`, conferir hashes, aplicar **somente após aprovação** o pacote 11, executar `npm ci`, `npm run lint`, `npm run build` e testes e revisar o diff. Não instalar na produção, no Supabase ou no Bolt nesta fase.
