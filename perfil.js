
import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://nlqalpiksbqflzxzsgoa.supabase.co',
  'sb_publishable_BpJHFuq0WQaH5hGYOuC20Q_grO6loaP'
);

const form = document.getElementById('profile-form');
const nome = document.getElementById('nome');
const area = document.getElementById('area');
const bio = document.getElementById('bio');
const foto = document.getElementById('foto');
const photoPreview = document.getElementById('profile-photo');
const status = document.getElementById('status');
const saveButton = document.getElementById('save-button');

const fotoPadrao =
  'https://placehold.co/160x160/e8dfca/40543c?text=Arte';

let userId = null;

function mostrarStatus(mensagem) {
  status.textContent = mensagem;
}

function atualizarFoto() {
  const url = foto.value.trim();

  if (!url) {
    photoPreview.src = fotoPadrao;
    return;
  }

  try {
    const endereco = new URL(url);

    if (endereco.protocol !== 'https:' &&
        endereco.protocol !== 'http:') {
      photoPreview.src = fotoPadrao;
      return;
    }

    photoPreview.src = endereco.href;
  } catch {
    photoPreview.src = fotoPadrao;
  }
}

foto.addEventListener('input', atualizarFoto);

photoPreview.addEventListener('error', () => {
  if (photoPreview.src !== fotoPadrao) {
    photoPreview.src = fotoPadrao;
  }
});

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

    mostrarStatus('Carregando seus dados...');

    const { data, error } = await supabase
      .from('profiles')
      .select('nome_artistico, biografia, area_atuacao, foto_url')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      mostrarStatus('Erro ao carregar perfil: ' + error.message);
      return;
    }

    const metadata = usuario.user_metadata || {};

    nome.value = data?.nome_artistico || metadata.nome || '';
    area.value = data?.area_atuacao || '';
    bio.value = data?.biografia || '';
    foto.value = data?.foto_url || '';

    atualizarFoto();

    mostrarStatus(
      data
        ? 'Perfil carregado. Você já pode editar seus dados.'
        : 'Vamos criar seu perfil artístico. Preencha os campos e salve.'
    );
  } catch (erro) {
    mostrarStatus('Erro inesperado ao carregar o perfil.');
    console.error(erro);
  }
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!userId) {
    mostrarStatus('Sua sessão não foi identificada. Entre novamente.');
    return;
  }

  if (!form.reportValidity()) return;

  saveButton.disabled = true;
  mostrarStatus('Salvando seu perfil...');

  try {
    const perfil = {
      id: userId,
      nome_artistico: nome.value.trim(),
      biografia: bio.value.trim(),
      area_atuacao: area.value.trim(),
      foto_url: foto.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(perfil, { onConflict: 'id' });

    if (error) {
      mostrarStatus('Erro ao salvar: ' + error.message);
      return;
    }

    mostrarStatus('Seu perfil artístico foi salvo com sucesso!');
  } catch (erro) {
    mostrarStatus('Ocorreu um erro inesperado ao salvar.');
    console.error(erro);
  } finally {
    saveButton.disabled = false;
  }
});

carregarPerfil();
