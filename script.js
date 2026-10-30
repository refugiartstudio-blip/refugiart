
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
  // 6. REFLEXIARTS — PUBLICAÇÃO E CARROSSEL
  // ==========================================

  const formPublicacao = document.getElementById("form-publicacao");
  const campoPublicacao = document.getElementById("texto-publicacao");
  const listaReflexiarts = document.getElementById("lista-reflexiarts");
  const indicadoresReflexiart = document.getElementById("reflexiart-indicadores");
  const botaoReflexiartAnterior = document.getElementById("reflexiart-anterior");
  const botaoReflexiartProxima = document.getElementById("reflexiart-proxima");

  let reflexiarts = [];
  let indiceReflexiart = 0;
  let intervaloReflexiart = null;

  function embaralharReflexiarts(lista) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function tempoRelativo(data) {
    const instante = new Date(data).getTime();
    if (!Number.isFinite(instante)) return "";
    const minutos = Math.max(0, Math.floor((Date.now() - instante) / 60000));
    if (minutos < 1) return "Agora mesmo";
    if (minutos < 60) return "Há " + minutos + (minutos === 1 ? " minuto" : " minutos");
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return "Há " + horas + (horas === 1 ? " hora" : " horas");
    const dias = Math.floor(horas / 24);
    return "Há " + dias + (dias === 1 ? " dia" : " dias");
  }

  function renderizarReflexiart() {
    if (!listaReflexiarts || !indicadoresReflexiart) return;
    listaReflexiarts.replaceChildren();
    indicadoresReflexiart.replaceChildren();

    if (!reflexiarts.length) {
      const vazio = document.createElement("p");
      vazio.className = "reflexiart-carregando";
      vazio.textContent = "As reflexões compartilhadas pelos artistas aparecerão aqui.";
      listaReflexiarts.appendChild(vazio);
      botaoReflexiartAnterior && (botaoReflexiartAnterior.disabled = true);
      botaoReflexiartProxima && (botaoReflexiartProxima.disabled = true);
      return;
    }

    indiceReflexiart = (indiceReflexiart + reflexiarts.length) % reflexiarts.length;
    const item = reflexiarts[indiceReflexiart];

    const cartao = document.createElement("article");
    cartao.className = "cartao-reflexiart";

    const topo = document.createElement("div");
    topo.className = "cartao-reflexiart-topo";

    const avatar = document.createElement("div");
    avatar.className = "reflexiart-avatar";
    if (item.perfil?.foto_url) {
      const imagem = document.createElement("img");
      imagem.src = item.perfil.foto_url;
      imagem.alt = "Foto de " + (item.perfil.nome_artistico || "artista");
      imagem.loading = "lazy";
      imagem.onerror = () => { imagem.remove(); avatar.textContent = "✦"; };
      avatar.appendChild(imagem);
    } else {
      avatar.textContent = (item.perfil?.nome_artistico || item.perfil?.nome_atelie || "R").charAt(0).toUpperCase();
    }

    const identidade = document.createElement("div");
    identidade.className = "reflexiart-identidade";
    const atelie = document.createElement("strong");
    atelie.textContent = item.perfil?.nome_atelie?.trim() || "Ateliê RefugiART";
    const artista = document.createElement("span");
    artista.textContent = item.perfil?.nome_artistico?.trim() || "Artista da comunidade";
    const horario = document.createElement("small");
    horario.textContent = tempoRelativo(item.created_at);
    identidade.append(atelie, artista, horario);
    topo.append(avatar, identidade);

    const categoria = document.createElement("span");
    categoria.className = "categoria-reflexiart";
    categoria.textContent = item.category || "Arte e cultura";

    const texto = document.createElement("p");
    texto.className = "reflexiart-texto";
    texto.textContent = item.content;

    const rodape = document.createElement("div");
    rodape.className = "reflexiart-rodape";
    rodape.textContent = "Uma reflexão compartilhada na RefugiART";

    cartao.append(topo, categoria, texto, rodape);
    listaReflexiarts.appendChild(cartao);

    reflexiarts.forEach((_, indice) => {
      const ponto = document.createElement("button");
      ponto.type = "button";
      ponto.className = "reflexiart-ponto" + (indice === indiceReflexiart ? " ativo" : "");
      ponto.setAttribute("aria-label", "Mostrar reflexão " + (indice + 1));
      ponto.setAttribute("aria-current", indice === indiceReflexiart ? "true" : "false");
      ponto.addEventListener("click", () => {
        indiceReflexiart = indice;
        renderizarReflexiart();
        reiniciarRotacaoReflexiart();
      });
      indicadoresReflexiart.appendChild(ponto);
    });

    if (botaoReflexiartAnterior) botaoReflexiartAnterior.disabled = reflexiarts.length < 2;
    if (botaoReflexiartProxima) botaoReflexiartProxima.disabled = reflexiarts.length < 2;
  }

  function reiniciarRotacaoReflexiart() {
    if (intervaloReflexiart) clearInterval(intervaloReflexiart);
    if (reflexiarts.length > 1) {
      intervaloReflexiart = setInterval(() => {
        indiceReflexiart = (indiceReflexiart + 1) % reflexiarts.length;
        renderizarReflexiart();
      }, 7000);
    }
  }

  async function carregarReflexiarts() {
    if (!listaReflexiarts || !supabase) return;
    const { data, error } = await supabase
      .from("reflexiarts")
      .select("id, user_id, content, category, created_at")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      console.error("Erro ao carregar ReflexiARTs:", error);
      listaReflexiarts.textContent = "Não foi possível carregar as ReflexiARTs agora.";
      return;
    }

    const publicacoes = data || [];
    const ids = [...new Set(publicacoes.map(item => item.user_id).filter(Boolean))];
    let perfis = {};

    if (ids.length) {
      const { data: dadosPerfis, error: erroPerfis } = await supabase
        .from("profiles")
        .select("id, nome_artistico, nome_atelie, foto_url")
        .in("id", ids);
      if (erroPerfis) console.warn("Não foi possível carregar os perfis das ReflexiARTs:", erroPerfis);
      else perfis = Object.fromEntries((dadosPerfis || []).map(perfil => [perfil.id, perfil]));
    }

    reflexiarts = embaralharReflexiarts(publicacoes.map(item => ({
      ...item,
      perfil: perfis[item.user_id] || null
    })));
    indiceReflexiart = 0;
    renderizarReflexiart();
    reiniciarRotacaoReflexiart();
  }

  botaoReflexiartAnterior?.addEventListener("click", () => {
    indiceReflexiart--;
    renderizarReflexiart();
    reiniciarRotacaoReflexiart();
  });

  botaoReflexiartProxima?.addEventListener("click", () => {
    indiceReflexiart++;
    renderizarReflexiart();
    reiniciarRotacaoReflexiart();
  });

  if (formPublicacao && campoPublicacao) {
    formPublicacao.addEventListener("submit", async (evento) => {
      evento.preventDefault();

      const texto = campoPublicacao.value.trim();
      const categoria = document.getElementById("categoria-publicacao")?.value || "";
      const feed = document.getElementById("feed");

      if (!texto || !feed) return;
      if (!usuarioAtual) {
        alert("Entre na sua conta para compartilhar uma ReflexiART.");
        window.location.href = "login.html";
        return;
      }
      if (!categoria) {
        alert("Selecione a área da sua ReflexiART.");
        return;
      }

      const botao = formPublicacao.querySelector('button[type="submit"]');
      if (botao) {
        botao.disabled = true;
        botao.textContent = "Compartilhando...";
      }

      try {
        const { error } = await supabase
          .from("reflexiarts")
          .insert({
            user_id: usuarioAtual.id,
            content: texto,
            category: categoria
          });

        if (error) throw error;

        formPublicacao.reset();
        await carregarReflexiarts();
        document.getElementById("carrossel-reflexiart")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      } catch (erro) {
        console.error("Erro ao publicar ReflexiART:", erro);
        alert("Não foi possível publicar sua ReflexiART: " + (erro.message || "Tente novamente."));
      } finally {
        if (botao) {
          botao.disabled = false;
          botao.textContent = "Compartilhar ReflexiART";
        }
      }
    });
  }

  carregarReflexiarts();

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
