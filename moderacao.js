import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase=createClient("https://nlqalpiksbqflzxzsgoa.supabase.co","sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP");
const status=document.getElementById("status-admin");\nconsole.info("RefugiART moderação: JavaScript carregado.");
const fila=document.getElementById("fila-moderacao");
const busca=document.querySelector(".inbox-busca input");
const titulo=document.querySelector(".inbox-titulo-linha h2");
const itensPasta=[...document.querySelectorAll("[data-pasta]")];
const filtros=[...document.querySelectorAll("[data-filtro]")];
let publicacoes=[];
let pastaAtual="entrada";
let filtroAtual="todas";
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
function renderizar(){
 fila.replaceChildren();
 const termo=(busca?.value||"").trim().toLocaleLowerCase("pt-BR");
 let lista=publicacoes.filter(p=>{
  const texto=[p.caption,p.category,p.reasons?.join(" "),p.report_count].join(" ").toLocaleLowerCase("pt-BR");
  const combina=!termo||texto.includes(termo);
  const categoria=filtroAtual==="todas"||filtroAtual==="denuncias";
  return combina&&categoria;
 });
 if(pastaAtual==="reclamacoes"||filtroAtual==="reclamacoes"){
  status.textContent="A área de reclamações ainda não possui um formulário ou fonte de dados conectado.";
  return;
 }
 if(pastaAtual==="arquivadas"){
  status.textContent="As publicações já analisadas não são armazenadas nesta fila. O histórico de decisões ainda será implementado.";
  return;
 }
 if(!lista.length){
  status.textContent=termo?"Nenhum resultado para essa pesquisa.":"Nenhuma publicação aguardando revisão.";
  return;
 }
 status.textContent=lista.length+" publicação(ões) aguardando análise.";
 for(const obra of lista){
  const card=el("article","item-moderacao");
  const img=document.createElement("img");img.src=obra.image_url||"";img.alt="Obra denunciada";img.loading="lazy";
  const h=el("h3","","Denúncias: "+obra.report_count);
  const motivos=el("p","","Motivos registrados: "+(Array.isArray(obra.reasons)?obra.reasons.join(", "):"Não informado"));
  const legenda=el("p","",obra.caption||"Sem legenda");
  const categoria=el("p","","Categoria: "+(obra.category||"Outros"));
  const acoes=el("div","acoes-moderacao");
  const liberar=el("button","aprovar-moderacao","Liberar publicação");
  const manter=el("button","remover-moderacao","Manter removida");
  liberar.type=manter.type="button";
  async function decidir(decisao,botao){
   botao.disabled=true;status.textContent="Salvando decisão...";
   const nota=window.prompt("Observação administrativa (opcional):","")||null;
   const {error}=await supabase.rpc("refugiart_review_post",{p_post_id:obra.id,p_decision:decisao,p_note:nota});
   if(error){status.textContent="Não foi possível salvar: "+error.message;botao.disabled=false;return;}
   publicacoes=publicacoes.filter(p=>p.id!==obra.id);renderizar();
   status.textContent="Decisão registrada.";
  }
  liberar.addEventListener("click",()=>decidir("restore",liberar));
  manter.addEventListener("click",()=>decidir("remove",manter));
  acoes.append(liberar,manter);card.append(img,h,motivos,categoria,legenda,acoes);fila.append(card);
 }
}
itensPasta.forEach(botao=>botao.addEventListener("click",()=>{
 pastaAtual=botao.dataset.pasta;
 itensPasta.forEach(b=>b.classList.toggle("ativo",b===botao));
 titulo.textContent=botao.textContent.trim();
 filtros.forEach(b=>b.classList.toggle("ativo",b.dataset.filtro==="todas"));
 filtroAtual="todas";
 renderizar();
}));
filtros.forEach(botao=>botao.addEventListener("click",()=>{
 filtroAtual=botao.dataset.filtro;
 filtros.forEach(b=>b.classList.toggle("ativo",b===botao));
 renderizar();
}));
busca?.addEventListener("input",renderizar);
async function carregar(){
 status.textContent="Verificando acesso e carregando fila...";
 fila.replaceChildren();
 const {data:sessao,error:erroSessao}=await supabase.auth.getSession();
 if(erroSessao||!sessao?.session?.user){
  status.textContent="Entre na sua conta administradora para acessar a moderação.";
  return;
 }
 const {data:admin,error:erroAdmin}=await supabase.rpc("refugiart_is_admin");
 if(erroAdmin||admin!==true){
  status.textContent="Esta conta não possui permissão de administrador.";
  return;
 }
 const {data,error}=await supabase.rpc("refugiart_admin_queue");
 if(error){status.textContent="Erro ao carregar denúncias: "+error.message;return;}
 publicacoes=data||[];
 renderizar();
}
carregar();
