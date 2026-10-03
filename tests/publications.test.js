const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(new URL("../index.html", `file://${__filename}`), "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1].replace(/\binit\(\);\s*$/, "");

function app(initial = []) {
  const elements = new Map();
  const rows = initial.map(x => ({ ...x }));
  const calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: "", innerHTML: "", textContent: "", hidden: false, dataset: {}, style: {},
      className: "", classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      querySelector: () => null, setAttribute() {}, focus() {}, select() {},
    });
    return elements.get(id);
  };
  function query(table) {
    const state = { action: "select", filters: [], payload: null };
    const builder = {
      select() { if (state.action === "idle") state.action = "select"; return this; },
      insert(payload) { state.action = "insert"; state.payload = payload; calls.push(["insert", table, payload]); return this; },
      update(payload) { state.action = "update"; state.payload = payload; calls.push(["update", table, payload]); return this; },
      delete() { state.action = "delete"; calls.push(["delete", table]); return this; },
      eq(column, value) { state.filters.push([column, value]); calls.push(["eq", column, value]); return this; },
      order() { return this; }, limit() { return Promise.resolve(run(false)); },
      single() { return Promise.resolve(run(true)); },
      then(resolve, reject) { return Promise.resolve(run(false)).then(resolve, reject); },
    };
    function matching(row) { return state.filters.every(([key, value]) => String(row[key]) === String(value)); }
    function run(single) {
      if (table !== "publicacoes") return { data: single ? null : [], error: null };
      if (state.action === "insert") {
        const row = { id: `pub-${rows.length + 1}`, created_at: new Date().toISOString(), ...state.payload };
        rows.push(row); return { data: single ? { ...row } : [{ ...row }], error: null };
      }
      const found = rows.filter(matching);
      if (state.action === "update") { found.forEach(row => Object.assign(row, state.payload)); return { data: single ? { ...found[0] } : found, error: null }; }
      if (state.action === "delete") { for (let i = rows.length - 1; i >= 0; i--) if (matching(rows[i])) rows.splice(i, 1); return { data: null, error: null }; }
      return { data: single ? (found[0] && { ...found[0] }) : found.map(x => ({ ...x })), error: null };
    }
    return builder;
  }
  const context = vm.createContext({
    console, confirm: () => true, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { ESSENCIA_SUPABASE: { url: "https://example.test", publishableKey: "key" }, supabase: { createClient: () => ({ from: query }) } },
    document: {
      body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, removeChild() {} },
      getElementById: element, querySelectorAll: () => [], createElement: () => element("copy"), execCommand: () => true,
    },
  });
  vm.runInContext(script, context);
  vm.runInContext('currentUser={id:"user-1",email:"mae@example.com",user_metadata:{}}', context);
  return { context, element, rows, calls };
}

const content = { id: "content-1", title: "Rotina", pillar: "Maternidade", intent: "Conexão", duration: "30–60s", block: "Bloco 1 — Maternidade / culpa", status: "a-gravar", date: "", soundHook: "", visualHook: "", textHook: "", context: "", points: "", turn: "", conclusion: "", cta: "", notes: "", automaticScript: "", customScript: "", legacyScript: "" };

function openEditor(app) {
  vm.runInContext(`editForm(${JSON.stringify(content)})`, app.context);
  app.element("publicationArea").dataset.contentId = content.id;
}

test("conteúdo antigo sem publicação continua funcionando e mostra estado vazio", async () => {
  const a = app(); openEditor(a);
  await vm.runInContext('loadPublications("content-1")', a.context);
  assert.match(a.element("publicationArea").innerHTML, /Nenhuma plataforma adicionada ainda/);
  assert.match(a.element("publicationArea").innerHTML, /Adicionar plataforma/);
});

test("adiciona TikTok e Instagram uma vez e mantém registros independentes após recarregar", async () => {
  const a = app(); openEditor(a);
  await vm.runInContext('loadPublications("content-1")', a.context);
  a.element("publicationPlatform").value = "tiktok";
  await vm.runInContext('addPublication("content-1")', a.context);
  a.element("publicationPlatform").value = "instagram";
  await vm.runInContext('addPublication("content-1")', a.context);
  assert.deepEqual(a.rows.map(x => x.plataforma), ["tiktok", "instagram"]);

  for (const [id, value] of Object.entries({ pub_title_pub_1: "Título TikTok", pub_caption_pub_1: "Legenda TikTok", pub_hashtags_pub_1: "#tiktok", pub_date_pub_1: "2026-10-10", pub_time_pub_1: "09:30", pub_status_pub_1: "Agendada" })) a.element(id.replaceAll("_pub_", "_pub-")).value = value;
  await vm.runInContext('savePublication("pub-1")', a.context);
  assert.equal(a.rows[0].titulo, "Título TikTok");
  assert.equal(a.rows[1].titulo, "");
  await vm.runInContext('loadPublications("content-1")', a.context);
  assert.equal(vm.runInContext('PUBLICATIONS.find(x=>x.platform==="tiktok").title', a.context), "Título TikTok");
  assert.equal(vm.runInContext('PUBLICATIONS.find(x=>x.platform==="instagram").title', a.context), "");

  a.element("publicationPlatform").value = "tiktok";
  await vm.runInContext('addPublication("content-1")', a.context);
  assert.equal(a.rows.length, 2, "não duplica plataforma");
});

test("exclui somente a publicação escolhida e não altera o conteúdo", async () => {
  const a = app([
    { id: "tt", user_id: "user-1", conteudo_id: "content-1", plataforma: "tiktok", titulo: "TikTok" },
    { id: "ig", user_id: "user-1", conteudo_id: "content-1", plataforma: "instagram", titulo: "Instagram" },
  ]); openEditor(a);
  await vm.runInContext('loadPublications("content-1")', a.context);
  await vm.runInContext('deletePublication("tt")', a.context);
  assert.deepEqual(a.rows.map(x => x.id), ["ig"]);
  assert.equal(content.title, "Rotina");
  assert.ok(!a.calls.some(call => call[1] === "conteudos"));
});

test("leituras, edições e exclusões isolam publicação por usuário e conteúdo", () => {
  assert.match(script, /from\("publicacoes"\)\.select\("\*"\)\.eq\("user_id",userId\)\.eq\("conteudo_id",contentId\)/);
  assert.match(script, /from\("publicacoes"\)\.update\([\s\S]*?\.eq\("id",id\)\.eq\("user_id",currentUser\.id\)/);
  assert.match(script, /from\("publicacoes"\)\.delete\(\)\.eq\("id",id\)\.eq\("user_id",currentUser\.id\)/);
  assert.match(script, /user_id:currentUser\.id,conteudo_id:contentId/);
});

test("uma conta não carrega publicações de outra conta", async () => {
  const a = app([
    { id: "mine", user_id: "user-1", conteudo_id: "content-1", plataforma: "tiktok" },
    { id: "other", user_id: "user-2", conteudo_id: "content-1", plataforma: "instagram" },
  ]); openEditor(a);
  await vm.runInContext('loadPublications("content-1")', a.context);
  assert.equal(vm.runInContext("PUBLICATIONS.length", a.context), 1);
  assert.equal(vm.runInContext("PUBLICATIONS[0].id", a.context), "mine");
});
