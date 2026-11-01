import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://nlqalpiksbqflzxzsgoa.supabase.co",
  "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP"
);

const $ = id => document.getElementById(id);
const sidebar = $("sidebar");
const navButtons = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll(".page");
let painelAdminAutorizado = false;

function openPage(name) {
  pages.forEach(page => page.classList.toggle("active", page.id === "page-" + name));
  navButtons.forEach(button => button.classList.toggle("active", button.dataset.page === name));
  const titles = {dashboard:"Visão geral da plataforma",financeiro:"Financeiro",vendas:"Vendas",artistas:"Artistas e Apreciadores",estoque:"Obras e anúncios",relatorios:"Relatórios",configuracoes:"Configurações",ajuda:"Ajuda"};
  document.querySelector(".welcome h1").textContent = titles[name] || "RefugiART Painel";
  sidebar.classList.remove("open");
  if(name === "artistas" && painelAdminAutorizado) carregarUsuarios();
}
navButtons.forEach(button => button.addEventListener("click", () => openPage(button.dataset.page)));
document.querySelectorAll("[data-open]").forEach(button => button.addEventListener("click", () => openPage(button.dataset.open)));
$("menuToggle").addEventListener("click", () => sidebar.classList.toggle("open"));

const dinheiro = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(cents)||0)/100);
const dataCurta = value => value ? new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"}).format(new Date(value)) : "—";
const statusPedido = value => ({delivered:"Entregue",shipped:"Enviado",awaiting_shipment:"Aguardando envio",pending:"Pendente",paid:"Pago",rejected:"Recusado",canceled:"Cancelado",expired:"Expirado",failed:"Falhou"}[value] || value || "Não informado");
const setCell = (row, text, className) => { const cell=document.createElement("td"); cell.textContent=text; if(className) cell.className=className; row.append(cell); return cell; };
const setStatus = (cell, text, kind="") => { const badge=document.createElement("span"); badge.className="status "+kind; badge.textContent=text; cell.append(badge); };
function fillMessage(id,message,span=5){const body=$(id);if(!body)return;body.replaceChildren();const row=document.createElement("tr");const cell=document.createElement("td");cell.colSpan=span;cell.textContent=message;row.append(cell);body.append(row);}
function renderRows(rows,bodyId,mode="financeiro"){
  const body=$(bodyId); if(!body)return; body.replaceChildren();
  if(!rows.length){fillMessage(bodyId,"Nenhuma transação real registrada até o momento.",mode==="vendas"?5:5);return;}
  rows.forEach(item=>{
    const row=document.createElement("tr");
    if(mode==="vendas"){
      setCell(row,dataCurta(item.date));
      setCell(row,item.description);
      setCell(row,dinheiro(item.amount));
      setCell(row,dinheiro(item.commission));
      const statusCell=setCell(row,"");setStatus(statusCell,item.statusLabel,item.statusKind);
    } else {
      setCell(row,dataCurta(item.date));
      setCell(row,item.description);
      setCell(row,item.category);
      const amountCell=setCell(row,(item.direction==="out"?"− ":"+ ")+dinheiro(item.amount),item.direction==="out"?"amount-out":"amount-in");
      const statusCell=setCell(row,"");setStatus(statusCell,item.statusLabel,item.statusKind);
    }
    body.append(row);
  });
}

async function carregarUsuarios(){
  const body=$("usuarios-real");
  const total=$("usuarios-total");
  if(!body || !total) return;
  total.textContent="Consultando cadastros…";
  fillMessage("usuarios-real","Carregando usuários cadastrados…",3);
  const {data,error}=await supabase.rpc("refugiart_admin_list_users");
  if(error){
    total.textContent="Não foi possível carregar";
    fillMessage("usuarios-real","Erro ao consultar usuários: "+(error.message||"verifique as permissões."),3);
    return;
  }
  const usuarios=data||[];
  total.textContent=usuarios.length+" usuário(s) cadastrado(s)";
  body.replaceChildren();
  if(!usuarios.length){fillMessage("usuarios-real","Ainda não há usuários cadastrados.",3);return;}
  usuarios.forEach(usuario=>{
    const row=document.createElement("tr");
    setCell(row,usuario.nome||"Nome não informado");
    setCell(row,usuario.email||"E-mail não informado");
    setCell(row,usuario.categoria||"Não informado");
    body.append(row);
  });
}

let charts=[];
function destroyCharts(){charts.forEach(chart=>chart.destroy());charts=[];}
function buildCharts(orders,transactions){
  if(typeof Chart==="undefined")return;
  destroyCharts();
  const grouped={};
  orders.forEach(order=>{const key=new Date(order.date).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});if(!grouped[key])grouped[key]={sales:0,commission:0,count:0};grouped[key].sales+=Number(order.amount)||0;grouped[key].commission+=Number(order.commission)||0;grouped[key].count++;});
  const labels=Object.keys(grouped);
  const sales=labels.map(key=>grouped[key].sales/100);
  const commissions=labels.map(key=>grouped[key].commission/100);
  const counts=labels.map(key=>grouped[key].count);
  const grid="rgba(145,163,187,.12)",tick="#8291a8";
  Chart.defaults.color=tick;Chart.defaults.font.family="'DM Sans',sans-serif";Chart.defaults.plugins.legend.display=false;Chart.defaults.plugins.tooltip.backgroundColor="#101827";Chart.defaults.plugins.tooltip.borderColor="#334155";Chart.defaults.plugins.tooltip.borderWidth=1;
  const perf=$("performanceChart"); if(perf)charts.push(new Chart(perf,{type:"line",data:{labels,datasets:[{label:"Vendas",data:sales,borderColor:"#28d7b0",backgroundColor:"rgba(40,215,176,.13)",fill:true,tension:.3,pointRadius:4},{label:"Comissão",data:commissions,borderColor:"#a66bff",backgroundColor:"rgba(166,107,255,.06)",fill:false,tension:.3,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:"#aab7c9",usePointStyle:true,boxWidth:7,font:{size:10}}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:grid},ticks:{callback:v=>"R$ "+v.toFixed(2),font:{size:9}}}}}}));
  const salesCanvas=$("salesChart");if(salesCanvas)charts.push(new Chart(salesCanvas,{type:"bar",data:{labels,datasets:[{label:"Vendas",data:counts,backgroundColor:"#a66bff",borderRadius:5,maxBarThickness:22}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>" "+c.raw+" venda(s)"}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:grid},ticks:{stepSize:1,font:{size:9}}}}}}));
  const activity=$("activityChart");if(activity){const cats=["Vendas","Depósitos","Saques pagos"];const vals=[transactions.filter(t=>t.category==="Venda").reduce((s,t)=>s+t.amount,0)/100,transactions.filter(t=>t.category==="Depósito").reduce((s,t)=>s+t.amount,0)/100,transactions.filter(t=>t.category==="Saque"&&t.status==="paid").reduce((s,t)=>s+t.amount,0)/100];charts.push(new Chart(activity,{type:"bar",data:{labels:cats,datasets:[{data:vals,backgroundColor:["#28d7b0","#5c9dff","#fa647c"],borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>" "+new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c.raw)}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:grid},ticks:{callback:v=>"R$ "+v,font:{size:9}}}}}}));}
  const expense=$("expenseChart");if(expense){const commission=orders.reduce((s,o)=>s+o.commission,0)/100;const artistNet=orders.reduce((s,o)=>s+o.net,0)/100;charts.push(new Chart(expense,{type:"doughnut",data:{labels:["Comissão RefugiART","Valor líquido do artista"],datasets:[{data:[commission,artistNet],backgroundColor:["#28d7b0","#5c9dff"],borderColor:"#121b2a",borderWidth:4,hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{display:false}}}}));}
}

async function iniciarPainel(){
  const status=$("painel-status");
  try{
    status.textContent="Verificando acesso administrativo…";
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    if(sessionError)throw sessionError;
    if(!session){status.textContent="Faça login no RefugiART para acessar os dados administrativos.";fillMessage("movimentacoes-reais","Acesso restrito: entre na sua conta administrativa.");fillMessage("financeiro-real","Acesso restrito: entre na sua conta administrativa.");fillMessage("vendas-reais","Acesso restrito: entre na sua conta administrativa.");return;}
    const {data:isAdmin,error:adminError}=await supabase.rpc("refugiart_is_admin");
    if(adminError)throw adminError;
    if(isAdmin!==true){status.textContent="Acesso restrito à administração do RefugiART.";fillMessage("movimentacoes-reais","Sua conta não possui permissão para visualizar este painel.");fillMessage("financeiro-real","Sua conta não possui permissão para visualizar este painel.");fillMessage("vendas-reais","Sua conta não possui permissão para visualizar este painel.");fillMessage("usuarios-real","Acesso restrito à administração do RefugiART.",3);return;}
    painelAdminAutorizado=true;
    await carregarUsuarios();
    status.textContent="Conectado · dados reais do Supabase";
    const [ordersResult,itemsResult,paymentsResult,withdrawalsResult]=await Promise.all([
      supabase.from("refugiart_orders").select("id,status,subtotal_cents,platform_commission_cents,seller_net_cents,paid_at,created_at").order("created_at",{ascending:true}),
      supabase.from("refugiart_order_items").select("order_id,title_snapshot,unit_price_cents,commission_cents,seller_net_cents").order("created_at",{ascending:true}),
      supabase.from("refugiart_payment_intents").select("id,order_nsu,amount_cents,paid_amount_cents,status,payment_method,confirmed_at,created_at").eq("status","paid").order("created_at",{ascending:true}),
      supabase.from("refugiart_withdrawal_requests").select("id,amount_cents,status,created_at,processed_at").order("created_at",{ascending:true})
    ]);
    for(const result of [ordersResult,itemsResult,paymentsResult,withdrawalsResult])if(result.error)throw result.error;
    const itemsByOrder={};(itemsResult.data||[]).forEach(item=>{(itemsByOrder[item.order_id] ||= []).push(item);});
    const orders=(ordersResult.data||[]).map(order=>({id:order.id,date:order.paid_at||order.created_at,amount:Number(order.subtotal_cents)||0,commission:Number(order.platform_commission_cents)||0,net:Number(order.seller_net_cents)||0,status:order.status,title:(itemsByOrder[order.id]||[]).map(i=>i.title_snapshot).filter(Boolean).join(", ")||("Pedido #"+order.id)}));
    const deposits=(paymentsResult.data||[]).filter(payment=>!String(payment.order_nsu||"").startsWith("REFUGIART-MKT-")).map(payment=>({id:payment.id,date:payment.confirmed_at||payment.created_at,amount:Number(payment.paid_amount_cents??payment.amount_cents)||0,category:"Depósito",description:"Depósito via "+(payment.payment_method||"pagamento").toUpperCase(),direction:"in",status:"paid",statusLabel:"Confirmado",statusKind:""}));
    const withdrawals=(withdrawalsResult.data||[]).map(w=>({id:w.id,date:w.processed_at||w.created_at,amount:Number(w.amount_cents)||0,category:"Saque",description:"Saque manual",direction:"out",status:w.status,statusLabel:statusPedido(w.status),statusKind:w.status==="paid"?"":w.status==="pending"?"pending":"review"}));
    const saleTransactions=orders.map(order=>({id:"order-"+order.id,date:order.date,amount:order.amount,commission:order.commission,category:"Venda",description:order.title,direction:"in",status:order.status,statusLabel:statusPedido(order.status),statusKind:order.status==="delivered"?"": "pending"}));
    const transactions=[...saleTransactions,...deposits,...withdrawals].sort((a,b)=>new Date(b.date)-new Date(a.date));
    const totalSales=orders.reduce((sum,o)=>sum+o.amount,0);
    const totalCommission=orders.reduce((sum,o)=>sum+o.commission,0);
    const paidWithdrawals=withdrawals.filter(w=>w.status==="paid").reduce((sum,w)=>sum+w.amount,0);
    $("total-vendas").textContent=dinheiro(totalSales);$("qtd-vendas").textContent=orders.length+" venda(s) registrada(s)";
    $("total-comissao").textContent=dinheiro(totalCommission);$("qtd-comissao").textContent="Comissão calculada nas vendas registradas";
    $("total-saques").textContent=dinheiro(paidWithdrawals);$("qtd-saques").textContent=withdrawals.filter(w=>w.status==="paid").length+" saque(s) pago(s)";
    renderRows(transactions,"movimentacoes-reais","financeiro");
    renderRows(transactions,"financeiro-real","financeiro");
    renderRows(orders.map(o=>({...o,description:o.title,statusLabel:statusPedido(o.status),statusKind:o.status==="delivered"?"":"pending"})),"vendas-reais","vendas");
    buildCharts(orders,transactions);
  }catch(error){
    console.error("Falha ao carregar painel RefugiART:",error);
    status.textContent="Não foi possível carregar os dados reais. "+(error.message||"Verifique a conexão e as permissões.");
    ["movimentacoes-reais","financeiro-real","vendas-reais"].forEach(id=>fillMessage(id,"Falha ao consultar os dados. Atualize a página ou verifique a permissão administrativa."));
  }
}
iniciarPainel();
