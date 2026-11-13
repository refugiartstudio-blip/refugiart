import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
const SUPABASE_KEY = "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const main = document.querySelector("[data-categoria-loja]");
const categoria = main?.dataset.categoriaLoja;
const grade = document.getElementById("gradeProdutosLoja");
const barraAdmin = document.getElementById("acoesAdminLoja");
const botaoAdicionar = document.getElementById("adicionarProdutoLoja");
const nomes = { vestuario: "Vestuário", acessorios: "Acessórios", papelaria: "Papelaria" };
const moeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
let administrador = false, produtos = [], produtoEmEdicao = null, imagensAtuais = [], imagensNovas = [], indiceZoom = 0, galeriaZoom = [];

function elemento(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined) node.textContent = texto;
  return node;
}
function urlsDoProduto(produto) {
  const lista = Array.isArray(produto.image_urls) ? produto.image_urls.filter(Boolean) : [];
  if (!lista.length && produto.image_url) lista.push(produto.image_url);
  return [...new Set(lista)];
}

function montarModal() {
  const overlay = elemento("div", "admin-loja-modal");
  overlay.id = "modalAdminLoja";
  overlay.hidden = true;
  const form = elemento("form", "admin-loja-form");
  form.id = "formProdutoLoja";
  form.innerHTML = `
    <h2 id="tituloFormProduto">Adicionar produto</h2>
    <label for="produtoTitulo">Título</label><input id="produtoTitulo" name="title" maxlength="120" required>
    <label for="produtoDescricao">Descrição</label><textarea id="produtoDescricao" name="description" maxlength="600"></textarea>
    <div class="linha-admin">
      <div><label for="produtoPreco">Preço (R$)</label><input id="produtoPreco" name="price" type="number" min="0" step="0.01" required></div>
    </div>
    <label for="produtoFotos">Fotografias do produto (selecione várias)</label>
    <input id="produtoFotos" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple>
    <p class="admin-loja-status">Até 8 fotografias por produto. JPG, PNG ou WebP, máximo de 5 MB cada. Toque no × para remover uma foto.</p>
    <div id="galeriaEdicaoProduto" class="admin-galeria-edicao"></div>
    <label class="demo-admin"><input id="produtoDemo" type="checkbox"> Produto fictício / demonstrativo</label>
    <p class="admin-loja-status" id="statusProdutoLoja">Adicione fotografias da frente, do verso e dos detalhes.</p>
    <div class="botoes-admin"><button type="button" id="cancelarProduto">Cancelar</button><button type="submit" id="salvarProduto">Salvar produto</button></div>
  `;
  overlay.append(form);
  document.body.append(overlay);
  overlay.addEventListener("click", event => { if (event.target === overlay) fecharModal(); });
  form.querySelector("#cancelarProduto").addEventListener("click", fecharModal);
  form.addEventListener("submit", salvarProduto);
  form.querySelector("#produtoFotos").addEventListener("change", selecionarFotos);
  return overlay;
}
const modal = montarModal();
const form = document.getElementById("formProdutoLoja");
const statusForm = document.getElementById("statusProdutoLoja");
const gradeEdicao = document.getElementById("galeriaEdicaoProduto");

function desenharFotosEdicao() {
  gradeEdicao.querySelectorAll("img[data-object-url]").forEach(img => URL.revokeObjectURL(img.dataset.objectUrl));
  gradeEdicao.replaceChildren();
  if (!imagensAtuais.length && !imagensNovas.length) {
    gradeEdicao.append(elemento("p", "admin-loja-status", "Nenhuma fotografia adicionada."));
    return;
  }
  imagensAtuais.forEach((url, i) => {
    const item = elemento("div", "admin-foto-item");
    const img = elemento("img"); img.src = url; img.alt = "Fotografia atual " + (i + 1);
    const remover = elemento("button", "admin-foto-remover", "×"); remover.type = "button"; remover.setAttribute("aria-label", "Remover fotografia");
    remover.addEventListener("click", () => { imagensAtuais.splice(i, 1); desenharFotosEdicao(); });
    item.append(img, remover, elemento("small", "", i === 0 ? "Foto principal" : "Foto " + (i + 1)));
    gradeEdicao.append(item);
  });
  imagensNovas.forEach((arquivo, i) => {
    const item = elemento("div", "admin-foto-item");
    const img = elemento("img"); img.src = URL.createObjectURL(arquivo); img.dataset.objectUrl = img.src; img.alt = "Nova fotografia " + (i + 1);
    const remover = elemento("button", "admin-foto-remover", "×"); remover.type = "button"; remover.setAttribute("aria-label", "Remover nova fotografia");
    remover.addEventListener("click", () => { imagensNovas.splice(i, 1); sincronizarInputFotos(); desenharFotosEdicao(); });
    item.append(img, remover, elemento("small", "", "Nova foto"));
    gradeEdicao.append(item);
  });
}
function sincronizarInputFotos() {
  const transfer = new DataTransfer();
  imagensNovas.forEach(file => transfer.items.add(file));
  document.getElementById("produtoFotos").files = transfer.files;
}
function selecionarFotos(event) {
  const selecionadas = [...(event.target.files || [])];
  const validas = selecionadas.filter(file => ["image/jpeg","image/png","image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024);
  if (validas.length !== selecionadas.length) statusForm.textContent = "Algumas fotos foram ignoradas: use JPG, PNG ou WebP de até 5 MB.";
  const vagas = Math.max(0, 8 - imagensAtuais.length - imagensNovas.length);
  imagensNovas.push(...validas.slice(0, vagas));
  if (validas.length > vagas) statusForm.textContent = "Limite de 8 fotografias por produto. Foram adicionadas apenas as vagas disponíveis.";
  sincronizarInputFotos();
  desenharFotosEdicao();
}
function abrirModal(produto = null) {
  produtoEmEdicao = produto;
  imagensAtuais = produto ? urlsDoProduto(produto) : [];
  imagensNovas = [];
  form.reset();
  document.getElementById("tituloFormProduto").textContent = produto ? "Editar produto" : "Adicionar produto";
  document.getElementById("produtoTitulo").value = produto?.title || "";
  document.getElementById("produtoDescricao").value = produto?.description || "";
  document.getElementById("produtoPreco").value = produto ? Number(produto.price).toFixed(2) : "";
  document.getElementById("produtoDemo").checked = produto ? Boolean(produto.is_demo) : false;
  statusForm.textContent = "Até 8 fotografias por produto. A primeira será a imagem principal.";
  desenharFotosEdicao();
  modal.hidden = false;
  document.getElementById("produtoTitulo").focus();
}
function fecharModal() {
  gradeEdicao.querySelectorAll("img[data-object-url]").forEach(img => URL.revokeObjectURL(img.dataset.objectUrl));
  modal.hidden = true; produtoEmEdicao = null; imagensAtuais = []; imagensNovas = [];
}

function abrirZoom(imagens, indice = 0) {
  galeriaZoom = imagens.filter(Boolean);
  if (!galeriaZoom.length) return;
  indiceZoom = indice;
  atualizarZoom();
  document.getElementById("zoomProduto").hidden = false;
  document.body.classList.add("produto-zoom-aberto");
}
function atualizarZoom() {
  const img = document.getElementById("zoomImagemProduto");
  img.src = galeriaZoom[indiceZoom];
  img.alt = "Fotografia " + (indiceZoom + 1) + " de " + galeriaZoom.length;
  document.getElementById("zoomContador").textContent = (indiceZoom + 1) + " / " + galeriaZoom.length;
  document.getElementById("zoomAnterior").hidden = galeriaZoom.length < 2;
  document.getElementById("zoomProxima").hidden = galeriaZoom.length < 2;
}
function moverZoom(direcao) {
  if (!galeriaZoom.length) return;
  indiceZoom = (indiceZoom + direcao + galeriaZoom.length) % galeriaZoom.length;
  atualizarZoom();
}
function fecharZoom() {
  document.getElementById("zoomProduto").hidden = true;
  document.getElementById("zoomImagemProduto").removeAttribute("src");
  document.body.classList.remove("produto-zoom-aberto");
}
function montarZoom() {
  const overlay = elemento("div", "produto-zoom");
  overlay.id = "zoomProduto"; overlay.hidden = true;
  overlay.innerHTML = `
    <button type="button" class="zoom-fechar" id="zoomFechar" aria-label="Fechar">×</button>
    <button type="button" class="zoom-navegar zoom-anterior" id="zoomAnterior" aria-label="Fotografia anterior">‹</button>
    <figure><img id="zoomImagemProduto" alt=""><figcaption id="zoomContador"></figcaption></figure>
    <button type="button" class="zoom-navegar zoom-proxima" id="zoomProxima" aria-label="Próxima fotografia">›</button>`;
  document.body.append(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) fecharZoom(); });
  overlay.querySelector("#zoomFechar").addEventListener("click", fecharZoom);
  overlay.querySelector("#zoomAnterior").addEventListener("click", () => moverZoom(-1));
  overlay.querySelector("#zoomProxima").addEventListener("click", () => moverZoom(1));
  document.addEventListener("keydown", e => {
    if (overlay.hidden) return;
    if (e.key === "Escape") fecharZoom();
    if (e.key === "ArrowLeft") moverZoom(-1);
    if (e.key === "ArrowRight") moverZoom(1);
  });
}
montarZoom();

function renderizar() {
  grade.replaceChildren();
  if (!produtos.length) { grade.append(elemento("p", "", "Ainda não há produtos nesta categoria.")); return; }
  produtos.forEach(produto => {
    const fotos = urlsDoProduto(produto);
    const card = elemento("article", "produto-loja");
    const capa = elemento("div", "produto-loja-capa");
    if (fotos.length) {
      const img = elemento("img", "produto-loja-imagem"); img.src = fotos[0]; img.alt = produto.title; img.loading = "lazy"; img.addEventListener("click", () => abrirZoom(fotos, 0));
      const abrir = elemento("button", "produto-loja-zoom", fotos.length > 1 ? "Ver fotos · " + fotos.length : "Ampliar foto");
      abrir.type = "button"; abrir.addEventListener("click", () => abrirZoom(fotos, 0));
      capa.append(img, abrir);
      if (fotos.length > 1) {
        const miniaturas = elemento("div", "produto-loja-miniaturas");
        fotos.forEach((url, index) => {
          const thumb = elemento("button", "produto-loja-miniatura"); thumb.type = "button";
          const thumbImg = elemento("img"); thumbImg.src = url; thumbImg.alt = "Ver foto " + (index + 1);
          thumb.addEventListener("click", () => abrirZoom(fotos, index));
          thumb.append(thumbImg); miniaturas.append(thumb);
        });
        capa.append(miniaturas);
      }
    } else { capa.append(elemento("div", "produto-loja-sem-foto", "Sem fotografia")); }
    const info = elemento("div", "produto-loja-info");
    info.append(elemento("span", "produto-loja-selo", produto.is_demo ? "Produto demonstrativo" : nomes[categoria]));
    info.append(elemento("h3", "", produto.title));
    info.append(elemento("p", "", produto.description || ""));
    info.append(elemento("strong", "produto-loja-preco", moeda(produto.price)));
    if (administrador) {
      const acoes = elemento("div", "produto-loja-admin");
      const editar = elemento("button", "", "Editar"); editar.type = "button"; editar.addEventListener("click", () => abrirModal(produto));
      const excluir = elemento("button", "excluir", "Excluir"); excluir.type = "button"; excluir.addEventListener("click", () => excluirProduto(produto));
      acoes.append(editar, excluir); info.append(acoes);
    }
    card.append(capa, info); grade.append(card);
  });
}
async function carregarProdutos() {
  grade.textContent = "Carregando produtos...";
  const { data, error } = await supabase.from("refugiart_store_products")
    .select("id,category,title,description,price,image_url,image_urls,is_active,is_demo,created_at")
    .eq("category", categoria).eq("is_active", true).order("created_at", { ascending: true });
  if (error) { console.error(error); grade.textContent = "Não foi possível carregar os produtos. Atualize a página e tente novamente."; return; }
  produtos = data || []; renderizar();
}
async function verificarAdministrador() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return;
  const { data, error } = await supabase.rpc("refugiart_is_admin");
  administrador = !error && data === true;
  if (administrador) { barraAdmin.hidden = false; botaoAdicionar.addEventListener("click", () => abrirModal()); }
}
function caminhosDoStorage(urls) {
  const prefixo = SUPABASE_URL + "/storage/v1/object/public/refugiart-store/";
  return [...new Set(urls.filter(url => typeof url === "string" && url.startsWith(prefixo))
    .map(url => {
      try { return decodeURIComponent(new URL(url).pathname.split("/storage/v1/object/public/refugiart-store/")[1] || ""); }
      catch { return ""; }
    }).filter(Boolean))];
}
async function limparImagensSemUso(urls) {
  const caminhos = caminhosDoStorage(urls);
  if (!caminhos.length) return;
  try {
    const { data, error } = await supabase.from("refugiart_store_products").select("image_url,image_urls");
    if (error || !data) {
      console.warn("Limpeza de imagens ignorada: não foi possível conferir referências restantes.", error);
      return;
    }
    const emUso = new Set(data.flatMap(item => [
      ...(Array.isArray(item.image_urls) ? item.image_urls : []),
      item.image_url
    ]).filter(Boolean));
    const remover = urls.filter(url => !emUso.has(url));
    const caminhosRemover = caminhosDoStorage(remover);
    if (caminhosRemover.length) {
      const { error: storageError } = await supabase.storage.from("refugiart-store").remove(caminhosRemover);
      if (storageError) console.warn("Não foi possível remover algumas imagens sem uso do Storage.", storageError);
    }
  } catch (error) {
    console.warn("A operação no catálogo foi concluída, mas a limpeza de imagens ficou pendente.", error);
  }
}

async function salvarProduto(event) {
  event.preventDefault();
  if (!administrador) return;
  const titulo = document.getElementById("produtoTitulo").value.trim();
  const descricao = document.getElementById("produtoDescricao").value.trim();
  const preco = Number(document.getElementById("produtoPreco").value);
  if (titulo.length < 2 || !Number.isFinite(preco) || preco < 0) { statusForm.textContent = "Confira o título e o preço antes de salvar."; return; }
  if (imagensAtuais.length + imagensNovas.length > 8) { statusForm.textContent = "O limite é de 8 fotografias por produto."; return; }
  const botao = document.getElementById("salvarProduto");
  botao.disabled = true; botao.textContent = "Salvando...";
  const imagensAnteriores = produtoEmEdicao ? urlsDoProduto(produtoEmEdicao) : [];
  const arquivosEnviados = [];
  let gravacaoConcluida = false;
  try {
    const novasUrls = [];
    for (const arquivo of imagensNovas) {
      const extensao = arquivo.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const caminho = categoria + "/" + crypto.randomUUID() + "." + extensao;
      const { error: uploadError } = await supabase.storage.from("refugiart-store").upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      arquivosEnviados.push(caminho);
      novasUrls.push(supabase.storage.from("refugiart-store").getPublicUrl(caminho).data.publicUrl);
    }
    const todasImagens = [...imagensAtuais, ...novasUrls];
    const registro = {
      category: categoria, title: titulo, description: descricao, price: preco,
      image_url: todasImagens[0] || null, image_urls: todasImagens,
      is_demo: document.getElementById("produtoDemo").checked,
      is_active: true, updated_at: new Date().toISOString()
    };
    const resposta = produtoEmEdicao
      ? await supabase.from("refugiart_store_products").update(registro).eq("id", produtoEmEdicao.id)
      : await supabase.from("refugiart_store_products").insert(registro);
    if (resposta.error) throw resposta.error;
    gravacaoConcluida = true;
    const imagensMantidas = new Set(todasImagens);
    const removidas = imagensAnteriores.filter(url => !imagensMantidas.has(url));
    fecharModal(); await carregarProdutos();
    if (removidas.length) await limparImagensSemUso(removidas);
  } catch (error) {
    if (!gravacaoConcluida && arquivosEnviados.length) {
      const { error: rollbackError } = await supabase.storage.from("refugiart-store").remove(arquivosEnviados);
      if (rollbackError) console.warn("Falha ao desfazer upload que não foi salvo no catálogo.", rollbackError);
    }
    console.error(error); statusForm.textContent = "Não foi possível salvar: " + (error.message || "verifique sua conexão e tente novamente.");
  } finally { botao.disabled = false; botao.textContent = "Salvar produto"; }
}
async function excluirProduto(produto) {
  if (!administrador || !confirm('Excluir "' + produto.title + '" da loja?')) return;
  const imagensRemovidas = urlsDoProduto(produto);
  const { error } = await supabase.from("refugiart_store_products").delete().eq("id", produto.id);
  if (error) { alert("Não foi possível excluir o produto: " + error.message); return; }
  await carregarProdutos();
  await limparImagensSemUso(imagensRemovidas);
}
if (categoria && grade) { await verificarAdministrador(); await carregarProdutos(); }
