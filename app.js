const form = document.getElementById("codeForm");
const inputCodigo = document.getElementById("codigo");
const inputDispositivo = document.getElementById("dispositivo");
const mensagem = document.getElementById("mensagem");
const contadorTexto = document.getElementById("contadorTexto");

function mostrarMensagem(texto) {
  if (mensagem) {
    mensagem.textContent = texto;
  }
}

function limparCodigo(codigo) {
  return String(codigo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

if (form) {
  form.addEventListener("submit", event => {
    event.preventDefault();

    const codigo = limparCodigo(inputCodigo ? inputCodigo.value : "");
    const dispositivo = String(inputDispositivo ? inputDispositivo.value : "").trim();

    if (!codigo) {
      mostrarMensagem("Digite o código do estabelecimento.");
      return;
    }

    mostrarMensagem("Carregando reprodutor...");

    if (contadorTexto) {
      contadorTexto.classList.remove("hidden");
      contadorTexto.textContent = "Abrindo player...";
    }

    const params = new URLSearchParams();
    params.set("codigo", codigo);

    if (dispositivo) {
      params.set("dispositivo", dispositivo);
    }

    window.location.href = `player.html?${params.toString()}`;
  });
}
