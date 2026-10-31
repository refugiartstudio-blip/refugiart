import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://nlqalpiksbqflzxzsgoa.supabase.co",
  "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP"
);

const status = document.getElementById("status-admin");
const fila = document.getElementById("fila-moderacao");
const busca = document.querySelector(".inbox-busca input");
const titulo = document.querySelector(".inbox-titulo-linha h2");
const subtitulo = document.querySelector(".inbox-subtitulo");
const itensPasta = [...document.querySelectorAll("[data-pasta]")];
const filtros = [...document.querySelectorAll("[data-filtro]")];
const indicadorDenuncias = document.getElementById("indicador-denuncias");

let publicacoes = [];
let notificacoesFinanceiras = [];
let canalFinanceiro = null;
let erroCarregamentoFinanceiro = null;
let pastaAtual = "entrada";
let filtroAtual = "todas";

console.info("RefugiART moderação: JavaScript carregado.");

function el(tag, cls, txt) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt !== undefined) node.textContent = txt;
  return node;
}

function mostrarMensagem(mensagem) {
  fila.replaceChildren();
  const aviso = el("div", "mod-mensagem-vazia", mensagem);
  aviso.style.cssText = "padding:32px 24px;text-align:center;color:#68766b;font-size:14px;line-height:1.6;";
  fila.append(aviso);
}

function atualizarAbas() {
  itensPasta.forEach(botao => {
    const ativo = botao.dataset.pasta === pastaAtual;
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });

  filtros.forEach(botao => {
    const ativo = botao.dataset.filtro === filtroAtual;
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });
}

function atualizarCabecalho() {
  const nomes = {
    entrada: "Caixa de entrada",
    denuncias: "Denúncias",
    reclamacoes: "Reclamações",
    arquivadas: "Arquivadas",
    financeiro: "Central financeira"
  };
  titulo.textContent = nomes[pastaAtual] || "Caixa de entrada";

  if (pastaAtual === "financeiro") {
    subtitulo.textContent = "Depósitos, compras, vendas, entregas e repasses registrados pelo sistema.";
  } else if (pastaAtual === "reclamacoes" || filtroAtual === "reclamacoes") {
    subtitulo.textContent = "Espaço destinado às reclamações enviadas pela comunidade.";
  } else if (pastaAtual === "arquivadas") {
    subtitulo.textContent = "Consulte aqui as ocorrências já analisadas pela equipe.";
  } else {
    subtitulo.textContent = "Avisos de denúncias e conteúdos sinalizados pela comunidade.";
  }
}


function formatarDinheiroCentavos(centavos) {
  if (centavos === null || centavos === undefined) return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(centavos) / 100);
}

function rotuloStatusFinanceiro(statusEvento) {
  const rotulos = {
    new: "Novo",
    pending: "Pendente",
    action_required: "Ação necessária",
    completed: "Concluído",
    canceled: "Cancelado",
    failed: "Falhou"
  };
  return rotulos[statusEvento] || statusEvento || "Não informado";
}


function conectarAtualizacoesFinanceiras() {
  if (canalFinanceiro) return;
  canalFinanceiro = supabase
    .channel("refugiart-central-financeira")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "refugiart_financial_notifications"
    }, payload => {
      if (payload.eventType === "INSERT" && payload.new) {
        notificacoesFinanceiras = [
          payload.new,
          ...notificacoesFinanceiras.filter(item => item.id !== payload.new.id)
        ].slice(0, 150);
      } else if (payload.eventType === "UPDATE" && payload.new) {
        if (payload.new.archived_at) {
          notificacoesFinanceiras = notificacoesFinanceiras.filter(item => item.id !== payload.new.id);
        } else {
          notificacoesFinanceiras = notificacoesFinanceiras.map(item =>
            item.id === payload.new.id ? payload.new : item
          );
        }
      }
      if (pastaAtual === "financeiro") renderizarFinanceiro();
    })
    .subscribe();
}

async function carregarFinanceiro() {
  status.textContent = "Carregando movimentações financeiras...";
  const { data, error } = await supabase
    .from("refugiart_financial_notifications")
    .select("id,event_type,status,summary,description,actor_label,counterparty_label,amount_cents,currency,source_reference,related_order_id,created_at,read_at,archived_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    erroCarregamentoFinanceiro = error.message;
    notificacoesFinanceiras = [];
    renderizarFinanceiro();
    return;
  }

  erroCarregamentoFinanceiro = null;
  notificacoesFinanceiras = data || [];
  renderizarFinanceiro();
}

async function renderizarFinanceiro() {
  fila.replaceChildren();
  atualizarAbas();
  atualizarCabecalho();
  if (erroCarregamentoFinanceiro) {
    status.textContent = "Não foi possível carregar o financeiro: " + erroCarregamentoFinanceiro;
    mostrarMensagem("Verifique sua conexão e tente atualizar a central financeira novamente.");
    return;
  }

  const termo = (busca?.value || "").trim().toLocaleLowerCase("pt-BR");
  const lista = notificacoesFinanceiras.filter(evento => {
    const texto = [
      evento.summary, evento.description, evento.actor_label,
      evento.counterparty_label, evento.event_type, evento.status,
      evento.source_reference, evento.related_order_id,
      formatarDinheiroCentavos(evento.amount_cents)
    ].join(" ").toLocaleLowerCase("pt-BR");
    return !termo || texto.includes(termo);
  });

  if (!lista.length) {
    status.textContent = termo ? "Nenhuma movimentação corresponde à pesquisa." : "Central financeira pronta. Ainda não há movimentações registradas.";
    mostrarMensagem(termo
      ? "Tente pesquisar por nome, tipo de movimentação ou valor."
      : "Quando houver depósitos, compras, vendas, confirmações de entrega ou repasses, cada ocorrência aparecerá aqui automaticamente.");
    return;
  }

  status.textContent = lista.length + " movimentação(ões) financeira(s).";
  for (const evento of lista) {
    const card = el("article", "financeiro-item" + (evento.read_at ? "" : " financeiro-nao-lida"));
    const topo = el("div", "financeiro-item-topo");
    const tituloEvento = el("h3", "", evento.summary || "Movimentação financeira");
    const selo = el("span", "financeiro-status " + (evento.status || ""), rotuloStatusFinanceiro(evento.status));
    topo.append(tituloEvento, selo);

    const descricao = el("p", "", evento.description || "");
    const meta = el("div", "financeiro-meta");
    const data = new Date(evento.created_at);
    const dataTexto = Number.isNaN(data.getTime()) ? "Data não informada" : data.toLocaleString("pt-BR");
    meta.append(el("span", "", "Data: " + dataTexto));
    meta.append(el("strong", "", formatarDinheiroCentavos(evento.amount_cents)));

    if (evento.actor_label) meta.append(el("span", "", "De/por: " + evento.actor_label));
    if (evento.counterparty_label) meta.append(el("span", "", "Para: " + evento.counterparty_label));
    if (evento.related_order_id) meta.append(el("span", "", "Pedido: " + evento.related_order_id));
    if (evento.source_reference) meta.append(el("span", "", "Referência: " + evento.source_reference));

    card.append(topo);
    if (evento.description) card.append(descricao);
    card.append(meta);

    if (!evento.read_at) {
      const marcar = el("button", "financeiro-marcar-lida", "Marcar como lida");
      marcar.type = "button";
      marcar.addEventListener("click", async () => {
        marcar.disabled = true;
        const { error } = await supabase
          .from("refugiart_financial_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", evento.id);
        if (error) {
          status.textContent = "Não foi possível atualizar a notificação: " + error.message;
          marcar.disabled = false;
          return;
        }
        evento.read_at = new Date().toISOString();
        renderizarFinanceiro();
      });
      card.append(marcar);
    }
    fila.append(card);
  }
}

function renderizar() {
  fila.replaceChildren();
  atualizarAbas();
  atualizarCabecalho();

  const termo = (busca?.value || "").trim().toLocaleLowerCase("pt-BR");

  if (pastaAtual === "financeiro") {
    document.body.classList.add("financeiro-aberto");
    renderizarFinanceiro();
    return;
  }
  document.body.classList.remove("financeiro-aberto");

  if (pastaAtual === "reclamacoes" || filtroAtual === "reclamacoes") {
    status.textContent = "Reclamações";
    mostrarMensagem("Nenhuma reclamação disponível. Esta categoria já está habilitada para navegação; o recebimento de reclamações será conectado quando o formulário próprio for criado.");
    return;
  }

  if (pastaAtual === "arquivadas") {
    status.textContent = "Histórico de moderação";
    mostrarMensagem("Ainda não há um histórico de publicações arquivadas conectado a esta caixa.");
    return;
  }

  const lista = publicacoes.filter(post => {
    const texto = [
      post.caption,
      post.category,
      ...(Array.isArray(post.reasons) ? post.reasons : []),
      post.report_count
    ].join(" ").toLocaleLowerCase("pt-BR");
    return !termo || texto.includes(termo);
  });

  if (!lista.length) {
    status.textContent = termo ? "Nenhum resultado para essa pesquisa." : "Nenhuma publicação aguardando revisão.";
    mostrarMensagem(termo ? "Tente pesquisar por outro termo." : "Não há denúncias aguardando análise nesta categoria.");
    return;
  }

  status.textContent = lista.length + " publicação(ões) aguardando análise.";

  for (const obra of lista) {
    const card = el("article", "item-moderacao");
    const img = document.createElement("img");
    img.src = obra.image_url || "";
    img.alt = "Obra denunciada";
    img.loading = "lazy";

    const h = el("h3", "", "Denúncias: " + obra.report_count);
    const motivos = el("p", "", "Motivos registrados: " + (Array.isArray(obra.reasons) ? obra.reasons.join(", ") : "Não informado"));
    const legenda = el("p", "", obra.caption || "Sem legenda");
    const categoria = el("p", "", "Categoria: " + (obra.category || "Outros"));
    const acoes = el("div", "acoes-moderacao");
    const liberar = el("button", "aprovar-moderacao", "Liberar publicação");
    const manter = el("button", "remover-moderacao", "Manter removida");
    liberar.type = manter.type = "button";

    async function decidir(decisao, botao) {
      botao.disabled = true;
      status.textContent = "Salvando decisão...";
      const nota = window.prompt("Observação administrativa (opcional):", "") || null;
      const { error } = await supabase.rpc("refugiart_review_post", {
        p_post_id: obra.id,
        p_decision: decisao,
        p_note: nota
      });

      if (error) {
        status.textContent = "Não foi possível salvar: " + error.message;
        botao.disabled = false;
        return;
      }

      publicacoes = publicacoes.filter(post => post.id !== obra.id);
      renderizar();
      status.textContent = "Decisão registrada.";
    }

    liberar.addEventListener("click", () => decidir("restore", liberar));
    manter.addEventListener("click", () => decidir("remove", manter));
    acoes.append(liberar, manter);
    card.append(img, h, motivos, categoria, legenda, acoes);
    fila.append(card);
  }
}

itensPasta.forEach(botao => {
  botao.addEventListener("click", () => {
    pastaAtual = botao.dataset.pasta;
    filtroAtual = pastaAtual === "denuncias" ? "denuncias" : "todas";
    renderizar();
  });
});

filtros.forEach(botao => {
  botao.addEventListener("click", () => {
    filtroAtual = botao.dataset.filtro;
    pastaAtual = "entrada";
    renderizar();
  });
});

busca?.addEventListener("input", () => pastaAtual === "financeiro" ? renderizarFinanceiro() : renderizar());

document.getElementById("atualizar-financeiro")?.addEventListener("click", carregarFinanceiro);

async function carregar() {
  status.textContent = "Verificando acesso e carregando fila...";
  fila.replaceChildren();

  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao || !sessao?.session?.user) {
    status.textContent = "Entre na sua conta administradora para acessar a moderação.";
    mostrarMensagem("Faça login com uma conta autorizada para visualizar as denúncias.");
    return;
  }

  const { data: admin, error: erroAdmin } = await supabase.rpc("refugiart_is_admin");
  if (erroAdmin || admin !== true) {
    status.textContent = "Esta conta não possui permissão de administrador.";
    mostrarMensagem("Acesso restrito à equipe administrativa.");
    return;
  }

  conectarAtualizacoesFinanceiras();
  await carregarFinanceiro();

  const { data, error } = await supabase.rpc("refugiart_admin_queue");
  if (error) {
    status.textContent = "Erro ao carregar denúncias: " + error.message;
    mostrarMensagem("Não foi possível carregar a fila. Atualize a página ou tente novamente.");
    return;
  }

  publicacoes = data || [];
  if (indicadorDenuncias) indicadorDenuncias.textContent = String(publicacoes.length);
  renderizar();
}

renderizar();
carregar();
