const form = document.getElementById("codeForm");
const inputCodigo = document.getElementById("codigo");
const inputDispositivo = document.getElementById("dispositivo");
const mensagem = document.getElementById("mensagem");
const contadorTexto = document.getElementById("contadorTexto");

const STORAGE_CODIGO = "duna_codigo_salvo";
const STORAGE_DISPOSITIVO = "duna_dispositivo_salvo";
const STORAGE_JA_CONECTOU = "duna_ja_conectou";

let contadorAuto = null;
let segundosRestantes = 30;

function mostrarMensagem(texto) {
  if (mensagem) {
    mensagem.textContent = texto;
  }
}

function mostrarContador(texto) {
  if (!contadorTexto) return;

  contadorTexto.classList.remove("hidden");
  contadorTexto.textContent = texto;
}

function esconderContador() {
  if (!contadorTexto) return;

  contadorTexto.classList.add("hidden");
  contadorTexto.textContent = "";
}

function limparCodigo(codigo) {
  return String(codigo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function pararAutoReproducao() {
  if (contadorAuto) {
    clearInterval(contadorAuto);
    contadorAuto = null;
  }

  esconderContador();
}

function abrirPlayer(codigo, dispositivo) {
  const codigoLimpo = limparCodigo(codigo);
  const nomeDispositivo = String(dispositivo || "").trim();

  if (!codigoLimpo) {
    mostrarMensagem("Digite o código do estabelecimento.");
    return;
  }

  localStorage.setItem(STORAGE_CODIGO, codigoLimpo);
  localStorage.setItem(STORAGE_DISPOSITIVO, nomeDispositivo);
  localStorage.setItem(STORAGE_JA_CONECTOU, "1");

  const params = new URLSearchParams();
  params.set("codigo", codigoLimpo);

  if (nomeDispositivo) {
    params.set("dispositivo", nomeDispositivo);
  }

  mostrarMensagem("Carregando reprodutor...");
  mostrarContador("Abrindo player...");

  window.location.href = `player.html?${params.toString()}`;
}

function iniciarAutoReproducaoSePossivel() {
  const codigoSalvo = localStorage.getItem(STORAGE_CODIGO) || "";
  const dispositivoSalvo = localStorage.getItem(STORAGE_DISPOSITIVO) || "";
  const jaConectou = localStorage.getItem(STORAGE_JA_CONECTOU) === "1";

  if (inputCodigo && codigoSalvo) {
    inputCodigo.value = codigoSalvo;
  }

  if (inputDispositivo && dispositivoSalvo) {
    inputDispositivo.value = dispositivoSalvo;
  }

  if (!jaConectou || !codigoSalvo) {
    return;
  }

  segundosRestantes = 30;

  mostrarMensagem("Dispositivo já conectado anteriormente.");
  mostrarContador(`Iniciando reprodução automaticamente em ${segundosRestantes} segundos...`);

  contadorAuto = setInterval(() => {
    segundosRestantes -= 1;

    if (segundosRestantes <= 0) {
      pararAutoReproducao();
      abrirPlayer(codigoSalvo, dispositivoSalvo);
      return;
    }

    mostrarContador(`Iniciando reprodução automaticamente em ${segundosRestantes} segundos...`);
  }, 1000);
}

if (form) {
  form.addEventListener("submit", event => {
    event.preventDefault();

    pararAutoReproducao();

    const codigo = inputCodigo ? inputCodigo.value : "";
    const dispositivo = inputDispositivo ? inputDispositivo.value : "";

    abrirPlayer(codigo, dispositivo);
  });
}

if (inputCodigo) {
  inputCodigo.addEventListener("input", () => {
    pararAutoReproducao();
    mostrarMensagem("");
  });
}

if (inputDispositivo) {
  inputDispositivo.addEventListener("input", () => {
    pararAutoReproducao();
    mostrarMensagem("");
  });
}

iniciarAutoReproducaoSePossivel();
