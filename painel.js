const SUPABASE_URL = "https://yiyaxxnewjvmnusfxzom.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjuRWhlusDG2RLTAHFREQQ_-qZjxm3g";

const TABELA = "playlists_novo";
const TABELA_PONTOS = "pontos";

let supabaseClient = null;
let codigoAtual = null;
let playlistAtual = [];
let indiceAtual = 0;
let timeoutMidia = null;

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

  if (limpa.endsWith(".txt")) {
    return "site";
  }

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
    .update({
      ultimo_ping: new Date().toISOString()
    })
    .eq("codigo", codigoAtual);

  if (error) {
    console.error("Erro ao registrar ping:", error);
  }
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
      } else {
        console.warn("TXT sem URL reconhecida:", texto);
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

async function buscarPlaylist() {
  mostrarMensagem("Buscando conteudo...", `Codigo: ${codigoAtual}`);

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("*")
    .eq("codigo", codigoAtual)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro Supabase:", error);
    mostrarMensagem("Erro ao buscar playlist.", error.message || "Verifique a tabela playlists_novo.");
    return false;
  }

  const lista = (data || [])
    .filter(itemEstaAtivo)
    .filter(item => item.arquivo_url || item.video_url);

  if (!lista.length) {
    mostrarMensagem("Sem conteudo para este codigo.", `Codigo: ${codigoAtual}`);
    return false;
  }

  playlistAtual = await Promise.all(lista.map(resolverItem));
  playlistAtual = playlistAtual.filter(item => item.url);

  if (!playlistAtual.length) {
    mostrarMensagem("Conteudo encontrado, mas sem URL valida.");
    return false;
  }

  return true;
}

function proximo() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteudo para reproduzir.");
    return;
  }

  indiceAtual++;

  if (indiceAtual >= playlistAtual.length) {
    indiceAtual = 0;
  }

  tocarMidia();
}

function tocarImagem(item) {
  document.body.innerHTML = `
    <div class="player-container">
      <img src="${item.url}" alt="">
    </div>
  `;

  const img = document.querySelector("img");

  if (img) {
    img.onerror = () => {
      console.error("Erro ao carregar imagem:", item.url);
      mostrarMensagem("Erro ao carregar imagem.", item.nome);
      timeoutMidia = setTimeout(proximo, 3000);
    };
  }

  timeoutMidia = setTimeout(proximo, 20000);
}

function tocarVideo(item) {
  document.body.innerHTML = `
    <div class="player-container">
      <video id="videoPlayer" autoplay muted playsinline preload="auto"></video>
    </div>
  `;

  const video = document.getElementById("videoPlayer");

  if (!video) {
    mostrarMensagem("Erro ao iniciar video.");
    return;
  }

  video.src = item.url;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;

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

  timeoutMidia = setTimeout(() => {
    if (video.readyState === 0) {
      mostrarMensagem("Video demorou para carregar.", "Pulando para o proximo item...");
      setTimeout(proximo, 2000);
    }
  }, 15000);
}

function tocarSite(item) {
  const url = normalizarUrlSite(item.url);

  if (!url) {
    mostrarMensagem("URL do site invalida.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
    return;
  }

  document.body.innerHTML = `
    <div class="player-container">
      <iframe
        src="${url}"
        allow="autoplay; fullscreen"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
  `;

  timeoutMidia = setTimeout(proximo, 30000);
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

    if (!criarSupabaseClient()) {
      return;
    }

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
      tocarMidia();
    }

    setInterval(registrarPing, 60000);

    setInterval(async () => {
      const tinhaConteudo = playlistAtual.length > 0;
      const encontrouAtualizacao = await buscarPlaylist();

      if (!tinhaConteudo && encontrouAtualizacao) {
        tocarMidia();
      }
    }, 30000);
  } catch (error) {
    console.error("Erro geral no player:", error);
    mostrarMensagem("Erro geral no player.", error.message || "Veja o console do navegador.");
  }
}

window.addEventListener("load", iniciar);
