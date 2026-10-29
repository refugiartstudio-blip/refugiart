
import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://nlqalpiksbqflzxzsgoa.supabase.co',
  'sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP'
);

// Elementos da página
const form = document.getElementById('profile-form');
const nome = document.getElementById('nome');
const area = document.getElementById('area');
const bio = document.getElementById('bio');
const foto = document.getElementById('foto');
const photoPreview = document.getElementById('profile-photo');
const botaoEscolherFoto =
  document.getElementById('escolher-foto');
const status = document.getElementById('status');
const saveButton = document.getElementById('save-button');

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

// Exibe mensagens na página
function mostrarStatus(mensagem) {
  status.textContent = mensagem;
}

// Abre a galeria ao tocar na moldura
botaoEscolherFoto.addEventListener('click', () => {
  foto.click();
});

// Mostra a imagem escolhida antes de salvar
foto.addEventListener('change', () => {
  const arquivo = foto.files?.[0];

  if (!arquivo) return;

  if (!tiposPermitidos[arquivo.type]) {
    mostrarStatus(
      'Formato inválido. Escolha uma imagem JPG, PNG, WEBP ou GIF.'
    );
    foto.value = '';
    arquivoFoto = null;
    return;
  }

  if (arquivo.size > tamanhoMaximo) {
    mostrarStatus(
      'A imagem ultrapassa 5 MB. Escolha uma imagem menor.'
    );
    foto.value = '';
    arquivoFoto = null;
    return;
  }

  arquivoFoto = arquivo;

  if (urlPreviaLocal) {
    URL.revokeObjectURL(urlPreviaLocal);
  }

  urlPreviaLocal = URL.createObjectURL(arquivo);
  photoPreview.src = urlPreviaLocal;

  mostrarStatus(
    'Foto selecionada! Clique em "Salvar meu perfil" para confirmar.'
  );
});

// Evita erro visual se uma imagem não carregar
photoPreview.addEventListener('error', () => {
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
        'nome_artistico, biografia, area_atuacao, foto_url'
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

    nome.value =
      data?.nome_artistico || metadata.nome || '';

    area.value = data?.area_atuacao || '';
    bio.value = data?.biografia || '';

    fotoAtualUrl = data?.foto_url || null;
    photoPreview.src = fotoAtualUrl || fotoPadrao;

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
form.addEventListener('submit', async (evento) => {
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

    // Envia a foto somente quando uma nova imagem foi escolhida
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

    // Monta os dados do perfil
    const perfil = {
      id: userId,
      nome_artistico: nome.value.trim(),
      area_atuacao: area.value.trim(),
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

    mostrarStatus('Seu perfil artístico foi salvo com sucesso!');
  } catch (erro) {
    console.error(erro);
    mostrarStatus('Ocorreu um erro inesperado ao salvar o perfil.');
  } finally {
    saveButton.disabled = false;
  }
});

// Inicia a página
carregarPerfil();
