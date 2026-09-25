const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(new URL("../index.html", `file://${__filename}`), "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1].replace(/\binit\(\);\s*$/, "");

function app() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id,
      value: "",
      innerHTML: "",
      textContent: "",
      hidden: false,
      className: "",
      classList: { add() {}, remove() {}, toggle() {} },
    });
    return elements.get(id);
  };
  const updates = [];
  const updateChain = {
    eq(column, value) { updates.push([column, value]); return this; },
    then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
  };
  const context = vm.createContext({
    console,
    confirm: () => true,
    setTimeout,
    clearTimeout,
    localStorage: {},
    window: {
      ESSENCIA_SUPABASE: { url: "https://example.test", publishableKey: "test-key" },
      supabase: { createClient: () => ({ from: () => ({ update: row => { context.lastUpdate = row; return updateChain; } }) }) },
    },
    document: {
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      getElementById: element,
      querySelectorAll: () => [],
    },
  });
  vm.runInContext(script, context);
  // Objects used by the database stub must be installed from the host context.
  vm.runInContext(`currentUser={id:"user-1",email:"teste@example.com",user_metadata:{}}`, context);
  return { context, element, updates };
}

function seed(context) {
  vm.runInContext(`C=[
    {id:"other",title:"Outro bloco",block:blocks[0],status:"a-gravar",pillar:"Maternidade",intent:"Conexão"},
    {id:"faith-1",title:"Fé 1",block:blocks[2],status:"a-gravar",pillar:"Fé",intent:"Conexão",order:1},
    {id:"faith-2",title:"Fé 2",block:blocks[2],status:"a-gravar",pillar:"Fé",intent:"Conexão",order:2},
    {id:"done",title:"Já gravado",block:blocks[2],status:"gravado",pillar:"Fé",intent:"Conexão",order:0}
  ]`, context);
}

test("inicia no bloco ativo e mantém a ordem definida", () => {
  const { context, element } = app();
  seed(context);
  vm.runInContext(`selectRecordBlock(blocks[2]); mode()`, context);
  assert.match(element("box").innerHTML, /Bloco: Fé · Conteúdo 1 de 2/);
  assert.match(element("box").innerHTML, /Fé 1/);
  assert.doesNotMatch(element("box").innerHTML, /Outro bloco/);
});

test("Pular avança no mesmo bloco sem alterar o status", () => {
  const { context, element } = app();
  seed(context);
  vm.runInContext(`mode(blocks[2]); skipRecording()`, context);
  assert.match(element("box").innerHTML, /Fé 2/);
  assert.equal(vm.runInContext(`C.find(x=>x.id==="faith-1").status`, context), "a-gravar");
});

test("Gravei usa o status configurado, restringe a atualização ao usuário e conclui o bloco", async () => {
  const { context, element, updates } = app();
  seed(context);
  vm.runInContext(`STATUS_CONFIG=[{name:"Gravado",key:"video-gravado"}];mode(blocks[2])`, context);
  await vm.runInContext(`recorded("faith-1")`, context);
  assert.equal(vm.runInContext(`C.find(x=>x.id==="faith-1").status`, context), "video-gravado");
  assert.match(element("box").innerHTML, /Fé 2/);
  await vm.runInContext(`recorded("faith-2")`, context);
  assert.match(element("box").innerHTML, /Bloco concluído/);
  assert.match(element("box").innerHTML, /fim dos conteúdos de Fé/);
  assert.deepEqual(updates.filter(([column]) => column === "user_id"), [["user_id", "user-1"], ["user_id", "user-1"]]);
});

test("exibe estado vazio e permite trocar de bloco preservando o bloco ativo", () => {
  const { context, element } = app();
  seed(context);
  vm.runInContext(`mode(blocks[4])`, context);
  assert.match(element("box").innerHTML, /Não há conteúdos aguardando gravação neste bloco/);
  vm.runInContext(`changeRecordingBlock(blocks[2])`, context);
  assert.match(element("box").innerHTML, /Fé 1/);
  assert.equal(element("bf").value, "Bloco 3 — Fé");
  vm.runInContext(`closeM(); renderRecord()`, context);
  assert.equal(element("activeBlockLabel").textContent, "Bloco ativo: Fé");
});

test("a leitura de conteúdos continua limitada ao usuário autenticado", () => {
  assert.match(script, /from\("conteudos"\)\.select\("\*"\)\.eq\("user_id",userId\)/);
});
