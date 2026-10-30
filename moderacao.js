import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase=createClient("https://nlqalpiksbqflzxzsgoa.supabase.co","sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP");
const status=document.getElementById("status-admin");
const fila=document.getElementById("fila-moderacao");
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
async function carregar(){
 status.textContent="Carregando fila de revisão...";
 fila.replaceChildren();
 const {data,error}=await supabase.rpc("refugiart_admin_queue");
 if(error){status.textContent="Acesso não autorizado ou configuração pendente: "+error.message;return;}
 if(!data?.length){status.textContent="Nenhuma publicação aguardando revisão.";return;}
 status.textContent=data.length+" publicação(ões) aguardando análise.";
 for(const obra of data){
  const card=el("article","item-moderacao");
  const img=document.createElement("img");img.src=obra.image_url;img.alt="Obra denunciada";img.loading="lazy";
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
   card.remove();status.textContent="Decisão registrada.";
   if(!fila.children.length)status.textContent="Fila de revisão concluída.";
  }
  liberar.addEventListener("click",()=>decidir("restore",liberar));
  manter.addEventListener("click",()=>decidir("remove",manter));
  acoes.append(liberar,manter);card.append(img,h,motivos,categoria,legenda,acoes);fila.append(card);
 }
}
carregar();
