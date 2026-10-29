
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
  // 4. CADASTRO MANUAL DE ARTISTAS
  // Adicione novos artistas nesta lista.
  // ==========================================

  const artistas = [
    {
      id: "Residente",
      nome: "Henrique Sousa",
      foto: "",
      apresentacao: "Artista visual",
      biografia:
        "Henrique Sousa é artista visual, arte-educador e tatuador, formado em Licenciatura em Artes Visuais pela UNIFESSPA. Sua produção transita entre diferentes linguagens artísticas, com interesse pela cultura amazônica, pela formação artística e pelas relações entre arte, corpo e sociedade. É fundador da RefugiART, iniciativa dedicada à valorização da arte, à formação de novos artistas e à democratização do acesso à cultura. ",
      obras: [
        {
          titulo: "Bailarina",
          imagem: "",
          descricao:
            "Técnica: Aquarela sobre papel 300 g/m².",
        },
      
     {
  titulo: "Hagrid",
  imagem: "",
  descricao: "Técnica: Aquarela sobre papel."
},
      
      
      ] /*fecha a lista de obras*/
    }
  
  
  ] /*fecha a lista de Artistas*/;

  // ==========================================
  // 5. CARTÕES DO ACERVO
  // ==========================================

  const listaArtistas = document.getElementById("listaArtistas");
  const perfil = document.getElementById("perfilArtista");
  const conteudoPerfil = document.getElementById("conteudoPerfilArtista");
  const fecharPerfil = document.getElementById("fecharPerfilArtista");

  function renderizarArtistas() {
    if (!listaArtistas) return;

    listaArtistas.replaceChildren();

    artistas.forEach(function (artista) {
      const cartao = document.createElement("button");
      cartao.type = "button";
      cartao.className = "cartao-artista";

      if (artista.foto) {
        const imagem = document.createElement("img");
        imagem.src = artista.foto;
        imagem.alt = "Retrato de " + artista.nome;
        imagem.loading = "lazy";
        cartao.appendChild(imagem);
      }

      const nome = document.createElement("h3");
      nome.textContent = artista.nome;
      cartao.appendChild(nome);

      const apresentacao = document.createElement("p");
      apresentacao.textContent = artista.apresentacao;
      cartao.appendChild(apresentacao);

      cartao.addEventListener("click", function () {
        abrirPerfil(artista);
      });

      listaArtistas.appendChild(cartao);
    });
  }

  // ==========================================
  // 6. PERFIL DO ARTISTA NA PRÓPRIA GALERIA
  // ==========================================

  function abrirPerfil(artista) {
    if (!perfil || !conteudoPerfil || !listaArtistas) return;

    conteudoPerfil.replaceChildren();

    const titulo = document.createElement("h2");
    titulo.textContent = artista.nome;
    conteudoPerfil.appendChild(titulo);

    if (artista.foto) {
      const imagem = document.createElement("img");
      imagem.src = artista.foto;
      imagem.alt = "Retrato de " + artista.nome;
      imagem.className = "foto-perfil-artista";
      conteudoPerfil.appendChild(imagem);
    }

    const apresentacao = document.createElement("p");
    apresentacao.textContent = artista.apresentacao;
    conteudoPerfil.appendChild(apresentacao);

    const biografia = document.createElement("p");
    biografia.textContent = artista.biografia;
    conteudoPerfil.appendChild(biografia);

    const tituloObras = document.createElement("h3");
    tituloObras.textContent = "Obras";
    conteudoPerfil.appendChild(tituloObras);

    const obras = document.createElement("div");
    obras.className = "obras-artista";

    (artista.obras || []).forEach(function (obra) {
      const item = document.createElement("article");
      item.className = "obra-artista";

      if (obra.imagem) {
        const imagem = document.createElement("img");
        imagem.src = obra.imagem;
        imagem.alt = obra.titulo;
        imagem.loading = "lazy";
        item.appendChild(imagem);
      }

      const nomeObra = document.createElement("h4");
      nomeObra.textContent = obra.titulo;
      item.appendChild(nomeObra);

      const descricao = document.createElement("p");
      descricao.textContent = obra.descricao;
      item.appendChild(descricao);

      obras.appendChild(item);
    });

    conteudoPerfil.appendChild(obras);

    listaArtistas.hidden = true;
    perfil.hidden = false;

    if (fecharPerfil) fecharPerfil.focus();
  }

  if (fecharPerfil && perfil && listaArtistas) {
    fecharPerfil.addEventListener("click", function () {
      perfil.hidden = true;
      listaArtistas.hidden = false;
    });
  }

  // ==========================================
  // 7. ESTADO INICIAL
  // ==========================================

  if (visaoGeral && acervo && salao) {
    mostrarArea("visaoGeral");
  }

});
