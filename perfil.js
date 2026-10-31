
import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://nlqalpiksbqflzxzsgoa.supabase.co',
  'sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP'
);

// Elementos da página
const form = document.getElementById('profile-form');
const nome = document.getElementById('nome');
const nomeAtelie = document.getElementById('nome-atelie');
const areaAtuacao = document.getElementById('area-atuacao');
const bio = document.getElementById('bio');
const foto = document.getElementById('foto');
const photoPreview = document.getElementById('profile-photo');
const botaoEscolherFoto = document.getElementById('escolher-foto');
const status = document.getElementById('status');
const saveButton = document.getElementById('save-button');
const botaoSair = document.getElementById('botao-sair');
const seletorFoto = document.querySelector('.seletor-foto');
const iconeCamera = seletorFoto?.querySelector('.foto-editar');

// Verifica a permissão administrativa e encaminha administradores ao painel.
async function verificarAcessoModeracao() {
  const linkModeracao = document.getElementById('link-moderacao-perfil');

  try {
    const { data: sessao, error: erroSessao } = await supabase.auth.getSession();

    if (erroSessao || !sessao?.session?.user) return;

    const usuario = sessao.session.user;
    const { data, error } = await supabase
      .rpc('refugiart_is_admin');

    if (error) {
      console.warn('Não foi possível verificar a permissão administrativa:', error.message);
      return;
    }

    if (linkModeracao) linkModeracao.hidden = (data !== true);
  } catch (erro) {
    console.warn('Falha ao verificar acesso à moderação:', erro);
  }
}


// Configurações
const fotoPadrao =
  'https://placehold.co/160x160/e8dfca/40543c?text=Arte';

const tamanhoMaximo = 5 * 1024 * 1024;

const tiposPermitidos = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

let userId = null;
let arquivoFoto = null;
let urlPreviaLocal = null;
let fotoAtualUrl = null;

// Solicitações de amizade recebidas: aparecem no próprio perfil do destinatário.
const areaPedidosAmizade = document.getElementById('solicitacoes-recebidas-perfil');
const listaPedidosAmizade = document.getElementById('lista-solicitacoes-recebidas');

async function carregarSolicitacoesAmizadeRecebidas() {
  if (!userId || !areaPedidosAmizade || !listaPedidosAmizade) return;
  listaPedidosAmizade.replaceChildren();

  const { data: pedidos, error } = await supabase
    .from('atelie_friend_requests')
    .select('id, requester_id, created_at')
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Não foi possível carregar solicitações de amizade:', error.message);
    areaPedidosAmizade.hidden = true;
    return;
  }

  if (!pedidos?.length) {
    areaPedidosAmizade.hidden = true;
    return;
  }

  const ids = [...new Set(pedidos.map(p => p.requester_id))];
  const { data: perfis, error: erroPerfis } = await supabase
    .from('profiles')
    .select('id, nome_artistico, nome_atelie, biografia, area_atuacao, foto_url')
    .in('id', ids);

  if (erroPerfis) {
    console.warn('Não foi possível carregar os perfis dos solicitantes:', erroPerfis.message);
  }

  const mapaPerfis = new Map((perfis || []).map(p => [p.id, p]));

  pedidos.forEach(pedido => {
    const perfil = mapaPerfis.get(pedido.requester_id) || {};
    const cartao = document.createElement('article');
    cartao.className = 'pedido-amizade-perfil';

    const fotoSolicitante = document.createElement('img');
    fotoSolicitante.className = 'pedido-amizade-foto';
    fotoSolicitante.src = perfil.foto_url || fotoPadrao;
    fotoSolicitante.alt = 'Foto de ' + (perfil.nome_artistico || 'artista');
    fotoSolicitante.addEventListener('error', () => { fotoSolicitante.src = fotoPadrao; }, { once: true });

    const conteudo = document.createElement('div');
    conteudo.className = 'pedido-amizade-conteudo';
    const nomeSolicitante = document.createElement('strong');
    nomeSolicitante.textContent = perfil.nome_artistico || 'Artista RefugiART';
    const nomeAtelieSolicitante = document.createElement('span');
    nomeAtelieSolicitante.className = 'pedido-amizade-atelie';
    nomeAtelieSolicitante.textContent = perfil.nome_atelie || 'Ateliê';
    const bioSolicitante = document.createElement('p');
    bioSolicitante.textContent = perfil.biografia || perfil.area_atuacao || 'Este artista deseja se conectar com você na comunidade RefugiART.';
    const linkPerfil = document.createElement('a');
    linkPerfil.href = 'atelie.html?id=' + encodeURIComponent(pedido.requester_id);
    linkPerfil.textContent = 'Ver perfil';
    conteudo.append(nomeSolicitante, nomeAtelieSolicitante, bioSolicitante, linkPerfil);

    const acoes = document.createElement('div');
    acoes.className = 'pedido-amizade-acoes';
    const aceitar = document.createElement('button');
    aceitar.type = 'button';
    aceitar.textContent = 'Aceitar';
    const recusar = document.createElement('button');
    recusar.type = 'button';
    recusar.className = 'recusar';
    recusar.textContent = 'Recusar';

    aceitar.addEventListener('click', () => responderPedidoAmizade(pedido.id, 'accepted', cartao, aceitar, recusar));
    recusar.addEventListener('click', () => responderPedidoAmizade(pedido.id, 'rejected', cartao, aceitar, recusar));

    acoes.append(aceitar, recusar);
    cartao.append(fotoSolicitante, conteudo, acoes);
    listaPedidosAmizade.appendChild(cartao);
  });

  areaPedidosAmizade.hidden = false;
}

async function responderPedidoAmizade(id, novoStatus, cartao, aceitar, recusar) {
  aceitar.disabled = true;
  recusar.disabled = true;
  const { error } = await supabase
    .from('atelie_friend_requests')
    .update({ status: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_id', userId)
    .eq('status', 'pending');

  if (error) {
    mostrarStatus('Não foi possível responder à solicitação: ' + error.message);
    aceitar.disabled = false;
    recusar.disabled = false;
    return;
  }

  cartao.remove();
  if (!listaPedidosAmizade.children.length) areaPedidosAmizade.hidden = true;
  mostrarStatus(novoStatus === 'accepted' ? 'Amizade confirmada!' : 'Solicitação recusada.');
}

// Exibe mensagens
function mostrarStatus(mensagem) {
  if (status) status.textContent = mensagem;
}

// Controla a câmera e a classe do contêiner
function mostrarCamera(mostrar) {
  if (iconeCamera) {
    iconeCamera.style.setProperty(
      'display',
      mostrar ? 'grid' : 'none',
      'important'
    );
  }

  if (seletorFoto) {
    seletorFoto.classList.toggle('tem-foto', !mostrar);
  }
}

// Abre a galeria ao tocar na moldura
botaoEscolherFoto?.addEventListener('click', () => {
  foto?.click();
});

// Mostra a imagem escolhida antes de salvar
foto?.addEventListener('change', () => {
  const arquivo = foto.files?.[0];

  if (!arquivo) return;

  if (!tiposPermitidos[arquivo.type]) {
    foto.value = '';
    arquivoFoto = null;
    mostrarCamera(!fotoAtualUrl);

    mostrarStatus(
      'Formato inválido. Escolha JPG, PNG, WEBP ou GIF.'
    );
    return;
  }

  if (arquivo.size > tamanhoMaximo) {
    foto.value = '';
    arquivoFoto = null;
    mostrarCamera(!fotoAtualUrl);

    mostrarStatus(
      'A imagem ultrapassa 5 MB. Escolha uma imagem menor.'
    );
    return;
  }

  arquivoFoto = arquivo;

  if (urlPreviaLocal) {
    URL.revokeObjectURL(urlPreviaLocal);
  }

  urlPreviaLocal = URL.createObjectURL(arquivo);
  photoPreview.src = urlPreviaLocal;

  // A câmera some assim que a imagem é selecionada.
  mostrarCamera(false);

  mostrarStatus(
    'Foto selecionada! Clique em "Salvar meu perfil" para confirmar.'
  );
});

// Evita erro visual se uma imagem não carregar
photoPreview?.addEventListener('error', () => {
  if (photoPreview.src !== fotoPadrao) {
    photoPreview.src = fotoPadrao;
  }
});

// Carrega os dados da conta
async function carregarPerfil() {
  mostrarStatus('Verificando sua sessão...');

  try {
    const { data: sessao, error: erroSessao } =
      await supabase.auth.getSession();

    if (erroSessao) {
      mostrarStatus('Não foi possível verificar sua sessão.');
      return;
    }

    if (!sessao.session) {
      window.location.href = 'login.html';
      return;
    }

    const usuario = sessao.session.user;
    userId = usuario.id;
    await carregarSolicitacoesAmizadeRecebidas();

    mostrarStatus('Carregando seu perfil...');

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'nome_artistico, nome_atelie, biografia, foto_url'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      mostrarStatus(
        'Erro ao carregar perfil: ' + error.message
      );
      return;
    }

    const metadata = usuario.user_metadata || {};

    nome.value = data?.nome_artistico || metadata.nome || '';
    nomeAtelie.value = data?.nome_atelie || '';
    areaAtuacao.value = data?.area_atuacao || metadata.tipo_conta || '';
    bio.value = data?.biografia || '';

    fotoAtualUrl = data?.foto_url || null;
    photoPreview.src = fotoAtualUrl || fotoPadrao;

    // Foto salva: esconde a câmera.
    // Sem foto salva: mostra a câmera.
    mostrarCamera(!fotoAtualUrl);

    mostrarStatus(
      data
        ? 'Perfil carregado. Você já pode editar seus dados.'
        : 'Crie seu perfil artístico preenchendo os campos abaixo.'
    );
  } catch (erro) {
    console.error(erro);
    mostrarStatus('Ocorreu um erro ao carregar o perfil.');
  }
}

// Salva os dados e envia uma nova foto, se selecionada
form?.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!userId) {
    mostrarStatus(
      'Sua sessão não foi identificada. Entre novamente.'
    );
    return;
  }

  if (!form.reportValidity()) return;

  saveButton.disabled = true;
  mostrarStatus('Salvando seu perfil...');

  try {
    let fotoUrlSalva = fotoAtualUrl;

    // Envia a foto somente se uma nova foi escolhida
    if (arquivoFoto) {
      const extensao = tiposPermitidos[arquivoFoto.type];
      const caminho =
        `${userId}/perfil-${Date.now()}.${extensao}`;

      const { error: erroUpload } = await supabase.storage
        .from('profile-photos')
        .upload(caminho, arquivoFoto, {
          contentType: arquivoFoto.type,
          upsert: false
        });

      if (erroUpload) {
        mostrarStatus(
          'Erro ao enviar a foto: ' + erroUpload.message
        );
        return;
      }

      const { data: urlPublica } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(caminho);

      fotoUrlSalva = urlPublica.publicUrl;
    }

    const perfil = {
      id: userId,
      nome_artistico: nome.value.trim(),
      nome_atelie: nomeAtelie.value.trim(),
      area_atuacao: areaAtuacao.value,
      biografia: bio.value.trim(),
      foto_url: fotoUrlSalva,
      updated_at: new Date().toISOString()
    };

    const { error: erroSalvar } = await supabase
      .from('profiles')
      .upsert(perfil, { onConflict: 'id' });

    if (erroSalvar) {
      mostrarStatus(
        'Erro ao salvar perfil: ' + erroSalvar.message
      );
      return;
    }

    // Atualiza o estado local após salvar
    fotoAtualUrl = fotoUrlSalva;
    arquivoFoto = null;
    foto.value = '';

    if (urlPreviaLocal) {
      URL.revokeObjectURL(urlPreviaLocal);
      urlPreviaLocal = null;
    }

    photoPreview.src = fotoAtualUrl || fotoPadrao;
    mostrarCamera(!fotoAtualUrl);

    mostrarStatus(
      'Seu perfil artístico foi salvo com sucesso!'
    );
  } catch (erro) {
    console.error(erro);
    mostrarStatus(
      'Ocorreu um erro inesperado ao salvar o perfil.'
    );
  } finally {
    saveButton.disabled = false;
  }
});

// Encerra a sessão da conta.
botaoSair?.addEventListener('click', async () => {
  botaoSair.disabled = true;
  mostrarStatus('Saindo da sua conta...');
  const { error } = await supabase.auth.signOut();
  if (error) {
    mostrarStatus('Não foi possível sair: ' + error.message);
    botaoSair.disabled = false;
    return;
  }
  window.location.href = 'login.html';
});

// Inicia a página
mostrarCamera(true);
carregarPerfil();
verificarAcessoModeracao();
