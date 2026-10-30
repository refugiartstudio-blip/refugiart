
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
    .select("id, nome_artistico, foto_url")
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

  const conteudo = criarElemento("div", "obra-conteudo");

  const legendaTexto = obra.caption?.trim()
    || "Uma obra compartilhada com a comunidade RefugiART.";

  const legenda = criarElemento(
    "p",
    "obra-legenda",
    legendaTexto
  );

  conteudo.append(categoria, legenda);
  artigo.append(cabecalho, imagem, conteudo);

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
    const { data: obras, error } = await supabase
      .from("atelie_posts")
      .select("id, user_id, image_url, caption, category, created_at")
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
        category: categoria
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

/* ---------- Inicialização ---------- */

atualizarEstadoCategorias();
carregarObras();


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
  // O Ateliê exibido nesta página representa o espaço do próprio usuário.
  // Sem sessão autenticada, a aba e o formulário permanecem indisponíveis.
  if (usuario && botaoAbrirPublicacao) {
    botaoAbrirPublicacao.hidden = false;
  } else {
    if (botaoAbrirPublicacao) botaoAbrirPublicacao.hidden = true;
    fecharPainelPublicacao();
  }
}

controlarAcessoPublicacao();
