const SUPABASE_URL = "https://yiyaxxnewjvmnusfxzom.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjuRWhlusDG2RLTAHFREQQ_-qZjxm3g";
const BUCKET = "pontos";
const TABELA = "playlists_novo";
const TABELA_PONTOS = "pontos";

const SENHA_PAINEL = "videolife";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginBox = document.getElementById("loginBox");
const conteudoPainel = document.getElementById("conteudoPainel");
const senhaInput = document.getElementById("senhaInput");
const btnLogin = document.getElementById("btnLogin");
const loginErro = document.getElementById("loginErro");
const statusEl = document.querySelector(".status-topo");
const listaPontos = document.getElementById("listaPontos");
const pontoDetalhe = document.getElementById("pontoDetalhe");
const codigoAtual = document.getElementById("codigoAtual");
const tituloPasta = document.getElementById("tituloPasta");
const btnVoltar = document.getElementById("btnVoltar");
const btnCopiarCodigo = document.getElementById("btnCopiarCodigo");
const btnEditarInfo = document.getElementById("btnEditarInfo");
const btnUpgrade = document.getElementById("btnUpgrade");
const inputUpgrade = document.getElementById("inputUpgrade");
const modalEditar = document.getElementById("modalEditar");
const editNome = document.getElementById("editNome");
const editCidade = document.getElementById("editCidade");
const editEndereco = document.getElementById("editEndereco");
const previewImagem = document.getElementById("previewImagem");
const inputImagem = document.getElementById("inputImagem");
const btnSalvarEdicao = document.getElementById("btnSalvarEdicao");
const btnFecharModal = document.getElementById("btnFecharModal");

let codigoSelecionado = null;
let pontosMap = {};
let dragIndex = null;
let arquivoImagemEdicao = null;
let posicaoImagemAtual = { x: 50, y: 50 };
let arrastandoPreview = false;

const playlistSchema = {
  campoCodigo: "codigo",
  campoNome: "nome",
  campoDataFim: "data_fim",
  campoDataCriacao: "created_at",
  temOrdem: true,
  temCaminhoStorage: true,
  temAtivo: true
};

function setStatus(texto, tipo = "normal") {
  if (!statusEl) return;
  statusEl.textContent = texto;
  statusEl.classList.remove("ok", "erro");
  if (tipo === "ok") statusEl.classList.add("ok");
  if (tipo === "erro") statusEl.classList.add("erro");
}

function escapeHtml(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function obterImagemPonto(ponto) {
  return ponto?.imagem_url || "https://placehold.co/600x320/png";
}

function obterCidadeComNomeEmNegrito(cidade) {
  const nome = String(cidade || "").trim();
  return nome ? `Cidade de <strong>${escapeHtml(nome)}</strong>` : "Cidade não definida";
}

function calcularStatusInfo(ponto) {
  if (!ponto?.ultimo_ping) {
    return { texto: "Inativo", ativo: false, classe: "inativo" };
  }

  const dataPing = new Date(ponto.ultimo_ping);
  if (Number.isNaN(dataPing.getTime())) {
    return { texto: "Inativo", ativo: false, classe: "inativo" };
  }

  const diff = Date.now() - dataPing.getTime();

  if (diff < 5 * 60 * 1000) {
    return { texto: "Ativo", ativo: true, classe: "ativo" };
  }

  return { texto: "Inativo", ativo: false, classe: "inativo" };
}

function obterNomeItem(item) {
  return item?.nome || item?.nome_arquivo || "Arquivo";
}

function obterDataFimItem(item) {
  return item?.data_fim || item?.data_encerramento || null;
}

function itemEstaInativo(item) {
  const dataFimItem = obterDataFimItem(item);
  if (!dataFimItem) return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim = new Date(dataFimItem);
  if (Number.isNaN(fim.getTime())) return false;

  fim.setHours(23, 59, 59, 999);
  return fim < hoje;
}

function obterChavePosicaoImagem(codigo) {
  return `ponto_imagem_posicao_${codigo}`;
}

function salvarPosicaoImagem(codigo, posicao) {
  if (!codigo) return;
  localStorage.setItem(obterChavePosicaoImagem(codigo), JSON.stringify(posicao));
}

function lerPosicaoImagem(codigo) {
  if (!codigo) return { x: 50, y: 50 };

  try {
    const salva = localStorage.getItem(obterChavePosicaoImagem(codigo));
    if (!salva) return { x: 50, y: 50 };

    const obj = JSON.parse(salva);
    const x = Number(obj.x);
    const y = Number(obj.y);

    return {
      x: Number.isFinite(x) ? x : 50,
      y: Number.isFinite(y) ? y : 50
    };
  } catch {
    return { x: 50, y: 50 };
  }
}

function aplicarPosicaoImagem(el, posicao) {
  if (!el || !posicao) return;
  el.style.objectPosition = `${posicao.x}% ${posicao.y}%`;
}

function normalizarNomeArquivo(nome) {
  return String(nome || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "_");
}

function detectarTipoArquivo(file) {
  const nome = String(file?.name || "").toLowerCase();
  const mime = String(file?.type || "").toLowerCase();

  if (mime.startsWith("video/") || nome.endsWith(".mp4")) return "video";
  if (mime.startsWith("image/") || nome.endsWith(".jpg") || nome.endsWith(".jpeg") || nome.endsWith(".png") || nome.endsWith(".webp")) return "imagem";
  if (mime.startsWith("text/") || nome.endsWith(".txt")) return "texto";

  return null;
}

function arquivoPermitido(file) {
  return Boolean(detectarTipoArquivo(file));
}

async function uploadImagemPonto(file, codigo) {
  const extensao = (file.name.split(".").pop() || "jpg").toLowerCase();
  const nomeArquivo = `${codigo}/${Date.now()}.${extensao}`;

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(nomeArquivo, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

async function uploadArquivoPlaylist(file, codigo) {
  const nomeSeguro = normalizarNomeArquivo(file.name);
  const caminho = `${codigo}/${Date.now()}_${nomeSeguro}`;

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(caminho, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(caminho);

  return {
    caminho,
    url: data.publicUrl
  };
}

async function obterProximaOrdemPlaylist(codigo) {
  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("ordem")
    .eq("codigo", codigo)
    .order("ordem", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || !data.length) return 0;

  const ultima = Number(data[0].ordem);
  return Number.isFinite(ultima) ? ultima + 1 : 0;
}

function validarLogin() {
  if (!senhaInput || senhaInput.value.trim() !== SENHA_PAINEL) {
    if (loginErro) loginErro.textContent = "Código inválido";
    return;
  }

  sessionStorage.setItem("painelLiberado", "1");

  if (loginErro) loginErro.textContent = "";
  if (loginBox) loginBox.style.display = "none";
  if (conteudoPainel) conteudoPainel.style.display = "block";

  setStatus("Painel Ativo", "ok");
  iniciarPainel();
}

async function buscarPontos() {
  const { data, error } = await supabaseClient
    .from(TABELA_PONTOS)
    .select("*")
    .order("codigo", { ascending: true });

  if (error) {
    console.error(error);
    setStatus("Erro ao carregar pontos", "erro");
    return [];
  }

  return data || [];
}

function renderizarCardsPontos(lista) {
  pontosMap = {};

  lista.forEach(ponto => {
    pontosMap[ponto.codigo] = ponto;
  });

  document.querySelectorAll(".card-ponto").forEach(card => {
    const codigo = String(card.dataset.codigo || "").trim();
    const ponto = pontosMap[codigo] || {};
    const statusInfo = calcularStatusInfo(ponto);

    const nomeEl = card.querySelector(".card-nome");
    const cidadeEl = card.querySelector(".card-cidade");
    const statusElCard = card.querySelector(".card-status");
    const bolinhaEl = card.querySelector(".status-bolinha");
    const imagemEl = card.querySelector(".card-imagem");

    if (nomeEl) nomeEl.innerHTML = `<strong>${escapeHtml(ponto.nome || codigo)}</strong>`;
    if (cidadeEl) cidadeEl.innerHTML = obterCidadeComNomeEmNegrito(ponto.cidade);

    if (statusElCard) {
      statusElCard.textContent = statusInfo.texto;
      statusElCard.classList.toggle("ativo", statusInfo.ativo);
      statusElCard.classList.toggle("inativo", !statusInfo.ativo);
    }

    if (bolinhaEl) {
      bolinhaEl.classList.toggle("ativo", statusInfo.ativo);
      bolinhaEl.classList.toggle("inativo", !statusInfo.ativo);
    }

    if (imagemEl) {
      imagemEl.src = obterImagemPonto(ponto);
      imagemEl.alt = ponto.nome || codigo;
      aplicarPosicaoImagem(imagemEl, lerPosicaoImagem(codigo));
    }
  });
}

function abrirPonto(codigo) {
  codigoSelecionado = String(codigo || "").trim();
  const ponto = pontosMap[codigoSelecionado] || {};
  const statusInfo = calcularStatusInfo(ponto);

  if (listaPontos) listaPontos.style.display = "none";
  if (pontoDetalhe) pontoDetalhe.style.display = "block";
  if (codigoAtual) codigoAtual.textContent = codigoSelecionado;
  if (tituloPasta) tituloPasta.innerHTML = `<strong>${escapeHtml(ponto.nome || codigoSelecionado)}</strong>`;

  const cidadePonto = document.getElementById("cidadePonto");
  const enderecoPonto = document.getElementById("enderecoPonto");
  const statusPonto = document.getElementById("statusPonto");
  const imagemPonto = document.getElementById("imagemPonto");

  if (cidadePonto) cidadePonto.innerHTML = obterCidadeComNomeEmNegrito(ponto.cidade);
  if (enderecoPonto) enderecoPonto.textContent = ponto.endereco || "Endereço não definido";

  if (statusPonto) {
    statusPonto.textContent = statusInfo.texto;
    statusPonto.classList.remove("ativo", "inativo");
    statusPonto.classList.add(statusInfo.classe);
  }

  if (imagemPonto) {
    imagemPonto.src = obterImagemPonto(ponto);
    imagemPonto.alt = ponto.nome || codigoSelecionado;
    aplicarPosicaoImagem(imagemPonto, lerPosicaoImagem(codigoSelecionado));
  }

  carregarPlaylist();
}

function abrirModalEdicao() {
  if (!codigoSelecionado || !modalEditar) return;

  const ponto = pontosMap[codigoSelecionado] || {};
  posicaoImagemAtual = lerPosicaoImagem(codigoSelecionado);

  if (editNome) editNome.value = ponto.nome || "";
  if (editCidade) editCidade.value = ponto.cidade || "";
  if (editEndereco) editEndereco.value = ponto.endereco || "";

  if (previewImagem) {
    previewImagem.src = obterImagemPonto(ponto);
    aplicarPosicaoImagem(previewImagem, posicaoImagemAtual);
  }

  if (inputImagem) inputImagem.value = "";

  arquivoImagemEdicao = null;
  modalEditar.style.display = "flex";
}

function fecharModalEdicao() {
  if (!modalEditar) return;

  modalEditar.style.display = "none";
  arquivoImagemEdicao = null;
  arrastandoPreview = false;

  if (inputImagem) inputImagem.value = "";
}

function montarAcoesPlaylist(item) {
  const url = item.arquivo_url ? String(item.arquivo_url) : "";
  const abrir = url
    ? `<a class="playlist-acao" href="${url}" target="_blank" rel="noopener noreferrer" title="Abrir">↗</a>`
    : "";

  return `
    <div class="playlist-item-acoes-laterais">
      ${abrir}
      <button class="playlist-acao btn-excluir-item" type="button" data-id="${item.id}" title="Excluir">🗑</button>
    </div>
  `;
}

function montarNomePlaylist(item) {
  return escapeHtml(obterNomeItem(item));
}

function montarItemPlaylist(item, index) {
  return `
    <div class="playlist-item" draggable="true" data-index="${index}" data-id="${item.id}">
      <div class="playlist-item-linha">
        <div class="playlist-item-handle" title="Arrastar">⋮⋮</div>
        <div class="playlist-item-ordem">${index + 1}.</div>
        <div class="playlist-item-nome" title="${escapeHtml(obterNomeItem(item))}">${montarNomePlaylist(item)}</div>
        ${montarAcoesPlaylist(item)}
      </div>
    </div>
  `;
}

async function carregarPlaylist() {
  if (!codigoSelecionado) return;

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("*")
    .eq("codigo", codigoSelecionado)
    .order("ordem", { ascending: true });

  if (error) {
    console.error(error);
    setStatus("Erro ao carregar playlist", "erro");
    return;
  }

  const lista = data || [];
  const ativos = lista.filter(item => !itemEstaInativo(item));
  const playlistAtiva = document.getElementById("playlistAtiva");

  if (playlistAtiva) {
    playlistAtiva.innerHTML = ativos.length
      ? ativos.map((item, index) => montarItemPlaylist(item, index)).join("")
      : `<div class="playlist-vazia">Nenhum item ativo</div>`;
  }

  ativarDrag(ativos);
  ativarExclusaoItens();
}

function ativarExclusaoItens() {
  document.querySelectorAll(".btn-excluir-item").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();

      const id = btn.dataset.id;
      if (!id) return;

      const confirmar = window.confirm("Deseja excluir este item da playlist?");
      if (!confirmar) return;

      const { data: itemData } = await supabaseClient
        .from(TABELA)
        .select("caminho_storage")
        .eq("id", id)
        .single();

      if (itemData?.caminho_storage) {
        await supabaseClient.storage.from(BUCKET).remove([itemData.caminho_storage]);
      }

      const { error } = await supabaseClient
        .from(TABELA)
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        setStatus("Erro ao excluir item", "erro");
        return;
      }

      setStatus("Item excluído", "ok");
      carregarPlaylist();
    };
  });
}

function limparEstadosDrag() {
  document.querySelectorAll("#playlistAtiva .playlist-item").forEach(el => {
    el.classList.remove("drag-over", "drop-animating");
  });
}

function ativarDrag(lista) {
  const items = document.querySelectorAll("#playlistAtiva .playlist-item");

  items.forEach(item => {
    item.addEventListener("dragstart", () => {
      dragIndex = Number(item.dataset.index);
      item.classList.add("dragging");
      document.body.classList.add("playlist-drag-ativa");
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.body.classList.remove("playlist-drag-ativa");
      limparEstadosDrag();
      dragIndex = null;
    });

    item.addEventListener("dragover", e => {
      e.preventDefault();
      limparEstadosDrag();
      item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", async () => {
      item.classList.remove("drag-over");
      item.classList.add("drop-animating");

      const target = Number(item.dataset.index);

      if (Number.isNaN(dragIndex) || Number.isNaN(target) || dragIndex === target) {
        item.classList.remove("drop-animating");
        return;
      }

      const novo = [...lista];
      const movido = novo.splice(dragIndex, 1)[0];
      novo.splice(target, 0, movido);

      for (let i = 0; i < novo.length; i++) {
        const { error } = await supabaseClient
          .from(TABELA)
          .update({ ordem: i })
          .eq("id", novo[i].id);

        if (error) {
          console.error(error);
          setStatus("Erro ao reordenar playlist", "erro");
          item.classList.remove("drop-animating");
          return;
        }
      }

      setTimeout(() => {
        item.classList.remove("drop-animating");
      }, 220);

      carregarPlaylist();
    });
  });
}

if (btnLogin) {
  btnLogin.onclick = validarLogin;
}

if (senhaInput) {
  senhaInput.addEventListener("keydown", e => {
    if (e.key === "Enter") validarLogin();
  });
}

if (sessionStorage.getItem("painelLiberado") === "1") {
  if (loginBox) loginBox.style.display = "none";
  if (conteudoPainel) conteudoPainel.style.display = "block";
  setStatus("Painel Ativo", "ok");
  iniciarPainel();
}

if (btnVoltar) {
  btnVoltar.onclick = () => {
    if (listaPontos) listaPontos.style.display = "grid";
    if (pontoDetalhe) pontoDetalhe.style.display = "none";
  };
}

if (btnCopiarCodigo) {
  btnCopiarCodigo.onclick = async () => {
    if (!codigoSelecionado) return;

    try {
      await navigator.clipboard.writeText(codigoSelecionado);
      setStatus("Código copiado", "ok");
    } catch {
      setStatus("Erro ao copiar código", "erro");
    }
  };
}

if (btnEditarInfo) {
  btnEditarInfo.onclick = abrirModalEdicao;
}

if (btnFecharModal) {
  btnFecharModal.onclick = fecharModalEdicao;
}

if (modalEditar) {
  modalEditar.addEventListener("click", e => {
    if (e.target === modalEditar) fecharModalEdicao();
  });
}

if (inputImagem) {
  inputImagem.addEventListener("change", e => {
    const arquivo = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (!arquivo) return;

    arquivoImagemEdicao = arquivo;
    posicaoImagemAtual = { x: 50, y: 50 };

    const reader = new FileReader();

    reader.onload = evento => {
      if (previewImagem) {
        previewImagem.src = evento.target.result;
        aplicarPosicaoImagem(previewImagem, posicaoImagemAtual);
      }
    };

    reader.readAsDataURL(arquivo);
  });
}

if (previewImagem) {
  previewImagem.style.cursor = "grab";

  previewImagem.addEventListener("mousedown", e => {
    e.preventDefault();
    arrastandoPreview = true;
    previewImagem.style.cursor = "grabbing";
  });

  window.addEventListener("mouseup", () => {
    arrastandoPreview = false;
    if (previewImagem) previewImagem.style.cursor = "grab";
  });

  previewImagem.addEventListener("mousemove", e => {
    if (!arrastandoPreview) return;

    const rect = previewImagem.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    posicaoImagemAtual = { x, y };
    aplicarPosicaoImagem(previewImagem, posicaoImagemAtual);
  });

  previewImagem.addEventListener("dragstart", e => {
    e.preventDefault();
  });
}

if (btnSalvarEdicao) {
  btnSalvarEdicao.onclick = async () => {
    if (!codigoSelecionado) return;

    const ponto = pontosMap[codigoSelecionado] || {};
    const nome = editNome ? editNome.value.trim() : "";
    const cidade = editCidade ? editCidade.value.trim() : "";
    const endereco = editEndereco ? editEndereco.value.trim() : "";

    try {
      setStatus("Salvando informações...", "normal");

      const { error: erroInfo } = await supabaseClient
        .from(TABELA_PONTOS)
        .update({ nome, cidade, endereco })
        .eq("codigo", codigoSelecionado);

      if (erroInfo) {
        console.error(erroInfo);
        setStatus("Erro ao atualizar informações", "erro");
        return;
      }

      ponto.nome = nome;
      ponto.cidade = cidade;
      ponto.endereco = endereco;

      if (arquivoImagemEdicao) {
        setStatus("Enviando imagem...", "normal");

        const imagemUrlFinal = await uploadImagemPonto(arquivoImagemEdicao, codigoSelecionado);

        const { error: erroImagem } = await supabaseClient
          .from(TABELA_PONTOS)
          .update({ imagem_url: imagemUrlFinal })
          .eq("codigo", codigoSelecionado);

        if (erroImagem) {
          console.error(erroImagem);
          setStatus("Erro ao salvar imagem", "erro");
          return;
        }

        ponto.imagem_url = imagemUrlFinal;
      }

      pontosMap[codigoSelecionado] = ponto;
      salvarPosicaoImagem(codigoSelecionado, posicaoImagemAtual);

      fecharModalEdicao();
      abrirPonto(codigoSelecionado);
      renderizarCardsPontos(Object.values(pontosMap));
      setStatus("Atualizado com sucesso", "ok");
    } catch (error) {
      console.error(error);
      setStatus("Erro ao salvar edição", "erro");
    }
  };
}

if (btnUpgrade && inputUpgrade) {
  btnUpgrade.onclick = () => {
    if (!codigoSelecionado) {
      setStatus("Abra um ponto primeiro", "erro");
      return;
    }

    inputUpgrade.value = "";
    inputUpgrade.click();
  };

  inputUpgrade.addEventListener("change", async e => {
    const arquivo = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (!arquivo || !codigoSelecionado) return;

    if (!arquivoPermitido(arquivo)) {
      setStatus("Use mp4, jpg, jpeg, png, webp ou txt", "erro");
      inputUpgrade.value = "";
      return;
    }

    try {
      setStatus("Enviando material...", "normal");

      const ordem = await obterProximaOrdemPlaylist(codigoSelecionado);
      const upload = await uploadArquivoPlaylist(arquivo, codigoSelecionado);

      const payload = {
        codigo: codigoSelecionado,
        nome: arquivo.name,
        arquivo_url: upload.url,
        caminho_storage: upload.caminho,
        ordem,
        ativo: true,
        data_fim: null
      };

      const { error } = await supabaseClient
        .from(TABELA)
        .insert(payload);

      if (error) {
        console.error(error);
        setStatus("Erro ao salvar material", "erro");
        inputUpgrade.value = "";
        return;
      }

      setStatus("Material enviado com sucesso", "ok");
      inputUpgrade.value = "";
      await carregarPlaylist();
    } catch (error) {
      console.error(error);
      setStatus("Erro no upload", "erro");
      inputUpgrade.value = "";
    }
  });
}

async function iniciarPainel() {
  const pontos = await buscarPontos();
  renderizarCardsPontos(pontos);

  document.querySelectorAll(".btn-abrir").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      abrirPonto(btn.dataset.codigo);
    };
  });

  document.querySelectorAll(".btn-copiar").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();

      const codigo = btn.dataset.codigo;
      if (!codigo) return;

      try {
        await navigator.clipboard.writeText(codigo);
        setStatus("Código copiado", "ok");
      } catch {
        setStatus("Erro ao copiar código", "erro");
      }
    };
  });
}
