# IACRA-DEV — abrir prévia privada no GitHub Codespaces

## Finalidade e limites

Esta prévia usa **somente** a branch `eavra-dev-visual-isolado` e o Supabase **IACRA-DEV** (`xuyimfugcdkqovqelrfz`). Não é uma publicação pública e não altera a `main`, o Bolt nem o projeto IACRA original. O Codespaces pode consumir cotas gratuitas ou gerar cobrança conforme o plano do GitHub.

**Por enquanto, somente a tela de login está pronta para visualização.** O DEV está sem usuários Auth e sem perfis. A tela de Gerenciamento de Permissões deve continuar desligada até concluir testes de usuários, RLS, auditoria e acesso por professor.

## Abrir

1. No GitHub, confirme no seletor que a branch atual é `eavra-dev-visual-isolado`.
2. Clique em **Code > Codespaces > Create codespace on eavra-dev-visual-isolado**.
3. Aguarde a instalação das dependências pelo `.devcontainer/devcontainer.json`.
4. No terminal do Codespace, execute `cp .env.example .env.local`.
5. No editor, abra o arquivo local `.env.local`. Substitua apenas os dois valores de exemplo de `VITE_SUPABASE_ANON_KEY` e `SUPABASE_KEY` pela mesma chave **publishable** do projeto **IACRA-DEV**, obtida em Supabase > IACRA-DEV > Project Settings > API Keys. Nunca use chaves `sb_secret_`, `service_role`, credenciais Google ou chaves de produção. Não envie a chave por chat ou commit.
6. Preserve `VITE_EAVRA_PERMISSION_ADMIN_ENABLED=false` e `EAVRA_ENABLE_DEV_GOOGLE_CALENDAR=false`.
7. Execute `npm run dev`.
8. Em **Ports**, abra a porta **3000** no navegador. Confirme que ela está com visibilidade **Private**. Deve aparecer o aviso fixo `AMBIENTE DE TESTES · IACRA-DEV · SEM DADOS REAIS`.

Se aparecer um erro de conexão, revise as variáveis locais sem publicar valores. Com nenhum usuário Auth cadastrado, o login **não deve** funcionar; isso é o comportamento esperado neste estágio.

## O que ainda falta para navegar com login

- Criar contas e perfis **fictícios** vinculados no projeto IACRA-DEV usando um procedimento administrativo controlado (não inserir manualmente diretamente em `auth.users`).
- Executar testes de autorização com sessões reais de superadministrador, administrador e professor.
- Revisar todas as funções `SECURITY DEFINER`, RLS e grants, e registrar a evidência dos testes de isolamento por professor.
- Somente depois habilitar o gerenciador de permissões no DEV.

## Segurança operacional

- `.env.local` é ignorado pelo Git. Nunca criar ou commitar arquivos `.env` com chaves reais.
- Não mudar portas para **Public** nem publicar em domínio institucional.
- Não ligar Google Calendar real.
- Não fazer **Compare & pull request** nem merge na `main`.
- Parar o Codespace quando não estiver usando para evitar gasto desnecessário.
