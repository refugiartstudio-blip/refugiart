
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =========================================================
   REFUGIART — ATELIÊ
   Feed, filtros, pesquisa, perfis e publicação de obras
   ========================================================= */

const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
const SUPABASE_KEY = "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById("form-obra");
const inputImagem = document.getElementById("imagem-obra");
const previaImagem = document.getElementById("previa-obra");
const inputLegenda = document.getElementById("legenda-obra");
const selectCategoria = document.getElementById("categoria-obra");
const botaoPublicar = document.getElementById("botao-enviar-obra");
const statusAtelie = document.getElementById("status-atelie");
const listaObras = document.getElementById("lista-obras");
const botaoAtualizar = document.getElementById("atualizar-feed");
const campoBusca = document.getElementById("busca-atelie");
const formBusca = document.getElementById("form-busca-atelie");

const CATEGORIAS = [
  "Desenho",
  "Pintura",
  "Fotografia",
  "Escultura",
  "Tatuagem",
  "Digital",
  "Leitura",
  "Outros"
];

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];

let imagemSelecionada = null;
let urlPreviaTemporaria = null;
let imagemOriginalRecorte = null;
let arquivoOriginalRecorte = null;
let recorteAtual = { esquerda: 0, direita: 0, topo: 0, baixo: 0 };

const editorRecorte = document.getElementById("editor-recorte-obra");
const canvasRecorte = document.getElementById("canvas-recorte-obra");
const contextoRecorte = canvasRecorte?.getContext("2d");
const controlesRecorte = {
  esquerda: document.getElementById("recorte-esquerda"),
  direita: document.getElementById("recorte-direita"),
  topo: document.getElementById("recorte-topo"),
  baixo: document.getElementById("recorte-baixo")
};
let categoriaAtiva = "Todas";
let termoBusca = "";
let obrasCarregadas = [];
let temporizadorBusca = null;
let carregamentoEmAndamento = false;
let ultimaSolicitacao = 0;

// Identifica qual Ateliê deve ser exibido pela URL.
const parametrosAtelie = new URLSearchParams(window.location.search);
const artistaIdUrl = parametrosAtelie.get("id");
let perfilIdAtelie = null;
let souDonoDoAtelie = false;

/* ---------- Elementos e mensagens ---------- */

function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);

  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;

  return elemento;
}

function mostrarStatus(mensagem, tipo = "normal") {
  if (!statusAtelie) return;

  statusAtelie.textContent = mensagem;
  statusAtelie.dataset.tipo = tipo;
}

function mostrarMensagemFeed(mensagem) {
  if (!listaObras) return;

  listaObras.replaceChildren();

  listaObras.appendChild(
    criarElemento("p", "mensagem-feed", mensagem)
  );
}

function formatarData(data) {
  if (!data) return "";

  const dataValida = new Date(data);

  if (Number.isNaN(dataValida.getTime())) return "";

  return dataValida.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/* ---------- Pré-visualização da imagem ---------- */

function limparPrevia() {
  imagemOriginalRecorte = null;
  arquivoOriginalRecorte = null;
  recorteAtual = { esquerda: 0, direita: 0, topo: 0, baixo: 0 };
  if (editorRecorte) editorRecorte.hidden = true;
  Object.entries(controlesRecorte).forEach(([lado, controle]) => {
    if (controle) {
      controle.value = 0;
      const saida = document.getElementById("valor-" + lado);
      if (saida) saida.textContent = "0%";
    }
  });
  if (urlPreviaTemporaria) {
    URL.revokeObjectURL(urlPreviaTemporaria);
    urlPreviaTemporaria = null;
  }

  if (previaImagem) {
    previaImagem.removeAttribute("src");
    previaImagem.hidden = true;
    previaImagem.alt = "";
  }
}

function validarImagem(arquivo) {
  if (!arquivo) {
    return "Selecione uma imagem para a obra.";
  }

  if (!TIPOS_IMAGEM.includes(arquivo.type)) {
    return "Formato inválido. Use uma imagem JPG, PNG ou WEBP.";
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    return "A imagem deve ter no máximo 5 MB.";
  }

  if (arquivo.size === 0) {
    return "O arquivo selecionado está vazio.";
  }

  return "";
}

inputImagem?.addEventListener("change", () => {
  limparPrevia();
  imagemSelecionada = inputImagem.files?.[0] || null;
  if (!imagemSelecionada) return;
  const erro = validarImagem(imagemSelecionada);
  if (erro) {
    imagemSelecionada = null; inputImagem.value = "";
    mostrarStatus(erro, "erro"); return;
  }
  arquivoOriginalRecorte = imagemSelecionada;
  const leitor = new FileReader();
  leitor.onload = () => {
    const imagem = new Image();
    imagem.onload = () => {
      imagemOriginalRecorte = imagem;
      if (editorRecorte) editorRecorte.hidden = false;
      desenharPreviaRecorte();
      mostrarStatus("Imagem pronta. Ajuste cada borda como desejar.", "sucesso");
    };
    imagem.onerror = () => mostrarStatus("Não foi possível abrir essa imagem.", "erro");
    imagem.src = leitor.result;
  };
  leitor.onerror = () => mostrarStatus("Não foi possível ler a imagem.", "erro");
  leitor.readAsDataURL(imagemSelecionada);
});

/* ---------- Recorte manual por cada uma das quatro bordas ---------- */
function desenharPreviaRecorte() {
  if (!imagemOriginalRecorte || !canvasRecorte || !contextoRecorte) return;
  const largura = imagemOriginalRecorte.naturalWidth;
  const altura = imagemOriginalRecorte.naturalHeight;
  const x = Math.round(largura * recorteAtual.esquerda / 100);
  const y = Math.round(altura * recorteAtual.topo / 100);
  const w = Math.max(1, Math.round(largura * (100 - recorteAtual.esquerda - recorteAtual.direita) / 100));
  const h = Math.max(1, Math.round(altura * (100 - recorteAtual.topo - recorteAtual.baixo) / 100));
  const escala = Math.min(1, 900 / Math.max(w, h));
  canvasRecorte.width = Math.max(1, Math.round(w * escala));
  canvasRecorte.height = Math.max(1, Math.round(h * escala));
  contextoRecorte.clearRect(0, 0, canvasRecorte.width, canvasRecorte.height);
  contextoRecorte.drawImage(imagemOriginalRecorte, x, y, w, h, 0, 0, canvasRecorte.width, canvasRecorte.height);
}

Object.entries(controlesRecorte).forEach(([lado, controle]) => {
  controle?.addEventListener("input", () => {
    const oposto = lado === "esquerda" ? "direita" : lado === "direita" ? "esquerda" : lado === "topo" ? "baixo" : "topo";
    const valor = Number(controle.value);
    if (valor + recorteAtual[oposto] > 85) {
      controle.value = Math.max(0, 85 - recorteAtual[oposto]);
    }
    recorteAtual[lado] = Number(controle.value);
    const saida = document.getElementById("valor-" + lado);
    if (saida) saida.textContent = controle.value + "%";
    desenharPreviaRecorte();
  });
});

document.getElementById("resetar-recorte-obra")?.addEventListener("click", () => {
  Object.entries(controlesRecorte).forEach(([lado, controle]) => {
    if (controle) controle.value = 0;
    recorteAtual[lado] = 0;
    const saida = document.getElementById("valor-" + lado);
    if (saida) saida.textContent = "0%";
  });
  desenharPreviaRecorte();
});

async function obterArquivoRecortado() {
  if (!imagemOriginalRecorte || !arquivoOriginalRecorte) return imagemSelecionada;
  const largura = imagemOriginalRecorte.naturalWidth;
  const altura = imagemOriginalRecorte.naturalHeight;
  const x = Math.round(largura * recorteAtual.esquerda / 100);
  const y = Math.round(altura * recorteAtual.topo / 100);
  const w = Math.max(1, Math.round(largura * (100 - recorteAtual.esquerda - recorteAtual.direita) / 100));
  const h = Math.max(1, Math.round(altura * (100 - recorteAtual.topo - recorteAtual.baixo) / 100));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(imagemOriginalRecorte, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, arquivoOriginalRecorte.type, 0.92));
  if (!blob) throw new Error("Não foi possível preparar a imagem recortada.");
  return new File([blob], arquivoOriginalRecorte.name, { type: arquivoOriginalRecorte.type, lastModified: Date.now() });
}

/* ---------- Sessão e perfil ---------- */

async function obterUsuario() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Erro ao verificar sessão:", error);
    return null;
  }

  return data.user || null;
}

async function buscarPerfil(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome_artistico, nome_atelie, biografia, area_atuacao, foto_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Erro ao carregar perfil:", error.message);
    return null;
  }

  return data;
}

/* ---------- Cartão de publicação ---------- */

function criarCartaoObra(obra) {
  const artigo = criarElemento("article", "obra-card");

  const cabecalho = criarElemento("div", "obra-cabecalho");

  const avatar = criarElemento("div", "obra-avatar", "✎");
  avatar.setAttribute("aria-hidden", "true");

  if (obra.artista?.foto_url) {
    const fotoArtista = document.createElement("img");

    fotoArtista.src = obra.artista.foto_url;
    fotoArtista.alt = "";
    fotoArtista.className = "obra-avatar-imagem";
    fotoArtista.loading = "lazy";

    fotoArtista.addEventListener("error", () => {
      fotoArtista.remove();
      avatar.textContent = "✎";
    }, { once: true });

    avatar.replaceChildren(fotoArtista);
  }

  const informacoesArtista = criarElemento(
    "div",
    "obra-info-artista"
  );

  const nome = obra.artista?.nome_artistico?.trim()
    || "Artista da comunidade";

  const nomeArtista = criarElemento(
    "strong",
    "obra-nome-artista",
    nome
  );

  const data = criarElemento(
    "small",
    "obra-data",
    formatarData(obra.created_at)
  );

  informacoesArtista.append(nomeArtista, data);
  cabecalho.append(avatar, informacoesArtista);

  // A edição só aparece para quem publicou esta obra.
  obterUsuario().then(usuario => {
    if (!usuario || usuario.id !== obra.user_id) return;

    const editar = criarElemento("button", "botao-editar-obra", "✏️");
    editar.type = "button";
    editar.title = "Editar publicação";
    editar.setAttribute("aria-label", "Editar sua publicação");
    editar.addEventListener("click", () => {
      // Evita abrir duas janelas se houver toque duplo ou modal anterior.
      document.querySelectorAll(".modal-obra-overlay").forEach(item => item.remove());
      const overlay = criarElemento("div", "modal-obra-overlay");
      overlay.setAttribute("role", "presentation");
      const janela = criarElemento("section", "modal-obra");
      janela.setAttribute("role", "dialog");
      janela.setAttribute("aria-modal", "true");
      janela.setAttribute("aria-labelledby", "titulo-modal-obra");

      const topo = criarElemento("div", "modal-obra-topo");
      const titulo = criarElemento("h2", "", "Gerenciar publicação");
      titulo.id = "titulo-modal-obra";
      const fechar = criarElemento("button", "modal-obra-fechar", "×");
      fechar.type = "button";
      fechar.setAttribute("aria-label", "Fechar");
      topo.append(titulo, fechar);

      const opcoes = criarElemento("div", "modal-obra-opcoes");
      const botaoEditar = criarElemento("button", "modal-obra-opcao", "✏️  Editar legenda");
      const botaoExcluir = criarElemento("button", "modal-obra-opcao modal-obra-excluir", "🗑️  Excluir obra");
      botaoEditar.type = botaoExcluir.type = "button";
      opcoes.append(botaoEditar, botaoExcluir);

      const formulario = criarElemento("div", "modal-obra-formulario");
      formulario.hidden = true;
      const campo = document.createElement("textarea");
      campo.value = obra.caption || "";
      campo.maxLength = 2000;
      campo.rows = 5;
      campo.setAttribute("aria-label", "Legenda da obra");
      const acoes = criarElemento("div", "modal-obra-acoes");
      const cancelarEdicao = criarElemento("button", "modal-obra-secundario", "Cancelar");
      const salvar = criarElemento("button", "modal-obra-salvar", "Salvar legenda");
      cancelarEdicao.type = salvar.type = "button";
      acoes.append(cancelarEdicao, salvar);
      formulario.append(campo, acoes);

      const confirmacao = criarElemento("div", "modal-obra-confirmacao");
      confirmacao.hidden = true;
      const aviso = criarElemento("p", "", "Tem certeza? Esta ação apagará a publicação permanentemente.");
      const acoesExcluir = criarElemento("div", "modal-obra-acoes");
      const cancelarExclusao = criarElemento("button", "modal-obra-secundario", "Manter obra");
      const confirmarExclusao = criarElemento("button", "modal-obra-perigo", "Sim, excluir");
      cancelarExclusao.type = confirmarExclusao.type = "button";
      acoesExcluir.append(cancelarExclusao, confirmarExclusao);
      confirmacao.append(aviso, acoesExcluir);

      const mensagem = criarElemento("p", "modal-obra-mensagem");
      mensagem.setAttribute("aria-live", "polite");
      janela.append(topo, opcoes, formulario, confirmacao, mensagem);
      overlay.appendChild(janela);
      document.body.appendChild(overlay);

      const fecharModal = () => overlay.remove();
      fechar.addEventListener("click", fecharModal);
      overlay.addEventListener("click", evento => {
        if (evento.target === overlay) fecharModal();
      });
      document.addEventListener("keydown", function escapeModal(evento) {
        if (evento.key === "Escape" && document.body.contains(overlay)) {
          fecharModal();
          document.removeEventListener("keydown", escapeModal);
        }
      });

      botaoEditar.addEventListener("click", () => {
        opcoes.hidden = true;
        formulario.hidden = false;
        campo.focus();
      });
      cancelarEdicao.addEventListener("click", () => {
        formulario.hidden = true;
        opcoes.hidden = false;
        mensagem.textContent = "";
      });
      salvar.addEventListener("click", async () => {
        const novaLegenda = campo.value.trim();
        if (novaLegenda.length > 2000) {
          mensagem.textContent = "A legenda deve ter no máximo 2.000 caracteres.";
          return;
        }
        salvar.disabled = true;
        mensagem.textContent = "Salvando...";
        try {
          const { error } = await supabase.from("atelie_posts")
            .update({ caption: novaLegenda })
            .eq("id", obra.id)
            .eq("user_id", usuario.id);
          if (error) throw error;
          obra.caption = novaLegenda;
          fecharModal();
          renderizarObras();
        } catch (erro) {
          mensagem.textContent = "Não foi possível salvar: " + (erro.message || "tente novamente.");
          salvar.disabled = false;
        }
      });

      botaoExcluir.addEventListener("click", () => {
        opcoes.hidden = true;
        confirmacao.hidden = false;
      });
      cancelarExclusao.addEventListener("click", () => {
        confirmacao.hidden = true;
        opcoes.hidden = false;
        mensagem.textContent = "";
      });
      confirmarExclusao.addEventListener("click", async () => {
        confirmarExclusao.disabled = true;
        mensagem.textContent = "Excluindo publicação...";
        try {
          const { error } = await supabase.from("atelie_posts")
            .delete()
            .eq("id", obra.id)
            .eq("user_id", usuario.id);
          if (error) throw error;
          fecharModal();
          obrasCarregadas = obrasCarregadas.filter(item => String(item.id) !== String(obra.id));
          renderizarObras();
        } catch (erro) {
          mensagem.textContent = "Não foi possível excluir: " + (erro.message || "tente novamente.");
          confirmarExclusao.disabled = false;
        }
      });
    });
    cabecalho.appendChild(editar);
  });

  const categoria = criarElemento(
    "span",
    "obra-categoria",
    obra.category || "Outros"
  );

  const imagem = document.createElement("img");

  imagem.className = "obra-imagem";
  imagem.src = obra.image_url;
  imagem.alt = `Obra artística de ${nome}`;
  imagem.loading = "lazy";
  imagem.decoding = "async";

  imagem.addEventListener("error", () => {
    imagem.alt = "Não foi possível carregar a imagem desta obra.";
    imagem.classList.add("imagem-com-erro");
  }, { once: true });

  const areaImagem = criarElemento("div", "obra-imagem-area");
  areaImagem.appendChild(imagem);
  if (souDonoDoAtelie && obra.moderation_status && obra.moderation_status !== "published") {
    const aviso = criarElemento("div", "aviso-moderacao-obra",
      obra.moderation_status === "under_review"
        ? "⚠ Publicação denunciada — em análise administrativa. Visível somente para você."
        : "⛔ Publicação removida da visualização pública após revisão administrativa.");
    aviso.setAttribute("role", "status");
    areaImagem.appendChild(aviso);
  }
  if (obra.content_sensitive) {
    const cobertura = criarElemento("button", "cobertura-conteudo-sensivel", "⚠ Conteúdo sensível — toque para visualizar");
    cobertura.type = "button";
    cobertura.addEventListener("click", () => { areaImagem.classList.add("conteudo-sensivel-revelado"); cobertura.remove(); });
    areaImagem.appendChild(cobertura);
  }

  const conteudo = criarElemento("div", "obra-conteudo");

  const legendaTexto = obra.caption?.trim()
    || "Uma obra compartilhada com a comunidade RefugiART.";

  const legenda = criarElemento(
    "p",
    "obra-legenda",
    legendaTexto
  );

  conteudo.append(categoria, legenda);

  obterUsuario().then(usuario => {
    if (!usuario || usuario.id === obra.user_id || obra.moderation_status !== "published") return;
    const denunciar = criarElemento("button", "botao-denunciar-obra", "⚑ Denunciar");
    denunciar.type = "button";
    denunciar.addEventListener("click", async () => {
      const motivo = window.prompt(
        "Motivo: 1 Conteúdo sexual proibido; 2 Imagem íntima sem consentimento; 3 Violência; 4 Ódio/assédio; 5 Segurança de menores; 6 Conteúdo sensível sem aviso; 7 Spam; 8 Outro",
        "8"
      );
      if (motivo === null) return;
      const motivos = {"1":"sexual_content","2":"nonconsensual_intimate","3":"violence","4":"hate_or_harassment","5":"minor_safety","6":"missing_sensitive_warning","7":"spam","8":"other"};
      if (!motivos[motivo]) { window.alert("Escolha um número entre 1 e 8."); return; }
      denunciar.disabled = true;
      try {
        const {data,error} = await supabase.rpc("refugiart_submit_post_report", {
          p_post_id: obra.id, p_reason: motivos[motivo], p_details: null
        });
        if (error) throw error;
        window.alert(data?.already_reported
          ? "Você já denunciou esta publicação."
          : data?.under_review
            ? "Denúncia registrada. A publicação atingiu o limite e foi ocultada para revisão."
            : "Denúncia registrada. Obrigado por ajudar a comunidade.");
      } catch (erro) {
        window.alert("Não foi possível registrar: " + (erro.message || "tente novamente."));
        denunciar.disabled = false;
      }
    });
    const acoes = criarElemento("div", "obra-acoes-moderacao");
    acoes.appendChild(denunciar);
    artigo.appendChild(acoes);
  });

  artigo.append(cabecalho, areaImagem, conteudo);

  return artigo;
}

/* ---------- Filtros e pesquisa ---------- */

function filtrarObras(obras) {
  const pesquisa = normalizarTexto(termoBusca);

  return obras.filter((obra) => {
    const categoriaObra = obra.category || "Outros";

    const correspondeCategoria =
      categoriaAtiva === "Todas" ||
      categoriaObra === categoriaAtiva ||
      (
        categoriaAtiva === "Outros" &&
        !CATEGORIAS.includes(categoriaObra)
      );

    const textoObra = normalizarTexto([
      obra.caption,
      obra.category,
      obra.artista?.nome_artistico
    ].join(" "));

    const correspondePesquisa =
      !pesquisa || textoObra.includes(pesquisa);

    return correspondeCategoria && correspondePesquisa;
  });
}

function renderizarObras() {
  if (!listaObras) return;

  const filtradas = filtrarObras(obrasCarregadas);

  listaObras.replaceChildren();

  if (!filtradas.length) {
    const existemObras = obrasCarregadas.length > 0;

    let mensagem;

    if (existemObras) {
      mensagem = "Nenhuma obra encontrada com esses filtros.";
    } else {
      // Feed vazio: não exibe balão ou mensagem de convite.
      return;
    }

    mostrarMensagemFeed(mensagem);
    return;
  }

  const fragmento = document.createDocumentFragment();

  filtradas.forEach((obra) => {
    fragmento.appendChild(criarCartaoObra(obra));
  });

  listaObras.appendChild(fragmento);
}

function atualizarEstadoCategorias() {
  document.querySelectorAll("[data-categoria]").forEach((elemento) => {
    const categoria = elemento.dataset.categoria || "Todas";
    const ativo = categoria === categoriaAtiva;

    elemento.classList.toggle("selecionada", ativo);

    if (
      elemento.classList.contains("link-lateral") ||
      elemento.closest(".lista-categorias")
    ) {
      elemento.classList.toggle("ativo", ativo);
    }

    if (elemento.tagName === "BUTTON") {
      elemento.setAttribute("aria-pressed", String(ativo));
    }
  });
}

/* ---------- Carregamento do feed ---------- */

async function carregarObras() {
  if (!listaObras) return;

  const numeroSolicitacao = ++ultimaSolicitacao;

  if (!obrasCarregadas.length) {
    mostrarMensagemFeed("Carregando publicações...");
  }

  carregamentoEmAndamento = true;

  try {
    if (!perfilIdAtelie) {
      obrasCarregadas = [];
      mostrarMensagemFeed("Não foi possível identificar este Ateliê.");
      return;
    }

    const { data: obras, error } = await supabase
      .from("atelie_posts")
      .select("id, user_id, image_url, caption, category, created_at, moderation_status, content_sensitive")
      .eq("user_id", perfilIdAtelie)
      .order("created_at", { ascending: false })
      .limit(50);

    if (numeroSolicitacao !== ultimaSolicitacao) return;

    if (error) throw error;

    const publicacoes = obras || [];

    const idsArtistas = [
      ...new Set(publicacoes.map((obra) => obra.user_id).filter(Boolean))
    ];

    let perfisPorId = {};

    if (idsArtistas.length) {
      const { data: perfis, error: erroPerfis } = await supabase
        .from("profiles")
        .select("id, nome_artistico, foto_url")
        .in("id", idsArtistas);

      if (erroPerfis) {
        console.warn("Não foi possível carregar alguns perfis:", erroPerfis);
      } else {
        perfisPorId = Object.fromEntries(
          (perfis || []).map((perfil) => [perfil.id, perfil])
        );
      }
    }

    if (numeroSolicitacao !== ultimaSolicitacao) return;

    obrasCarregadas = publicacoes.map((obra) => ({
      ...obra,
      artista: perfisPorId[obra.user_id] || null
    }));

    renderizarObras();
  } catch (erro) {
    console.error("Erro ao carregar o feed:", erro);

    if (numeroSolicitacao === ultimaSolicitacao) {
      mostrarMensagemFeed(
        "Não foi possível carregar as obras. Verifique sua conexão e as configurações do Supabase."
      );
    }
  } finally {
    if (numeroSolicitacao === ultimaSolicitacao) {
      carregamentoEmAndamento = false;
    }
  }
}

/* ---------- Publicação de uma obra ---------- */

form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (botaoPublicar?.disabled) return;

  const textoOriginal = botaoPublicar?.textContent || "Publicar obra";

  if (botaoPublicar) {
    botaoPublicar.disabled = true;
    botaoPublicar.textContent = "Publicando...";
  }

  try {
    mostrarStatus("Verificando sua conta...", "normal");

    const usuario = await obterUsuario();

    if (!usuario) {
      mostrarStatus(
        "Entre na sua conta para publicar uma obra.",
        "erro"
      );

      window.location.href = "login.html";
      return;
    }

    if (!souDonoDoAtelie || usuario.id !== perfilIdAtelie) {
      mostrarStatus("Você só pode publicar no seu próprio Ateliê.", "erro");
      return;
    }

    const arquivo = await obterArquivoRecortado() || imagemSelecionada || inputImagem?.files?.[0];
    const erroImagem = validarImagem(arquivo);

    if (erroImagem) {
      mostrarStatus(erroImagem, "erro");
      return;
    }

    const categoria = selectCategoria?.value || "Outros";

    if (!CATEGORIAS.includes(categoria)) {
      mostrarStatus("Selecione uma categoria válida.", "erro");
      return;
    }

    const publicarComunidade = document.getElementById("publicar-comunidade")?.checked || false;
    const publicarMercado = document.getElementById("publicar-mercado")?.checked || false;
    const conteudoSensivel = document.getElementById("conteudo-sensivel-obra")?.checked || false;
    const campoPreco = document.getElementById("preco-obra");
    const precoTexto = (campoPreco?.value || "").trim().replace(",", ".");
    const preco = publicarMercado ? Number(precoTexto) : null;

    if (publicarMercado && (!precoTexto || !Number.isFinite(preco) || preco <= 0)) {
      mostrarStatus("Informe um preço válido para anunciar no Mercado.", "erro");
      return;
    }

    const legenda = (inputLegenda?.value || "").trim();

    if (legenda.length > 2000) {
      mostrarStatus(
        "A legenda deve ter no máximo 2.000 caracteres.",
        "erro"
      );
      return;
    }

    mostrarStatus("Enviando a imagem...", "normal");

    const extensoesPermitidas = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extensao = extensoesPermitidas[arquivo.type];

    const nomeArquivo =
      `${usuario.id}/${Date.now()}-${crypto.randomUUID()}.${extensao}`;

    const { error: erroUpload } = await supabase.storage
      .from("artwork-images")
      .upload(nomeArquivo, arquivo, {
        cacheControl: "3600",
        upsert: false,
        contentType: arquivo.type
      });

    if (erroUpload) throw erroUpload;

    const { data: urlPublica } = supabase.storage
      .from("artwork-images")
      .getPublicUrl(nomeArquivo);

    if (!urlPublica?.publicUrl) {
      throw new Error("Não foi possível obter o endereço da imagem.");
    }

    mostrarStatus("Salvando publicação...", "normal");

    const { error: erroPublicacao } = await supabase
      .from("atelie_posts")
      .insert({
        user_id: usuario.id,
        image_url: urlPublica.publicUrl,
        caption: legenda,
        category: categoria,
        publicar_comunidade: publicarComunidade,
        publicar_mercado: publicarMercado,
        preco: publicarMercado ? preco : null,
        content_sensitive: conteudoSensivel
      });

    if (erroPublicacao) throw erroPublicacao;

    form.reset();
    imagemSelecionada = null;
    limparPrevia();

    mostrarStatus("Sua obra foi publicada com sucesso!", "sucesso");
    fecharPainelPublicacao();

    categoriaAtiva = "Todas";
    termoBusca = "";

    if (campoBusca) campoBusca.value = "";

    atualizarEstadoCategorias();

    await carregarObras();

    document.getElementById("feed")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (erro) {
    console.error("Erro ao publicar obra:", erro);

    const detalhe = erro?.message || erro?.error_description || String(erro);
    mostrarStatus(
      "Falha ao publicar: " + detalhe,
      "erro"
    );
  } finally {
    if (botaoPublicar) {
      botaoPublicar.disabled = false;
      botaoPublicar.textContent = textoOriginal;
    }
  }
});

/* ---------- Opções de destino da publicação ---------- */
const checkboxMercado = document.getElementById("publicar-mercado");
const campoPrecoMercado = document.getElementById("campo-preco-mercado");
const inputPrecoMercado = document.getElementById("preco-obra");
checkboxMercado?.addEventListener("change", () => {
  if (campoPrecoMercado) campoPrecoMercado.hidden = !checkboxMercado.checked;
  if (inputPrecoMercado) inputPrecoMercado.required = checkboxMercado.checked;
});

/* ---------- Eventos das categorias ---------- */

document.querySelectorAll("[data-categoria]").forEach((elemento) => {
  elemento.addEventListener("click", (evento) => {
    // Evita que links usados como filtros recarreguem a página.
    if (elemento.tagName === "A") {
      evento.preventDefault();
    }

    categoriaAtiva = elemento.dataset.categoria || "Todas";

    atualizarEstadoCategorias();
    renderizarObras();
  });
});

/* ---------- Pesquisa com atraso inteligente ---------- */

function aplicarPesquisa() {
  termoBusca = campoBusca?.value.trim() || "";
  renderizarObras();
}

formBusca?.addEventListener("submit", (evento) => {
  evento.preventDefault();

  if (temporizadorBusca) {
    clearTimeout(temporizadorBusca);
  }

  aplicarPesquisa();
});

campoBusca?.addEventListener("input", () => {
  if (temporizadorBusca) {
    clearTimeout(temporizadorBusca);
  }

  temporizadorBusca = setTimeout(aplicarPesquisa, 250);
});

/* ---------- Atualização manual ---------- */

botaoAtualizar?.addEventListener("click", async () => {
  if (carregamentoEmAndamento) return;

  const textoOriginal = botaoAtualizar.textContent;

  botaoAtualizar.disabled = true;
  botaoAtualizar.textContent = "Atualizando...";

  try {
    await carregarObras();
  } finally {
    botaoAtualizar.disabled = false;
    botaoAtualizar.textContent = textoOriginal;
  }
});

/* ---------- Identidade do Ateliê selecionado ---------- */

async function carregarIdentidadeAtelie() {
  if (!perfilIdAtelie) return;
  const perfil = await buscarPerfil(perfilIdAtelie);
  if (!perfil) {
    mostrarMensagemFeed("Este Ateliê não foi encontrado ou não está público.");
    return;
  }
  const titulo = document.getElementById("nome-artista-atelie");
  const artista = document.getElementById("artista-responsavel-atelie");
  const area = document.getElementById("area-artista-atelie");
  const bio = document.getElementById("bio-artista-atelie");
  const foto = document.getElementById("foto-artista-atelie");
  if (titulo) titulo.textContent = perfil.nome_atelie?.trim() || "Meu Ateliê";
  if (artista) artista.textContent = perfil.nome_artistico?.trim() || "Artista RefugiART";
  if (area) area.textContent = perfil.area_atuacao || "Espaço artístico";
  if (bio) bio.textContent = perfil.biografia?.trim() || "Este espaço reúne a trajetória e as criações do artista.";
  if (foto && perfil.foto_url) foto.src = perfil.foto_url;
}

/* ---------- Aba de publicação exclusiva do próprio artista logado ---------- */
const botaoAbrirPublicacao = document.getElementById("abrir-publicacao-atelie");
const botaoFecharPublicacao = document.getElementById("fechar-publicacao-atelie");
const painelPublicacao = document.getElementById("painel-publicacao-atelie");
const overlayPublicacao = document.getElementById("overlay-publicacao-atelie");

function fecharPainelPublicacao() {
  painelPublicacao?.classList.remove("aberto");
  painelPublicacao?.setAttribute("aria-hidden", "true");
  painelPublicacao?.setAttribute("inert", "");
  botaoAbrirPublicacao?.setAttribute("aria-expanded", "false");
  if (overlayPublicacao) overlayPublicacao.hidden = true;
}

function abrirPainelPublicacao() {
  if (!botaoAbrirPublicacao || botaoAbrirPublicacao.hidden) return;
  painelPublicacao?.classList.add("aberto");
  painelPublicacao?.setAttribute("aria-hidden", "false");
  painelPublicacao?.removeAttribute("inert");
  botaoAbrirPublicacao.setAttribute("aria-expanded", "true");
  if (overlayPublicacao) overlayPublicacao.hidden = false;
}

botaoAbrirPublicacao?.addEventListener("click", abrirPainelPublicacao);
botaoFecharPublicacao?.addEventListener("click", fecharPainelPublicacao);
overlayPublicacao?.addEventListener("click", fecharPainelPublicacao);
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") fecharPainelPublicacao();
});

async function controlarAcessoPublicacao() {
  const usuario = await obterUsuario();
  souDonoDoAtelie = !!usuario && usuario.id === perfilIdAtelie;

  if (botaoAbrirPublicacao) {
    botaoAbrirPublicacao.hidden = !souDonoDoAtelie;
  }

  if (!souDonoDoAtelie) fecharPainelPublicacao();
}


/* ---------- Amizades e fãs ---------- */
const areaRelacionamento = document.getElementById("acoes-relacionamento-atelie");
const botaoAmizade = document.getElementById("botao-amizade-atelie");
const botaoFa = document.getElementById("botao-fa-atelie");
const areaSolicitacoes = document.getElementById("solicitacoes-amizade-atelie");
const listaSolicitacoes = document.getElementById("lista-solicitacoes-amizade");
const statusRelacionamento = document.getElementById("status-relacionamento-atelie");

function statusRelacao(mensagem, erro = false) {
  if (!statusRelacionamento) return;
  statusRelacionamento.textContent = mensagem;
  statusRelacionamento.dataset.tipo = erro ? "erro" : "sucesso";
}

async function atualizarRelacionamentos(usuario) {
  const obrasEl = document.getElementById("total-obras-artista");
  const amigosEl = document.getElementById("total-amigos-artista");
  const fasEl = document.getElementById("total-fas-artista");

  // A função retorna somente números públicos, sem expor solicitações privadas.
  const { data: totais, error: erroTotais } = await supabase
    .rpc("get_atelie_relationship_counts", { p_artist_id: perfilIdAtelie });

  if (erroTotais) {
    console.error("Erro ao consultar estatísticas do Ateliê:", erroTotais);
    statusRelacao("Não foi possível carregar as estatísticas deste Ateliê.", true);
  } else {
    const dados = Array.isArray(totais) ? totais[0] : totais;
    if (obrasEl) obrasEl.textContent = dados?.posts_count ?? 0;
    if (amigosEl) amigosEl.textContent = dados?.friends_count ?? 0;
    if (fasEl) fasEl.textContent = dados?.fans_count ?? 0;
  }

  if (!usuario || usuario.id === perfilIdAtelie) {
    if (areaRelacionamento) areaRelacionamento.hidden = true;
    if (areaSolicitacoes) areaSolicitacoes.hidden = true;
    return;
  }

  if (areaRelacionamento) areaRelacionamento.hidden = false;

  const { data: souFa, error: erroSouFa } = await supabase.from("atelie_fans")
    .select("id").eq("fan_id", usuario.id).eq("artist_id", perfilIdAtelie).maybeSingle();
  if (erroSouFa) console.warn("Não foi possível verificar o vínculo de fã:", erroSouFa);

  if (botaoFa) {
    botaoFa.textContent = souFa ? "Deixar de ser fã" : "Tornar-se fã";
    botaoFa.dataset.seguindo = souFa ? "sim" : "nao";
  }

  // A policy SELECT permite consultar apenas pedidos em que o usuário participa.
  const { data: pedidos, error: erroPedidos } = await supabase
    .from("atelie_friend_requests")
    .select("id, requester_id, recipient_id, status")
    .or(`and(requester_id.eq.${usuario.id},recipient_id.eq.${perfilIdAtelie}),and(requester_id.eq.${perfilIdAtelie},recipient_id.eq.${usuario.id})`)
    .order("created_at", { ascending: false });

  if (erroPedidos) {
    console.warn("Não foi possível consultar a relação de amizade:", erroPedidos);
    statusRelacao("Não foi possível verificar a amizade. Confira as permissões da tabela.", true);
  }

  const relacoesValidas = pedidos || [];
  const relacao = relacoesValidas.find(p => p.status === "accepted");
  const enviado = relacoesValidas.find(p => p.requester_id === usuario.id && p.status === "pending");
  const recebido = relacoesValidas.find(p => p.recipient_id === usuario.id && p.status === "pending");

  if (botaoAmizade) {
    botaoAmizade.disabled = !!relacao || !!recebido || !!erroPedidos;
    botaoAmizade.textContent = relacao ? "Vocês são amigos"
      : enviado ? "Solicitação enviada"
      : recebido ? "Responder solicitação abaixo"
      : erroPedidos ? "Amizade indisponível"
      : "Adicionar amizade";
  }

  if (areaSolicitacoes && listaSolicitacoes) {
    listaSolicitacoes.replaceChildren();
    if (recebido) {
      areaSolicitacoes.hidden = false;
      const texto = criarElemento("p", "", "Você recebeu uma solicitação de amizade deste artista.");
      const aceitar = criarElemento("button", "acao-solicitacao", "Aceitar");
      const recusar = criarElemento("button", "acao-solicitacao secundario", "Recusar");
      aceitar.type = recusar.type = "button";
      aceitar.addEventListener("click", () => responderSolicitacao(recebido.id, "accepted", usuario));
      recusar.addEventListener("click", () => responderSolicitacao(recebido.id, "rejected", usuario));
      listaSolicitacoes.append(texto, aceitar, recusar);
    } else {
      areaSolicitacoes.hidden = true;
    }
  }
}

async function responderSolicitacao(id, status, usuario) {
  const { error } = await supabase.from("atelie_friend_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_id", usuario.id).eq("status", "pending");
  if (error) return statusRelacao("Não foi possível responder à solicitação: " + error.message, true);
  statusRelacao(status === "accepted" ? "Amizade confirmada!" : "Solicitação recusada.");
  await atualizarRelacionamentos(usuario);
}

botaoFa?.addEventListener("click", async () => {
  const usuario = await obterUsuario();
  if (!usuario) return statusRelacao("Entre na sua conta para seguir artistas.", true);
  if (usuario.id === perfilIdAtelie) return;
  botaoFa.disabled = true;
  try {
    if (botaoFa.dataset.seguindo === "sim") {
      const { error } = await supabase.from("atelie_fans").delete()
        .eq("fan_id", usuario.id).eq("artist_id", perfilIdAtelie);
      if (error) throw error;
      statusRelacao("Você deixou de seguir este artista.");
    } else {
      const { error } = await supabase.from("atelie_fans")
        .insert({ fan_id: usuario.id, artist_id: perfilIdAtelie });
      if (error && error.code !== "23505") throw error;
      statusRelacao("Agora você é fã deste artista!");
    }
    await atualizarRelacionamentos(usuario);
  } catch (erro) {
    statusRelacao("Não foi possível atualizar: " + erro.message, true);
  } finally {
    botaoFa.disabled = false;
  }
});

botaoAmizade?.addEventListener("click", async () => {
  const usuario = await obterUsuario();
  if (!usuario) return statusRelacao("Entre na sua conta para enviar uma solicitação.", true);
  if (usuario.id === perfilIdAtelie) return;
  botaoAmizade.disabled = true;
  try {
    const { error } = await supabase.from("atelie_friend_requests")
      .insert({ requester_id: usuario.id, recipient_id: perfilIdAtelie, status: "pending" });
    if (error && error.code !== "23505") throw error;
    statusRelacao(error ? "Já existe uma solicitação entre estas contas." : "Solicitação de amizade enviada!");
    await atualizarRelacionamentos(usuario);
  } catch (erro) {
    statusRelacao("Não foi possível enviar: " + erro.message, true);
  } finally {
    botaoAmizade.disabled = false;
  }
});

/* ---------- Inicialização ---------- */

async function inicializarAtelie() {
  const usuario = await obterUsuario();

  // Sem ID na URL, mantém o comportamento antigo: abrir o próprio Ateliê.
  perfilIdAtelie = artistaIdUrl || usuario?.id || null;

  if (!perfilIdAtelie) {
    mostrarMensagemFeed("Entre na sua conta ou acesse o link de um artista para visualizar um Ateliê.");
    if (botaoAbrirPublicacao) botaoAbrirPublicacao.hidden = true;
    return;
  }

  await carregarIdentidadeAtelie();
  await controlarAcessoPublicacao();
  await atualizarRelacionamentos(usuario);
  atualizarEstadoCategorias();
  await carregarObras();
}

inicializarAtelie();
