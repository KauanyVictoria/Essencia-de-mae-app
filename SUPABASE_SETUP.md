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
