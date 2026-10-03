const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync(new URL("../index.html", `file://${__filename}`), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20261003000000_v23_blocos_pilares.sql", `file://${__filename}`), "utf8");

test("carrega blocos e pilares exclusivamente para o usuário autenticado", () => {
  assert.match(html, /from\("blocos"\)\.select\("\*"\)\.eq\("user_id",userId\)/);
  assert.match(html, /from\("pilares"\)\.select\("\*"\)\.eq\("user_id",userId\)/);
  assert.match(migration, /auth\.uid\(\) = user_id/g);
});

test("cria e renomeia blocos e pilares com validação de nome", () => {
  assert.match(html, /if\(!name\)return notify\("Informe um nome\.","error"\)/);
  assert.match(html, /insert\(\{nome:name,ordem:info\.items\.length,user_id:currentUser\.id\}\)/);
  assert.match(html, /operation:"rename",source_id:id,new_name:name/);
  assert.match(migration, /create unique index if not exists blocos_user_nome_unique/);
  assert.match(migration, /create unique index if not exists pilares_user_nome_unique/);
});

test("impede exclusão direta de taxonomia utilizada e exige destino", () => {
  assert.match(html, /Este \$\{info\.label\} possui <b>\$\{used\.length\} conteúdos associados<\/b>/);
  assert.match(html, /Crie outro \$\{info\.label\} antes de mover/);
  assert.match(migration, /if associated>0 then[\s\S]*if destination_name is null then raise exception/g);
});

test("move conteúdos e exclui blocos e pilares atomicamente", () => {
  assert.match(migration, /set bloco_id=target_id, bloco=destination_name/);
  assert.match(migration, /set pilar_id=target_id, pilar=destination_name/);
  assert.match(migration, /on delete restrict/g);
  assert.match(migration, /delete from public\.blocos where id=source_id and user_id=auth\.uid\(\)/);
  assert.match(migration, /delete from public\.pilares where id=source_id and user_id=auth\.uid\(\)/);
});

test("preserva campos textuais legados e integra IDs na criação e edição", () => {
  assert.match(html, /pilar:x\.pillar,pilar_id:/);
  assert.match(html, /bloco:x\.block,bloco_id:/);
  assert.match(html, /pillar:x\.pilar\?\?x\.pillar/);
  assert.match(html, /block:x\.bloco\?\?x\.block/);
  assert.match(html, /id=f_p>\$\{pillarOptions\(\)/);
  assert.match(html, /id=f_b>\$\{blockOptions\(\)/);
});

test("mantém filtros, Baú de ideias e Modo Gravação nas opções atualizadas", () => {
  assert.match(html, /select\.innerHTML='<option value="">Todos os blocos<\/option>'\+blocks\.map/);
  assert.match(html, /recordingQueue\(activeRecordBlock\)/);
  assert.match(html, /pillarOptions\(\)\.map\(option=>option\.name\)/);
});
