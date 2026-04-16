const SUPABASE_URL = "https://yiyaxxnewjvmnusfxzom.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjuRWhlusDG2RLTAHFREQQ_-qZjxm3g";

const TABELA = "playlists_novo";
const TABELA_PONTOS = "pontos";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

function limparTimeout() {
  if (timeoutMidia) {
    clearTimeout(timeoutMidia);
    timeoutMidia = null;
  }
}

function detectarTipo(url) {
  const limpa = String(url || "").toLowerCase().split("?")[0];

  if (limpa.endsWith(".jpg") || limpa.endsWith(".jpeg") || limpa.endsWith(".png") || limpa.endsWith(".webp")) {
    return "imagem";
  }

  if (limpa.endsWith(".txt")) {
    return "site";
  }

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

function itemEstaAtivo(item) {
  if (item.ativo === false) return false;

  if (!item.data_fim) return true;

  const fim = new Date(item.data_fim);
  if (Number.isNaN(fim.getTime())) return true;

  fim.setHours(23, 59, 59, 999);
  return fim >= new Date();
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
  mostrarMensagem("Buscando conteúdo...", `Código: ${codigoAtual}`);

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("*")
    .eq("codigo", codigoAtual)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro Supabase:", error);
    mostrarMensagem("Erro ao buscar playlist.", error.message || "Verifique permissões e tabela playlists_novo.");
    return false;
  }

  const lista = (data || [])
    .filter(itemEstaAtivo)
    .filter(item => item.arquivo_url);

  if (!lista.length) {
    mostrarMensagem("Sem conteúdo para este código.", `Código: ${codigoAtual}`);
    return false;
  }

  playlistAtual = await Promise.all(
    lista.map(async item => {
      let url = item.arquivo_url;
      let tipo = item.tipo || detectarTipo(url);

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
          console.error("Erro ao ler TXT:", error);
        }
      }

      return {
        id: item.id,
        nome: item.nome || "Arquivo",
        url,
        tipo
      };
    })
  );

  playlistAtual = playlistAtual.filter(item => item.url);

  if (!playlistAtual.length) {
    mostrarMensagem("Conteúdo encontrado, mas sem URL válida.");
    return false;
  }

  return true;
}

function proximo() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteúdo para reproduzir.");
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

  img.onload = () => {
    console.log("Imagem carregada:", item.url);
  };

  img.onerror = () => {
    console.error("Erro ao carregar imagem:", item.url);
    mostrarMensagem("Erro ao carregar imagem.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
  };

  timeoutMidia = setTimeout(proximo, 20000);
}

function tocarVideo(item) {
  document.body.innerHTML = `
    <div class="player-container">
      <video id="videoPlayer" autoplay muted playsinline preload="auto"></video>
    </div>
  `;

  const video = document.getElementById("videoPlayer");

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
    console.error("Erro ao carregar vídeo:", item.url);
    mostrarMensagem("Erro ao carregar vídeo.", item.nome);
    timeoutMidia = setTimeout(proximo, 3000);
  };

  timeoutMidia = setTimeout(() => {
    if (video.readyState === 0) {
      console.warn("Vídeo não carregou em 15 segundos:", item.url);
      mostrarMensagem("Vídeo demorou para carregar.", "Pulando para o próximo item...");
      setTimeout(proximo, 2000);
    }
  }, 15000);
}

function tocarSite(item) {
  document.body.innerHTML = `
    <div class="player-container">
      <iframe src="${item.url}" allow="autoplay; fullscreen"></iframe>
    </div>
  `;

  timeoutMidia = setTimeout(proximo, 30000);
}

function tocarMidia() {
  limparTimeout();

  if (!playlistAtual.length) {
    mostrarMensagem("Sem conteúdo para reproduzir.");
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

  console.log("Reproduzindo:", item);

  if (item.tipo === "imagem") {
    tocarImagem(item);
    return;
  }

  if (item.tipo === "site") {
    tocarSite(item);
    return;
  }

  tocar
