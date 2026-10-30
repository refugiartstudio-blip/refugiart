
document.addEventListener("DOMContentLoaded", async () => {
  const SUPABASE_URL = "https://nlqalpiksbqflzxzsgoa.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP";
  let supabase = null;
  let usuarioAtual = null;
  let nomeAtual = "Artista";
  let canalChat = null;

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      alert("Entre na sua conta RefugiART para usar o chat.");
      window.location.href = "login.html";
      return;
    }
    usuarioAtual = user;
    const { data: perfil } = await supabase.from("profiles")
      .select("nome_artistico").eq("id", user.id).maybeSingle();
    nomeAtual = perfil?.nome_artistico || user.user_metadata?.nome || user.email?.split("@")[0] || "Artista";
    const nomeTopo = document.getElementById("nomeUsuario");
    if (nomeTopo) nomeTopo.textContent = nomeAtual;
  } catch (erro) {
    console.error("Falha ao iniciar o chat:", erro);
    alert("Não foi possível conectar ao chat. Tente novamente.");
    return;
  }
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
    leitura: "📚 Leitura",
    digital: "💻 Digital",
    tatuagem: "✒️ Tatuagem"
  };

  const historicoPrivado = {};

  function mostrarVazio(area, texto) {
    area.innerHTML = "";
    const estado = document.createElement("div");
    estado.className = "estado-vazio";
    const paragrafo = document.createElement("p");
    paragrafo.textContent = texto;
    estado.appendChild(paragrafo);
    area.appendChild(estado);
  }

  async function carregarMensagens(tipo, chave, area) {
    if (!supabase || !area) return;
    const { data, error } = await supabase.from("chat_messages")
      .select("id, user_id, content, created_at, room_type, room_key")
      .eq("room_type", tipo).eq("room_key", chave)
      .order("created_at", { ascending: true }).limit(200);
    if (error) {
      console.error("Erro ao carregar mensagens:", error);
      mostrarVazio(area, "Não foi possível carregar as mensagens.");
      return;
    }
    const ids = [...new Set((data || []).map(m => m.user_id))];
    let perfis = {};
    if (ids.length) {
      const { data: listaPerfis } = await supabase.from("profiles")
        .select("id, nome_artistico").in("id", ids);
      (listaPerfis || []).forEach(p => perfis[p.id] = p.nome_artistico || "Artista");
    }
    area.innerHTML = "";
    if (!data?.length) {
      mostrarVazio(area, tipo === "global" ? "Ainda não há mensagens no chat global." : "Ainda não há mensagens nesta comunidade.");
      return;
    }
    data.forEach(m => {
      const autor = m.user_id === usuarioAtual.id ? nomeAtual : (perfis[m.user_id] || "Artista");
      criarMensagem(area, autor, m.content, m.user_id === usuarioAtual.id);
      const elemento = area.lastElementChild;
      elemento.dataset.messageId = m.id;
      const horario = elemento.querySelector(".identificacao span");
      if (horario) horario.textContent = new Date(m.created_at).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
    });
    await carregarReacoes(data.map(m => m.id), area);
    area.scrollTop = area.scrollHeight;
  }

  async function carregarReacoes(messageIds, area) {
    if (!messageIds.length) return;
    const { data, error } = await supabase.from("chat_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", messageIds);
    if (error) {
      console.error("Erro ao carregar reações:", error);
      return;
    }
    const porMensagem = {};
    (data || []).forEach(r => {
      (porMensagem[r.message_id] ||= []).push(r);
    });
    area.querySelectorAll(".mensagem[data-message-id]").forEach(mensagem => {
      desenharReacoes(mensagem, porMensagem[mensagem.dataset.messageId] || []);
    });
  }

  function desenharReacoes(mensagem, registros) {
    const area = mensagem.querySelector(".reacoes-mensagem");
    if (!area) return;
    const curtir = area.querySelector("[data-like]");
    area.querySelectorAll(".resumo-reacao").forEach(el => el.remove());
    const agrupadas = {};
    registros.forEach(r => {
      if (!agrupadas[r.emoji]) agrupadas[r.emoji] = { total: 0, minha: false };
      agrupadas[r.emoji].total++;
      if (r.user_id === usuarioAtual.id) agrupadas[r.emoji].minha = true;
    });
    Object.entries(agrupadas).forEach(([emoji, info]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "resumo-reacao" + (info.minha ? " minha-reacao" : "");
      item.textContent = emoji + " " + info.total;
      item.title = info.minha ? "Remover sua reação" : "Reagir com " + emoji;
      item.addEventListener("click", () => alternarReacao(mensagem, emoji));
      area.appendChild(item);
    });
    if (curtir) {
      const minhaCurtida = registros.some(r => r.user_id === usuarioAtual.id && r.emoji === "❤️");
      const total = registros.filter(r => r.emoji === "❤️").length;
      curtir.dataset.curtido = String(minhaCurtida);
      curtir.classList.toggle("curtido", minhaCurtida);
      curtir.textContent = total ? "❤️ " + total : "♡ Curtir";
    }
  }

  async function alternarReacao(mensagem, emoji) {
    const messageId = mensagem.dataset.messageId;
    if (!messageId) return;
    const { data: existente, error: erroBusca } = await supabase.from("chat_reactions")
      .select("id, emoji").eq("message_id", messageId).eq("user_id", usuarioAtual.id).maybeSingle();
    if (erroBusca) {
      console.error("Erro ao consultar reação:", erroBusca);
      alert("Não foi possível atualizar a reação.");
      return;
    }
    let resultado;
    if (existente?.emoji === emoji) {
      resultado = await supabase.from("chat_reactions").delete()
        .eq("message_id", messageId).eq("user_id", usuarioAtual.id);
    } else if (existente) {
      resultado = await supabase.from("chat_reactions").update({ emoji })
        .eq("message_id", messageId).eq("user_id", usuarioAtual.id);
    } else {
      resultado = await supabase.from("chat_reactions").insert({
        message_id: messageId, user_id: usuarioAtual.id, emoji
      });
    }
    if (resultado.error) {
      console.error("Erro ao salvar reação:", resultado.error);
      alert("Não foi possível salvar a reação.");
      return;
    }
    const { data: reacoes, error } = await supabase.from("chat_reactions")
      .select("message_id, user_id, emoji").eq("message_id", messageId);
    if (!error) desenharReacoes(mensagem, reacoes || []);
  }

  async function enviarMensagem(tipo, chave, texto) {
    const registro = {
      user_id: usuarioAtual.id,
      content: texto,
      room_type: tipo,
      room_key: chave,
      recipient_id: null
    };
    const { error } = await supabase.from("chat_messages").insert(registro);
    if (error) {
      console.error("Erro ao enviar mensagem:", error);
      alert("Não foi possível enviar: " + error.message);
      return false;
    }
    return true;
  }

  async function atualizarSalas() {
    await carregarMensagens("global", "global", document.getElementById("mensagensGlobal"));
    await carregarMensagens("comunidade", salaAtual, document.getElementById("mensagensComunidade"));
    if (canalChat) await supabase.removeChannel(canalChat);
    canalChat = supabase.channel("refugiart-chat-publico")
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"chat_messages"}, async payload => {
        const m = payload.new;
        if (m.room_type === "global") {
          await carregarMensagens("global", "global", document.getElementById("mensagensGlobal"));
        } else if (m.room_type === "comunidade" && m.room_key === salaAtual) {
          await carregarMensagens("comunidade", salaAtual, document.getElementById("mensagensComunidade"));
        }
      }).subscribe();
  }

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

    form.addEventListener("submit", async evento => {
      evento.preventDefault();
      const texto = campo.value.trim();
      if (!texto) return;
      if (tipo === "privado") {
        alert("As conversas privadas serão conectadas na próxima etapa.");
        return;
      }
      const chave = tipo === "global" ? "global" : salaAtual;
      const enviado = await enviarMensagem(tipo, chave, texto);
      if (!enviado) return;
      campo.value = "";
      if (tipo === "global") {
        respostaGlobal = null;
        atualizarResposta("global");
      } else {
        respostaComunidade = null;
        atualizarResposta("comunidade");
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

      salaAtual = zona;
      const area = document.getElementById("mensagensComunidade");
      carregarMensagens("comunidade", salaAtual, area);
      respostaComunidade = null;
      atualizarResposta("comunidade");
    });
  });

  let salaAtual = "desenho";
  atualizarSalas();

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
      alternarReacao(mensagem, "❤️");
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

      if (area) alternarReacao(mensagemSelecionada, emoji);
      fecharMenu();
    });
  });

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  document.querySelectorAll(".lista-mensagens").forEach(area => {
    configurarMensagensExistentes(area);
  });


  // SELETOR DE EMOJIS — MODELO 2
  const gruposEmojis = {
    recentes: ["😂","❤️","🙏","☕","🔥","😍","👏","🎨","🖌️","🌻","✨","🤔","😎","🥰","🙌","💚","😭","🤣"],
    rostos: ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","😊","😍","🥰","😘","😎","🤔","😴","😭","😡","🤗","🤩","🥳","😇","😌","🙃"],
    gestos: ["👋","🤚","✋","👌","🤌","🤏","✌️","🤞","🫶","👏","🙌","🙏","💪","👍","👎","🤝","☝️","👇"],
    coracoes: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","💕","💞","💓","💗","💖","💘","💝","💟"],
    comida: ["☕","🍵","🥐","🍞","🧀","🍎","🍓","🍉","🍕","🍔","🍟","🍰","🍫","🍩","🥑","🍇"],
    natureza: ["🌱","🌿","🍀","🌻","🌷","🌹","🌳","🌴","🌵","🍃","🌎","🌙","⭐","🌈","🦋","🐝","🐢","🐦"],
    arte: ["🎨","🖌️","🖍️","✏️","🖋️","🎭","🎬","📷","🎼","🎸","🧵","🧶","🖼️","📚","💡","✨"]
  };
  const iconesCategorias = [["recentes","⏱"],["rostos","😀"],["gestos","👋"],["coracoes","❤️"],["comida","☕"],["natureza","🌿"],["arte","🎨"]];

  document.querySelectorAll(".formulario-mensagem").forEach(form => {
    const botao = form.querySelector(".botao-emojis");
    const campo = form.querySelector("input");
    if (!botao || !campo) return;
    const painel = document.createElement("div");
    painel.className = "seletor-emojis";
    painel.hidden = true;
    const categorias = document.createElement("div");
    categorias.className = "categorias-emojis";
    const busca = document.createElement("input");
    busca.className = "busca-emojis";
    busca.type = "search";
    busca.placeholder = "Pesquisar emoji...";
    busca.setAttribute("aria-label", "Pesquisar emoji");
    const grade = document.createElement("div");
    grade.className = "grade-emojis";
    painel.append(categorias, busca, grade);
    form.appendChild(painel);
    let categoriaAtual = "recentes";

    function desenharEmojis() {
      const termo = busca.value.trim();
      const lista = termo ? [...new Set(Object.values(gruposEmojis).flat())].filter(e => e.includes(termo)) : gruposEmojis[categoriaAtual];
      grade.innerHTML = "";
      lista.forEach(emoji => {
        const item = document.createElement("button");
        item.type = "button"; item.textContent = emoji;
        item.addEventListener("click", () => {
          const inicio = campo.selectionStart ?? campo.value.length;
          const fim = campo.selectionEnd ?? campo.value.length;
          campo.value = campo.value.slice(0, inicio) + emoji + campo.value.slice(fim);
          const pos = inicio + emoji.length;
          campo.focus(); campo.setSelectionRange(pos, pos);
          painel.hidden = true; botao.setAttribute("aria-expanded", "false");
          campo.dispatchEvent(new Event("input", { bubbles: true }));
        });
        grade.appendChild(item);
      });
    }
    function desenharCategorias() {
      categorias.innerHTML = "";
      iconesCategorias.forEach(([nome, icone]) => {
        const item = document.createElement("button");
        item.type = "button"; item.textContent = icone; item.title = nome;
        item.setAttribute("aria-label", "Categoria " + nome);
        item.classList.toggle("ativa", nome === categoriaAtual);
        item.addEventListener("click", () => { categoriaAtual = nome; busca.value = ""; desenharCategorias(); desenharEmojis(); });
        categorias.appendChild(item);
      });
    }
    botao.addEventListener("click", () => {
      const abrir = painel.hidden;
      document.querySelectorAll(".seletor-emojis").forEach(outro => {
        outro.hidden = true;
        outro.parentElement.querySelector(".botao-emojis")?.setAttribute("aria-expanded", "false");
      });
      painel.hidden = !abrir;
      botao.setAttribute("aria-expanded", String(abrir));
    });
    busca.addEventListener("input", desenharEmojis);
    document.addEventListener("click", evento => {
      const clicouEmTopico = evento.target.closest(".zona-interesse");
      if (!form.contains(evento.target) && !clicouEmTopico) return;
      if (clicouEmTopico) return;
      // Fecha somente quando o clique acontece fora do formulário e dos tópicos.
      if (!form.contains(evento.target)) {
        painel.hidden = true;
        botao.setAttribute("aria-expanded", "false");
      }
    });
    desenharCategorias(); desenharEmojis();
  });

  atualizarResposta("global");
  atualizarResposta("comunidade");
});