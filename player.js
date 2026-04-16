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
let playlistSchema = null;

function mostrarMensagem(texto) {
  document.body.innerHTML = `
    <div class="mensagem">${texto}</div>
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

      return true;
    }
  } catch (error) {
    console.error("Erro ao carregar cache local:", error);
  }

  return false;
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

function detectarTipoPelaUrl(url, tipoOriginal) {
  const tipo = String(tipoOriginal || "").toLowerCase();
  const caminho = String(url || "").toLowerCase().split("?")[0];

  if (tipo === "video" || tipo === "imagem" || tipo === "site") return tipo;

  if (caminho.endsWith(".mp4") || caminho.includes(".mp4")) return "video";
  if (caminho.endsWith(".jpg") || caminho.endsWith(".jpeg") || caminho.endsWith(".png") || caminho.endsWith(".webp")) return "imagem";
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

async function detectarSchemaPlaylist() {
  if (playlistSchema) return playlistSchema;

  const schema = {
    campoCodigo: "codigo",
    campoUrl: "arquivo_url",
    campoNome: "nome",
    campoOrdem: "ordem"
  };

  const testeCodigo = await supabaseClient
    .from(TABELA)
    .select("codigo")
    .limit(1);

  if (testeCodigo.error) {
    const testeCodigoPonto = await supabaseClient
      .from(TABELA)
      .select("codigo_ponto")
      .limit(1);

    if (!testeCodigoPonto.error) {
      schema.campoCodigo = "codigo_ponto";
    }
  }

  const testeArquivoUrl = await supabaseClient
    .from(TABELA)
    .select("arquivo_url")
    .limit(1);

  if (testeArquivoUrl.error) {
    const testeVideoUrl = await supabaseClient
      .from(TABELA)
      .select("video_url")
      .limit(1);

    if (!testeVideoUrl.error) {
      schema.campoUrl = "video_url";
    }
  }

  const testeNome = await supabaseClient
    .from(TABELA)
    .select("nome")
    .limit(1);

  if (testeNome.error) {
    const testeNomeArquivo = await supabaseClient
      .from(TABELA)
      .select("nome_arquivo")
      .limit(1);

    if (!testeNomeArquivo.error) {
      schema.campoNome = "nome_arquivo";
    }
  }

  const testeOrdem = await supabaseClient
    .from(TABELA)
    .select("ordem")
    .limit(1);

  if (testeOrdem.error) {
    schema.campoOrdem = null;
  }

  playlistSchema = schema;
  return playlistSchema;
}

async function normalizarLista(registros) {
  const schema = await detectarSchemaPlaylist();

  const listaOrdenada = (registros || [])
    .filter(itemEstaAtivo)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

  const listaNormalizada = await Promise.all(
    listaOrdenada.map(async item => {
      let url = item[schema.campoUrl] || item.arquivo_url || item.video_url || "";
      let tipo = detectarTipoPelaUrl(url, item.tipo);

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
        nome: item[schema.campoNome] || item.nome || item.nome_arquivo || "Arquivo",
        url,
        tipo
      };
    })
  );

  return listaNormalizada.filter(item => item.url);
}

async function registrarPing() {
  if (!codigoAtual) return;

  const { error } = await supabaseClient
    .from(TABELA_PONTOS)
    .update({
      ultimo_ping: new Date().toISOString()
    })
    .eq("codigo", codigoAtual);

  if (error) {
    console.error("Erro ao registrar ping:", error);
  }
}

async function buscarPlaylist() {
  try {
    const schema = await detectarSchemaPlaylist();

    let query = supabaseClient
      .from(TABELA)
      .select("*")
      .eq(schema.campoCodigo, codigoAtual);

    if (schema.campoOrdem) {
      query = query.order(schema.campoOrdem, { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const novaPlaylist = await normalizarLista(data);

    if (novaPlaylist.length) {
      const itemAtual = playlistAtual[indiceAtual];
      playlistAtual = novaPlaylist;

      if (itemAtual) {
        const novoIndice = playlistAtual.findIndex(item => item.id === itemAtual.id);
        indiceAtual = novoIndice >= 0 ? novoIndice : 0;
      } else if (indiceAtual >= playlistAtual.length) {
        indiceAtual = 0;
      }

      salvarCachePlaylist();
    } else {
      playlistAtual = [];
      indiceAtual = 0;
      salvarCachePlaylist();
    }
  } catch (error) {
    console.error("Erro ao buscar playlist online:", error);
  }
}

function limparTimeout() {
  if (timeoutMidia) {
    clearTimeout(timeoutMidia);
    timeoutMidia = null;
  }
}

function tocarMidia() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteúdo");
    return;
  }

  if (indiceAtual >= playlistAtual.length) {
    indiceAtual = 0;
  }

  const item = playlistAtual[indiceAtual];
  if (!item) return;

  salvarCachePlaylist();

  if (item.tipo === "video") {
    document.body.innerHTML = `
      <div class="player-container">
        <video id="videoPlayer" autoplay muted playsinline></video>
      </div>
    `;

    const video = document.getElementById("videoPlayer");
    video.src = item.url;
    video.onended = proximo;
    video.onerror = proximo;
    video.play().catch(() => {
      setTimeout(proximo, 3000);
    });

    return;
  }

  if (item.tipo === "imagem") {
    document.body.innerHTML = `
      <img src="${item.url}" style="width:100vw;height:100vh;object-fit:cover;background:#000;">
    `;

    timeoutMidia = setTimeout(proximo, 20000);
    return;
  }

  if (item.tipo === "site") {
    document.body.innerHTML = `
      <iframe src="${item.url}" style="width:100vw;height:100vh;border:none;background:#000;"></iframe>
    `;

    timeoutMidia = setTimeout(proximo, 30000);
    return;
  }

  proximo();
}

function proximo() {
  indiceAtual++;

  if (indiceAtual >= playlistAtual.length) {
    indiceAtual = 0;
  }

  salvarCachePlaylist();
  tocarMidia();
}

async function iniciar() {
  const params = new URLSearchParams(window.location.search);
  codigoAtual = params.get("codigo") || localStorage.getItem(CACHE_CODIGO_KEY);

  if (!codigoAtual) {
    mostrarMensagem("Código não informado");
    return;
  }

  codigoAtual = codigoAtual.trim();

  const temCache = carregarCachePlaylist();

  if (temCache && playlistAtual.length) {
    tocarMidia();
  } else {
    mostrarMensagem("Carregando conteúdo...");
  }

  await registrarPing();
  await buscarPlaylist();

  if (playlistAtual.length) {
    tocarMidia();
  } else if (!temCache) {
    mostrarMensagem("Sem conteúdo");
  }

  setInterval(registrarPing, 60000);

  setInterval(async () => {
    await buscarPlaylist();

    if (playlistAtual.length && document.querySelector(".mensagem")) {
      tocarMidia();
    }
  }, 600000);
}

iniciar();
