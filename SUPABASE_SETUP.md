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
  `gancho`, `pontos`, `virada`, `cta` e `data_publicacao`;
- `calendario`: `titulo`, `data` e `conteudo_id` (este último pode ser nulo para
  compromissos independentes).

`conteudos.user_id` e `calendario.user_id` devem ser UUIDs relacionados a
`auth.users(id)`. As políticas de RLS precisam permitir `select`, `insert`,
`update` e `delete` quando `auth.uid() = user_id`.

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
