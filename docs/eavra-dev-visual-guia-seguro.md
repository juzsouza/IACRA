# EAVRA DEV — Abrir frontend visual com segurança

**ESTADO:** código completo do pacote 12 está nesta branch; NÃO está publicado, nem conectado ao Bolt. O GitHub Actions realiza build e teste HTTP com chave fictícia, sem acessar usuários reais.

## Projeto autorizado

- **Somente** Supabase **IACRA-DEV** — referência: `xuyimfugcdkqovqelrfz`.
- `IACRA` original / produção (`ldumzwrwbhjtrnlioigg`) é bloqueado pelo cliente.
- A API do navegador **somente** aceita uma chave pública `sb_publishable_...`; a chave `service_role` e `sb_secret_...` são recusadas.
- O Google Calendar continua desligado: `EAVRA_ENABLE_DEV_GOOGLE_CALENDAR=false`.
- O gerenciamento de permissões continua desligado: `VITE_EAVRA_PERMISSION_ADMIN_ENABLED=false` (até testes de contas reais no DEV).
- **Nenhuma conta fictícia foi criada pelo código deste branch**. Não há signup público.

## Preview visual sem publicar

**No GitHub:** Actions > `EAVRA DEV - build e teste visual sem dados reais`. A execução gera a captura de login `eavra-dev-login-preview` (se houver Chrome disponível). A captura é ilustrativa e não é login funcional.

**Para rodar o frontend interativamente em um NOVO projeto isolado**, nunca no Bolt que aponta para a produção:

1. Abrir um projeto novo a partir desta branch `eavra-dev-visual-isolado` no GitHub. Não importar a `main` e não conectar a um domínio de produção.
2. Definir variáveis usando `.env.example` como modelo. **Preencher a chave pública publishable de IACRA-DEV diretamente no ambiente do projeto**, sem colar chaves no chat e sem comitá-las.
3. Não configurar nenhuma variável `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` para essa primeira prévia.
4. Rodar `npm ci` e `npm run dev`. Deve aparecer uma etiqueta fixa `AMBIENTE DE TESTES · IACRA-DEV · SEM DADOS REAIS`.
5. Com 0 contas Auth criadas, o login real não vai funcionar; isso é esperado. Criar contas fictícias via Auth Admin e perfis vinculados em fluxo controlado numa fase seguinte.
6. Só habilitar `VITE_EAVRA_PERMISSION_ADMIN_ENABLED=true` **depois** de Auth, RLS e auditoria aprovados no DEV. A flag é apenas gate de interface; não substitui segurança no banco.

## Testes realizados e pendências

- Branch aplica os 33 arquivos do pacote 12; GitHub CI verifica integridade, typecheck, build e testes de autorização.
- RLS v9, catálogo de 52 permissões e RPCs foram instalados **no IACRA-DEV**, não em produção. A instalação do banco não substitui o teste por sessão Auth real.
- Permanecem **pendentes**: contas via Auth Admin API, perfis com IDs correspondentes, teste real com JWT, auditoria de funções SECURITY DEFINER e isolamento de registros por professor em todas as tabelas.
- Frontend ainda não tem um link público hospedado. **Não publicar** no domínio institucional até aprovação final.

## Links

- Branch isolada: https://github.com/juzsouza/IACRA/tree/eavra-dev-visual-isolado
- Ações desta branch: https://github.com/juzsouza/IACRA/actions
- Supabase DEV: https://supabase.com/dashboard/project/xuyimfugcdkqovqelrfz
