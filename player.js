const SUPABASE_URL = "https://yiyaxxnewjvmnusfxzom.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjuRWhlusDG2RLTAHFREQQ_-qZjxm3g";

const TABELA = "playlists_novo";
const TABELA_PONTOS = "pontos";

const DURACAO_IMAGEM = 20000;
const DURACAO_SITE = 10000;
const INTERVALO_PING = 60000;
const INTERVALO_ATUALIZAR_PLAYLIST = 30000;

let supabaseClient = null;
let codigoAtual = null;
let playlistAtual = [];
let indiceAtual = 0;
let timeoutMidia = null;
let cacheMidia = new Map();
let primeiraBuscaFinalizada = false;

function mostrarMensagem(texto, detalhe = "") {
  document.body.innerHTML = `
    <div class="player-container">
      <div class="mensagem">
        ${texto}
        ${detalhe ? `<small>${detalhe}</small>` : ""}
      </div>
    </div>
  `;
}

function criarSupabaseClient() {
  if (!window.supabase || !window.supabase.createClient) {
    mostrarMensagem("Supabase nao carregou.", "Verifique a internet ou o CDN do Supabase.");
    return false;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return true;
}

function limparTimeout() {
  if (timeoutMidia) {
    clearTimeout(timeoutMidia);
    timeoutMidia = null;
  }
}

function detectarTipo(url, tipoOriginal = "") {
  const tipo = String(tipoOriginal || "").toLowerCase();
  const limpa = String(url || "").toLowerCase().split("?")[0];

  if (tipo === "imagem" || tipo === "image") return "imagem";
  if (tipo === "video") return "video";
  if (tipo === "site" || tipo === "texto" || tipo === "text") return "site";

  if (
    limpa.endsWith(".jpg") ||
    limpa.endsWith(".jpeg") ||
    limpa.endsWith(".png") ||
    limpa.endsWith(".webp")
  ) {
    return "imagem";
  }

  if (limpa.endsWith(".txt")) return "site";

  return "video";
}

function normalizarUrlSite(url) {
  let final = String(url || "").trim();

  if (!final) return "";

  if (!/^https?:\/\//i.test(final)) {
    final = `https://${final.replace(/^\/+/, "")}`;
  }

  return final;
}

function extrairUrlDoTexto(texto) {
  const conteudo = String(texto || "").trim();

  const matchInternetShortcut = conteudo.match(/URL\s*=\s*(.+)/i);
  if (matchInternetShortcut && matchInternetShortcut[1]) {
    return normalizarUrlSite(matchInternetShortcut[1]);
  }

  const matchUrlDireta = conteudo.match(/https?:\/\/[^\s]+/i);
  if (matchUrlDireta && matchUrlDireta[0]) {
    return normalizarUrlSite(matchUrlDireta[0]);
  }

  const linhas = conteudo
    .split(/\r?\n/)
    .map(linha => linha.trim())
    .filter(Boolean);

  for (const linha of linhas) {
    if (
      linha.includes(".com") ||
      linha.includes(".com.br") ||
      linha.includes(".app.br") ||
      linha.includes(".net") ||
      linha.includes(".org") ||
      linha.includes(".br/")
    ) {
      return normalizarUrlSite(linha.replace(/^URL\s*=/i, ""));
    }
  }

  return "";
}

function itemEstaAtivo(item) {
  if (item.ativo === false) return false;
  if (!item.data_fim) return true;

  const fim = new Date(item.data_fim);
  if (Number.isNaN(fim.getTime())) return true;

  fim.setHours(23, 59, 59, 999);
  return fim >= new Date();
}

async function registrarPing() {
  if (!codigoAtual || !supabaseClient) return;

  const { error } = await supabaseClient
    .from(TABELA_PONTOS)
    .update({ ultimo_ping: new Date().toISOString() })
    .eq("codigo", codigoAtual);

  if (error) console.error("Erro ao registrar ping:", error);
}

async function resolverItem(item) {
  let url = item.arquivo_url || item.video_url || "";
  let tipo = detectarTipo(url, item.tipo);

  if (tipo === "site" && String(url).toLowerCase().split("?")[0].endsWith(".txt")) {
    try {
      const resposta = await fetch(url, { cache: "no-store" });

      if (!resposta.ok) {
        throw new Error(`Erro ao ler TXT: ${resposta.status}`);
      }

      const texto = await resposta.text();
      const urlExtraida = extrairUrlDoTexto(texto);

      if (urlExtraida) {
        url = urlExtraida;
      }
    } catch (error) {
      console.error("Erro ao processar arquivo TXT:", error);
    }
  }

  return {
    id: item.id,
    nome: item.nome || item.nome_arquivo || "Arquivo",
    url,
    tipo
  };
}

function assinaturaPlaylist(lista) {
  return lista.map(item => `${item.id}:${item.url}:${item.tipo}`).join("|");
}

async function buscarPlaylist({ silencioso = false } = {}) {
  if (!silencioso) {
    mostrarMensagem("Buscando conteudo...", `Codigo: ${codigoAtual}`);
  }

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("*")
    .eq("codigo", codigoAtual)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro Supabase:", error);

    if (!silencioso) {
      mostrarMensagem("Erro ao buscar playlist.", error.message || "Verifique a tabela playlists_novo.");
    }

    return false;
  }

  const lista = (data || [])
    .filter(itemEstaAtivo)
    .filter(item => item.arquivo_url || item.video_url);

  if (!lista.length) {
    if (!silencioso) {
      mostrarMensagem("Sem conteudo para este codigo.", `Codigo: ${codigoAtual}`);
    }

    playlistAtual = [];
    return false;
  }

  const novaPlaylist = await Promise.all(lista.map(resolverItem));
  const limpa = novaPlaylist.filter(item => item.url);

  if (!limpa.length) {
    if (!silencioso) {
      mostrarMensagem("Conteudo encontrado, mas sem URL valida.");
    }

    playlistAtual = [];
    return false;
  }

  const assinaturaAntiga = assinaturaPlaylist(playlistAtual);
  const assinaturaNova = assinaturaPlaylist(limpa);

  playlistAtual = limpa;

  if (indiceAtual >= playlistAtual.length) {
    indiceAtual = 0;
  }

  primeiraBuscaFinalizada = true;

  if (assinaturaAntiga !== assinaturaNova) {
    limparCacheObsoleto();
    preCarregarProximos(2);
  }

  return true;
}

function limparCacheObsoleto() {
  const urlsAtuais = new Set(playlistAtual.map(item => item.url));

  for (const url of cacheMidia.keys()) {
    if (!urlsAtuais.has(url)) {
      cacheMidia.delete(url);
    }
  }
}

function obterIndiceCircular(base, deslocamento) {
  if (!playlistAtual.length) return 0;
  return (base + deslocamento + playlistAtual.length) % playlistAtual.length;
}

function preCarregarItem(item) {
  if (!item || !item.url || cacheMidia.has(item.url)) return;

  if (item.tipo === "imagem") {
    const img = new Image();
    img.src = item.url;
    cacheMidia.set(item.url, img);
    return;
  }

  if (item.tipo === "video") {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = item.url;
    video.load();
    cacheMidia.set(item.url, video);
    return;
  }

  if (item.tipo === "site") {
    const iframe = document.createElement("iframe");
    iframe.src = normalizarUrlSite(item.url);
    iframe.style.position = "absolute";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    document.body.appendChild(iframe);
    cacheMidia.set(item.url, iframe);
  }
}

function preCarregarProximos(quantidade = 2) {
  if (!playlistAtual.length) return;

  for (let i = 1; i <= quantidade; i++) {
    const index = obterIndiceCircular(indiceAtual, i);
    preCarregarItem(playlistAtual[index]);
  }
}

function proximo() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteudo para reproduzir.");
    return;
  }

  indiceAtual = obterIndiceCircular(indiceAtual, 1);
  tocarMidia();
}

function tocarImagem(item) {
  const imgCache = cacheMidia.get(item.url);

  document.body.innerHTML = `
    <div class="player-container" id="playerContainer"></div>
  `;

  const container = document.getElementById("playerContainer");
  const img = imgCache instanceof HTMLImageElement ? imgCache : new Image();

  img.alt = "";
  img.style.width = "100vw";
  img.style.height = "100vh";
  img.style.objectFit = "cover";
  img.style.background = "#000";

  if (!img.src) img.src = item.url;

  img.onerror = () => {
    console.error("Erro ao carregar imagem:", item.url);
    mostrarMensagem("Erro ao carregar imagem.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
  };

  container.appendChild(img);

  preCarregarProximos(2);
  timeoutMidia = setTimeout(proximo, DURACAO_IMAGEM);
}

function tocarVideo(item) {
  const videoCache = cacheMidia.get(item.url);

  document.body.innerHTML = `
    <div class="player-container" id="playerContainer"></div>
  `;

  const container = document.getElementById("playerContainer");
  const video = videoCache instanceof HTMLVideoElement ? videoCache : document.createElement("video");

  video.id = "videoPlayer";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = "auto";
  video.style.width = "100vw";
  video.style.height = "100vh";
  video.style.objectFit = "cover";
  video.style.background = "#000";

  if (!video.src) video.src = item.url;

  video.onloadeddata = () => {
    video.play().catch(error => {
      console.error("Erro ao dar play:", error);
      mostrarMensagem("Clique/toque na tela para iniciar.", item.nome);

      document.body.onclick = () => {
        video.play();
      };
    });
  };

  video.onended = proximo;

  video.onerror = () => {
    console.error("Erro ao carregar video:", item.url);
    mostrarMensagem("Erro ao carregar video.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
  };

  container.appendChild(video);

  preCarregarProximos(2);

  timeoutMidia = setTimeout(() => {
    if (video.readyState === 0) {
      mostrarMensagem("Video demorou para carregar.", "Pulando para o proximo item...");
      setTimeout(proximo, 2000);
    }
  }, 15000);

  video.play().catch(() => {});
}

function tocarSite(item) {
  const url = normalizarUrlSite(item.url);

  if (!url) {
    mostrarMensagem("URL do site invalida.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
    return;
  }

  const iframeCache = cacheMidia.get(item.url);

  document.body.innerHTML = `
    <div class="player-container" id="playerContainer"></div>
  `;

  const container = document.getElementById("playerContainer");
  const iframe = iframeCache instanceof HTMLIFrameElement ? iframeCache : document.createElement("iframe");

  iframe.src = url;
  iframe.allow = "autoplay; fullscreen";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.style.width = "100vw";
  iframe.style.height = "100vh";
  iframe.style.border = "0";
  iframe.style.background = "#000";
  iframe.style.position = "static";
  iframe.style.opacity = "1";
  iframe.style.pointerEvents = "auto";

  container.appendChild(iframe);

  preCarregarProximos(2);
  timeoutMidia = setTimeout(proximo, DURACAO_SITE);
}

function tocarMidia() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteudo para reproduzir.");
    return;
  }

  if (indiceAtual >= playlistAtual.length) {
    indiceAtual = 0;
  }

  const item = playlistAtual[indiceAtual];

  if (!item || !item.url) {
    proximo();
    return;
  }

  if (item.tipo === "imagem") {
    tocarImagem(item);
    return;
  }

  if (item.tipo === "site") {
    tocarSite(item);
    return;
  }

  tocarVideo(item);
}

async function iniciar() {
  try {
    mostrarMensagem("Iniciando player...");

    if (!criarSupabaseClient()) return;

    const params = new URLSearchParams(window.location.search);
    codigoAtual = params.get("codigo");

    if (!codigoAtual) {
      mostrarMensagem("Codigo nao informado.", "Exemplo: player.html?codigo=H4E9L2A");
      return;
    }

    codigoAtual = String(codigoAtual).trim().toUpperCase();

    await registrarPing();

    const encontrou = await buscarPlaylist();

    if (encontrou) {
      preCarregarProximos(2);
      tocarMidia();
    }

    setInterval(registrarPing, INTERVALO_PING);

    setInterval(async () => {
      const tinhaConteudo = playlistAtual.length > 0;
      const encontrouAtualizacao = await buscarPlaylist({ silencioso: true });

      if (!tinhaConteudo && encontrouAtualizacao) {
        tocarMidia();
      }
    }, INTERVALO_ATUALIZAR_PLAYLIST);
  } catch (error) {
    console.error("Erro geral no player:", error);
    mostrarMensagem("Erro geral no player.", error.message || "Veja o console do navegador.");
  }
}

window.addEventListener("load", iniciar);
