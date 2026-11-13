import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
const SUPABASE_KEY = "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const root = document.querySelector("[data-loja-conteudo]");
if (root) {
  const page = root.dataset.lojaConteudo;
  const configs = {
    mercado: [["welcome_label","Identificação da loja",".etiqueta-loja","text"],["welcome_title","Título de boas-vindas","#titulo-loja-refugiart","text"],["welcome_text","Texto de apresentação",".cabecalho-loja-conteudo p","textarea"],["collection_title","Título da vitrine",".titulo-vitrine-propria h3","text"],["collection_text","Texto da vitrine",".titulo-vitrine-propria p","textarea"]],
    vestuario: [["category_label","Identificação da categoria",".banner-categoria small","text"],["category_title","Título da categoria",".banner-categoria h1","text"],["category_text","Apresentação da categoria",".banner-categoria-conteudo p","textarea"],["collection_title","Título da coleção","#titulo-colecao","text"],["collection_text","Texto da coleção",".colecao-categoria .apoio","textarea"]],
    acessorios: [["category_label","Identificação da categoria",".banner-categoria small","text"],["category_title","Título da categoria",".banner-categoria h1","text"],["category_text","Apresentação da categoria",".banner-categoria-conteudo p","textarea"],["collection_title","Título da coleção","#titulo-colecao","text"],["collection_text","Texto da coleção",".colecao-categoria .apoio","textarea"]],
    papelaria: [["category_label","Identificação da categoria",".banner-categoria small","text"],["category_title","Título da categoria",".banner-categoria h1","text"],["category_text","Apresentação da categoria",".banner-categoria-conteudo p","textarea"],["collection_title","Título da coleção","#titulo-colecao","text"],["collection_text","Texto da coleção",".colecao-categoria .apoio","textarea"]]
  };
  const fields = configs[page];
  if (fields) iniciarEditor();
  async function iniciarEditor() {
    const prefix = page + ".";
    const { data: rows, error: readError } = await supabase.from("refugiart_store_content").select("content_key,content_value").like("content_key", prefix + "%");
    if (!readError && rows) {
      const values = new Map(rows.map(row => [row.content_key.slice(prefix.length), row.content_value]));
      fields.forEach(([key,,selector]) => { const target=root.querySelector(selector); if(target&&values.has(key)) target.textContent=values.get(key); });
    } else if (readError) console.warn("Não foi possível carregar os textos personalizados:",readError.message);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;
    const { data: isAdmin, error: adminError } = await supabase.rpc("refugiart_is_admin");
    if (adminError || isAdmin !== true) return;
    montarInterfaceAdmin(authData.user.id,prefix);
  }
  function montarInterfaceAdmin(userId,prefix) {
    const anchor=root.querySelector(page==="mercado"?".cabecalho-loja":".banner-categoria");
    if(!anchor)return;
    const style=document.createElement("style");
    style.textContent=`
      .editor-textos-loja{margin:14px 0 20px;display:flex;justify-content:flex-end}
      .editor-textos-loja button{border:1px solid #d5dfd4;border-radius:999px;padding:10px 15px;background:#fff;color:#243e35;font:700 12px inherit;cursor:pointer}
      .editor-textos-loja button:hover{background:#edf2eb}
      .painel-textos-loja{margin:14px 0 22px;padding:18px;border:1px solid #d7e1d6;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(36,62,53,.07)}
      .painel-textos-loja[hidden]{display:none}
      .painel-textos-loja h2{margin:0 0 5px;color:#243e35;font-size:19px}
      .painel-textos-loja>p{margin:0 0 14px;color:#718075;font-size:12px}
      .painel-textos-loja label{display:block;margin:12px 0 5px;color:#34483a;font-size:12px;font-weight:750}
      .painel-textos-loja input,.painel-textos-loja textarea{box-sizing:border-box;width:100%;border:1px solid #d8e1d7;border-radius:8px;padding:10px;color:#29352e;background:#fff;font:inherit;font-size:14px}
      .painel-textos-loja textarea{min-height:76px;resize:vertical}
      .painel-textos-loja .acoes-editor-textos{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}
      .painel-textos-loja .acoes-editor-textos button{border:0;border-radius:8px;padding:10px 15px;background:#243e35;color:#fff;font-weight:750;cursor:pointer}
      .painel-textos-loja .acoes-editor-textos button.secundario{background:#edf2eb;color:#243e35}
      .painel-textos-loja button:disabled{opacity:.6;cursor:wait}
      .painel-textos-loja .status-editor-textos{min-height:18px;margin:10px 0 0;color:#526b56;font-size:12px}
    `;
    document.head.append(style);
    const tools=document.createElement("div");tools.className="editor-textos-loja";
    const toggle=document.createElement("button");toggle.type="button";toggle.textContent="✎ Editar textos da loja";toggle.setAttribute("aria-expanded","false");tools.append(toggle);
    const panel=document.createElement("section");panel.className="painel-textos-loja";panel.hidden=true;
    const title=document.createElement("h2");title.textContent="Editar conteúdo da página";
    const intro=document.createElement("p");intro.textContent="As alterações serão publicadas para todos os visitantes da loja.";
    const form=document.createElement("form");const controls=new Map();
    fields.forEach(([key,label,selector,type])=>{
      const fieldLabel=document.createElement("label");const id="loja-copy-"+key;fieldLabel.htmlFor=id;fieldLabel.textContent=label;
      const input=document.createElement(type==="textarea"?"textarea":"input");if(type!=="textarea")input.type="text";
      input.id=id;input.maxLength=type==="textarea"?500:100;input.required=true;input.value=root.querySelector(selector)?.textContent?.trim()||"";
      controls.set(key,input);form.append(fieldLabel,input);
    });
    const actions=document.createElement("div");actions.className="acoes-editor-textos";
    const save=document.createElement("button");save.type="submit";save.textContent="Salvar alterações";
    const cancel=document.createElement("button");cancel.type="button";cancel.className="secundario";cancel.textContent="Fechar";
    const status=document.createElement("p");status.className="status-editor-textos";status.setAttribute("role","status");
    actions.append(save,cancel);form.append(actions,status);panel.append(title,intro,form);
    anchor.insertAdjacentElement("afterend",tools);tools.insertAdjacentElement("afterend",panel);
    toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));if(!panel.hidden)panel.scrollIntoView({behavior:"smooth",block:"nearest"});});
    cancel.addEventListener("click",()=>{panel.hidden=true;toggle.setAttribute("aria-expanded","false");});
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      const values=fields.map(([key])=>({content_key:prefix+key,content_value:controls.get(key).value.trim(),updated_by:userId,updated_at:new Date().toISOString()}));
      if(values.some(value=>!value.content_value)){status.textContent="Preencha todos os campos antes de salvar.";return;}
      save.disabled=true;save.textContent="Publicando...";status.textContent="Salvando alterações...";
      const {error}=await supabase.from("refugiart_store_content").upsert(values,{onConflict:"content_key"});
      if(error){console.error("Erro ao salvar textos:",error);status.textContent="Não foi possível salvar. "+(error.message||"Tente novamente.");}
      else{fields.forEach(([key,,selector])=>{const target=root.querySelector(selector);if(target)target.textContent=controls.get(key).value.trim();});status.textContent="Textos atualizados e publicados com sucesso.";}
      save.disabled=false;save.textContent="Salvar alterações";
    });
  }
}
