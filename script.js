
document.addEventListener("DOMContentLoaded", function () {

  // ==========================================
  // 1. MENU LATERAL — COMPARTILHADO
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

    if (abrirMenu) {
      abrirMenu.setAttribute("aria-expanded", "true");
    }

    if (fecharMenu) fecharMenu.focus();
  }

  function fecharPainel() {
    if (!menuLateral || !fundoMenu) return;

    menuLateral.classList.remove("menu-aberto");
    fundoMenu.classList.remove("fundo-visivel");
    document.body.classList.remove("menu-bloqueio");

    menuLateral.setAttribute("aria-hidden", "true");
    menuLateral.inert = true;

    if (abrirMenu) {
      abrirMenu.setAttribute("aria-expanded", "false");
      abrirMenu.focus();
    }

    aguardandoAbertura = false;

    if (animacaoRolagem !== null) {
      cancelAnimationFrame(animacaoRolagem);
      animacaoRolagem = null;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  if (abrirMenu) {
    abrirMenu.addEventListener("click", abrirPainel);
  }

  // Compatível com os dois nomes de botão usados nas páginas.
  const botoesExplorar = [botaoExplorar, explorarMenu].filter(Boolean);

  botoesExplorar.forEach(function (botao) {
    botao.addEventListener("click", function () {
      if (!comunidades) {
        abrirPainel();
        return;
      }

      aguardandoAbertura = true;

      comunidades.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      if (animacaoRolagem !== null) {
        cancelAnimationFrame(animacaoRolagem);
      }

      function verificarRolagem() {
        if (!aguardandoAbertura) return;

        const posicao = comunidades.getBoundingClientRect();

        // Não exige que a seção chegue exatamente ao pixel zero.
        if (Math.abs(posicao.top) < 30) {
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

  if (fecharMenu) {
    fecharMenu.addEventListener("click", fecharPainel);
  }

  if (fundoMenu) {
    fundoMenu.addEventListener("click", fecharPainel);
  }

  document.addEventListener("keydown", function (evento) {
    if (
      evento.key === "Escape" &&
      menuLateral &&
      menuLateral.classList.contains("menu-aberto")
    ) {
      fecharPainel();
    }
  });


  // ==========================================
  // 2. CONTROLE VISUAL DO PERFIL NA INÍCIO
  // ==========================================

  const itemPerfil = document.getElementById("itemPerfil");
  const linkLogin = document.getElementById("linkLogin");

  function atualizarEstadoLogin() {
    if (!itemPerfil) return;

    const estaLogado = document.body.dataset.logado === "true";

    itemPerfil.hidden = !estaLogado;
    itemPerfil.style.display = estaLogado ? "" : "none";

    if (linkLogin && document.body.dataset.logado !== undefined) {
      if (estaLogado) {
        linkLogin.textContent = "Minha conta";
        linkLogin.href = "perfil.html";
      } else {
        linkLogin.textContent = "Login";
        linkLogin.href = "login.html";
      }
    }
  }

  atualizarEstadoLogin();


  // ==========================================
  // 3. CURTIDAS
  // ==========================================

  function alternarCurtida(botao) {
    const estaCurtido = botao.classList.toggle("curtido");

    botao.textContent = estaCurtido ? "♥ Curtido" : "♡ Curtir";
  }

  document.addEventListener("click", function (evento) {
    const alvo = evento.target;

    if (!(alvo instanceof Element)) return;

    const botaoCurtir = alvo.closest(".botao-curtir");

    if (botaoCurtir) {
      alternarCurtida(botaoCurtir);
      return;
    }

    // ==========================================
    // 4. ABRIR E FECHAR COMENTÁRIOS
    // ==========================================

    const botaoComentar = alvo.closest(".botao-comentar");

    if (botaoComentar) {
      const publicacao = botaoComentar.closest(".publicacao");
      if (!publicacao) return;

      const area = publicacao.querySelector(".area-comentarios");
      if (!area) return;

      area.hidden = !area.hidden;

      if (!area.hidden) {
        const campo = area.querySelector(".texto-comentario");
        if (campo) campo.focus();
      }
    }
  });


  // ==========================================
  // 5. PUBLICAR COMENTÁRIOS
  // ==========================================

  document.addEventListener("submit", function (evento) {
    const formulario = evento.target;

    if (!(formulario instanceof HTMLFormElement)) return;
    if (!formulario.matches(".form-comentario")) return;

    evento.preventDefault();

    const area = formulario.closest(".area-comentarios");
    const campo = formulario.querySelector(".texto-comentario");

    if (!area || !campo) return;

    const lista = area.querySelector(".lista-comentarios");
    const mensagem = campo.value.trim();

    if (!lista || !mensagem) return;

    const comentario = document.createElement("div");
    comentario.className = "comentario";

    const autor = document.createElement("strong");
    autor.textContent = "Artista RefugiART";

    const texto = document.createElement("p");
    texto.textContent = mensagem;

    comentario.append(autor, texto);
    lista.appendChild(comentario);

    campo.value = "";
  });


  // ==========================================
  // 6. CRIAR PUBLICAÇÕES
  // ==========================================

  const formPublicacao = document.getElementById("form-publicacao");
  const campoPublicacao = document.getElementById("texto-publicacao");

  if (formPublicacao && campoPublicacao) {
    formPublicacao.addEventListener("submit", function (evento) {
      evento.preventDefault();

      const texto = campoPublicacao.value.trim();
      if (!texto) return;

      const feed = document.getElementById("feed");

      if (!feed) {
        console.error("A área do feed não foi encontrada.");
        return;
      }

      const novaPublicacao = document.createElement("article");
      novaPublicacao.className = "publicacao";

      const cabecalho = document.createElement("div");
      cabecalho.className = "autor";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = "A";

      const identificacao = document.createElement("div");

      const nomeElemento = document.createElement("strong");
      nomeElemento.textContent = "Artista RefugiART";

      const data = document.createElement("p");
      data.textContent = "Nova publicação";

      identificacao.append(nomeElemento, data);
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

      const areaComentarios = document.createElement("div");
      areaComentarios.className = "area-comentarios";
      areaComentarios.hidden = true;

      const formularioComentario = document.createElement("form");
      formularioComentario.className = "form-comentario";

      const campoComentario = document.createElement("input");
      campoComentario.type = "text";
      campoComentario.className = "texto-comentario";
      campoComentario.placeholder = "Escreva um comentário construtivo...";
      campoComentario.maxLength = 300;
      campoComentario.required = true;
      campoComentario.setAttribute("aria-label", "Escreva um comentário");

      const publicarComentario = document.createElement("button");
      publicarComentario.type = "submit";
      publicarComentario.textContent = "Publicar";

      formularioComentario.append(campoComentario, publicarComentario);

      const listaComentarios = document.createElement("div");
      listaComentarios.className = "lista-comentarios";

      areaComentarios.append(formularioComentario, listaComentarios);

      novaPublicacao.append(
        cabecalho,
        mensagem,
        acoes,
        areaComentarios
      );

      formPublicacao.insertAdjacentElement("afterend", novaPublicacao);
      formPublicacao.reset();
    });
  }


  // ==========================================
  // 7. CRIAÇÃO DE PERFIL ARTÍSTICO
  // ==========================================

  const botaoCriarPerfil = document.getElementById("btn-criar-perfil");
  const formPerfil = document.getElementById("form-perfil");
  const areaPerfil = document.getElementById("perfil-criado");

  if (botaoCriarPerfil && formPerfil && areaPerfil) {
    botaoCriarPerfil.addEventListener("click", function () {
      formPerfil.hidden = false;
      botaoCriarPerfil.hidden = true;

      const campoNome = document.getElementById("nome-artista");
      if (campoNome) campoNome.focus();
    });

    formPerfil.addEventListener("submit", function (evento) {
      evento.preventDefault();

      const campoNome = document.getElementById("nome-artista");
      const campoArea = document.getElementById("area-artista");
      const campoBio = document.getElementById("bio-artista");
      const campoSenha = document.getElementById("senha-artista");
      const campoConfirmacao = document.getElementById("confirmar-senha");

      if (!campoNome || !campoArea || !campoSenha || !campoConfirmacao) {
        return;
      }

      const nome = campoNome.value.trim();
      const area = campoArea.value;
      const bio = campoBio ? campoBio.value.trim() : "";
      const senha = campoSenha.value;
      const confirmarSenha = campoConfirmacao.value;

      if (!nome || !area) {
        alert("Preencha o nome artístico e a área de atuação.");
        return;
      }

      if (senha.length < 8) {
        alert("A senha deve ter pelo menos 8 caracteres.");
        return;
      }

      if (senha !== confirmarSenha) {
        alert("As senhas não coincidem. Confira e tente novamente.");
        return;
      }

      const perfil = document.createElement("article");
      perfil.className = "perfil-artista";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = nome.charAt(0).toUpperCase();

      const identificacao = document.createElement("h3");
      identificacao.textContent = nome;

      const especialidade = document.createElement("p");
      especialidade.textContent = area;

      perfil.append(avatar, identificacao, especialidade);

      if (bio) {
        const apresentacao = document.createElement("p");
        apresentacao.textContent = bio;
        perfil.appendChild(apresentacao);
      }

      areaPerfil.appendChild(perfil);

      formPerfil.reset();
      formPerfil.hidden = true;
      botaoCriarPerfil.hidden = false;

      perfil.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }

});
