
document.addEventListener("DOMContentLoaded", () => {
  const abas = document.querySelectorAll(".aba-chat");
  const paineis = document.querySelectorAll(".painel-chat");
  const menu = document.getElementById("menuMensagem");

  let mensagemSelecionada = null;
  let respostaGlobal = null;
  let respostaComunidade = null;
  let contatoAtual = null;

  const nomesZonas = {
    desenho: "✏️ Desenho",
    pintura: "🎨 Pintura",
    aquarela: "🖌️ Aquarela",
    grafite: "🧱 Grafite",
    tatuagem: "✒️ Tatuagem"
  };

  const historicoPrivado = {};

  // =====================================
  // ABAS PRINCIPAIS
  // =====================================

  abas.forEach(botao => {
    botao.addEventListener("click", () => {
      const destino = botao.dataset.aba;

      abas.forEach(aba => aba.classList.remove("ativa"));
      botao.classList.add("ativa");

      paineis.forEach(painel => {
        painel.hidden = painel.id !== `painel-${destino}`;
        painel.classList.toggle("ativo", !painel.hidden);
      });

      fecharMenu();
    });
  });

  // =====================================
  // CRIAR MENSAGENS
  // =====================================

  function criarMensagem(area, autor, texto, propria = false, citada = null) {
    const mensagem = document.createElement("article");
    mensagem.className = "mensagem";
    mensagem.dataset.autor = autor;
    mensagem.dataset.texto = texto;

    if (propria) mensagem.classList.add("propria");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = autor.charAt(0).toUpperCase();

    const corpo = document.createElement("div");
    corpo.className = "corpo-mensagem";

    if (citada) {
      const citacao = document.createElement("div");
      citacao.className = "mensagem-citada";
      citacao.textContent = `${citada.autor}: ${citada.texto}`;
      corpo.appendChild(citacao);
    }

    const identificacao = document.createElement("div");
    identificacao.className = "identificacao";

    const nome = document.createElement("strong");
    nome.textContent = autor;

    const horario = document.createElement("span");
    horario.textContent = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    identificacao.append(nome, horario);

    const balao = document.createElement("div");
    balao.className = "balao-mensagem";
    balao.textContent = texto;

    const reacoes = document.createElement("div");
    reacoes.className = "reacoes-mensagem";

    corpo.append(identificacao, balao, reacoes);
    mensagem.append(avatar, corpo);

    area.appendChild(mensagem);
    area.scrollTop = area.scrollHeight;

    configurarMensagem(mensagem);

    return mensagem;
  }

  // =====================================
  // ENVIO DE MENSAGENS
  // =====================================

  function configurarEnvio(formId, campoId, areaId, tipo) {
    const form = document.getElementById(formId);
    const campo = document.getElementById(campoId);
    const area = document.getElementById(areaId);

    if (!form || !campo || !area) return;

    form.addEventListener("submit", evento => {
      evento.preventDefault();

      const texto = campo.value.trim();
      if (!texto) return;

      if (tipo === "privado" && !contatoAtual) {
        alert("Selecione uma conversa primeiro.");
        return;
      }

      let citada = null;

      if (tipo === "global") {
        citada = respostaGlobal;
        respostaGlobal = null;
        atualizarResposta("global");
      }

      if (tipo === "comunidade") {
        citada = respostaComunidade;
        respostaComunidade = null;
        atualizarResposta("comunidade");
      }

      criarMensagem(area, "Você", texto, true, citada);
      campo.value = "";

      if (tipo === "privado" && contatoAtual) {
        historicoPrivado[contatoAtual] = area.innerHTML;
      }
    });
  }

  configurarEnvio("formGlobal", "campoGlobal", "mensagensGlobal", "global");
  configurarEnvio("formComunidade", "campoComunidade", "mensagensComunidade", "comunidade");
  configurarEnvio("formPrivado", "campoPrivado", "mensagensPrivadas", "privado");

  // =====================================
  // TROCA DE SALAS
  // =====================================

  const botoesZonas = document.querySelectorAll(".zona-interesse");
  const nomeZona = document.getElementById("nomeZona");
  const campoComunidade = document.getElementById("campoComunidade");

  const mensagensPorZona = {};

  botoesZonas.forEach(botao => {
    botao.addEventListener("click", () => {
      const zona = botao.dataset.zona;

      botoesZonas.forEach(item => item.classList.remove("ativa"));
      botao.classList.add("ativa");

      if (nomeZona) {
        nomeZona.textContent = nomesZonas[zona] || zona;
      }

      if (campoComunidade) {
        campoComunidade.placeholder = `Mensagem em ${zona}...`;
      }

      const area = document.getElementById("mensagensComunidade");

      if (area) {
        mensagensPorZona[salaAtual] = area.innerHTML;
        area.innerHTML = mensagensPorZona[zona] || "";
        configurarMensagensExistentes(area);
      }

      salaAtual = zona;
      respostaComunidade = null;
      atualizarResposta("comunidade");
    });
  });

  let salaAtual = "desenho";

  // =====================================
  // RESPOSTAS
  // =====================================

  function atualizarResposta(tipo) {
    const dados = tipo === "global" ? respostaGlobal : respostaComunidade;

    const elemento = document.getElementById(
      tipo === "global" ? "respostaSelecionada" : "respostaComunidade"
    );

    const autor = document.getElementById(
      tipo === "global" ? "respostaAutor" : "autorRespostaComunidade"
    );

    const texto = document.getElementById(
      tipo === "global" ? "respostaTexto" : "textoRespostaComunidade"
    );

    if (!elemento) return;

    elemento.hidden = !dados;

    if (dados) {
      if (autor) autor.textContent = dados.autor;
      if (texto) texto.textContent = dados.texto;
    }
  }

  document.getElementById("cancelarResposta")?.addEventListener("click", () => {
    respostaGlobal = null;
    atualizarResposta("global");
  });

  document.getElementById("cancelarRespostaComunidade")?.addEventListener("click", () => {
    respostaComunidade = null;
    atualizarResposta("comunidade");
  });

  // =====================================
  // CONVERSAS PRIVADAS
  // =====================================

  const conversas = document.querySelectorAll(".item-conversa");

  conversas.forEach(botao => {
    botao.addEventListener("click", () => selecionarContato(botao.dataset.usuario));
  });

  function selecionarContato(nome) {
    contatoAtual = nome;

    const nomeContato = document.getElementById("nomeContato");
    const statusContato = document.getElementById("statusContato");
    const campo = document.getElementById("campoPrivado");
    const enviar = document.querySelector("#formPrivado .botao-enviar");
    const area = document.getElementById("mensagensPrivadas");

    if (nomeContato) nomeContato.textContent = nome;
    if (statusContato) statusContato.textContent = "Conversa privada";
    if (campo) campo.disabled = false;
    if (enviar) enviar.disabled = false;

    document.querySelectorAll(".item-conversa").forEach(item => {
      item.classList.toggle("ativa", item.dataset.usuario === nome);
    });

    if (area) {
      area.innerHTML = historicoPrivado[nome] || "";
      configurarMensagensExistentes(area);
    }
  }

  // =====================================
  // MENU DE MENSAGENS
  // =====================================

 
function configurarMensagem(mensagem) {
  // Abre o menu ao clicar no nome ou no avatar
  const nome = mensagem.querySelector(".identificacao strong");
  const avatar = mensagem.querySelector(".avatar");

  [nome, avatar].forEach(elemento => {
    if (!elemento) return;

    elemento.style.cursor = "pointer";

    elemento.addEventListener("click", evento => {
      evento.stopPropagation();

      const retangulo = elemento.getBoundingClientRect();
      abrirMenu(
        retangulo.left,
        retangulo.bottom + 5,
        mensagem
      );
    });
  });

  // Mantém o menu de clique direito no computador
  mensagem.addEventListener("contextmenu", evento => {
    evento.preventDefault();
    abrirMenu(evento.clientX, evento.clientY, mensagem);
  });

  // Mantém o menu de toque prolongado no celular
  let temporizador;
  let movimento = false;

  mensagem.addEventListener("touchstart", evento => {
    movimento = false;
    const toque = evento.touches[0];

    temporizador = setTimeout(() => {
      if (!movimento) {
        abrirMenu(toque.clientX, toque.clientY, mensagem);
      }
    }, 550);
  }, { passive: true });

  mensagem.addEventListener("touchmove", () => {
    movimento = true;
    clearTimeout(temporizador);
  }, { passive: true });

  mensagem.addEventListener("touchend", () => {
    clearTimeout(temporizador);
  });

  // Adiciona botão de curtir diretamente na mensagem
  const areaReacoes = mensagem.querySelector(".reacoes-mensagem");

  if (areaReacoes && !areaReacoes.querySelector("[data-like]")) {
    const curtir = document.createElement("button");

    curtir.type = "button";
    curtir.dataset.like = "true";
    curtir.className = "botao-curtir";
    curtir.textContent = "♡ Curtir";
    curtir.setAttribute("aria-label", "Curtir mensagem");

    curtir.addEventListener("click", evento => {
      evento.stopPropagation();

      const curtido = curtir.dataset.curtido === "true";

      curtir.dataset.curtido = String(!curtido);
      curtir.classList.toggle("curtido", !curtido);
      curtir.textContent = !curtido ? "❤️ 1" : "♡ Curtir";
    });

    areaReacoes.prepend(curtir);
  }
}


  function configurarMensagensExistentes(area) {
    area.querySelectorAll(".mensagem").forEach(mensagem => {
      if (mensagem.dataset.menuConfigurado) return;

      const nome = mensagem.querySelector(".identificacao strong")?.textContent || "Usuário";
      const texto = mensagem.querySelector(".balao-mensagem")?.textContent || "";

      mensagem.dataset.autor = mensagem.dataset.autor || nome;
      mensagem.dataset.texto = mensagem.dataset.texto || texto;
      mensagem.dataset.menuConfigurado = "true";

      configurarMensagem(mensagem);
    });
  }

  function abrirMenu(x, y, mensagem) {
    if (!menu) return;

    mensagemSelecionada = mensagem;
    menu.hidden = false;

    const largura = menu.offsetWidth || 210;
    const altura = menu.offsetHeight || 230;

    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - largura - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - altura - 8))}px`;
  }

  function fecharMenu() {
    if (menu) menu.hidden = true;
    mensagemSelecionada = null;
  }

  document.addEventListener("click", evento => {
    if (
      menu &&
      !menu.contains(evento.target) &&
      !evento.target.closest(".mensagem")
    ) {
      fecharMenu();
    }
  });

  // =====================================
  // AÇÕES DO MENU
  // =====================================

  menu?.querySelectorAll("[data-acao]").forEach(botao => {
    botao.addEventListener("click", () => {
      if (!mensagemSelecionada) return;

      const autor = mensagemSelecionada.dataset.autor;
      const texto = mensagemSelecionada.dataset.texto;
      const acao = botao.dataset.acao;

      if (acao === "responder") {
        const global = mensagemSelecionada.closest("#mensagensGlobal");

        if (global) {
          respostaGlobal = { autor, texto };
          abas[0]?.click();
          atualizarResposta("global");
        } else if (mensagemSelecionada.closest("#mensagensComunidade")) {
          respostaComunidade = { autor, texto };
          abas[1]?.click();
          atualizarResposta("comunidade");
        }
      }

      if (acao === "mencionar") {
        const global = mensagemSelecionada.closest("#mensagensGlobal");
        const campo = document.getElementById(
          global ? "campoGlobal" : "campoComunidade"
        );

        if (campo) {
          campo.value = `@${autor} `;
          campo.focus();
        }
      }

      if (acao === "privado") {
        const abaPrivado = document.querySelector('[data-aba="privado"]');
        abaPrivado?.click();

        let conversa = document.querySelector(
          `.item-conversa[data-usuario="${CSS.escape(autor)}"]`
        );

        if (!conversa) {
          const lista = document.getElementById("listaConversas");

          if (lista) {
            conversa = document.createElement("button");
            conversa.type = "button";
            conversa.className = "item-conversa";
            conversa.dataset.usuario = autor;

            const avatar = document.createElement("div");
            avatar.className = "avatar";
            avatar.textContent = autor.charAt(0).toUpperCase();

            const dados = document.createElement("div");
            const nome = document.createElement("strong");
            nome.textContent = autor;
            const previa = document.createElement("p");
            previa.textContent = "Nova conversa";

            dados.append(nome, previa);
            conversa.append(avatar, dados);
            lista.appendChild(conversa);
            conversa.addEventListener("click", () => selecionarContato(autor));
          }
        }

        selecionarContato(autor);
      }

      if (acao === "copiar") {
        navigator.clipboard?.writeText(texto)
          .then(() => alert("Mensagem copiada!"))
          .catch(() => alert("Não foi possível copiar a mensagem."));
      }

      fecharMenu();
    });
  });

  menu?.querySelectorAll("[data-reacao]").forEach(botao => {
    botao.addEventListener("click", () => {
      if (!mensagemSelecionada) return;

      const area = mensagemSelecionada.querySelector(".reacoes-mensagem");
      const emoji = botao.dataset.reacao;

      if (area) {
        const reacao = document.createElement("span");
        reacao.textContent = emoji;
        area.appendChild(reacao);
      }

      fecharMenu();
    });
  });

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  document.querySelectorAll(".lista-mensagens").forEach(area => {
    configurarMensagensExistentes(area);
  });

  atualizarResposta("global");
  atualizarResposta("comunidade");
});