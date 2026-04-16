const SUPABASE_URL = "https://yiyaxxnewjvmnusfxzom.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjuRWhlusDG2RLTAHFREQQ_-qZjxm3g";

const TABELA = "playlists_novo";
const TABELA_PONTOS = "pontos";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CACHE_PLAYLIST_KEY = "duna_playlist_cache";
const CACHE_INDICE_KEY = "duna_playlist_indice";
const CACHE_CODIGO_KEY = "duna_playlist_codigo";

let codigoAtual = null;
let playlistAtual = [];
let indiceAtual = 0;
let timeoutMidia = null;

function mostrarMensagem(texto) {
  document.body.innerHTML = `
    <div class="player-container">
      <div class="mensagem">${texto}</div>
    </div>
  `;
}

function salvarCachePlaylist() {
  try {
    localStorage.setItem(CACHE_PLAYLIST_KEY, JSON.stringify(playlistAtual));
    localStorage.setItem(CACHE_INDICE_KEY, String(indiceAtual));
    localStorage.setItem(CACHE_CODIGO_KEY, codigoAtual || "");
  } catch (error) {
    console.error("Erro ao salvar cache local:", error);
  }
}

function carregarCachePlaylist() {
  try {
    const codigoSalvo = localStorage.getItem(CACHE_CODIGO_KEY);
    const playlistSalva = localStorage.getItem(CACHE_PLAYLIST_KEY);
    const indiceSalvo = localStorage.getItem(CACHE_INDICE_KEY);

    if (codigoSalvo && codigoSalvo === codigoAtual && playlistSalva) {
      playlistAtual = JSON.parse(playlistSalva) || [];
      indiceAtual = parseInt(indiceSalvo || "0", 10) || 0;

      if (indiceAtual >= playlistAtual.length) {
        indiceAtual = 0;
      }

      return playlistAtual.length > 0;
    }
  } catch (error) {
    console.error("Erro ao carregar cache local:", error);
  }

  return false;
}

function limparTimeout() {
  if (timeoutMidia) {
    clearTimeout(timeoutMidia);
    timeoutMidia = null;
  }
}

function obterDataFimItem(item) {
  return item?.data_fim || item?.data_encerramento || null;
}

function itemEstaAtivo(item) {
  if (item?.ativo === false) return false;

  const dataFim = obterDataFimItem(item);
  if (!dataFim) return true;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim = new Date(dataFim);
  if (Number.isNaN(fim.getTime())) return true;

  fim.setHours(23, 59, 59, 999);
  return fim >= hoje;
}

function detectarTipoPelaUrl(url) {
  const caminho = String(url || "").toLowerCase().split("?")[0];

  if (caminho.endsWith(".mp4") || caminho.includes(".mp4")) return "video";
  if (
    caminho.endsWith(".jpg") ||
    caminho.endsWith(".jpeg") ||
    caminho.endsWith(".png") ||
    caminho.endsWith(".webp")
  ) {
    return "imagem";
  }
  if (caminho.endsWith(".txt")) return "site";

  return "video";
}

function extrairUrlDoTexto(texto) {
  const conteudo = String(texto || "").trim();

  const matchInternetShortcut = conteudo.match(/URL\s*=\s*(.+)/i);
  if (matchInternetShortcut && matchInternetShortcut[1]) {
    let url = matchInternetShortcut[1].trim();

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url.replace(/^\/+/, "")}`;
    }

    return url;
  }

  const matchUrlDireta = conteudo.match(/https?:\/\/[^\s]+/i);
  if (matchUrlDireta && matchUrlDireta[0]) {
    return matchUrlDireta[0].trim();
  }

  return "";
}

async function normalizarLista(registros) {
  const listaOrdenada = (registros || [])
    .filter(itemEstaAtivo)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

  const listaNormalizada = await Promise.all(
    listaOrdenada.map(async item => {
      let url = item.arquivo_url || item.video_url || "";
      let tipo = item.tipo || detectarTipoPelaUrl(url);

      if (tipo === "texto") {
        tipo = "site";
      }

      if (tipo === "site" && String(url).toLowerCase().includes(".txt")) {
        try {
          const resposta = await fetch(url, { cache: "no-store" });
          const texto = await resposta.text();
          const urlExtraida = extrairUrlDoTexto(texto);

          if (urlExtraida) {
            url = urlExtraida;
          }
        } catch (error) {
          console.error("Erro ao ler arquivo TXT:", error);
        }
      }

      return {
        id: item.id,
        nome: item.nome || item.nome_arquivo || "Arquivo",
        url,
        tipo
      };
    })
  );

  return listaNormalizada.filter(item => item.url);
}

