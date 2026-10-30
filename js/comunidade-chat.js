
document.addEventListener("DOMContentLoaded", () => {
  // ELEMENTOS PRINCIPAIS
  const abas = document.querySelectorAll(".navegacao-chat button");
  const paineis = document.querySelectorAll(".painel-chat");

  const mensagensGlobal = document.getElementById("mensagensGlobal");
  const mensagensComunidade = document.getElementById("mensagensComunidade");
  const mensagensPrivadas = document.getElementById("mensagensPrivadas");

  const menuMensagem = document.getElementById("menuMensagem");

  let salaAtual = "desenho";
  let mensagemSelecionada = null;
  let respostaGlobal = null;
  let respostaComunidade = null;

  // TROCAR ENTRE AS ABAS GLOBAL, COMUNIDADE E CHAT
  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      const destino = aba.dataset.aba;

      abas.forEach((item) => item.classList.remove("ativo"));
      aba.classList.add("ativo");

      paineis.forEach((painel) => {
        painel.hidden = painel.id !== `painel-${destino}`;
      });

      fecharMenu();
    });
  });

  // ENVIAR MENSAGENS
  function configurarFormulario(formId, campoId, areaId, tipo) {
    const formulario = document.getElementById(formId);
    const campo = document.getElementById(campoId);
    const area = document.getElementById(areaId);

    if (!formulario || !campo || !area) return;

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();

      const texto = campo.value.trim();
      if (!texto) return;

      adicionarMensagem(area, {
        autor: "Você",
        texto,
        propria: true
      });

      campo.value = "";

      if (tipo === "global") respostaGlobal = null;
      if (tipo === "comunidade") respostaComunidade = null;

      atualizarResposta(tipo);
    });
  }

  function adicionarMensagem(area, dados) {
    const mensagem = document.createElement("div");
    mensagem.className = "mensagem";

    if (dados.propria) {
      mensagem.classList.add("propria");
    }

    mensagem.dataset.autor = dados.autor;
    mensagem.dataset.texto = dados.texto;

    if (dados.citada) {
      const citacao = document.createElement("div");
      citacao.className = "mensagem-citada";
      citacao.textContent = `${dados.citada.autor}: ${dados.citada.texto}`;
      mensagem.appendChild(citacao);
    }

    const autor = document.createElement("span");
    autor.className = "autor";
    autor.textContent = dados.autor;

    const conteudo = document.createElement("div");
    conteudo.className = "conteudo";
    conteudo.textContent = dados.texto;

    const horario = document.createElement("span");
    horario.className = "horario";
    horario.textContent = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    mensagem.append(autor, conteudo, horario);
    area.appendChild(mensagem);

    area.scrollTop = area.scrollHeight;

    configurarMenuDaMensagem(mensagem);
    return mensagem;
  }

  configurarFormulario(
    "formGlobal",
    "campoGlobal",
    "mensagensGlobal",
    "global"
  );

  configurarFormulario(
    "formComunidade",
    "campoComunidade",
    "mensagensComunidade",
    "comunidade"
  );

  configurarFormulario(
    "formPrivado",
    "campoPrivado",
    "mensagensPrivadas",
    "privado"
  );

  // TROCAR ENTRE AS SALAS DA COMUNIDADE
  const botoesZonas = document.querySelectorAll("[data-zona]");
  const nomeZona = document.getElementById("nomeZona");

  const nomesZonas = {
    desenho: "Desenho",
    pintura: "Pintura",
    aquarela: "Aquarela",
    grafite: "Grafite",
    tatuagem: "Tatuagem"
  };

  botoesZonas.forEach((botao) => {
    botao.addEventListener("click", () => {
      salaAtual = botao.dataset.zona;

      botoesZonas.forEach((item) => item.classList.remove("ativo"));
      botao.classList.add("ativo");

      if (nomeZona) {
        nomeZona.textContent = nomesZonas[salaAtual] || salaAtual;
      }

      // Por enquanto, cada sala começa vazia.
      if (mensagensComunidade) {
        mensagensComunidade.replaceChildren();
      }

      respostaComunidade = null;
      atualizarResposta("comunidade");
    });
  });

  // MENU DE AÇÕES: CLIQUE DIREITO E TOQUE PROLONGADO
  function configurarMenuDaMensagem(mensagem) {
    mensagem.addEventListener("contextmenu", (evento) => {
      evento.preventDefault();
      abrirMenu(evento.clientX, evento.clientY, mensagem);
    });

    let temporizador = null;
    let toqueMovido = false;

    mensagem.addEventListener("touchstart", (evento) => {
      toqueMovido = false;
      const toque = evento.touches[0];

      temporizador = setTimeout(() => {
        if (!toqueMovido) {
          abrirMenu(toque.clientX, toque.clientY, mensagem);
        }
      }, 550);
    }, { passive: true });

    mensagem.addEventListener("touchmove", () => {
      toqueMovido = true;
      clearTimeout(temporizador);
    }, { passive: true });

    mensagem.addEventListener("touchend", () => {
      clearTimeout(temporizador);
    });
  }

  function abrirMenu(x, y, mensagem) {
    if (!menuMensagem) return;

    mensagemSelecionada = mensagem;
    menuMensagem.hidden = false;

    const largura = 210;
    const altura = menuMensagem.offsetHeight || 230;

    menuMensagem.style.left =
      `${Math.min(x, window.innerWidth - largura - 10)}px`;

    menuMensagem.style.top =
      `${Math.min(y, window.innerHeight - altura - 10)}px`;
  }

  function fecharMenu() {
    if (menuMensagem) menuMensagem.hidden = true;
    mensagemSelecionada = null;
  }

  document.addEventListener("click", (evento) => {
    if (
      menuMensagem &&
      !menuMensagem.contains(evento.target) &&
      !evento.target.closest(".mensagem")
    ) {
      fecharMenu();
    }
  });

  // AÇÕES DO MENU
  if (menuMensagem) {
    menuMensagem.querySelectorAll("[data-acao]").forEach((botao) => {
      botao.addEventListener("click", () => {
        if (!mensagemSelecionada) return;

        const acao = botao.dataset.acao;
        const autor = mensagemSelecionada.dataset.autor;
        const texto = mensagemSelecionada.dataset.texto;

        if (acao === "responder") {
          const painel = mensagemSelecionada.closest("#mensagensGlobal")
            ? "global"
            : "comunidade";

          const dados = { autor, texto };

          if (painel === "global") {
            respostaGlobal = dados;
          } else {
            respostaComunidade = dados;
          }

          atualizarResposta(painel);
        }

        if (acao === "mencionar") {
          const painel = mensagemSelecionada.closest("#mensagensGlobal")
            ? "campoGlobal"
            : "campoComunidade";

          const campo = document.getElementById(painel);
          if (campo) {
            campo.value = `@${autor} `;
            campo.focus();
          }
        }

        if (acao === "privado") {
          const abaPrivado = document.querySelector(
            '[data-aba="privado"]'
          );

          if (abaPrivado) abaPrivado.click();

          const contato = document.getElementById("nomeContato");
          if (contato) contato.textContent = autor;
        }

        if (acao === "copiar") {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(texto).catch(() => {
              alert("Não foi possível copiar a mensagem.");
            });
          } else {
            alert("A cópia não está disponível neste navegador.");
          }
        }

        fecharMenu();
      });
    });

    menuMensagem.querySelectorAll("[data-reacao]").forEach((botao) => {
      botao.addEventListener("click", () => {
        if (!mensagemSelecionada) return;

        const emoji = botao.dataset.reacao;
        const reacoes = mensagemSelecionada.querySelector(".reacoes-aplicadas")
          || document.createElement("div");

        reacoes.className = "reacoes-aplicadas";
        reacoes.textContent += ` ${emoji}`;

        if (!reacoes.parentElement) {
          mensagemSelecionada.appendChild(reacoes);
        }

        fecharMenu();
      });
    });
  }

  // MOSTRAR A MENSAGEM QUE ESTÁ SENDO RESPONDIDA
  function atualizarResposta(tipo) {
    const elemento = document.getElementById(
      tipo === "global" ? "respostaSelecionada" : "respostaComunidade"
    );

    const dados = tipo === "global" ? respostaGlobal : respostaComunidade;

    if (!elemento) return;

    elemento.replaceChildren();

    if (!dados) {
      elemento.hidden = true;
      return;
    }

    elemento.hidden = false;
    elemento.textContent = `Respondendo a ${dados.autor}: ${dados.texto}`;
  }

  // MENSAGEM DE EXEMPLO PARA A CONVERSA PRIVADA
  const conversas = document.querySelectorAll(".conversa");

  conversas.forEach((conversa) => {
    conversa.addEventListener("click", () => {
      conversas.forEach((item) => item.classList.remove("ativa"));
      conversa.classList.add("ativa");

      const nome = conversa.querySelector("strong")?.textContent
        || conversa.textContent.trim();

      const contato = document.getElementById("nomeContato");
      if (contato) contato.textContent = nome;

      if (mensagensPrivadas) {
        mensagensPrivadas.replaceChildren();
      }
    });
  });

  // CONFIGURAR MENU NAS MENSAGENS QUE JÁ VIERAM NO HTML
  document.querySelectorAll(".mensagens-chat .mensagem").forEach((mensagem) => {
    if (!mensagem.dataset.autor) {
      const autor = mensagem.querySelector(".autor")?.textContent || "Usuário";
      const conteudo = mensagem.querySelector(".conteudo")?.textContent || "";

      mensagem.dataset.autor = autor;
      mensagem.dataset.texto = conteudo;
    }

    configurarMenuDaMensagem(mensagem);
  });

  // INÍCIO
  atualizarResposta("global");
  atualizarResposta("comunidade");
});
