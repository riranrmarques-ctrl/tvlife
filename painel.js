const SUPABASE_URL = "https://dfzvmambzhhsijopcizk.supabase.co";
const SUPABASE_KEY = "sb_publishable_gSPO1gNfcdy3JNOxMprCbg_Wca6u6WQ";
const BUCKET = "pontos";
const TABELA = "playlists";
const TABELA_PONTOS = "pontos";
const TABELA_HISTORICO_CONEXAO = "historico_conexao";

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
let statusAnteriorMap = {};
let posicaoImagemAtual = { x: 50, y: 50 };
let arrastandoPreview = false;

let playlistSchema = null;

function setStatus(texto, tipo = "normal") {
  if (!statusEl) return;
  statusEl.textContent = texto;
  statusEl.className = "status-box";
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
    return {
      texto: "Inativo",
      detalhe: "sem histórico",
      ativo: false,
      classe: "inativo"
    };
  }

  const dataPing = new Date(ponto.ultimo_ping);
  if (Number.isNaN(dataPing.getTime())) {
    return {
      texto: "Inativo",
      detalhe: "sem histórico",
      ativo: false,
      classe: "inativo"
    };
  }

  const diff = Date.now() - dataPing.getTime();
  const horario = dataPing.toLocaleString("pt-BR");

  if (diff < 5 * 60 * 1000) {
    return {
      texto: "Ativo",
      detalhe: horario,
      ativo: true,
      classe: "ativo"
    };
  }

  return {
    texto: "Inativo",
    detalhe: horario,
    ativo: false,
    classe: "inativo"
  };
}

function formatarData(valor) {
  if (!valor) return "Sem data";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem data";
  return data.toLocaleDateString("pt-BR");
}

function formatarDataHora(valor) {
  if (!valor) return "Sem data";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem data";
  return data.toLocaleString("pt-BR");
}

function obterDataFimItem(item) {
  return item?.data_fim || item?.data_encerramento || null;
}

function obterNomeItem(item) {
  return item?.nome || item?.nome_arquivo || "Arquivo";
}

function obterDataCriacaoItem(item) {
  return item?.created_at || item?.data_postagem || null;
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

async function registrarEventoConexao(codigo, statusAtual) {
  const evento = statusAtual === "ativo" ? "conectou" : "desconectou";

  const { error } = await supabaseClient
    .from(TABELA_HISTORICO_CONEXAO)
    .insert({
      codigo,
      evento
    });

  if (error) {
    console.error("Erro ao registrar histórico de conexão:", error);
  }
}

function obterTextoEventoConexao(evento) {
  if (evento === "conectou") return "Conectou";
  if (evento === "desconectou") return "Desconectou";
  return evento || "Sem evento";
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
  if (mime === "image/jpeg" || nome.endsWith(".jpg") || nome.endsWith(".jpeg")) return "imagem";
  if (mime.startsWith("text/") || nome.endsWith(".txt")) return "texto";
  return null;
}

function arquivoPermitido(file) {
  return Boolean(detectarTipoArquivo(file));
}

async function uploadImagemPonto(file, codigo) {
  const extensao = (file.name.split(".").pop() || "jpg").toLowerCase();
  const nomeArquivo = `${codigo}/${Date.now()}.${extensao}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(nomeArquivo, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

async function uploadArquivoPlaylist(file, codigo) {
  const nomeSeguro = normalizarNomeArquivo(file.name);
  const caminho = `${codigo}/${Date.now()}_${nomeSeguro}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(caminho, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(caminho);

  return {
    caminho,
    url: data.publicUrl
  };
}

async function detectarSchemaPlaylist() {
  if (playlistSchema) return playlistSchema;

  const schema = {
    tipo: "novo",
    campoCodigo: "codigo",
    campoNome: "nome",
    campoDataFim: "data_fim",
    campoDataCriacao: "created_at",
    temOrdem: false,
    temCaminhoStorage: false,
    temAtivo: false
  };

  const testeLegado = await supabaseClient
    .from(TABELA)
    .select("id,codigo_ponto,nome_arquivo,arquivo_url,data_postagem,data_encerramento", { head: false })
    .limit(1);

  if (!testeLegado.error) {
    schema.tipo = "legado";
    schema.campoCodigo = "codigo_ponto";
    schema.campoNome = "nome_arquivo";
    schema.campoDataFim = "data_encerramento";
    schema.campoDataCriacao = "data_postagem";
  }

  const testeOrdem = await supabaseClient
    .from(TABELA)
    .select("ordem", { head: false })
    .limit(1);

  if (!testeOrdem.error) {
    schema.temOrdem = true;
  }

  const testeCaminho = await supabaseClient
    .from(TABELA)
    .select("caminho_storage", { head: false })
    .limit(1);

  if (!testeCaminho.error) {
    schema.temCaminhoStorage = true;
  }

  const testeAtivo = await supabaseClient
    .from(TABELA)
    .select("ativo", { head: false })
    .limit(1);

  if (!testeAtivo.error) {
    schema.temAtivo = true;
  }

  playlistSchema = schema;
  return playlistSchema;
}

async function obterProximaOrdemPlaylist(codigo) {
  const schema = await detectarSchemaPlaylist();

  if (!schema.temOrdem) return 0;

  const { data, error } = await supabaseClient
    .from(TABELA)
    .select("ordem")
    .eq(schema.campoCodigo, codigo)
    .order("ordem", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

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

if (sessionStorage.getItem("painelLiberado") === "1") {
  if (loginBox) loginBox.style.display = "none";
  if (conteudoPainel) conteudoPainel.style.display = "block";
  setStatus("Painel Ativo", "ok");
  iniciarPainel();
}

if (btnLogin) {
  btnLogin.onclick = validarLogin;
}

if (senhaInput) {
  senhaInput.addEventListener("keydown", e => {
    if (e.key === "Enter") validarLogin();
  });
}

async function buscarPontos() {
  const { data, error } = await supabaseClient.from(TABELA_PONTOS).select("*");

  if (error) {
    console.error(error);
    setStatus("Erro ao carregar pontos", "erro");
    return [];
  }

  return data || [];
}

function renderizarCardsPontos(lista) {
  pontosMap = {};
  lista.forEach(p => {
    pontosMap[p.codigo] = p;
  });

  document.querySelectorAll(".card-ponto").forEach(card => {
    const codigo = String(card.dataset.codigo || "").trim();
    const ponto = pontosMap[codigo] || {};

    const nomeEl = card.querySelector(".card-nome");
    const cidadeEl = card.querySelector(".card-cidade");
    const statusElCard = card.querySelector(".card-status");
    const bolinhaEl = card.querySelector(".status-bolinha");
    const imagemEl = card.querySelector(".card-imagem");

    const statusInfo = calcularStatusInfo(ponto);
    const statusAtual = statusInfo.ativo ? "ativo" : "inativo";
    const statusAnterior = statusAnteriorMap[codigo];

    if (statusAnterior && statusAnterior !== statusAtual) {
      registrarEventoConexao(codigo, statusAtual);
    }

    statusAnteriorMap[codigo] = statusAtual;

    if (nomeEl) {
      nomeEl.innerHTML = `<strong>${escapeHtml(ponto.nome || codigo)}</strong>`;
    }

    if (cidadeEl) {
      cidadeEl.innerHTML = obterCidadeComNomeEmNegrito(ponto.cidade);
    }

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

  if (listaPontos) listaPontos.style.display = "none";
  if (pontoDetalhe) pontoDetalhe.style.display = "block";

  if (codigoAtual) {
    codigoAtual.textContent = codigoSelecionado;
  }

  if (tituloPasta) {
    tituloPasta.innerHTML = `<strong>${escapeHtml(ponto.nome || codigoSelecionado)}</strong>`;
  }

  const cidadePonto = document.getElementById("cidadePonto");
  const enderecoPonto = document.getElementById("enderecoPonto");
  const statusPonto = document.getElementById("statusPonto");
  const imagemPonto = document.getElementById("imagemPonto");

  const statusInfo = calcularStatusInfo(ponto);
  const posicaoSalva = lerPosicaoImagem(codigoSelecionado);

  if (cidadePonto) {
    cidadePonto.innerHTML = obterCidadeComNomeEmNegrito(ponto.cidade);
  }

  if (enderecoPonto) {
    enderecoPonto.textContent = ponto.endereco || "Endereço não definido";
  }

  if (statusPonto) {
    statusPonto.textContent = statusInfo.texto;
    statusPonto.classList.remove("ativo", "inativo");
    statusPonto.classList.add(statusInfo.classe);
    statusPonto.dataset.status = statusInfo.texto.toLowerCase();
  }

  if (imagemPonto) {
    imagemPonto.src = obterImagemPonto(ponto);
    imagemPonto.alt = ponto.nome || codigoSelecionado;
    aplicarPosicaoImagem(imagemPonto, posicaoSalva);
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
  btnEditarInfo.onclick = () => {
    abrirModalEdicao();
  };
}

if (btnFecharModal) {
  btnFecharModal.onclick = () => {
    fecharModalEdicao();
  };
}

if (modalEditar) {
  modalEditar.addEventListener("click", e => {
    if (e.target === modalEditar) {
      fecharModalEdicao();
    }
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
    if (previewImagem) {
      previewImagem.style.cursor = "grab";
    }
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
        .update({
          nome,
          cidade,
          endereco
        })
        .eq("codigo", codigoSelecionado);

      if (erroInfo) {
        console.error("Erro ao salvar textos:", erroInfo);
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
          .update({
            imagem_url: imagemUrlFinal
          })
          .eq("codigo", codigoSelecionado);

        if (erroImagem) {
          console.error("Erro ao salvar imagem:", erroImagem);
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
      console.error("Erro geral ao salvar edição:", error);
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
      setStatus("Use mp4, jpg, jpeg ou txt", "erro");
      inputUpgrade.value = "";
      return;
    }

    try {
      setStatus("Enviando material...", "normal");

      const schema = await detectarSchemaPlaylist();
      const ordem = await obterProximaOrdemPlaylist(codigoSelecionado);
      const upload = await uploadArquivoPlaylist(arquivo, codigoSelecionado);

      const payload = {
        [schema.campoCodigo]: codigoSelecionado,
        [schema.campoNome]: arquivo.name,
        arquivo_url: upload.url
      };

      if (schema.temCaminhoStorage) {
        payload.caminho_storage = upload.caminho;
      }

      if (schema.temOrdem) {
        payload.ordem = ordem;
      }

      if (schema.campoDataFim) {
        payload[schema.campoDataFim] = null;
      }

      if (schema.temAtivo) {
        payload.ativo = true;
      }

      const { error } = await supabaseClient
        .from(TABELA)
        .insert(payload);

      if (error) {
        console.error("Erro ao salvar material:", error);
        setStatus("Erro ao salvar material", "erro");
        inputUpgrade.value = "";
        return;
      }

      setStatus("Material enviado com sucesso", "ok");
      inputUpgrade.value = "";
      await carregarPlaylist();
    } catch (error) {
      console.error("Erro no upload:", error);
      setStatus("Erro no upload", "erro");
      inputUpgrade.value = "";
    }
  });
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
  const podeOrdenar = Boolean(playlistSchema?.temOrdem);
  const dataCriacao = obterDataCriacaoItem(item);
  const dataFim = obterDataFimItem(item);

  return `
    <div class="playlist-item" draggable="${podeOrdenar ? "true" : "false"}" data-index="${index}" data-id="${item.id}">
      <div class="playlist-item-linha">
        <div class="playlist-item-handle" title="Arrastar">${podeOrdenar ? "⋮⋮" : ""}</div>
        <div class="playlist-item-ordem">${index + 1}.</div>
        <div class="playlist-item-nome" title="${escapeHtml(obterNomeItem(item))}">${montarNomePlaylist(item)}</div>
        <div class="playlist-item-data playlist-item-postado">
          ${formatarDataHora(dataCriacao)}
        </div>
        <div class="playlist-item-data playlist-item-encerramento">
          ${dataFim ? formatarData(dataFim) : ""}
        </div>
        ${montarAcoesPlaylist(item)}
      </div>
    </div>
  `;
}

function montarItemHistoricoEncerramento(item, index) {
  return `
    <div class="historico-item">
      <span class="historico-item-ordem">${index + 1}.</span>
      <span class="historico-item-nome">${escapeHtml(obterNomeItem(item))}</span>
      <span class="historico-item-valor">${formatarData(obterDataFimItem(item))}</span>
    </div>
  `;
}

function montarItemHistoricoStatus(item, index) {
  const textoEvento = obterTextoEventoConexao(item.evento);
  const classe = item.evento === "conectou" ? "ativo" : item.evento === "desconectou" ? "inativo" : "";

  return `
    <div class="historico-item">
      <span class="historico-item-ordem">${index + 1}.</span>
      <span class="historico-item-nome historico-status ${classe}">${textoEvento}</span>
      <span class="historico-item-valor">${formatarDataHora(item.data_hora || item.created_at)}</span>
    </div>
  `;
}

function obterContainerHistoricoEncerramento() {
  return (
    document.getElementById("historicoEncerramento") ||
    document.getElementById("playlistInativaEncerramento") ||
    document.getElementById("playlistInativa")
  );
}

function obterContainerHistoricoStatus() {
  return (
    document.getElementById("historicoStatus") ||
    document.getElementById("playlistInativaStatus")
  );
}

async function carregarPlaylist() {
  if (!codigoSelecionado) return;

  const schema = await detectarSchemaPlaylist();

  const queryPlaylist = supabaseClient
    .from(TABELA)
    .select("*")
    .eq(schema.campoCodigo, codigoSelecionado);

  if (schema.temOrdem) {
    queryPlaylist.order("ordem", { ascending: true });
  } else {
    queryPlaylist.order(schema.campoDataCriacao, { ascending: true });
  }

  const [{ data: playlistData, error: playlistError }, { data: historicoData, error: historicoError }] = await Promise.all([
    queryPlaylist,
    supabaseClient
      .from(TABELA_HISTORICO_CONEXAO)
      .select("*")
      .eq("codigo", codigoSelecionado)
      .order("data_hora", { ascending: false })
  ]);

  if (playlistError) {
    console.error(playlistError);
    setStatus("Erro ao carregar playlist", "erro");
    return;
  }

  if (historicoError) {
    console.error(historicoError);
    setStatus("Erro ao carregar histórico", "erro");
    return;
  }

  const lista = playlistData || [];
  const historicoConexao = historicoData || [];
  const ativos = lista.filter(item => !itemEstaInativo(item));
  const inativos = lista.filter(item => itemEstaInativo(item));

  const playlistAtiva = document.getElementById("playlistAtiva");
  const historicoEncerramento = obterContainerHistoricoEncerramento();
  const historicoStatus = obterContainerHistoricoStatus();

  if (playlistAtiva) {
    playlistAtiva.innerHTML = ativos.length
      ? ativos.map((item, index) => montarItemPlaylist(item, index)).join("")
      : `<div class="playlist-vazia">Nenhum item ativo</div>`;
  }

  if (historicoEncerramento) {
    historicoEncerramento.innerHTML = inativos.length
      ? inativos.map((item, index) => montarItemHistoricoEncerramento(item, index)).join("")
      : `<div class="playlist-vazia">Sem histórico</div>`;
  }

  if (historicoStatus) {
    historicoStatus.innerHTML = historicoConexao.length
      ? historicoConexao.map((item, index) => montarItemHistoricoStatus(item, index)).join("")
      : `<div class="playlist-vazia">Sem histórico</div>`;
  }

  if (schema.temOrdem) {
    ativarDrag(ativos);
  }

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

      const schema = await detectarSchemaPlaylist();

      if (schema.temCaminhoStorage) {
        const { data: itemData } = await supabaseClient
          .from(TABELA)
          .select("caminho_storage")
          .eq("id", id)
          .single();

        if (itemData?.caminho_storage) {
          await supabaseClient.storage.from(BUCKET).remove([itemData.caminho_storage]);
        }
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
      if (!item.classList.contains("drag-over")) {
        limparEstadosDrag();
        item.classList.add("drag-over");
      }
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", async () => {
      item.classList.remove("drag-over");
      item.classList.add("drop-animating");

      const schema = await detectarSchemaPlaylist();
      if (!schema.temOrdem) {
        item.classList.remove("drop-animating");
        return;
      }

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

async function iniciarPainel() {
  await detectarSchemaPlaylist();

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
