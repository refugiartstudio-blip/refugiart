
document.addEventListener("DOMContentLoaded", async function () {
  // ==========================================
  // 1. SESSÃO DO SUPABASE E NAVEGAÇÃO
  // ==========================================

  const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
  const SUPABASE_KEY =
    "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";

  let supabase = null;
  let usuarioAtual = null;

  try {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );

    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase.auth.getUser();

    if (!error) {
      usuarioAtual = data.user;
    }
  } catch (erro) {
    console.error("Não foi possível verificar a sessão:", erro);
  }

  function atualizarEstadoLogin() {
    const estaLogado = Boolean(usuarioAtual);

    document.body.dataset.logado = String(estaLogado);

    const itemPerfil = document.getElementById("itemPerfil");
    let linkLogin = document.body.classList.contains("pagina-atelie")
      ? null
      : document.getElementById("linkLogin");

    if (!document.body.classList.contains("pagina-atelie") && !linkLogin) {
      const navegacao = document.querySelector(".navegacao-principal");
      if (navegacao) {
        linkLogin = document.createElement("a");
        linkLogin.id = "linkLogin";
        navegacao.appendChild(linkLogin);
      }
    }

    if (itemPerfil) {
      itemPerfil.hidden = !estaLogado;
      itemPerfil.style.display = estaLogado ? "" : "none";
    }

    if (linkLogin) {
      linkLogin.textContent = estaLogado ? "Ateliê" : "Login";
      linkLogin.href = estaLogado ? "atelie.html" : "login.html";
      linkLogin.hidden = false;
    }

    document.querySelectorAll("[data-link-login]").forEach((link) => {
      link.hidden = estaLogado;
    });

    document.querySelectorAll("[data-link-perfil]").forEach((link) => {
      link.hidden = !estaLogado;
    });

    document.querySelectorAll("[data-link-atelie]").forEach((link) => {
      link.hidden = !estaLogado;
    });

    document.querySelectorAll("[data-link-sair]").forEach((link) => {
      link.hidden = !estaLogado;
    });
  }

  atualizarEstadoLogin();

  if (supabase) {
    supabase.auth.onAuthStateChange((evento, sessao) => {
      usuarioAtual = sessao?.user || null;
      atualizarEstadoLogin();
    });
  }

  // ==========================================
  // 2. MENU LATERAL
  // ==========================================

  const abrirMenu = document.getElementById("abrirMenu");
  const botaoExplorar = document.getElementById("botaoExplorar");
  const explorarMenu = document.getElementById("explorarMenu");
  const fecharMenu = document.getElementById("fecharMenu");
  const menuLateral = document.getElementById("menuLateral");
  const fundoMenu = document.getElementById("fundoMenu");
  const comunidades = document.getElementById("comunidades");

  let aguardandoAbertura = false;
  let animacaoRolagem = null;

  function abrirPainel() {
    if (!menuLateral || !fundoMenu) return;

    menuLateral.inert = false;
    menuLateral.setAttribute("aria-hidden", "false");
    menuLateral.classList.add("menu-aberto");
    fundoMenu.classList.add("fundo-visivel");
    document.body.classList.add("menu-bloqueio");

    abrirMenu?.setAttribute("aria-expanded", "true");
    fecharMenu?.focus();
  }

  function fecharPainel() {
    if (!menuLateral || !fundoMenu) return;

    menuLateral.classList.remove("menu-aberto");
    fundoMenu.classList.remove("fundo-visivel");
    document.body.classList.remove("menu-bloqueio");

    menuLateral.setAttribute("aria-hidden", "true");
    menuLateral.inert = true;

    abrirMenu?.setAttribute("aria-expanded", "false");
    aguardandoAbertura = false;

    if (animacaoRolagem !== null) {
      cancelAnimationFrame(animacaoRolagem);
      animacaoRolagem = null;
    }

    abrirMenu?.focus();
  }

  abrirMenu?.addEventListener("click", abrirPainel);
  fecharMenu?.addEventListener("click", fecharPainel);
  fundoMenu?.addEventListener("click", fecharPainel);

  [botaoExplorar, explorarMenu].filter(Boolean).forEach((botao) => {
    botao.addEventListener("click", () => {
      if (!comunidades) {
        abrirPainel();
        return;
      }

      aguardandoAbertura = true;
      comunidades.scrollIntoView({ behavior: "smooth", block: "start" });

      if (animacaoRolagem !== null) {
        cancelAnimationFrame(animacaoRolagem);
      }

      function verificarRolagem() {
        if (!aguardandoAbertura) return;

        if (Math.abs(comunidades.getBoundingClientRect().top) < 30) {
          aguardandoAbertura = false;
          animacaoRolagem = null;
          abrirPainel();
          return;
        }

        animacaoRolagem = requestAnimationFrame(verificarRolagem);
      }

      animacaoRolagem = requestAnimationFrame(verificarRolagem);
    });
  });

  document.addEventListener("keydown", (evento) => {
    if (
      evento.key === "Escape" &&
      menuLateral?.classList.contains("menu-aberto")
    ) {
      fecharPainel();
    }
  });

  // ==========================================
  // 3. SAIR DA CONTA
  // ==========================================

  document.querySelectorAll("[data-link-sair], #botaoSair").forEach((botao) => {
    botao.addEventListener("click", async (evento) => {
      evento.preventDefault();

      if (!supabase) {
        alert("Não foi possível conectar à autenticação.");
        return;
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        alert("Não foi possível sair: " + error.message);
        return;
      }

      window.location.href = "login.html";
    });
  });

  // ==========================================
  // 4. CURTIDAS VISUAIS
  // ==========================================

  function alternarCurtida(botao) {
    const curtido = botao.classList.toggle("curtido");
    botao.textContent = curtido ? "♥ Curtido" : "♡ Curtir";
  }

  document.addEventListener("click", (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;

    const botaoCurtir = alvo.closest(".botao-curtir");
    if (botaoCurtir) {
      alternarCurtida(botaoCurtir);
      return;
    }

    const botaoComentar = alvo.closest(".botao-comentar");
    if (botaoComentar) {
      const publicacao = botaoComentar.closest(".publicacao");
      const area = publicacao?.querySelector(".area-comentarios");
      if (!area) return;

      area.hidden = !area.hidden;

      if (!area.hidden) {
        area.querySelector(".texto-comentario")?.focus();
      }
    }
  });

  // ==========================================
  // 5. COMENTÁRIOS VISUAIS
  // ==========================================

  document.addEventListener("submit", (evento) => {
    const formulario = evento.target;

    if (
      !(formulario instanceof HTMLFormElement) ||
      !formulario.matches(".form-comentario")
    ) return;

    evento.preventDefault();

    const area = formulario.closest(".area-comentarios");
    const campo = formulario.querySelector(".texto-comentario");
    const lista = area?.querySelector(".lista-comentarios");
    const mensagem = campo?.value.trim();

    if (!lista || !campo || !mensagem) return;

    const comentario = document.createElement("div");
    comentario.className = "comentario";

    const autor = document.createElement("strong");
    autor.textContent = usuarioAtual?.user_metadata?.nome ||
      usuarioAtual?.email || "Artista RefugiART";

    const texto = document.createElement("p");
    texto.textContent = mensagem;

    comentario.append(autor, texto);
    lista.appendChild(comentario);
    campo.value = "";
  });

  // ==========================================
  // 6. PUBLICAÇÕES DE TEXTO — VISUAIS
  // ==========================================

  const formPublicacao = document.getElementById("form-publicacao");
  const campoPublicacao = document.getElementById("texto-publicacao");

  if (formPublicacao && campoPublicacao) {
    formPublicacao.addEventListener("submit", (evento) => {
      evento.preventDefault();

      const texto = campoPublicacao.value.trim();
      const feed = document.getElementById("feed");

      if (!texto || !feed) return;

      const publicacao = document.createElement("article");
      publicacao.className = "publicacao";

      const cabecalho = document.createElement("div");
      cabecalho.className = "autor";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = (
        usuarioAtual?.user_metadata?.nome ||
        usuarioAtual?.email ||
        "A"
      ).charAt(0).toUpperCase();

      const identificacao = document.createElement("div");
      const nome = document.createElement("strong");
      nome.textContent = usuarioAtual?.user_metadata?.nome ||
        usuarioAtual?.email || "Artista RefugiART";

      const data = document.createElement("p");
      data.textContent = "Agora";

      identificacao.append(nome, data);
      cabecalho.append(avatar, identificacao);

      const mensagem = document.createElement("p");
      mensagem.textContent = texto;

      const acoes = document.createElement("div");
      acoes.className = "acoes-publicacao";

      const curtir = document.createElement("button");
      curtir.type = "button";
      curtir.className = "botao-curtir";
      curtir.textContent = "♡ Curtir";

      const comentar = document.createElement("button");
      comentar.type = "button";
      comentar.className = "botao-comentar";
      comentar.textContent = "Comentar";

      acoes.append(curtir, comentar);

      const area = document.createElement("div");
      area.className = "area-comentarios";
      area.hidden = true;

      const formulario = document.createElement("form");
      formulario.className = "form-comentario";

      const campo = document.createElement("input");
      campo.type = "text";
      campo.className = "texto-comentario";
      campo.placeholder = "Escreva um comentário...";
      campo.maxLength = 300;
      campo.required = true;

      const enviar = document.createElement("button");
      enviar.type = "submit";
      enviar.textContent = "Publicar";

      formulario.append(campo, enviar);

      const lista = document.createElement("div");
      lista.className = "lista-comentarios";

      area.append(formulario, lista);
      publicacao.append(cabecalho, mensagem, acoes, area);

      formPublicacao.insertAdjacentElement("afterend", publicacao);
      formPublicacao.reset();
    });
  }

  // ==========================================
  // 7. PERFIL VISUAL DE DEMONSTRAÇÃO
  // ==========================================

  const botaoCriarPerfil = document.getElementById("btn-criar-perfil");
  const formPerfil = document.getElementById("form-perfil");
  const areaPerfil = document.getElementById("perfil-criado");

  if (botaoCriarPerfil && formPerfil && areaPerfil) {
    botaoCriarPerfil.addEventListener("click", () => {
      formPerfil.hidden = false;
      botaoCriarPerfil.hidden = true;
      document.getElementById("nome-artista")?.focus();
    });

    formPerfil.addEventListener("submit", (evento) => {
      evento.preventDefault();

      const nome = document.getElementById("nome-artista")?.value.trim();
      const area = document.getElementById("area-artista")?.value;
      const bio = document.getElementById("bio-artista")?.value.trim();

      if (!nome || !area) {
        alert("Preencha o nome artístico e a área de atuação.");
        return;
      }

      const perfil = document.createElement("article");
      perfil.className = "perfil-artista";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = nome.charAt(0).toUpperCase();

      const titulo = document.createElement("h3");
      titulo.textContent = nome;

      const especialidade = document.createElement("p");
      especialidade.textContent = area;

      perfil.append(avatar, titulo, especialidade);

      if (bio) {
        const apresentacao = document.createElement("p");
        apresentacao.textContent = bio;
        perfil.appendChild(apresentacao);
      }

      areaPerfil.appendChild(perfil);
      formPerfil.reset();
      formPerfil.hidden = true;
      botaoCriarPerfil.hidden = false;
    });
  }
});
