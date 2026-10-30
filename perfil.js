
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
const bio = document.getElementById('bio');
const foto = document.getElementById('foto');
const photoPreview = document.getElementById('profile-photo');
const botaoEscolherFoto = document.getElementById('escolher-foto');
const status = document.getElementById('status');
const saveButton = document.getElementById('save-button');
const botaoSair = document.getElementById('botao-sair');
const seletorFoto = document.querySelector('.seletor-foto');
const iconeCamera = seletorFoto?.querySelector('.foto-editar');

// Exibe o atalho de moderação somente para contas cadastradas como administradoras.
async function verificarAcessoModeracao() {
  const linkModeracao = document.getElementById('link-moderacao-perfil');
  if (!linkModeracao) return;

  try {
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao?.session?.user;
    if (!usuario) return;

    const { data, error } = await supabase
      .from('refugiart_admins')
      .select('user_id')
      .eq('user_id', usuario.id)
      .maybeSingle();

    if (error) {
      console.warn('Não foi possível verificar a permissão administrativa:', error.message);
      return;
    }

    linkModeracao.hidden = !data;
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
