const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(new URL("../index.html", `file://${__filename}`), "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1].replace(/\binit\(\);\s*$/, "");

function app() {
  const elements = new Map();
  const storage = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: "", innerHTML: "", textContent: "", hidden: false, dataset: {}, style: {},
      className: "", classList: { add() {}, remove() {}, toggle() {} }, focus() {}, select() {},
    });
    return elements.get(id);
  };
  let copied = "";
  const context = vm.createContext({
    console, confirm: () => true, setTimeout, clearTimeout,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    navigator: { clipboard: { writeText: text => { copied = text; return Promise.resolve(); } } },
    window: {
      ESSENCIA_SUPABASE: { url: "https://example.test", publishableKey: "test-key" },
      supabase: { createClient: () => ({}) },
    },
    document: {
      body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, removeChild() {} },
      getElementById: element,
      querySelectorAll: () => [],
      createElement: () => element("fallback-copy"),
      execCommand: () => true,
    },
  });
  vm.runInContext(script, context);
  vm.runInContext(`currentUser={id:"user-1",email:"teste@example.com",user_metadata:{}}`, context);
  return { context, element, copied: () => copied };
}

test("monta o roteiro automaticamente na ordem correta e ignora vazios", () => {
  const { context } = app();
  const complete = vm.runInContext(`buildAutomaticScript({soundHook:"Gancho",context:"Contexto",points:"Pontos",turn:"Virada",conclusion:"Conclusão",cta:"CTA"})`, context);
  assert.equal(complete, "Gancho\n\nContexto\n\nPontos\n\nVirada\n\nConclusão\n\nCTA");
  const partial = vm.runInContext(`buildAutomaticScript({soundHook:"Gancho",context:" ",points:"Pontos",turn:null,conclusion:"",cta:"CTA"})`, context);
  assert.equal(partial, "Gancho\n\nPontos\n\nCTA");
});

test("mapeia campos V2.2 sem alterar os campos legados", () => {
  const { context } = app();
  vm.runInContext(`mapped=contentFromDb({id:"1",titulo:"Antigo",gancho:"legado",roteiro:"roteiro antigo",legendas:"legendas antigas",gancho_sonoro:null,pontos:null})`, context);
  assert.equal(vm.runInContext("mapped.hook", context), "legado");
  assert.equal(vm.runInContext("mapped.legacyScript", context), "roteiro antigo");
  assert.equal(vm.runInContext("mapped.legacyCaptions", context), "legendas antigas");
  const keys = vm.runInContext(`Object.keys(contentToDb({title:"Novo",pillar:"Fé",intent:"Conexão",duration:"30–60s",block:blocks[2],status:"a-gravar",soundHook:"S",visualHook:"V",textHook:"T",context:"C",points:"P",turn:"R",conclusion:"F",cta:"A",notes:"N",automaticScript:"AUTO",customScript:"MINHA",date:""}))`, context);
  assert.ok(keys.includes("roteiro_automatico"));
  assert.ok(keys.includes("roteiro_personalizado"));
  assert.ok(!keys.includes("gancho") && !keys.includes("roteiro") && !keys.includes("legendas"));
});

test("o estúdio separa ganchos, construção e as duas versões do roteiro", () => {
  const { context, element } = app();
  vm.runInContext(`STATUS_CONFIG=[{name:"A gravar",key:"a-gravar"}];editForm({id:"1",title:"Teste",pillar:"Fé",intent:"Conexão",duration:"30–60s",block:blocks[2],status:"a-gravar",date:"",soundHook:"Som",visualHook:"Imagem",textHook:"Texto",context:"Contexto",points:"Pontos",turn:"Virada",conclusion:"Conclusão",cta:"CTA",notes:"Nota",automaticScript:"versão anterior",customScript:"minha edição",legacyScript:""})`, context);
  const markup = element("box").innerHTML;
  assert.match(markup, /Estratégia/);
  assert.match(markup, /Gancho sonoro/);
  assert.match(markup, /Gancho visual/);
  assert.match(markup, /Gancho de texto/);
  assert.match(markup, /Construção/);
  assert.match(markup, /Roteiro automático/);
  assert.match(markup, /Minha versão/);
  assert.match(markup, /O conteúdo foi alterado/);
});

test("alterar a estrutura atualiza somente o automático e preserva a versão personalizada", () => {
  const { context, element } = app();
  for (const [id, value] of Object.entries({ f_sound: "Novo gancho", f_visual: "visual", f_text: "texto", f_context: "Contexto", f_pts: "Pontos", f_turn: "", f_conclusion: "Fim", f_cta: "CTA", f_custom: "Minha escrita", f_auto: "" })) element(id).value = value;
  element("customStale").dataset.baseline = "Roteiro anterior";
  vm.runInContext("updateAutomaticPreview()", context);
  assert.equal(element("f_custom").value, "Minha escrita");
  assert.equal(element("f_auto").value, "Novo gancho\n\nContexto\n\nPontos\n\nFim\n\nCTA");
  assert.equal(element("customStale").hidden, false);
});

test("a referência da versão personalizada é isolada por usuário e conteúdo", () => {
  const { context } = app();
  vm.runInContext(`rememberScriptBaseline("content-1","Roteiro de referência")`, context);
  assert.equal(vm.runInContext(`storedScriptBaseline("content-1","")`, context), "Roteiro de referência");
  assert.equal(vm.runInContext(`storedScriptBaseline("content-2","outro")`, context), "outro");
  assert.match(vm.runInContext(`scriptBaselineKey("content-1")`, context), /user-1_content-1$/);
});

test("Copiar roteiro prioriza a versão personalizada e usa o automático como fallback", async () => {
  const first = app();
  first.element("f_custom").value = "Minha versão limpa";
  first.element("f_auto").value = "Versão automática";
  await vm.runInContext("copyScript()", first.context);
  assert.equal(first.copied(), "Minha versão limpa");

  const second = app();
  second.element("f_custom").value = "";
  second.element("f_auto").value = "Versão automática";
  await vm.runInContext("copyScript()", second.context);
  assert.equal(second.copied(), "Versão automática");
});

test("operações de conteúdo seguem limitadas ao user_id e não há seed automático", () => {
  assert.match(script, /from\("conteudos"\)\.select\("\*"\)\.eq\("user_id",userId\)/);
  assert.match(script, /update\(contentToDb\(x\)\)\.eq\("id",id\)\.eq\("user_id",currentUser\.id\)/);
  assert.doesNotMatch(script, /Array\(25\)|25 conteúdos|seedContents|createDefaults/);
});

test("mantém integrações de status, calendário, gravação e layout mobile", () => {
  assert.match(script, /flowStatusOptions\(\)/);
  assert.match(script, /statusColor\(content\?\.status\)/);
  assert.match(script, /recordingQueue\(activeRecordBlock\)/);
  assert.match(html, /@media\(max-width:600px\).*\.script-grid\{grid-template-columns:1fr\}/s);
});

test("deduplica status atuais e legados usando status_config como fonte principal", () => {
  const { context } = app();
  vm.runInContext(`
    STATUS_CONFIG=[
      {name:"Pronto para gravar",key:"pronto_gravar"},
      {name:"Em edição",key:"em-edicao"},
      {name:"Programado",key:"programado"}
    ];
    C=[
      {status:"a-gravar"},{status:"pronto_gravar"},
      {status:"editado"},{status:"em-edicao"},
      {status:"agendado"},{status:"programado"}
    ];
    options=flowStatusOptions();
  `, context);
  assert.deepEqual(
    JSON.parse(vm.runInContext(`JSON.stringify(options)`, context)),
    [
      { value: "pronto_gravar", label: "Pronto para gravar" },
      { value: "em-edicao", label: "Em edição" },
      { value: "programado", label: "Programado" },
    ],
  );
});

test("um filtro atual encontra também conteúdos com o status legado equivalente", () => {
  const { context, element } = app();
  element("cs").value = "";
  element("sf").value = "pronto_gravar";
  vm.runInContext(`C=[
    {id:"old",title:"Legado",pillar:"Fé",intent:"Conexão",status:"a-gravar",date:"",block:blocks[2]},
    {id:"new",title:"Atual",pillar:"Fé",intent:"Conexão",status:"pronto_gravar",date:"",block:blocks[2]},
    {id:"done",title:"Gravado",pillar:"Fé",intent:"Conexão",status:"gravado",date:"",block:blocks[2]}
  ]; renderAll()`, context);
  assert.match(element("allList").innerHTML, /Legado/);
  assert.match(element("allList").innerHTML, /Atual/);
  assert.doesNotMatch(element("allList").innerHTML, /Gravado/);
});

test("editar conteúdo antigo não muda seu slug sem escolha explícita", () => {
  const { context, element } = app();
  vm.runInContext(`studioEditState={originalStatus:"a-gravar",displayStatus:"pronto_gravar"}`, context);
  element("f_s").value = "pronto_gravar";
  assert.equal(vm.runInContext(`statusForSave()`, context), "a-gravar");
  element("f_s").value = "gravado";
  assert.equal(vm.runInContext(`statusForSave()`, context), "gravado");
  vm.runInContext(`studioEditState={originalStatus:null,displayStatus:"pronto_gravar"}`, context);
  element("f_s").value = "pronto_gravar";
  assert.equal(vm.runInContext(`statusForSave()`, context), "pronto_gravar");
});

test("aliases também preservam gravação, cores e demais equivalências conhecidas", () => {
  const { context } = app();
  assert.equal(vm.runInContext(`sameStatus("a_gravar","pronto-para-gravar")`, context), true);
  assert.equal(vm.runInContext(`sameStatus("a-gravar","pronto_gravar")`, context), true);
  assert.equal(vm.runInContext(`sameStatus("editado","em edição")`, context), true);
  assert.equal(vm.runInContext(`sameStatus("agendado","programado")`, context), true);
  assert.equal(vm.runInContext(`isRecordingEligible({status:"pronto_para_gravar"})`, context), true);
  vm.runInContext(`STATUS_CONFIG=[{name:"Pronto para gravar",key:"pronto_gravar",color:"#123456"}]`, context);
  assert.equal(vm.runInContext(`statusColor("a-gravar")`, context), "#123456");
});

test("usa o nome configurado para associar aliases mesmo quando o slug é personalizado", () => {
  const { context } = app();
  vm.runInContext(`STATUS_CONFIG=[{id:"ready",name:"Pronto para gravar",key:"ready_video"}]`, context);
  assert.equal(vm.runInContext(`sameStatus("a-gravar","ready_video")`, context), true);
  vm.runInContext(`C=[{status:"a-gravar"},{status:"ready_video"}]; options=flowStatusOptions()`, context);
  assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(options)`, context)), [
    { value: "ready_video", label: "Pronto para gravar" },
  ]);
});

test("regressão integrada: estúdio e status semântico coexistem no carregamento e payload", () => {
  const { context, element } = app();
  vm.runInContext(`
    STATUS_CONFIG=[{id:"ready",name:"Pronto para gravar",key:"pronto_gravar",color:"#667755"}];
    legacy=contentFromDb({
      id:"legacy-1",titulo:"Conteúdo legado",pilar:"Fé",intencao:"Conexão",
      duracao:"30–60s",bloco:blocks[2],status:"a-gravar",
      gancho_sonoro:"Escute",gancho_visual:"Veja",gancho_texto:"Leia",
      contexto:"Contexto",pontos:"Pontos",virada:"Virada",conclusao:"Conclusão",
      cta:"CTA",observacoes:"Gravar em pé",roteiro_automatico:"Auto anterior",
      roteiro_personalizado:"Minha versão"
    });
    C=[legacy,{id:"current-1",status:"pronto_gravar"}];
    options=flowStatusOptions();
  `, context);

  assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(options)`, context)), [
    { value: "pronto_gravar", label: "Pronto para gravar" },
  ]);
  assert.equal(vm.runInContext(`legacy.visualHook`, context), "Veja");
  assert.equal(vm.runInContext(`legacy.soundHook`, context), "Escute");
  assert.equal(vm.runInContext(`legacy.textHook`, context), "Leia");
  assert.equal(vm.runInContext(`legacy.context`, context), "Contexto");
  assert.equal(vm.runInContext(`legacy.conclusion`, context), "Conclusão");
  assert.equal(vm.runInContext(`legacy.customScript`, context), "Minha versão");
  assert.equal(vm.runInContext(`buildAutomaticScript(legacy)`, context), "Escute\n\nContexto\n\nPontos\n\nVirada\n\nConclusão\n\nCTA");
  assert.equal(vm.runInContext(`statusColor("a-gravar")`, context), "#667755");

  vm.runInContext(`studioEditState={originalStatus:"a-gravar",displayStatus:"pronto_gravar"}`, context);
  element("f_s").value = "pronto_gravar";
  assert.equal(vm.runInContext(`statusForSave()`, context), "a-gravar");

  vm.runInContext(`payload=contentToDb({
    title:legacy.title,pillar:legacy.pillar,intent:legacy.intent,duration:legacy.duration,
    block:legacy.block,status:statusForSave(),soundHook:legacy.soundHook,
    visualHook:legacy.visualHook,textHook:legacy.textHook,context:legacy.context,
    points:legacy.points,turn:legacy.turn,conclusion:legacy.conclusion,cta:legacy.cta,
    notes:legacy.notes,automaticScript:buildAutomaticScript(legacy),
    customScript:legacy.customScript,date:""
  })`, context);
  const payload = JSON.parse(vm.runInContext(`JSON.stringify(payload)`, context));
  assert.equal(payload.status, "a-gravar");
  assert.equal(payload.gancho_visual, "Veja");
  assert.equal(payload.gancho_sonoro, "Escute");
  assert.equal(payload.gancho_texto, "Leia");
  assert.equal(payload.contexto, "Contexto");
  assert.equal(payload.conclusao, "Conclusão");
  assert.equal(payload.roteiro_personalizado, "Minha versão");
  assert.equal(payload.user_id, "user-1");

  vm.runInContext(`studioEditState={originalStatus:null,displayStatus:"pronto_gravar"}`, context);
  element("f_s").value = "pronto_gravar";
  assert.equal(vm.runInContext(`statusForSave()`, context), "pronto_gravar");
});
