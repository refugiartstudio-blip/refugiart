
document.addEventListener("DOMContentLoaded", function () {
  // ==========================================
  // 1. COLUNA LATERAL
  // ==========================================

  const coluna = document.getElementById("colunaGaleria");
  const botaoColuna = document.getElementById("alternarColunaGaleria");
  const iconeSeta = document.getElementById("iconeSetaGaleria");

  if (coluna && botaoColuna && iconeSeta) {
    botaoColuna.addEventListener("click", function () {
      const expandida = coluna.classList.toggle("expandida");

      botaoColuna.setAttribute("aria-expanded", String(expandida));
      botaoColuna.setAttribute(
        "aria-label",
        expandida ? "Recolher menu da galeria" : "Expandir menu da galeria"
      );

      iconeSeta.textContent = expandida ? "⬅" : "➜";
    });
  }

  // ==========================================
  // 2. CARROSSEL AUTOMÁTICO E GESTOS
  // ==========================================

  const carrossel = document.getElementById("apresentacaoGaleria");

  if (carrossel) {
    const slides = Array.from(
      carrossel.querySelectorAll(".slide-carrossel")
    );

    let atual = 0;
    let inicioX = 0;
    let inicioY = 0;
    let arrastando = false;
    let houveMovimento = false;
    let intervalo = null;

    const LIMITE_ARRASTE = 45;
    const TEMPO_TROCA = 7000;

    function mostrarSlide(indice) {
      if (!slides.length) return;

      atual = (indice + slides.length) % slides.length;

      slides.forEach(function (slide, i) {
        const ativo = i === atual;
        slide.classList.toggle("ativo", ativo);
        slide.setAttribute("aria-hidden", String(!ativo));
      });
    }

    function pausar() {
      if (intervalo !== null) {
        clearInterval(intervalo);
        intervalo = null;
      }
    }

    function iniciar() {
      pausar();

      if (slides.length < 2) return;

      intervalo = setInterval(function () {
        if (!arrastando) mostrarSlide(atual + 1);
      }, TEMPO_TROCA);
    }

    carrossel.addEventListener("pointerdown", function (evento) {
      if (evento.pointerType === "mouse" && evento.button !== 0) return;

      inicioX = evento.clientX;
      inicioY = evento.clientY;
      arrastando = true;
      houveMovimento = false;

      carrossel.classList.add("arrastando");
      pausar();

      if (carrossel.setPointerCapture) {
        try {
          carrossel.setPointerCapture(evento.pointerId);
        } catch (erro) {
          // Continua funcionando mesmo se a captura não estiver disponível.
        }
      }
    });

    function finalizarGesto(evento) {
      if (!arrastando) return;

      const dx = evento.clientX - inicioX;
      const dy = evento.clientY - inicioY;

      if (
        Math.abs(dx) >= LIMITE_ARRASTE &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        mostrarSlide(atual + (dx < 0 ? 1 : -1));
        houveMovimento = true;
      }

      arrastando = false;
      carrossel.classList.remove("arrastando");
      iniciar();
    }

    carrossel.addEventListener("pointerup", finalizarGesto);

    carrossel.addEventListener("pointercancel", function () {
      arrastando = false;
      carrossel.classList.remove("arrastando");
      iniciar();
    });

    carrossel.addEventListener("click", function (evento) {
      if (houveMovimento) {
        evento.preventDefault();
        evento.stopPropagation();
        houveMovimento = false;
      }
    }, true);

    carrossel.addEventListener("mouseenter", pausar);
    carrossel.addEventListener("mouseleave", iniciar);
    carrossel.addEventListener("focusin", pausar);
    carrossel.addEventListener("focusout", iniciar);

    mostrarSlide(0);
    iniciar();
  }

  // ==========================================
  // 3. NAVEGAÇÃO ABAIXO DO CARROSSEL
  // O carrossel nunca desaparece.
  // ==========================================

  const links = document.querySelectorAll(
    "#colunaGaleria [data-tela-galeria]"
  );

  const visaoGeral = document.getElementById("visaoGeral");
  const acervo = document.getElementById("acervo");
  const salao = document.getElementById("salao");

  const telas = {
    visaoGeral: visaoGeral,
    acervo: acervo,
    salao: salao
  };

  function mostrarArea(nome) {
    if (!telas[nome]) return;

    Object.keys(telas).forEach(function (chave) {
      const tela = telas[chave];
      if (!tela) return;

      tela.hidden = chave !== nome;
    });

    links.forEach(function (link) {
      const ativo = link.dataset.telaGaleria === nome;

      link.classList.toggle("ativo", ativo);

      if (ativo) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (nome === "acervo") renderizarArtistas();

    // Mantém o visitante na página da Galeria.
    // O carrossel fica sempre visível acima da área escolhida.
  }

  links.forEach(function (link) {
    link.addEventListener("click", function (evento) {
      const nome = link.dataset.telaGaleria;

      if (!telas[nome]) return;

      evento.preventDefault();
      mostrarArea(nome);
    });
  });

  // ==========================================
  // 4. ACERVO DINÂMICO DE ARTISTAS
  // Cada cartão abre o Ateliê público do respectivo perfil.
  // ==========================================

  const listaArtistas = document.getElementById("listaArtistas");
  const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";
  let clienteGaleria = null;

  async function obterClienteGaleria() {
    if (clienteGaleria) return clienteGaleria;

    try {
      const { createClient } = await import(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
      );
      clienteGaleria = createClient(SUPABASE_URL, SUPABASE_KEY);
      return clienteGaleria;
    } catch (erro) {
      console.error("Erro ao conectar à Galeria:", erro);
      return null;
    }
  }

  function criarCartaoArtista(artista) {
    const cartao = document.createElement("a");
    cartao.className = "cartao-artista";
    cartao.href = "atelie.html?id=" + encodeURIComponent(artista.id);
    cartao.setAttribute("aria-label", "Visitar Ateliê de " + artista.nome);

    if (artista.foto_url) {
      const imagem = document.createElement("img");
      imagem.src = artista.foto_url;
      imagem.alt = "Retrato de " + artista.nome;
      imagem.loading = "lazy";
      cartao.appendChild(imagem);
    }

    const nome = document.createElement("h3");
    nome.textContent = artista.nome;
    cartao.appendChild(nome);

    const apresentacao = document.createElement("p");
    apresentacao.textContent = artista.nome_atelie || "Artista da comunidade";
    cartao.appendChild(apresentacao);

    return cartao;
  }

  async function renderizarArtistas() {
    if (!listaArtistas) return;

    listaArtistas.replaceChildren();
    const carregando = document.createElement("p");
    carregando.className = "texto-artistas-vazio";
    carregando.textContent = "Carregando artistas...";
    listaArtistas.appendChild(carregando);

    const cliente = await obterClienteGaleria();
    if (!cliente) {
      carregando.textContent = "Não foi possível conectar ao acervo. Tente novamente.";
      return;
    }

    const { data, error } = await cliente
      .from("profiles")
      .select("id, nome_artistico, nome_atelie, foto_url")
      .not("nome_artistico", "is", null)
      .order("nome_artistico", { ascending: true });

    if (error) {
      console.error("Erro ao carregar artistas:", error);
      carregando.textContent =
        "Não foi possível carregar os artistas. Verifique as permissões públicas do acervo no Supabase.";
      return;
    }

    const artistas = (data || []).filter((perfil) =>
      perfil.id && perfil.nome_artistico?.trim()
    );

    listaArtistas.replaceChildren();

    if (!artistas.length) {
      const vazio = document.createElement("p");
      vazio.className = "texto-artistas-vazio";
      vazio.textContent =
        "Ainda não há artistas com perfil artístico cadastrado.";
      listaArtistas.appendChild(vazio);
      return;
    }

    artistas.forEach((perfil) => {
      listaArtistas.appendChild(criarCartaoArtista({
        id: perfil.id,
        nome: perfil.nome_artistico.trim(),
        nome_atelie: perfil.nome_atelie,
        foto_url: perfil.foto_url
      }));
    });
  }

  // ==========================================
  // 5. ESTADO INICIAL
  // ==========================================

  const visaoGeral = document.getElementById("visaoGeral");
  const acervo = document.getElementById("acervo");
  const salao = document.getElementById("salao");

  const telas = {
    visaoGeral: visaoGeral,
    acervo: acervo,
    salao: salao
  };

  function mostrarArea(nome) {
    if (!telas[nome]) return;

    Object.keys(telas).forEach(function (chave) {
      const tela = telas[chave];
      if (tela) tela.hidden = chave !== nome;
    });

    links.forEach(function (link) {
      const ativo = link.dataset.telaGaleria === nome;
      link.classList.toggle("ativo", ativo);

      if (ativo) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (nome === "acervo") renderizarArtistas();
  }

  links.forEach(function (link) {
    link.addEventListener("click", function (evento) {
      const nome = link.dataset.telaGaleria;
      if (!telas[nome]) return;
      evento.preventDefault();
      mostrarArea(nome);
    });
  });

  // Mantém o carrossel e a navegação da Galeria independentes do acervo.
  if (visaoGeral && acervo && salao) {
    mostrarArea("visaoGeral");
  }

  // ==========================================
  // 7. ESTADO INICIAL
  // ==========================================

  // O perfil do artista e seu botão de retorno
  // começam ocultos ao carregar a página.
  if (perfil) {
    perfil.hidden = true;
  }

  // A lista começa visível.
  if (listaArtistas) {
    listaArtistas.hidden = false;
  }

  // A galeria abre na Visão geral.
  if (visaoGeral && acervo && salao) {
    mostrarArea("visaoGeral");
  }

});
