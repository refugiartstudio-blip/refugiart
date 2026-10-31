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
    arquivadas: "Arquivadas"
  };
  titulo.textContent = nomes[pastaAtual] || "Caixa de entrada";

  if (pastaAtual === "reclamacoes" || filtroAtual === "reclamacoes") {
    subtitulo.textContent = "Espaço destinado às reclamações enviadas pela comunidade.";
  } else if (pastaAtual === "arquivadas") {
    subtitulo.textContent = "Consulte aqui as ocorrências já analisadas pela equipe.";
  } else {
    subtitulo.textContent = "Avisos de denúncias e conteúdos sinalizados pela comunidade.";
  }
}

function renderizar() {
  fila.replaceChildren();
  atualizarAbas();
  atualizarCabecalho();

  const termo = (busca?.value || "").trim().toLocaleLowerCase("pt-BR");

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

busca?.addEventListener("input", renderizar);

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
