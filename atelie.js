
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

let imagemSelecionada = null;
let categoriaAtiva = "Todas";
let termoBusca = "";
let urlPreviaTemporaria = null;

const categoriasValidas = [
  "Desenho",
  "Pintura",
  "Fotografia",
  "Escultura",
  "Tatuagem",
  "Outros"
];

function mostrarStatus(mensagem, tipo = "normal") {
  if (!statusAtelie) return;

  statusAtelie.textContent = mensagem;
  statusAtelie.dataset.tipo = tipo;
}

function mostrarMensagemFeed(mensagem) {
  if (!listaObras) return;

  listaObras.replaceChildren();

  const texto = document.createElement("p");
  texto.className = "mensagem-feed";
  texto.textContent = mensagem;

  listaObras.appendChild(texto);
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

function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);

  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;

  return elemento;
}

function limparPrevia() {
  if (urlPreviaTemporaria) {
    URL.revokeObjectURL(urlPreviaTemporaria);
    urlPreviaTemporaria = null;
  }

  if (previaImagem) {
    previaImagem.removeAttribute("src");
    previaImagem.hidden = true;
  }
}

function validarImagem(arquivo) {
  if (!arquivo) return "Selecione uma imagem para a obra.";

  const tiposAceitos = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!tiposAceitos.includes(arquivo.type)) {
    return "Use uma imagem JPG, PNG ou WEBP.";
  }

  const tamanhoMaximo = 5 * 1024 * 1024;

  if (arquivo.size > tamanhoMaximo) {
    return "A imagem deve ter no máximo 5 MB.";
  }

  return "";
}

// Pré-visualização da imagem selecionada.
inputImagem?.addEventListener("change", () => {
  const arquivo = inputImagem.files?.[0] || null;

  imagemSelecionada = arquivo;
  limparPrevia();

  if (!arquivo) return;

  const erro = validarImagem(arquivo);

  if (erro) {
    imagemSelecionada = null;
    inputImagem.value = "";
    mostrarStatus(erro, "erro");
    return;
  }

  urlPreviaTemporaria = URL.createObjectURL(arquivo);

  if (previaImagem) {
    previaImagem.src = urlPreviaTemporaria;
    previaImagem.hidden = false;
  }

  mostrarStatus("Imagem pronta para publicação.", "sucesso");
});

// Descobre se há um usuário autenticado.
async function obterUsuario() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Erro ao verificar sessão:", error);
    return null;
  }

  return data.user || null;
}

// Busca o perfil público de um artista.
async function buscarPerfil(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome_artistico, foto_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Não foi possível carregar o perfil:", error.message);
    return null;
  }

  return data;
}

// Cria o cartão visual de uma publicação.
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
    avatar.replaceChildren(fotoArtista);
  }

  const informacoesArtista = criarElemento("div", "obra-info-artista");

  const nomeArtista = criarElemento(
    "strong",
    "obra-nome-artista",
    obra.artista?.nome_artistico || "Artista da comunidade"
  );

  const dataPublicacao = criarElemento(
    "small",
    "obra-data",
    formatarData(obra.created_at)
  );

  informacoesArtista.append(nomeArtista, dataPublicacao);
  cabecalho.append(avatar, informacoesArtista);

  const categoria = criarElemento(
    "span",
    "obra-categoria",
    obra.category || "Outras artes"
  );

  const imagem = document.createElement("img");
  imagem.className = "obra-imagem";
  imagem.src = obra.image_url;
  imagem.alt = obra.caption
    ? `Obra de ${obra.artista?.nome_artistico || "artista"}: ${obra.caption}`
    : `Obra artística de ${obra.artista?.nome_artistico || "artista da comunidade"}`;
  imagem.loading = "lazy";

  imagem.addEventListener("error", () => {
    imagem.alt = "Não foi possível carregar a imagem desta obra.";
  });

  const conteudo = criarElemento("div", "obra-conteudo");

  const legenda = criarElemento(
    "p",
    "obra-legenda",
    obra.caption || "Uma obra compartilhada com a comunidade RefugiART."
  );

  conteudo.append(categoria, legenda);
  artigo.append(cabecalho, imagem, conteudo);

  return artigo;
}

// Carrega publicações e seus respectivos perfis.
async function carregarObras() {
  if (!listaObras) return;

  mostrarMensagemFeed("Buscando obras da comunidade...");

  const { data: obras, error } = await supabase
    .from("atelie_posts")
    .select("id, user_id, image_url, caption, category, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Erro ao carregar publicações:", error);

    mostrarMensagemFeed(
      "Não foi possível carregar as obras. Verifique a conexão e a configuração do Supabase."
    );
    return;
  }

  const obrasComPerfil = await Promise.all(
    (obras || []).map(async (obra) => ({
      ...obra,
      artista: await buscarPerfil(obra.user_id)
    }))
  );

  renderizarObras(obrasComPerfil);
}

// Aplica os filtros de categoria e busca.
function renderizarObras(obras) {
  if (!listaObras) return;

  const filtradas = obras.filter((obra) => {
    const categoriaObra = obra.category || "Outros";

    const correspondeCategoria =
      categoriaAtiva === "Todas" ||
      categoriaObra === categoriaAtiva ||
      (categoriaAtiva === "Outros" &&
        !categoriasValidas.includes(categoriaObra));

    const textoPesquisa = [
      obra.caption || "",
      obra.category || "",
      obra.artista?.nome_artistico || ""
    ].join(" ").toLocaleLowerCase("pt-BR");

    const correspondeBusca = textoPesquisa.includes(
      termoBusca.toLocaleLowerCase("pt-BR")
    );

    return correspondeCategoria && correspondeBusca;
  });

  listaObras.replaceChildren();

  if (!filtradas.length) {
    const mensagem = termoBusca || categoriaAtiva !== "Todas"
      ? "Nenhuma obra encontrada com esses filtros."
      : "Ainda não há publicações. Seja o primeiro artista a compartilhar uma obra!";

    mostrarMensagemFeed(mensagem);
    return;
  }

  filtradas.forEach((obra) => {
    listaObras.appendChild(criarCartaoObra(obra));
  });
}

// Publica a imagem no Storage e os dados na tabela.
form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const usuario = await obterUsuario();

  if (!usuario) {
    mostrarStatus(
      "Entre na sua conta para publicar uma obra.",
      "erro"
    );

    window.location.href = "login.html";
    return;
  }

  const arquivo = imagemSelecionada || inputImagem?.files?.[0];
  const erroImagem = validarImagem(arquivo);

  if (erroImagem) {
    mostrarStatus(erroImagem, "erro");
    return;
  }

  const categoria = selectCategoria?.value || "Outros";

  if (!categoriasValidas.includes(categoria)) {
    mostrarStatus("Selecione uma categoria válida.", "erro");
    return;
  }

  const legenda = (inputLegenda?.value || "").trim();

  if (botaoPublicar) {
    botaoPublicar.disabled = true;
    botaoPublicar.textContent = "Publicando...";
  }

  mostrarStatus("Enviando sua obra...", "normal");

  try {
    const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const nomeArquivo = `${usuario.id}/${Date.now()}.${extensao}`;

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

    mostrarStatus("Obra publicada com sucesso!", "sucesso");

    await carregarObras();

    document.getElementById("feed")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (erro) {
    console.error("Erro ao publicar:", erro);

    mostrarStatus(
      "Não foi possível publicar. Confira se o Storage, a tabela e as permissões estão configurados.",
      "erro"
    );
  } finally {
    if (botaoPublicar) {
      botaoPublicar.disabled = false;
      botaoPublicar.innerHTML = 'Publicar obra <span>↗</span>';
    }
  }
});

// Filtros do painel esquerdo e dos chips.
document.querySelectorAll("[data-categoria]").forEach((elemento) => {
  elemento.addEventListener("click", () => {
    categoriaAtiva = elemento.dataset.categoria || "Todas";

    document.querySelectorAll(".categoria-chip").forEach((chip) => {
      const ativo = chip.dataset.categoria === categoriaAtiva;
      chip.classList.toggle("selecionada", ativo);
    });

    document.querySelectorAll(".link-lateral[data-categoria]").forEach((link) => {
      link.classList.toggle(
        "ativo",
        link.dataset.categoria === categoriaAtiva
      );
    });

    carregarObras();
  });
});

// Pesquisa por legenda, categoria ou nome artístico.
formBusca?.addEventListener("submit", (evento) => {
  evento.preventDefault();
  termoBusca = campoBusca?.value.trim() || "";
  carregarObras();
});

campoBusca?.addEventListener("input", () => {
  termoBusca = campoBusca.value.trim();
  carregarObras();
});

// Atualização manual do feed.
botaoAtualizar?.addEventListener("click", async () => {
  botaoAtualizar.disabled = true;

  try {
    await carregarObras();
  } finally {
    botaoAtualizar.disabled = false;
  }
});

// Carrega o feed ao abrir a página.
carregarObras();
