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
let administrador = false;
let produtos = [];
let produtoEmEdicao = null;

function elemento(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined) node.textContent = texto;
  return node;
}

function montarModal() {
  const overlay = elemento("div", "admin-loja-modal");
  overlay.id = "modalAdminLoja";
  overlay.hidden = true;
  const form = elemento("form", "admin-loja-form");
  form.id = "formProdutoLoja";
  form.innerHTML = `
    <h2 id="tituloFormProduto">Adicionar produto</h2>
    <label for="produtoTitulo">Título</label>
    <input id="produtoTitulo" name="title" maxlength="120" required>
    <label for="produtoDescricao">Descrição</label>
    <textarea id="produtoDescricao" name="description" maxlength="600"></textarea>
    <div class="linha-admin">
      <div><label for="produtoPreco">Preço (R$)</label><input id="produtoPreco" name="price" type="number" min="0" step="0.01" required></div>
      <div><label for="produtoFoto">Fotografia</label><input id="produtoFoto" name="image" type="file" accept="image/png,image/jpeg,image/webp"></div>
    </div>
    <img id="produtoPreview" class="admin-loja-preview" alt="Prévia da fotografia" hidden>
    <label class="demo-admin"><input id="produtoDemo" type="checkbox"> Produto fictício / demonstrativo</label>
    <p class="admin-loja-status" id="statusProdutoLoja">As imagens podem ser JPG, PNG ou WebP (máximo de 5 MB).</p>
    <div class="botoes-admin"><button type="button" id="cancelarProduto">Cancelar</button><button type="submit" id="salvarProduto">Salvar produto</button></div>
  `;
  overlay.append(form);
  document.body.append(overlay);
  overlay.addEventListener("click", event => { if (event.target === overlay) fecharModal(); });
  form.querySelector("#cancelarProduto").addEventListener("click", fecharModal);
  form.addEventListener("submit", salvarProduto);
  form.querySelector("#produtoFoto").addEventListener("change", mostrarPrevia);
  return overlay;
}

const modal = montarModal();
const form = document.getElementById("formProdutoLoja");
const statusForm = document.getElementById("statusProdutoLoja");

function mostrarPrevia(event) {
  const arquivo = event.target.files?.[0];
  const preview = document.getElementById("produtoPreview");
  if (!arquivo) { preview.hidden = true; preview.removeAttribute("src"); return; }
  if (!arquivo.type.startsWith("image/") || arquivo.size > 5 * 1024 * 1024) {
    event.target.value = "";
    statusForm.textContent = "Escolha uma imagem JPG, PNG ou WebP de até 5 MB.";
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(arquivo);
  preview.hidden = false;
  statusForm.textContent = "Prévia da nova fotografia selecionada.";
}

function abrirModal(produto = null) {
  produtoEmEdicao = produto;
  form.reset();
  const preview = document.getElementById("produtoPreview");
  preview.hidden = true;
  preview.removeAttribute("src");
  document.getElementById("tituloFormProduto").textContent = produto ? "Editar produto" : "Adicionar produto";
  document.getElementById("produtoTitulo").value = produto?.title || "";
  document.getElementById("produtoDescricao").value = produto?.description || "";
  document.getElementById("produtoPreco").value = produto ? Number(produto.price).toFixed(2) : "";
  document.getElementById("produtoDemo").checked = produto ? Boolean(produto.is_demo) : false;
  if (produto?.image_url) { preview.src = produto.image_url; preview.hidden = false; }
  statusForm.textContent = produto?.image_url ? "Selecione uma nova fotografia para substituir a atual." : "Escolha uma imagem JPG, PNG ou WebP de até 5 MB.";
  modal.hidden = false;
  document.getElementById("produtoTitulo").focus();
}

function fecharModal() {
  modal.hidden = true;
  produtoEmEdicao = null;
}

function renderizar() {
  grade.replaceChildren();
  if (!produtos.length) {
    grade.append(elemento("p", "", "Ainda não há produtos nesta categoria."));
    return;
  }
  produtos.forEach(produto => {
    const card = elemento("article", "produto-loja");
    const img = elemento("img", "produto-loja-imagem");
    img.src = produto.image_url || "";
    img.alt = produto.title;
    img.loading = "lazy";
    if (!produto.image_url) img.style.display = "none";
    const info = elemento("div", "produto-loja-info");
    info.append(elemento("span", "produto-loja-selo", produto.is_demo ? "Produto demonstrativo" : nomes[categoria]));
    info.append(elemento("h3", "", produto.title));
    info.append(elemento("p", "", produto.description || ""));
    info.append(elemento("strong", "produto-loja-preco", moeda(produto.price)));
    if (administrador) {
      const acoes = elemento("div", "produto-loja-admin");
      const editar = elemento("button", "", "Editar");
      editar.type = "button";
      editar.addEventListener("click", () => abrirModal(produto));
      const excluir = elemento("button", "excluir", "Excluir");
      excluir.type = "button";
      excluir.addEventListener("click", () => excluirProduto(produto));
      acoes.append(editar, excluir);
      info.append(acoes);
    }
    card.append(img, info);
    grade.append(card);
  });
}

async function carregarProdutos() {
  grade.textContent = "Carregando produtos...";
  const { data, error } = await supabase.from("refugiart_store_products")
    .select("id,category,title,description,price,image_url,is_active,is_demo,created_at")
    .eq("category", categoria).eq("is_active", true).order("created_at", { ascending: true });
  if (error) {
    console.error("Erro ao carregar produtos da loja:", error);
    grade.textContent = "Não foi possível carregar os produtos. Atualize a página e tente novamente.";
    return;
  }
  produtos = data || [];
  renderizar();
}

async function verificarAdministrador() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return;
  const { data, error } = await supabase.rpc("refugiart_is_admin");
  administrador = !error && data === true;
  if (administrador) {
    barraAdmin.hidden = false;
    botaoAdicionar.addEventListener("click", () => abrirModal());
  }
}

async function salvarProduto(event) {
  event.preventDefault();
  if (!administrador) return;
  const titulo = document.getElementById("produtoTitulo").value.trim();
  const descricao = document.getElementById("produtoDescricao").value.trim();
  const preco = Number(document.getElementById("produtoPreco").value);
  const arquivo = document.getElementById("produtoFoto").files?.[0];
  if (titulo.length < 2 || !Number.isFinite(preco) || preco < 0) {
    statusForm.textContent = "Confira o título e o preço antes de salvar.";
    return;
  }
  if (arquivo && (!arquivo.type.startsWith("image/") || arquivo.size > 5 * 1024 * 1024)) {
    statusForm.textContent = "A imagem precisa ser JPG, PNG ou WebP e ter até 5 MB.";
    return;
  }
  const botao = document.getElementById("salvarProduto");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    let imageUrl = produtoEmEdicao?.image_url || null;
    if (arquivo) {
      const extensao = arquivo.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const caminho = categoria + "/" + crypto.randomUUID() + "." + extensao;
      const { error: uploadError } = await supabase.storage.from("refugiart-store").upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      imageUrl = supabase.storage.from("refugiart-store").getPublicUrl(caminho).data.publicUrl;
    }
    const registro = {
      category: categoria, title: titulo, description: descricao, price: preco,
      image_url: imageUrl, is_demo: document.getElementById("produtoDemo").checked,
      is_active: true, updated_at: new Date().toISOString()
    };
    let resposta;
    if (produtoEmEdicao) {
      resposta = await supabase.from("refugiart_store_products").update(registro).eq("id", produtoEmEdicao.id);
    } else {
      resposta = await supabase.from("refugiart_store_products").insert(registro);
    }
    if (resposta.error) throw resposta.error;
    fecharModal();
    await carregarProdutos();
  } catch (error) {
    console.error(error);
    statusForm.textContent = "Não foi possível salvar: " + (error.message || "verifique sua conexão e tente novamente.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar produto";
  }
}

async function excluirProduto(produto) {
  if (!administrador || !confirm('Excluir "' + produto.title + '" da loja?')) return;
  const { error } = await supabase.from("refugiart_store_products").delete().eq("id", produto.id);
  if (error) { alert("Não foi possível excluir o produto: " + error.message); return; }
  await carregarProdutos();
}

if (categoria && grade) {
  await verificarAdministrador();
  await carregarProdutos();
}
