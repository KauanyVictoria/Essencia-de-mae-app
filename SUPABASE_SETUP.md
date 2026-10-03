# Configuração do Supabase

Preencha `supabase-config.js` com os valores públicos disponíveis em **Project
Settings > API** no painel do Supabase:

```js
window.ESSENCIA_SUPABASE = {
  url: "https://SEU-PROJETO.supabase.co",
  publishableKey: "SUA_CHAVE_PUBLICA_PUBLISHABLE_OU_ANON"
};
```

Use uma chave **publishable** (`sb_publishable_...`) ou a chave pública legada
**anon**. Nunca use `service_role` no navegador.

## Colunas usadas pelo aplicativo

Além de `id`, `user_id` e, opcionalmente, `created_at`, o frontend usa:

- `conteudos`: `titulo`, `pilar`, `intencao`, `duracao`, `bloco`, `status`,
  `gancho`, `pontos`, `virada`, `cta`, `data_publicacao`, `bloco_id` e
  `pilar_id`;
- `calendario`: `titulo`, `data` e `conteudo_id` (este último pode ser nulo para
  compromissos independentes);
- `publicacoes`: `conteudo_id`, `plataforma`, `titulo`, `legenda`, `hashtags`,
  `data_publicacao`, `horario_publicacao` e `status`.

Os campos `user_id` dessas tabelas devem ser UUIDs relacionados a
`auth.users(id)`. As políticas de RLS precisam permitir `select`, `insert`,
`update` e `delete` somente quando `auth.uid() = user_id`. Cada publicação é
associada ao conteúdo principal por `publicacoes.conteudo_id = conteudos.id`;
o aplicativo não cria publicações automaticamente para conteúdos existentes.

O nome informado no cadastro é salvo em `auth.users.raw_user_meta_data.nome`.
A sessão é persistida e renovada automaticamente pelo cliente oficial do
Supabase.

## Cores do fluxo de conteúdo (V2.1)

O aplicativo lê `status_config` sempre com filtro explícito por `user_id` e usa
essa tabela como fonte dos nomes e cores do fluxo. O frontend reutiliza `cor`
ou `color` quando uma delas já existe, contendo um hexadecimal no formato
`#RRGGBB`.

Se nenhuma dessas colunas existir no projeto, execute **manualmente** a
migration aditiva (que cria `cor`) em
`supabase/migrations/20260925000000_add_status_config_cor.sql`. Ela não remove
nem substitui registros e não é executada automaticamente pelo frontend.

A tabela deve manter RLS habilitado. As políticas existentes precisam permitir
`select` e `update` somente quando `auth.uid() = user_id`; o frontend também
aplica `.eq("user_id", currentUser.id)` tanto na leitura quanto na atualização.

## Blocos e pilares personalizados (V2.3)

Antes de usar o gerenciamento em Configurações, execute **manualmente**
`supabase/migrations/20261003000000_v23_blocos_pilares.sql` no SQL Editor do
Supabase. A migration não é executada pelo aplicativo e não apaga nem converte
conteúdos existentes. Ela:

- garante as tabelas `blocos` e `pilares`, com `user_id`, `nome` e `ordem`;
- adiciona `conteudos.bloco_id` e `conteudos.pilar_id`, mantendo `bloco` e
  `pilar` como camada de compatibilidade para os registros antigos;
- habilita RLS e cria políticas que limitam as duas configurações ao usuário
  autenticado;
- cria índices de nome por usuário e duas funções transacionais usadas para
  renomear, mover conteúdos e excluir com segurança.

Os registros antigos não são associados automaticamente. Eles continuam
visíveis pelos valores textuais legados e recebem os IDs quando forem salvos ou
movidos pelo usuário. Para disponibilizar opções personalizadas, crie ao menos
um bloco e um pilar em Configurações depois de aplicar a migration.
