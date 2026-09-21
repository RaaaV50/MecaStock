/* ============================================================
   MECASTOCK — Lógica Principal da Aplicação
   Sistema de Gerenciamento de Inventário para Mecânicas
   v1.0.0 | LocalStorage | JavaScript Puro (Vanilla JS)
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTES
// ============================================================

/** Categorias disponíveis para classificação das peças */
const CATEGORIAS = [
  'Motor', 'Freios', 'Suspensão', 'Elétrica', 'Transmissão',
  'Arrefecimento', 'Escapamento', 'Filtros', 'Lubrificantes',
  'Carroceria', 'Embreagem', 'Direção', 'Outros'
];

/** Chaves utilizadas para persistência no LocalStorage */
const CHAVES_STORAGE = {
  pecas:    'mecastock_pecas',
  veiculos: 'mecastock_veiculos',
  vendas:   'mecastock_vendas',   // Histórico de vendas registradas
};

/** Quantidade de itens exibidos por página na tabela do inventário */
const ITENS_POR_PAGINA = 15;

// ============================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================================

/**
 * Objeto central de estado. Controla a visão ativa, os dados
 * carregados, filtros aplicados e configurações de interface.
 */
const estado = {
  visao: 'dashboard',        // Visão ativa: dashboard | inventario | veiculos | relatorios | vendas
  pecas: [],                 // Lista de peças carregadas do armazenamento local
  veiculos: [],              // Lista de veículos cadastrados
  vendas: [],                // Histórico de vendas registradas
  filtros: {
    busca: '',               // Texto digitado na busca em tempo real
    categoria: '',           // Categoria selecionada no filtro
    veiculo: '',             // ID do veículo selecionado no filtro
  },
  ordenacao: {
    coluna: 'codigo',        // Coluna ativa de ordenação da tabela
    direcao: 'asc',          // Direção: 'asc' (crescente) | 'desc' (decrescente)
  },
  pagina: 1,                 // Página atual da paginação
  modal: null,               // Modal aberto: 'peca' | 'veiculo' | 'venda' | null
  idEditando: null,          // ID do registro em edição (null = novo cadastro)
  barraLateralAberta: true,  // Visibilidade da barra lateral
  notificacaoAberta: false,  // Visibilidade do painel de notificações
  veiculosSelecionados: [],  // IDs dos veículos selecionados no formulário de peça
  buscaTag: '',              // Texto de busca dentro do dropdown de veículos
  dropdownTagsAberto: false, // Controla abertura do dropdown multi-seleção de veículos
  // Estado temporário do formulário de venda
  pecaSelecionadaVenda: null, // Peça selecionada no modal de registrar venda
};

// ============================================================
// ARMAZENAMENTO (LocalStorage)
// ============================================================

/**
 * Módulo responsável por ler e gravar dados no LocalStorage.
 * Futuramente pode ser substituído por chamadas a uma API com PostgreSQL.
 */
const Armazenamento = {
  /** Lê a lista de peças salva */
  obterPecas:    ()     => JSON.parse(localStorage.getItem(CHAVES_STORAGE.pecas)    || '[]'),
  /** Grava a lista de peças */
  salvarPecas:   (dados) => localStorage.setItem(CHAVES_STORAGE.pecas,    JSON.stringify(dados)),
  /** Lê a lista de veículos salva */
  obterVeiculos: ()     => JSON.parse(localStorage.getItem(CHAVES_STORAGE.veiculos) || '[]'),
  /** Grava a lista de veículos */
  salvarVeiculos:(dados) => localStorage.setItem(CHAVES_STORAGE.veiculos, JSON.stringify(dados)),
  /** Lê o histórico de vendas salvo */
  obterVendas:   ()     => JSON.parse(localStorage.getItem(CHAVES_STORAGE.vendas)   || '[]'),
  /** Grava o histórico de vendas */
  salvarVendas:  (dados) => localStorage.setItem(CHAVES_STORAGE.vendas,   JSON.stringify(dados)),
};

// ============================================================
// UTILITÁRIOS
// ============================================================

/** Gera um UUID v4 único para identificar novos registros */
function gerarId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const aleatorio = Math.random() * 16 | 0;
    return (c === 'x' ? aleatorio : (aleatorio & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Formata um número como moeda brasileira (ex: 1234.5 → "1.234,50")
 * @param {number} valor - Valor numérico a formatar
 */
function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte uma data ISO para o formato brasileiro DD/MM/AAAA
 * @param {string} iso - Data no formato ISO 8601
 */
function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/**
 * Escapa caracteres HTML especiais para evitar injeção de código (XSS)
 * @param {string} texto - Texto bruto a ser escapado
 */
function escaparHTML(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Remove espaços em branco extras de uma string
 * @param {string} texto - Texto a sanitizar
 */
function sanitizar(texto) {
  return String(texto || '').trim();
}

/**
 * Retorna o rótulo completo de um veículo: "Marca Modelo Ano"
 * @param {Object} veiculo - Objeto com os campos do veículo
 */
function obterLabelVeiculo(veiculo) {
  return `${veiculo.marca} ${veiculo.modelo}${veiculo.ano ? ' ' + veiculo.ano : ''}`;
}

/**
 * Retorna o emoji correspondente à categoria da peça
 * @param {string} categoria - Nome da categoria
 */
function iconeCategoria(categoria) {
  const mapa = {
    'Motor':'⚙️','Freios':'🛑','Suspensão':'🔩','Elétrica':'⚡',
    'Transmissão':'🔄','Arrefecimento':'🌡️','Escapamento':'💨',
    'Filtros':'🔽','Lubrificantes':'🛢️','Carroceria':'🚗',
    'Embreagem':'🔧','Direção':'🎮','Outros':'📦',
  };
  return mapa[categoria] || '📦';
}

/**
 * Retorna a inicial em maiúsculo da marca do veículo
 * @param {string} marca - Nome da marca
 */
function inicialMarca(marca) {
  return (marca || '?').charAt(0).toUpperCase();
}

/**
 * Gera uma cor consistente baseada no nome da marca (hash determinístico).
 * A mesma marca sempre recebe a mesma cor.
 * @param {string} marca - Nome da marca
 */
function corMarca(marca) {
  const cores = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6'];
  let hash = 0;
  for (const caractere of marca) hash = (hash * 31 + caractere.charCodeAt(0)) % cores.length;
  return cores[Math.abs(hash)];
}

// ============================================================
// DADOS DE EXEMPLO (Seed)
// ============================================================

/**
 * Popula o armazenamento com dados de demonstração na primeira abertura.
 * Inclui veículos e peças comuns de oficina mecânica.
 */
function carregarDadosExemplo() {
  const veiculos = [
    { id: 'v1', marca: 'Fiat',       modelo: 'Uno',     ano: '2010–2020', obs: '' },
    { id: 'v2', marca: 'Volkswagen', modelo: 'Gol',     ano: '2012–2022', obs: '' },
    { id: 'v3', marca: 'Chevrolet',  modelo: 'Celta',   ano: '2001–2015', obs: '' },
    { id: 'v4', marca: 'Ford',       modelo: 'Ka',      ano: '2014–2023', obs: '' },
    { id: 'v5', marca: 'Toyota',     modelo: 'Corolla', ano: '2015–2023', obs: '' },
    { id: 'v6', marca: 'Honda',      modelo: 'Civic',   ano: '2012–2023', obs: '' },
  ];

  const agora = new Date().toISOString();
  const pecas = [
    { id: gerarId(), codigo: 'FILT-001', nome: 'Filtro de Óleo',          categoria: 'Filtros',       veiculosIds: ['v1','v2','v3'],         quantidade: 8,  estoqueMinimo: 3,    localizacao: 'Prateleira A1',  fornecedor: 'AutoPeças Silva',     precoCusto: 12.50,  precoVenda: 28.00,  obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'FILT-002', nome: 'Filtro de Ar',            categoria: 'Filtros',       veiculosIds: ['v1','v2'],              quantidade: 5,  estoqueMinimo: 2,    localizacao: 'Prateleira A1',  fornecedor: 'AutoPeças Silva',     precoCusto: 18.00,  precoVenda: 42.00,  obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'FILT-003', nome: 'Filtro de Combustível',   categoria: 'Filtros',       veiculosIds: ['v3','v4'],              quantidade: 1,  estoqueMinimo: 3,    localizacao: 'Prateleira A2',  fornecedor: 'Distribuidora Omega', precoCusto: 22.00,  precoVenda: 55.00,  obs: 'Verificar prazo', dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'PAST-001', nome: 'Pastilha de Freio Diant.',categoria: 'Freios',        veiculosIds: ['v1','v2','v4'],         quantidade: 4,  estoqueMinimo: 2,    localizacao: 'Gaveta B3',      fornecedor: 'Freios Brasil',       precoCusto: 45.00,  precoVenda: 110.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'PAST-002', nome: 'Pastilha de Freio Tras.', categoria: 'Freios',        veiculosIds: ['v5','v6'],              quantidade: 6,  estoqueMinimo: 2,    localizacao: 'Gaveta B3',      fornecedor: 'Freios Brasil',       precoCusto: 38.00,  precoVenda: 90.00,  obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'DISC-001', nome: 'Disco de Freio Dianteiro',categoria: 'Freios',        veiculosIds: ['v1','v3'],              quantidade: 2,  estoqueMinimo: 1,    localizacao: 'Estante C1',     fornecedor: 'Freios Brasil',       precoCusto: 85.00,  precoVenda: 195.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'VELA-001', nome: 'Vela de Ignição NGK',     categoria: 'Motor',         veiculosIds: ['v1','v2','v3','v4'],    quantidade: 12, estoqueMinimo: 8,    localizacao: 'Gaveta A5',      fornecedor: 'NGK Distribuidora',   precoCusto: 14.00,  precoVenda: 32.00,  obs: 'Caixa com 4un',  dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'OLEO-001', nome: 'Óleo Motor 5W30 1L',      categoria: 'Lubrificantes', veiculosIds: ['v1','v2','v3','v4','v5','v6'], quantidade: 24, estoqueMinimo: 10, localizacao: 'Depósito D1',  fornecedor: 'Castrol',             precoCusto: 22.00,  precoVenda: 45.00,  obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'CORR-001', nome: 'Correia Dentada',         categoria: 'Motor',         veiculosIds: ['v2','v4'],              quantidade: 0,  estoqueMinimo: 2,    localizacao: 'Prateleira B1',  fornecedor: 'Gates',               precoCusto: 65.00,  precoVenda: 150.00, obs: 'Repor urgente',   dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'AMOR-001', nome: 'Amortecedor Dianteiro',   categoria: 'Suspensão',     veiculosIds: ['v1','v3'],              quantidade: 2,  estoqueMinimo: 1,    localizacao: 'Estante C3',     fornecedor: 'Monroe',              precoCusto: 130.00, precoVenda: 280.00, obs: 'Par',             dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'BATE-001', nome: 'Bateria 60Ah',            categoria: 'Elétrica',      veiculosIds: ['v1','v2','v3','v4'],    quantidade: 3,  estoqueMinimo: 1,    localizacao: 'Estante D2',     fornecedor: 'Moura',               precoCusto: 320.00, precoVenda: 580.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'EMBT-001', nome: 'Kit Embreagem Completo',  categoria: 'Embreagem',     veiculosIds: ['v2','v3'],              quantidade: 1,  estoqueMinimo: null, localizacao: 'Estante E1',     fornecedor: 'LUK',                 precoCusto: 280.00, precoVenda: 620.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'RADI-001', nome: 'Radiador',                categoria: 'Arrefecimento', veiculosIds: ['v5','v6'],              quantidade: 1,  estoqueMinimo: 1,    localizacao: 'Estante F1',     fornecedor: 'Valeo',               precoCusto: 350.00, precoVenda: 750.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'CANO-001', nome: 'Cano de Escapamento',     categoria: 'Escapamento',   veiculosIds: ['v1'],                   quantidade: 2,  estoqueMinimo: null, localizacao: 'Estante G1',     fornecedor: 'Walker',              precoCusto: 95.00,  precoVenda: 210.00, obs: '',                dataCadastro: agora, dataAtualizacao: agora },
    { id: gerarId(), codigo: 'DIRE-001', nome: 'Caixa de Direção',        categoria: 'Direção',       veiculosIds: ['v4','v5'],              quantidade: 1,  estoqueMinimo: 1,    localizacao: 'Estante H2',     fornecedor: 'TRW',                 precoCusto: 420.00, precoVenda: 890.00, obs: 'Remanufaturada',  dataCadastro: agora, dataAtualizacao: agora },
  ];

  Armazenamento.salvarVeiculos(veiculos);
  Armazenamento.salvarPecas(pecas);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

/**
 * Ponto de entrada da aplicação. Carrega os dados do armazenamento,
 * aplica dados de exemplo se vazio, e renderiza a visão inicial.
 */
function inicializar() {
  estado.pecas    = Armazenamento.obterPecas();
  estado.veiculos = Armazenamento.obterVeiculos();
  estado.vendas   = Armazenamento.obterVendas();

  // Carrega dados de exemplo apenas na primeira execução (banco vazio)
  if (estado.pecas.length === 0 && estado.veiculos.length === 0) {
    carregarDadosExemplo();
    estado.pecas    = Armazenamento.obterPecas();
    estado.veiculos = Armazenamento.obterVeiculos();
  }

  renderizarEstatisticasLateral();
  navegarPara('dashboard');
  atualizarBadgeNotificacao();

  // Fecha o dropdown de veículos ao clicar fora dele
  document.addEventListener('click', tratarCliqueGlobal);
}

/**
 * Handler global de clique: fecha o dropdown de veículos se o clique
 * acontecer fora da área de seleção múltipla.
 * @param {MouseEvent} evento - Evento de clique do navegador
 */
function tratarCliqueGlobal(evento) {
  if (!evento.target.closest('.tags-group-wrap')) {
    estado.dropdownTagsAberto = false;
    const dropdown = document.getElementById('tags-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

/**
 * Navega para a visão especificada, atualiza o menu ativo
 * e re-renderiza o conteúdo principal.
 * @param {string} visao - 'dashboard' | 'inventario' | 'veiculos' | 'relatorios' | 'vendas'
 */
function navegarPara(visao) {
  estado.visao  = visao;
  estado.pagina = 1;

  // Atualiza o destaque de navegação no header
  document.querySelectorAll('.nav-item').forEach(botao => botao.classList.remove('active'));
  const botaoAtivo = document.getElementById(`nav-${visao}`);
  if (botaoAtivo) botaoAtivo.classList.add('active');

  renderizarVisao();
  renderizarEstatisticasLateral();
}

/**
 * Renderiza a visão atual no container principal (#main-content).
 * Limpa o conteúdo anterior e injeta o HTML gerado dinamicamente.
 */
function renderizarVisao() {
  const containerPrincipal = document.getElementById('main-content');
  containerPrincipal.innerHTML = '';

  const elemento = document.createElement('div');
  elemento.className = 'view-enter'; // Ativa animação CSS de entrada

  switch (estado.visao) {
    case 'dashboard':  elemento.innerHTML = construirDashboard();  break;
    case 'inventario': elemento.innerHTML = construirInventario(); break;
    case 'veiculos':   elemento.innerHTML = construirVeiculos();   break;
    case 'relatorios': elemento.innerHTML = construirRelatorios(); break;
    case 'vendas':     elemento.innerHTML = construirVendas();     break;
  }

  containerPrincipal.appendChild(elemento);
}

// ============================================================
// BARRA LATERAL
// ============================================================

/** Alterna a visibilidade da barra lateral e ajusta a margem do conteúdo */
function alternarBarraLateral() {
  estado.barraLateralAberta = !estado.barraLateralAberta;
  document.getElementById('sidebar').classList.toggle('hidden', !estado.barraLateralAberta);
  document.getElementById('main-content').classList.toggle('full', !estado.barraLateralAberta);
}

/**
 * Renderiza os cards de estatísticas rápidas na barra lateral.
 * Chamado sempre que os dados mudam.
 */
function renderizarEstatisticasLateral() {
  const container = document.getElementById('sidebar-stats');
  if (!container) return;

  const pecasEmAlerta  = estado.pecas.filter(p => p.estoqueMinimo != null && p.quantidade <= p.estoqueMinimo);
  const valorTotalCusto = estado.pecas.reduce((soma, p) => soma + (p.quantidade * (p.precoCusto || 0)), 0);

  container.innerHTML = `
    <p class="sidebar-label" style="margin-top:8px">Resumo</p>
    <div class="sidebar-stat-card">
      <div class="sidebar-stat-label">Total de Peças</div>
      <div class="sidebar-stat-val blue">${estado.pecas.length}</div>
    </div>
    <div class="sidebar-stat-card">
      <div class="sidebar-stat-label">Valor em Estoque</div>
      <div class="sidebar-stat-val green" style="font-size:1rem">R$ ${formatarMoeda(valorTotalCusto)}</div>
    </div>
    <div class="sidebar-stat-card">
      <div class="sidebar-stat-label">Alertas</div>
      <div class="sidebar-stat-val ${pecasEmAlerta.length > 0 ? 'red' : 'green'}">${pecasEmAlerta.length}</div>
    </div>
    <div class="sidebar-stat-card">
      <div class="sidebar-stat-label">Veículos</div>
      <div class="sidebar-stat-val orange">${estado.veiculos.length}</div>
    </div>
  `;
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================

/**
 * Atualiza o badge numérico no ícone do sino e o conteúdo do painel
 * de alertas de estoque baixo.
 */
function atualizarBadgeNotificacao() {
  const pecasEmAlerta = estado.pecas.filter(p => p.estoqueMinimo != null && p.quantidade <= p.estoqueMinimo);
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  if (pecasEmAlerta.length > 0) {
    badge.style.display = 'flex';
    badge.textContent   = pecasEmAlerta.length > 99 ? '99+' : pecasEmAlerta.length;
  } else {
    badge.style.display = 'none';
  }

  // Preenche o painel de alertas
  const painelCorpo = document.getElementById('notif-panel-body');
  if (!painelCorpo) return;

  if (pecasEmAlerta.length === 0) {
    painelCorpo.innerHTML = '<div class="notif-empty">✅ Nenhum alerta de estoque baixo</div>';
  } else {
    painelCorpo.innerHTML = pecasEmAlerta.map(peca => `
      <div class="notif-item" onclick="verDetalhePeca('${peca.id}')">
        <div class="notif-icon warning">⚠️</div>
        <div class="notif-text">
          <strong>${escaparHTML(peca.nome)}</strong>
          <span>${escaparHTML(peca.codigo)} — Estoque: <b>${peca.quantidade}</b> (mín: ${peca.estoqueMinimo})</span>
        </div>
      </div>
    `).join('');
  }
}

/** Abre ou fecha o painel lateral de notificações de estoque baixo */
function alternarNotificacoes() {
  estado.notificacaoAberta = !estado.notificacaoAberta;
  document.getElementById('notif-panel').classList.toggle('open', estado.notificacaoAberta);
  document.getElementById('notif-overlay').classList.toggle('open', estado.notificacaoAberta);
  atualizarBadgeNotificacao();
}

// ============================================================
// FILTROS E ORDENAÇÃO
// ============================================================

/**
 * Retorna a lista de peças filtrada pelos critérios ativos
 * (busca textual, categoria, veículo) e ordenada pela coluna selecionada.
 * @returns {Array} Lista de peças filtrada e ordenada
 */
function obterPecasFiltradas() {
  let lista = [...estado.pecas];
  const termoBusca = estado.filtros.busca.toLowerCase().trim();

  // Filtro de texto: código, nome e fornecedor
  if (termoBusca) {
    lista = lista.filter(peca =>
      peca.codigo.toLowerCase().includes(termoBusca) ||
      peca.nome.toLowerCase().includes(termoBusca)   ||
      (peca.fornecedor || '').toLowerCase().includes(termoBusca)
    );
  }

  // Filtro por categoria
  if (estado.filtros.categoria) {
    lista = lista.filter(peca => peca.categoria === estado.filtros.categoria);
  }

  // Filtro por modelo de veículo (cruzamento peça × veículo)
  if (estado.filtros.veiculo) {
    lista = lista.filter(peca => (peca.veiculosIds || []).includes(estado.filtros.veiculo));
  }

  // Ordenação pela coluna e direção ativas
  const { coluna, direcao } = estado.ordenacao;
  lista.sort((a, b) => {
    let valorA = a[coluna] ?? '';
    let valorB = b[coluna] ?? '';
    if (typeof valorA === 'string') valorA = valorA.toLowerCase();
    if (typeof valorB === 'string') valorB = valorB.toLowerCase();
    if (valorA < valorB) return direcao === 'asc' ? -1 :  1;
    if (valorA > valorB) return direcao === 'asc' ?  1 : -1;
    return 0;
  });

  return lista;
}

/**
 * Retorna apenas os itens da página atual a partir da lista filtrada.
 * @param {Array} listaFiltrada - Lista completa já filtrada e ordenada
 * @returns {Array} Subconjunto da lista para a página corrente
 */
function obterPecasPaginadas(listaFiltrada) {
  const inicio = (estado.pagina - 1) * ITENS_POR_PAGINA;
  return listaFiltrada.slice(inicio, inicio + ITENS_POR_PAGINA);
}

// ============================================================
// CONSTRUÇÃO — DASHBOARD
// ============================================================

/**
 * Constrói o HTML da visão Dashboard com cards de métricas,
 * painel de alertas de estoque e distribuição por categoria.
 * @returns {string} HTML completo da visão Dashboard
 */
function construirDashboard() {
  const pecas      = estado.pecas;
  const veiculos   = estado.veiculos;
  const alertas    = pecas.filter(p => p.estoqueMinimo != null && p.quantidade <= p.estoqueMinimo);
  const valorCusto = pecas.reduce((soma, p) => soma + (p.quantidade * (p.precoCusto || 0)), 0);
  const valorVenda = pecas.reduce((soma, p) => soma + (p.quantidade * (p.precoVenda || 0)), 0);
  const semEstoque = pecas.filter(p => p.quantidade === 0);

  // Contagem por categoria para o gráfico de barras proporcional
  const contagemCategorias = {};
  pecas.forEach(p => { contagemCategorias[p.categoria] = (contagemCategorias[p.categoria] || 0) + 1; });
  const listaCategorias = Object.entries(contagemCategorias).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCategoria    = listaCategorias[0]?.[1] || 1;

  return `
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Visão geral do inventário — ${new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="abrirModalPeca()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Peça
        </button>
      </div>
    </div>

    <!-- Cards de métricas gerais -->
    <div class="stats-grid">
      <div class="stat-card orange">
        <div class="stat-card-header">
          <span class="stat-card-label">Total de Peças</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>
        </div>
        <div class="stat-card-value">${pecas.length}</div>
        <div class="stat-card-sub">Itens cadastrados no inventário</div>
      </div>
      <div class="stat-card green">
        <div class="stat-card-header">
          <span class="stat-card-label">Valor em Estoque (custo)</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        </div>
        <div class="stat-card-value" style="font-size:1.4rem">R$ ${formatarMoeda(valorCusto)}</div>
        <div class="stat-card-sub">Venda estimada: R$ ${formatarMoeda(valorVenda)}</div>
      </div>
      <div class="stat-card ${alertas.length > 0 ? 'red' : 'green'}">
        <div class="stat-card-header">
          <span class="stat-card-label">Alertas de Estoque</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        </div>
        <div class="stat-card-value">${alertas.length}</div>
        <div class="stat-card-sub">${semEstoque.length} peça(s) sem estoque</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-card-header">
          <span class="stat-card-label">Veículos Cadastrados</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h.5l2-3h8l2 3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/><circle cx="9" cy="13" r="2"/><circle cx="15" cy="13" r="2"/></svg></div>
        </div>
        <div class="stat-card-value">${veiculos.length}</div>
        <div class="stat-card-sub">Modelos com peças vinculadas</div>
      </div>
    </div>

    <!-- Grade do dashboard: alertas + distribuição por categoria -->
    <div class="dashboard-grid">

      <!-- Painel de alertas de estoque baixo -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">⚠️ Alertas de Estoque Baixo</div>
            <div class="card-subtitle">${alertas.length} item(s) abaixo do mínimo</div>
          </div>
          ${alertas.length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="navegarPara('inventario')">Ver Todos</button>` : ''}
        </div>
        ${alertas.length === 0 ? `
          <div class="empty-state" style="padding:32px">
            <div class="empty-icon">✅</div>
            <p class="empty-title">Estoque sob controle!</p>
            <p class="empty-desc">Nenhuma peça abaixo do mínimo definido.</p>
          </div>
        ` : `
          <div class="alert-list">
            ${alertas.slice(0, 8).map(peca => `
              <div class="alert-row" onclick="verDetalhePeca('${peca.id}')">
                <div class="alert-row-icon">${peca.quantidade === 0 ? '🚫' : '⚠️'}</div>
                <div class="alert-row-info">
                  <div class="alert-row-name">${escaparHTML(peca.nome)}</div>
                  <div class="alert-row-code">${escaparHTML(peca.codigo)}</div>
                </div>
                <div class="alert-row-qty">
                  <div class="qty-val">${peca.quantidade}</div>
                  <div class="qty-label">/ mín ${peca.estoqueMinimo}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Painel de distribuição por categoria (gráfico de barras) -->
      <div class="card">
        <div class="card-header"><div class="card-title">📦 Por Categoria</div></div>
        ${listaCategorias.length === 0
          ? `<p style="color:var(--text-muted);font-size:.82rem">Nenhuma peça cadastrada.</p>`
          : `<div class="category-list">
              ${listaCategorias.map(([categoria, total]) => `
                <div class="cat-row">
                  <div class="cat-row-top">
                    <span class="cat-row-name">${iconeCategoria(categoria)} ${escaparHTML(categoria)}</span>
                    <span class="cat-row-count">${total} peça${total !== 1 ? 's' : ''}</span>
                  </div>
                  <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width:${Math.round((total / maxCategoria) * 100)}%"></div>
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>
  `;
}

// ============================================================
// CONSTRUÇÃO — INVENTÁRIO
// ============================================================

/**
 * Constrói o HTML da visão Inventário com barra de filtros,
 * tabela ordenável com paginação e ações por linha.
 * @returns {string} HTML completo da visão Inventário
 */
function construirInventario() {
  const pecasFiltradas = obterPecasFiltradas();
  const pecasPaginadas = obterPecasPaginadas(pecasFiltradas);
  const totalPaginas   = Math.max(1, Math.ceil(pecasFiltradas.length / ITENS_POR_PAGINA));

  // Gera a seta de ordenação para o cabeçalho da coluna
  const seta = (coluna) => {
    if (estado.ordenacao.coluna !== coluna) return '<span style="opacity:.2">⇅</span>';
    return estado.ordenacao.direcao === 'asc' ? '↑' : '↓';
  };

  // Constrói um <th> clicável para ordenação
  const cabecalho = (coluna, rotulo) =>
    `<th onclick="ordenarPor('${coluna}')" class="${estado.ordenacao.coluna === coluna ? 'sorted' : ''}" title="Ordenar por ${rotulo}">${rotulo} ${seta(coluna)}</th>`;

  return `
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">Inventário</h1>
        <p class="page-subtitle">${pecasFiltradas.length} peça${pecasFiltradas.length !== 1 ? 's' : ''} encontrada${pecasFiltradas.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="exportarCSV()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
        <button class="btn btn-primary" onclick="abrirModalPeca()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Peça
        </button>
      </div>
    </div>

    <!-- Barra de filtros: busca textual + categoria + veículo -->
    <div class="search-bar">
      <div class="search-input-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="inv-search" type="text"
          placeholder="Pesquisar por código, nome ou fornecedor..."
          value="${escaparHTML(estado.filtros.busca)}"
          oninput="aoMudarBusca(this.value)" autocomplete="off" />
      </div>
      <!-- Filtro por categoria -->
      <select class="filter-select" id="inv-cat" onchange="aoMudarCategoria(this.value)">
        <option value="">Todas as Categorias</option>
        ${CATEGORIAS.map(c => `<option value="${c}" ${estado.filtros.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <!-- Filtro por modelo de veículo (cruzamento peça × veículo) -->
      <select class="filter-select" id="inv-vei" onchange="aoMudarVeiculo(this.value)">
        <option value="">Todos os Veículos</option>
        ${estado.veiculos.map(v => `<option value="${v.id}" ${estado.filtros.veiculo === v.id ? 'selected' : ''}>${escaparHTML(obterLabelVeiculo(v))}</option>`).join('')}
      </select>
      <!-- Botão limpar (visível somente quando há filtro ativo) -->
      ${(estado.filtros.busca || estado.filtros.categoria || estado.filtros.veiculo)
        ? `<button class="btn btn-ghost btn-sm" onclick="limparFiltros()">✕ Limpar</button>`
        : ''}
    </div>

    <!-- Tabela de peças -->
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table" id="inv-table">
          <thead>
            <tr>
              ${cabecalho('codigo','Código')}
              ${cabecalho('nome','Nome da Peça')}
              ${cabecalho('categoria','Categoria')}
              <th>Veículos</th>
              ${cabecalho('quantidade','Qtd.')}
              <th>Est. Mín.</th>
              ${cabecalho('localizacao','Localização')}
              ${cabecalho('precoCusto','Custo (R$)')}
              ${cabecalho('precoVenda','Venda (R$)')}
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${pecasPaginadas.length === 0 ? `
              <tr><td colspan="10" style="text-align:center;padding:48px">
                <div class="empty-state" style="padding:0">
                  <div class="empty-icon">🔍</div>
                  <p class="empty-title">Nenhuma peça encontrada</p>
                  <p class="empty-desc">Tente outros filtros ou cadastre uma nova peça.</p>
                  <button class="btn btn-primary" onclick="abrirModalPeca()">Cadastrar Peça</button>
                </div>
              </td></tr>
            ` : pecasPaginadas.map(peca => {
              // Status visual do estoque da peça
              const estoqueAbaixoMinimo = peca.estoqueMinimo != null && peca.quantidade <= peca.estoqueMinimo;
              const estoqueZerado       = peca.quantidade === 0;
              // Tags dos veículos compatíveis com esta peça
              const tagsVeiculos = (peca.veiculosIds || [])
                .map(idVeiculo => estado.veiculos.find(v => v.id === idVeiculo))
                .filter(Boolean)
                .map(v => `<span class="vehicle-tag">${escaparHTML(v.marca)} ${escaparHTML(v.modelo)}</span>`)
                .join('');
              return `
                <tr class="${estoqueAbaixoMinimo ? 'low-stock' : ''}">
                  <td class="td-code">${escaparHTML(peca.codigo)}</td>
                  <td class="td-name" title="${escaparHTML(peca.nome)}">${escaparHTML(peca.nome)}</td>
                  <td><span class="badge badge-gray">${iconeCategoria(peca.categoria)} ${escaparHTML(peca.categoria)}</span></td>
                  <td><div class="vehicle-tags">${tagsVeiculos || '<span style="color:var(--text-muted);font-size:.75rem">—</span>'}</div></td>
                  <td>
                    <span class="badge ${estoqueZerado ? 'badge-red' : estoqueAbaixoMinimo ? 'badge-red' : 'badge-green'}">
                      ${estoqueZerado ? '🚫' : estoqueAbaixoMinimo ? '⚠️' : '✓'} ${peca.quantidade}
                    </span>
                  </td>
                  <td style="color:var(--text-muted)">
                    ${peca.estoqueMinimo != null ? peca.estoqueMinimo : '<span style="color:var(--text-muted);font-size:.75rem">—</span>'}
                  </td>
                  <td>${escaparHTML(peca.localizacao) || '<span style="color:var(--text-muted)">—</span>'}</td>
                  <td class="monospace" style="color:var(--text-secondary)">R$ ${formatarMoeda(peca.precoCusto)}</td>
                  <td class="monospace" style="color:var(--green-400)">R$ ${formatarMoeda(peca.precoVenda)}</td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-icon btn-secondary" onclick="verDetalhePeca('${peca.id}')" title="Ver detalhes">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button class="btn btn-icon btn-secondary" onclick="editarPeca('${peca.id}')" title="Editar">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn btn-icon btn-danger" onclick="confirmarExclusaoPeca('${peca.id}')" title="Excluir">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Rodapé com informações e controles de paginação -->
      <div class="table-footer">
        <span class="table-info">
          Mostrando ${Math.min((estado.pagina - 1) * ITENS_POR_PAGINA + 1, pecasFiltradas.length)}–${Math.min(estado.pagina * ITENS_POR_PAGINA, pecasFiltradas.length)} de ${pecasFiltradas.length} itens
        </span>
        <div class="pagination">
          <button class="page-btn" onclick="irParaPagina(${estado.pagina - 1})" ${estado.pagina <= 1 ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          ${construirBotoesPaginacao(estado.pagina, totalPaginas)}
          <button class="page-btn" onclick="irParaPagina(${estado.pagina + 1})" ${estado.pagina >= totalPaginas ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Constrói os botões numéricos de paginação com reticências para intervalos grandes.
 * @param {number} paginaAtual  - Página corrente
 * @param {number} totalPaginas - Total de páginas disponíveis
 * @returns {string} HTML dos botões de paginação
 */
function construirBotoesPaginacao(paginaAtual, totalPaginas) {
  if (totalPaginas <= 1) return '';
  const botoes    = [];
  const intervalo = [];
  for (let i = 1; i <= totalPaginas; i++) {
    if (i === 1 || i === totalPaginas || (i >= paginaAtual - 1 && i <= paginaAtual + 1)) intervalo.push(i);
  }
  let paginaAnterior = null;
  for (const pagina of intervalo) {
    if (paginaAnterior && pagina - paginaAnterior > 1) botoes.push('<span style="color:var(--text-muted);padding:0 4px">…</span>');
    botoes.push(`<button class="page-btn ${pagina === paginaAtual ? 'active' : ''}" onclick="irParaPagina(${pagina})">${pagina}</button>`);
    paginaAnterior = pagina;
  }
  return botoes.join('');
}

// Handlers dos filtros do inventário
/** Atualiza a busca textual e reinicia a paginação */
function aoMudarBusca(valor)     { estado.filtros.busca     = valor; estado.pagina = 1; renderizarVisao(); }
/** Atualiza o filtro de categoria e reinicia a paginação */
function aoMudarCategoria(valor) { estado.filtros.categoria = valor; estado.pagina = 1; renderizarVisao(); }
/** Atualiza o filtro de veículo e reinicia a paginação */
function aoMudarVeiculo(valor)   { estado.filtros.veiculo   = valor; estado.pagina = 1; renderizarVisao(); }
/** Remove todos os filtros ativos e exibe a lista completa */
function limparFiltros()         { estado.filtros = { busca: '', categoria: '', veiculo: '' }; estado.pagina = 1; renderizarVisao(); }

/**
 * Define a coluna de ordenação. Se já é a coluna ativa, inverte a direção.
 * @param {string} coluna - Nome do campo de ordenação
 */
function ordenarPor(coluna) {
  if (estado.ordenacao.coluna === coluna) {
    estado.ordenacao.direcao = estado.ordenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    estado.ordenacao.coluna  = coluna;
    estado.ordenacao.direcao = 'asc';
  }
  renderizarVisao();
}

/**
 * Navega para a página informada respeitando os limites mínimo e máximo.
 * @param {number} pagina - Número da página desejada
 */
function irParaPagina(pagina) {
  const totalPaginas = Math.max(1, Math.ceil(obterPecasFiltradas().length / ITENS_POR_PAGINA));
  estado.pagina      = Math.min(Math.max(1, pagina), totalPaginas);
  renderizarVisao();
}

// ============================================================
// CONSTRUÇÃO — VEÍCULOS
// ============================================================

/**
 * Constrói o HTML da visão Veículos com grid de cards por modelo.
 * Cada card exibe o total de peças vinculadas e permite filtrar o inventário.
 * @returns {string} HTML completo da visão Veículos
 */
function construirVeiculos() {
  const termoBusca = (document._buscaVeiculos || '').toLowerCase();
  const veiculosFiltrados = termoBusca
    ? estado.veiculos.filter(v => obterLabelVeiculo(v).toLowerCase().includes(termoBusca))
    : estado.veiculos;

  return `
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">Veículos</h1>
        <p class="page-subtitle">Modelos cadastrados e vinculados ao inventário</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="abrirModalVeiculo()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Veículo
        </button>
      </div>
    </div>
    <div class="search-bar" style="margin-bottom:20px">
      <div class="search-input-wrap" style="max-width:380px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="text" placeholder="Buscar por marca ou modelo..."
          oninput="document._buscaVeiculos=this.value; renderizarVisao()" autocomplete="off" />
      </div>
    </div>
    ${veiculosFiltrados.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">🚗</div>
        <p class="empty-title">Nenhum veículo encontrado</p>
        <p class="empty-desc">Cadastre modelos de veículos para vinculá-los às peças do inventário.</p>
        <button class="btn btn-primary" onclick="abrirModalVeiculo()">Cadastrar Veículo</button>
      </div>
    ` : `
      <div class="vehicles-grid">
        ${veiculosFiltrados.map(veiculo => {
          // Conta quantas peças estão vinculadas a este modelo
          const totalVinculadas = estado.pecas.filter(p => (p.veiculosIds || []).includes(veiculo.id)).length;
          const cor = corMarca(veiculo.marca);
          return `
            <div class="vehicle-card">
              <div class="vehicle-card-top">
                <div class="vehicle-brand-badge" style="background:linear-gradient(135deg,${cor}cc,${cor})">
                  ${inicialMarca(veiculo.marca)}
                </div>
                <div class="vehicle-actions">
                  <button class="btn btn-icon btn-secondary" onclick="editarVeiculo('${veiculo.id}')" title="Editar">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn btn-icon btn-danger" onclick="confirmarExclusaoVeiculo('${veiculo.id}')" title="Excluir">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </div>
              <div class="vehicle-name">${escaparHTML(veiculo.marca)} ${escaparHTML(veiculo.modelo)}</div>
              <div class="vehicle-detail">
                ${veiculo.ano ? `📅 ${escaparHTML(veiculo.ano)}` : ''}
                ${veiculo.obs ? ` · ${escaparHTML(veiculo.obs)}` : ''}
              </div>
              <div class="vehicle-card-footer">
                <span class="badge badge-blue">📦 ${totalVinculadas} peça${totalVinculadas !== 1 ? 's' : ''}</span>
                <!-- Filtra o inventário por este veículo ao clicar -->
                <button class="btn btn-secondary btn-sm" onclick="verPecasVeiculo('${veiculo.id}')">Ver Peças →</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}

/**
 * Atalho: aplica o filtro de veículo no inventário e navega para a visão.
 * @param {string} idVeiculo - ID do veículo a filtrar
 */
function verPecasVeiculo(idVeiculo) {
  estado.filtros.veiculo = idVeiculo;
  navegarPara('inventario');
}

// ============================================================
// CONSTRUÇÃO — RELATÓRIOS
// ============================================================

/**
 * Constrói o HTML da visão Relatórios com métricas financeiras,
 * ranking das peças mais valiosas e botões de exportação.
 * @returns {string} HTML completo da visão Relatórios
 */
function construirRelatorios() {
  const pecas = estado.pecas;

  // Métricas financeiras do inventário
  const pecasAlerta     = pecas.filter(p => p.estoqueMinimo != null && p.quantidade <= p.estoqueMinimo);
  const pecasSemEstoque = pecas.filter(p => p.quantidade === 0);
  const totalCusto      = pecas.reduce((soma, p) => soma + (p.quantidade * (p.precoCusto || 0)), 0);
  const totalVenda      = pecas.reduce((soma, p) => soma + (p.quantidade * (p.precoVenda || 0)), 0);
  const margemBruta     = totalCusto > 0 ? ((totalVenda - totalCusto) / totalCusto * 100) : 0;

  // Top 5: peças com maior valor total em estoque (quantidade × custo unitário)
  const top5 = [...pecas].sort((a, b) => (b.quantidade * b.precoCusto) - (a.quantidade * a.precoCusto)).slice(0, 5);

  return `
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">Relatórios</h1>
        <p class="page-subtitle">Análises financeiras e exportações do inventário</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="exportarCSV()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar Inventário CSV
        </button>
      </div>
    </div>
    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card green"><div class="stat-card-header"><span class="stat-card-label">Valor Total Custo</span><div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div></div><div class="stat-card-value" style="font-size:1.3rem">R$ ${formatarMoeda(totalCusto)}</div><div class="stat-card-sub">Valor investido no estoque</div></div>
      <div class="stat-card orange"><div class="stat-card-header"><span class="stat-card-label">Valor Total Venda</span><div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div></div><div class="stat-card-value" style="font-size:1.3rem">R$ ${formatarMoeda(totalVenda)}</div><div class="stat-card-sub">Receita potencial estimada</div></div>
      <div class="stat-card blue"><div class="stat-card-header"><span class="stat-card-label">Margem Estimada</span><div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div></div><div class="stat-card-value">${margemBruta.toFixed(1)}%</div><div class="stat-card-sub">Lucro bruto sobre custo</div></div>
      <div class="stat-card red"><div class="stat-card-header"><span class="stat-card-label">Peças Críticas</span><div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div></div><div class="stat-card-value">${pecasAlerta.length}</div><div class="stat-card-sub">${pecasSemEstoque.length} com estoque zerado</div></div>
    </div>
    <div class="reports-grid">
      <!-- Ranking das 5 peças com maior valor em estoque -->
      <div class="card" style="grid-column:1/-1">
        <div class="card-header"><div class="card-title">🏆 Top 5 Itens Mais Valiosos em Estoque</div></div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>#</th><th>Código</th><th>Nome</th><th>Qtd.</th><th>Custo Unit.</th><th>Total Custo</th><th>Total Venda</th></tr></thead>
            <tbody>
              ${top5.map((peca, indice) => `
                <tr>
                  <td><span class="badge ${indice === 0 ? 'badge-orange' : 'badge-gray'}">${indice + 1}º</span></td>
                  <td class="td-code">${escaparHTML(peca.codigo)}</td>
                  <td class="td-name">${escaparHTML(peca.nome)}</td>
                  <td>${peca.quantidade}</td>
                  <td class="monospace">R$ ${formatarMoeda(peca.precoCusto)}</td>
                  <td class="monospace" style="color:var(--text-primary);font-weight:600">R$ ${formatarMoeda(peca.quantidade * peca.precoCusto)}</td>
                  <td class="monospace" style="color:var(--green-400)">R$ ${formatarMoeda(peca.quantidade * peca.precoVenda)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Opções de exportação -->
      <div class="card">
        <div class="report-card-icon" style="background:var(--green-glow);color:var(--green-400)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="report-card-title">Inventário Completo (CSV)</div>
        <p class="report-card-desc">Exporta todas as peças com campos completos: código, nome, categoria, veículos, quantidades e preços.</p>
        <button class="btn btn-primary w-full" onclick="exportarCSV()">Exportar CSV</button>
      </div>
      <div class="card">
        <div class="report-card-icon" style="background:var(--red-glow);color:var(--red-400)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <div class="report-card-title">Estoque Crítico (CSV)</div>
        <p class="report-card-desc">Exporta apenas as peças com estoque abaixo do mínimo ou zerado, para reposição urgente.</p>
        <button class="btn btn-danger w-full" style="justify-content:center" onclick="exportarCriticos()">Exportar Críticos</button>
      </div>
      <div class="card">
        <div class="report-card-icon" style="background:var(--blue-glow);color:var(--blue-400)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h.5l2-3h8l2 3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/><circle cx="9" cy="13" r="2"/><circle cx="15" cy="13" r="2"/></svg></div>
        <div class="report-card-title">Peças por Veículo (CSV)</div>
        <p class="report-card-desc">Exporta o mapeamento veículo → peças vinculadas para consulta de compatibilidade por modelo.</p>
        <button class="btn btn-secondary w-full" style="justify-content:center" onclick="exportarPorVeiculo()">Exportar Mapeamento</button>
      </div>
    </div>
  `;
}

// ============================================================
// EXPORTAÇÃO CSV
// ============================================================

/** Exporta o inventário completo em CSV com BOM UTF-8 (compatível com Excel) */
function exportarCSV() {
  const cabecalhos = ['Código','Nome','Categoria','Veículos Compatíveis','Qtd. Estoque','Estoque Mínimo','Localização','Fornecedor','Preço Custo (R$)','Preço Venda (R$)','Observações','Data Cadastro'];
  const linhas = estado.pecas.map(peca => {
    const veiculosCompativeis = (peca.veiculosIds || [])
      .map(id => estado.veiculos.find(v => v.id === id)).filter(Boolean)
      .map(v => obterLabelVeiculo(v)).join('; ');
    return [
      peca.codigo, peca.nome, peca.categoria, veiculosCompativeis,
      peca.quantidade, peca.estoqueMinimo ?? '',
      peca.localizacao || '', peca.fornecedor || '',
      peca.precoCusto || 0, peca.precoVenda || 0,
      peca.obs || '', formatarData(peca.dataCadastro),
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  baixarCSV([cabecalhos.join(','), ...linhas].join('\n'), 'mecastock_inventario.csv');
  exibirToast('success', '✅ CSV exportado com sucesso!');
}

/** Exporta somente as peças com estoque crítico (abaixo do mínimo ou zerado) */
function exportarCriticos() {
  const criticas = estado.pecas.filter(p => p.estoqueMinimo != null && p.quantidade <= p.estoqueMinimo);
  if (criticas.length === 0) { exibirToast('info', 'ℹ️ Nenhum item crítico no momento.'); return; }
  const cabecalhos = ['Código','Nome','Categoria','Qtd. Atual','Estoque Mínimo','Localização','Fornecedor'];
  const linhas = criticas.map(p => [p.codigo, p.nome, p.categoria, p.quantidade, p.estoqueMinimo, p.localizacao||'', p.fornecedor||'']
    .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  baixarCSV([cabecalhos.join(','), ...linhas].join('\n'), 'mecastock_criticos.csv');
  exibirToast('success', `✅ ${criticas.length} item(s) crítico(s) exportado(s)!`);
}

/** Exporta o mapeamento veículo → peças vinculadas */
function exportarPorVeiculo() {
  if (estado.veiculos.length === 0) { exibirToast('info', 'ℹ️ Nenhum veículo cadastrado.'); return; }
  const cabecalhos = ['Veículo','Marca','Modelo','Ano','Código Peça','Nome Peça','Categoria','Qtd.'];
  const linhas = [];
  estado.veiculos.forEach(veiculo => {
    const pecasDoVeiculo = estado.pecas.filter(p => (p.veiculosIds || []).includes(veiculo.id));
    if (pecasDoVeiculo.length === 0) {
      linhas.push([obterLabelVeiculo(veiculo), veiculo.marca, veiculo.modelo, veiculo.ano||'','','Nenhuma peça vinculada','','']
        .map(x => `"${String(x).replace(/"/g,'""')}"`).join(','));
    } else {
      pecasDoVeiculo.forEach(p => {
        linhas.push([obterLabelVeiculo(veiculo), veiculo.marca, veiculo.modelo, veiculo.ano||'', p.codigo, p.nome, p.categoria, p.quantidade]
          .map(x => `"${String(x).replace(/"/g,'""')}"`).join(','));
      });
    }
  });
  baixarCSV([cabecalhos.join(','), ...linhas].join('\n'), 'mecastock_veiculos.csv');
  exibirToast('success', '✅ Mapeamento de veículos exportado!');
}

/**
 * Cria e dispara o download de um arquivo CSV no navegador.
 * @param {string} conteudo    - Conteúdo textual do CSV
 * @param {string} nomeArquivo - Nome do arquivo gerado
 */
function baixarCSV(conteudo, nomeArquivo) {
  const bom  = '\uFEFF'; // BOM: necessário para compatibilidade com Excel
  const blob = new Blob([bom + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = nomeArquivo; link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// MODAL — PEÇA
// ============================================================

/**
 * Abre o modal de cadastro ou edição de peça.
 * @param {string|null} id - ID da peça a editar, ou null para nova
 */
function abrirModalPeca(id = null) {
  estado.modal      = 'peca';
  estado.idEditando = id;
  const peca = id ? estado.pecas.find(p => p.id === id) : null;
  estado.veiculosSelecionados = peca ? [...(peca.veiculosIds || [])] : [];
  estado.buscaTag = '';

  document.getElementById('modal-container').innerHTML = construirModalPeca(peca);
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { const c = document.getElementById('m-codigo'); if (c) c.focus(); }, 150);
}

/**
 * Constrói o HTML interno do formulário de peça.
 * @param {Object|null} peca - Dados existentes (edição) ou null (novo)
 * @returns {string} HTML do modal
 */
function construirModalPeca(peca) {
  const d = peca || {};
  return `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
        <span class="modal-title">${peca ? 'Editar Peça' : 'Cadastrar Nova Peça'}</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <!-- Código: identificador único da peça no inventário -->
        <div class="form-group">
          <label class="form-label" for="m-codigo">Código da Peça <span class="required">*</span></label>
          <input class="form-input" id="m-codigo" type="text" placeholder="Ex: FILT-001" value="${escaparHTML(d.codigo||'')}" autocomplete="off" />
        </div>
        <!-- Nome descritivo da peça -->
        <div class="form-group">
          <label class="form-label" for="m-nome">Nome da Peça <span class="required">*</span></label>
          <input class="form-input" id="m-nome" type="text" placeholder="Ex: Filtro de Óleo" value="${escaparHTML(d.nome||'')}" />
        </div>
        <!-- Categoria da peça (Motor, Freios, etc.) -->
        <div class="form-group">
          <label class="form-label" for="m-categoria">Categoria <span class="required">*</span></label>
          <select class="form-select" id="m-categoria">
            <option value="">Selecione...</option>
            ${CATEGORIAS.map(c => `<option value="${c}" ${(d.categoria||'')=== c?'selected':''}>${iconeCategoria(c)} ${c}</option>`).join('')}
          </select>
        </div>
        <!-- Seleção múltipla de veículos compatíveis com esta peça -->
        <div class="form-group">
          <label class="form-label">Veículos Compatíveis</label>
          <div class="tags-group-wrap" id="tags-group">
            <div class="tags-input-wrap" id="tags-input-wrap" onclick="alternarDropdownTags()">
              <div id="tags-chips">${construirChipsTags()}</div>
              <span style="color:var(--text-muted);font-size:.8rem;padding:2px 4px">${estado.veiculosSelecionados.length===0?'Selecionar veículos...':''}</span>
            </div>
            <div class="tags-dropdown" id="tags-dropdown" style="display:none">
              <div class="tags-search-wrap">
                <input class="tags-search" id="tags-search-input" type="text" placeholder="Buscar veículo..."
                  oninput="filtrarDropdownTags(this.value)" onclick="event.stopPropagation()" autocomplete="off" />
              </div>
              <div id="tags-dropdown-list">${construirListaDropdownTags('')}</div>
            </div>
          </div>
          <span class="form-hint">Clique para selecionar os modelos compatíveis</span>
        </div>
        <!-- Quantidade atual em estoque -->
        <div class="form-group">
          <label class="form-label" for="m-quantidade">Quantidade em Estoque <span class="required">*</span></label>
          <input class="form-input" id="m-quantidade" type="number" min="0" placeholder="0" value="${d.quantidade??0}" />
        </div>
        <!-- Estoque mínimo: dispara alerta quando abaixo deste valor (opcional) -->
        <div class="form-group">
          <label class="form-label" for="m-estoque-min">Estoque Mínimo <span style="color:var(--text-muted);font-weight:400">(opcional)</span></label>
          <input class="form-input" id="m-estoque-min" type="number" min="0" placeholder="Deixe vazio para não alertar" value="${d.estoqueMinimo??''}" />
          <span class="form-hint">Sistema alerta quando estoque ≤ este valor</span>
        </div>
        <!-- Localização física da peça (prateleira, gaveta, depósito) -->
        <div class="form-group">
          <label class="form-label" for="m-localizacao">Localização</label>
          <input class="form-input" id="m-localizacao" type="text" placeholder="Ex: Prateleira A3, Gaveta 2..." value="${escaparHTML(d.localizacao||'')}" />
        </div>
        <!-- Fornecedor desta peça -->
        <div class="form-group">
          <label class="form-label" for="m-fornecedor">Fornecedor</label>
          <input class="form-input" id="m-fornecedor" type="text" placeholder="Nome do fornecedor" value="${escaparHTML(d.fornecedor||'')}" />
        </div>
        <!-- Preço de custo (compra) -->
        <div class="form-group">
          <label class="form-label" for="m-custo">Preço de Custo (R$)</label>
          <input class="form-input" id="m-custo" type="number" min="0" step="0.01" placeholder="0,00" value="${d.precoCusto??''}" />
        </div>
        <!-- Preço de venda (cobrado ao cliente) -->
        <div class="form-group">
          <label class="form-label" for="m-venda">Preço de Venda (R$)</label>
          <input class="form-input" id="m-venda" type="number" min="0" step="0.01" placeholder="0,00" value="${d.precoVenda??''}" />
        </div>
        <!-- Campo livre para observações adicionais -->
        <div class="form-group full">
          <label class="form-label" for="m-obs">Observações</label>
          <textarea class="form-textarea" id="m-obs" placeholder="Informações adicionais sobre a peça...">${escaparHTML(d.obs||'')}</textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarPeca()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        ${peca ? 'Salvar Alterações' : 'Cadastrar Peça'}
      </button>
    </div>
  `;
}

/** Constrói os chips (tags) dos veículos selecionados no formulário */
function construirChipsTags() {
  return estado.veiculosSelecionados.map(id => {
    const v = estado.veiculos.find(vv => vv.id === id);
    if (!v) return '';
    return `<div class="tag-chip">${escaparHTML(v.marca)} ${escaparHTML(v.modelo)}<button type="button" onclick="removerTag('${id}',event)" title="Remover">×</button></div>`;
  }).join('');
}

/**
 * Constrói os itens do dropdown de veículos, filtrados pela busca.
 * @param {string} termoBusca - Texto de busca dentro do dropdown
 */
function construirListaDropdownTags(termoBusca) {
  const busca = termoBusca.toLowerCase();
  const lista = estado.veiculos.filter(v => !busca || obterLabelVeiculo(v).toLowerCase().includes(busca));
  if (lista.length === 0) return `<div class="tags-dropdown-empty">Nenhum veículo encontrado</div>`;
  return lista.map(v => {
    const selecionado = estado.veiculosSelecionados.includes(v.id);
    const cor = corMarca(v.marca);
    return `<div class="tags-dropdown-item ${selecionado?'selected':''}" onclick="alternarTag('${v.id}',event)">
      <span style="width:28px;height:28px;background:${cor}33;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:${cor}">${inicialMarca(v.marca)}</span>
      ${escaparHTML(obterLabelVeiculo(v))}
    </div>`;
  }).join('');
}

/** Abre ou fecha o dropdown de seleção de veículos compatíveis */
function alternarDropdownTags() {
  estado.dropdownTagsAberto = !estado.dropdownTagsAberto;
  const dd = document.getElementById('tags-dropdown');
  if (!dd) return;
  dd.style.display = estado.dropdownTagsAberto ? 'block' : 'none';
  if (estado.dropdownTagsAberto) setTimeout(() => { const c = document.getElementById('tags-search-input'); if (c) c.focus(); }, 50);
}

/** Filtra os itens do dropdown conforme o usuário digita */
function filtrarDropdownTags(valor) {
  const lista = document.getElementById('tags-dropdown-list');
  if (lista) lista.innerHTML = construirListaDropdownTags(valor);
}

/**
 * Adiciona ou remove um veículo da seleção de compatíveis.
 * @param {string} idVeiculo - ID do veículo a alternar
 * @param {MouseEvent} evento - Evento (evita propagação)
 */
function alternarTag(idVeiculo, evento) {
  evento.stopPropagation();
  const pos = estado.veiculosSelecionados.indexOf(idVeiculo);
  if (pos === -1) estado.veiculosSelecionados.push(idVeiculo);
  else estado.veiculosSelecionados.splice(pos, 1);

  const chips = document.getElementById('tags-chips');
  if (chips) chips.innerHTML = construirChipsTags();
  const wrap = document.getElementById('tags-input-wrap');
  if (wrap) { const ph = wrap.querySelector('span'); if (ph) ph.textContent = estado.veiculosSelecionados.length===0?'Selecionar veículos...':''; }
  const termoBusca = document.getElementById('tags-search-input')?.value || '';
  const listagem = document.getElementById('tags-dropdown-list');
  if (listagem) listagem.innerHTML = construirListaDropdownTags(termoBusca);
}

/**
 * Remove um veículo específico dos chips de compatíveis.
 * @param {string} idVeiculo - ID do veículo a remover
 * @param {MouseEvent} evento - Evento (evita propagação)
 */
function removerTag(idVeiculo, evento) {
  evento.stopPropagation();
  estado.veiculosSelecionados = estado.veiculosSelecionados.filter(v => v !== idVeiculo);
  const chips = document.getElementById('tags-chips');
  if (chips) chips.innerHTML = construirChipsTags();
  const wrap = document.getElementById('tags-input-wrap');
  if (wrap) { const ph = wrap.querySelector('span'); if (ph) ph.textContent = estado.veiculosSelecionados.length===0?'Selecionar veículos...':''; }
}

// ============================================================
// SALVAR PEÇA
// ============================================================

/**
 * Lê, valida e persiste os dados do formulário de peça.
 * Suporta criação de novo registro e atualização de existente.
 */
function salvarPeca() {
  // Leitura dos campos do formulário
  const codigo        = sanitizar(document.getElementById('m-codigo')?.value);
  const nome          = sanitizar(document.getElementById('m-nome')?.value);
  const categoria     = document.getElementById('m-categoria')?.value;
  const quantidade    = parseInt(document.getElementById('m-quantidade')?.value || '0');
  const estoqueMinRaw = document.getElementById('m-estoque-min')?.value.trim();
  const estoqueMinimo = estoqueMinRaw === '' ? null : parseInt(estoqueMinRaw);
  const localizacao   = sanitizar(document.getElementById('m-localizacao')?.value);
  const fornecedor    = sanitizar(document.getElementById('m-fornecedor')?.value);
  const precoCusto    = parseFloat(document.getElementById('m-custo')?.value || 0);
  const precoVenda    = parseFloat(document.getElementById('m-venda')?.value || 0);
  const obs           = sanitizar(document.getElementById('m-obs')?.value);

  // Validações dos campos obrigatórios
  if (!codigo)    { exibirToast('error', '❌ Código da peça é obrigatório.');  return; }
  if (!nome)      { exibirToast('error', '❌ Nome da peça é obrigatório.');    return; }
  if (!categoria) { exibirToast('error', '❌ Categoria é obrigatória.');       return; }
  if (isNaN(quantidade) || quantidade < 0) { exibirToast('error', '❌ Quantidade inválida.'); return; }

  // Verifica duplicidade de código (exceto o próprio registro em edição)
  const duplicado = estado.pecas.find(p => p.codigo.toLowerCase() === codigo.toLowerCase() && p.id !== estado.idEditando);
  if (duplicado) { exibirToast('error', `❌ Código "${codigo}" já existe no inventário.`); return; }

  const agora = new Date().toISOString();

  if (estado.idEditando) {
    // Atualiza o registro existente
    estado.pecas = estado.pecas.map(p => p.id !== estado.idEditando ? p : {
      ...p, codigo, nome, categoria,
      veiculosIds: [...estado.veiculosSelecionados],
      quantidade, estoqueMinimo, localizacao, fornecedor,
      precoCusto, precoVenda, obs, dataAtualizacao: agora,
    });
    exibirToast('success', '✅ Peça atualizada com sucesso!');
  } else {
    // Cria novo registro com ID único
    estado.pecas.push({
      id: gerarId(), codigo, nome, categoria,
      veiculosIds: [...estado.veiculosSelecionados],
      quantidade, estoqueMinimo, localizacao, fornecedor,
      precoCusto, precoVenda, obs,
      dataCadastro: agora, dataAtualizacao: agora,
    });
    exibirToast('success', '✅ Peça cadastrada com sucesso!');
  }

  Armazenamento.salvarPecas(estado.pecas);
  fecharModal();
  renderizarEstatisticasLateral();
  atualizarBadgeNotificacao();
  renderizarVisao();
}

// ============================================================
// AÇÕES SOBRE PEÇAS
// ============================================================

/** Abre o formulário de edição para a peça informada */
function editarPeca(id) { abrirModalPeca(id); }

/**
 * Abre o modal de visualização de detalhes de uma peça (somente leitura).
 * @param {string} id - ID da peça a visualizar
 */
function verDetalhePeca(id) {
  const peca = estado.pecas.find(x => x.id === id);
  if (!peca) return;
  if (estado.notificacaoAberta) alternarNotificacoes();

  const veiculosCompativeis = (peca.veiculosIds || [])
    .map(idV => estado.veiculos.find(v => v.id === idV)).filter(Boolean);
  const abaixoMinimo = peca.estoqueMinimo != null && peca.quantidade <= peca.estoqueMinimo;
  const zerado       = peca.quantidade === 0;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
        <span class="modal-title">Detalhes da Peça</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body">
      <!-- Cabeçalho resumido com nome, código e status -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:14px;background:var(--bg-elevated);border-radius:var(--radius-md)">
        <div style="font-size:2rem">${iconeCategoria(peca.categoria)}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${escaparHTML(peca.nome)}</div>
          <div style="font-family:monospace;color:var(--orange-400);font-size:.9rem;font-weight:700">${escaparHTML(peca.codigo)}</div>
        </div>
        <div style="margin-left:auto">
          <span class="badge ${zerado?'badge-red':abaixoMinimo?'badge-red':'badge-green'}" style="font-size:.85rem;padding:5px 12px">
            ${zerado?'🚫 Zerado':abaixoMinimo?'⚠️ Baixo':'✓ OK'} — ${peca.quantidade} un.
          </span>
        </div>
      </div>
      <!-- Grade de campos informativos -->
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Categoria</div><div class="detail-value">${iconeCategoria(peca.categoria)} ${escaparHTML(peca.categoria)}</div></div>
        <div class="detail-field"><div class="detail-label">Localização</div><div class="detail-value">${escaparHTML(peca.localizacao)||'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Quantidade</div><div class="detail-value" style="font-size:1.3rem;font-weight:800;color:${zerado?'var(--red-400)':abaixoMinimo?'var(--red-400)':'var(--green-400)'}">${peca.quantidade}</div></div>
        <div class="detail-field"><div class="detail-label">Estoque Mínimo</div><div class="detail-value">${peca.estoqueMinimo!=null?peca.estoqueMinimo:'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Preço de Custo</div><div class="detail-value price">R$ ${formatarMoeda(peca.precoCusto)}</div></div>
        <div class="detail-field"><div class="detail-label">Preço de Venda</div><div class="detail-value price" style="color:var(--green-400)">R$ ${formatarMoeda(peca.precoVenda)}</div></div>
        <div class="detail-field"><div class="detail-label">Fornecedor</div><div class="detail-value">${escaparHTML(peca.fornecedor)||'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Cadastrado em</div><div class="detail-value">${formatarData(peca.dataCadastro)}</div></div>
      </div>
      ${peca.obs?`<div style="margin-bottom:16px"><div class="detail-label">Observações</div><div style="margin-top:6px;padding:10px 12px;background:var(--bg-elevated);border-radius:var(--radius-md);font-size:.85rem;color:var(--text-secondary);line-height:1.5">${escaparHTML(peca.obs)}</div></div>`:''}
      <!-- Lista de veículos compatíveis com esta peça -->
      <div>
        <div class="detail-label" style="margin-bottom:8px">Veículos Compatíveis</div>
        ${veiculosCompativeis.length===0
          ?'<p style="color:var(--text-muted);font-size:.82rem">Nenhum veículo vinculado.</p>'
          :`<div style="display:flex;gap:6px;flex-wrap:wrap">
            ${veiculosCompativeis.map(v=>`
              <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--blue-glow);border:1px solid rgba(59,130,246,.3);border-radius:var(--radius-full)">
                <span style="width:20px;height:20px;background:${corMarca(v.marca)};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:800;color:white">${inicialMarca(v.marca)}</span>
                <span style="font-size:.78rem;font-weight:500;color:var(--blue-400)">${escaparHTML(obterLabelVeiculo(v))}</span>
              </div>`).join('')}
          </div>`}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="fecharModal()">Fechar</button>
      <button class="btn btn-secondary" onclick="fecharModal();editarPeca('${peca.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Abre modal de confirmação antes de excluir uma peça.
 * @param {string} id - ID da peça a excluir
 */
function confirmarExclusaoPeca(id) {
  const peca = estado.pecas.find(x => x.id === id);
  if (!peca) return;
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon" style="background:var(--red-glow);color:var(--red-400)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
        <span class="modal-title">Excluir Peça</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:32px 24px">
      <div style="font-size:3rem;margin-bottom:16px">🗑️</div>
      <p style="font-size:1rem;font-weight:600;color:var(--text-primary);margin-bottom:8px">Excluir "${escaparHTML(peca.nome)}"?</p>
      <p style="font-size:.85rem;color:var(--text-muted)">Esta ação não pode ser desfeita. O item será removido permanentemente do inventário.</p>
    </div>
    <div class="modal-footer" style="justify-content:center;gap:16px">
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-danger" style="padding:9px 24px" onclick="excluirPeca('${id}')">Sim, Excluir</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Remove definitivamente a peça do armazenamento.
 * @param {string} id - ID da peça a excluir
 */
function excluirPeca(id) {
  estado.pecas = estado.pecas.filter(p => p.id !== id);
  Armazenamento.salvarPecas(estado.pecas);
  fecharModal();
  renderizarEstatisticasLateral();
  atualizarBadgeNotificacao();
  renderizarVisao();
  exibirToast('success', '🗑️ Peça excluída do inventário.');
}

// ============================================================
// MODAL — VEÍCULO
// ============================================================

/**
 * Abre o modal de cadastro ou edição de veículo.
 * @param {string|null} id - ID do veículo a editar, ou null para novo
 */
function abrirModalVeiculo(id = null) {
  estado.modal      = 'veiculo';
  estado.idEditando = id;
  const veiculo = id ? estado.veiculos.find(v => v.id === id) : null;
  const d = veiculo || {};

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon" style="background:var(--blue-glow);color:var(--blue-400)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h.5l2-3h8l2 3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/><circle cx="9" cy="13" r="2"/><circle cx="15" cy="13" r="2"/></svg></div>
        <span class="modal-title">${veiculo?'Editar Veículo':'Novo Veículo'}</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <!-- Marca do veículo (ex: Fiat, Volkswagen) -->
        <div class="form-group">
          <label class="form-label" for="mv-marca">Marca <span class="required">*</span></label>
          <input class="form-input" id="mv-marca" type="text" placeholder="Ex: Fiat, Volkswagen..." value="${escaparHTML(d.marca||'')}" />
        </div>
        <!-- Modelo do veículo (ex: Uno, Gol) -->
        <div class="form-group">
          <label class="form-label" for="mv-modelo">Modelo <span class="required">*</span></label>
          <input class="form-input" id="mv-modelo" type="text" placeholder="Ex: Uno, Gol, Celta..." value="${escaparHTML(d.modelo||'')}" />
        </div>
        <!-- Ano ou intervalo de anos de fabricação -->
        <div class="form-group full">
          <label class="form-label" for="mv-ano">Ano / Período</label>
          <input class="form-input" id="mv-ano" type="text" placeholder="Ex: 2010–2020 ou 2018" value="${escaparHTML(d.ano||'')}" />
          <span class="form-hint">Intervalo de anos que o veículo abrange</span>
        </div>
        <!-- Observações: versão, motor, informações adicionais -->
        <div class="form-group full">
          <label class="form-label" for="mv-obs">Observações</label>
          <textarea class="form-textarea" id="mv-obs" placeholder="Versão, motor, observações adicionais...">${escaparHTML(d.obs||'')}</textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarVeiculo()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        ${veiculo?'Salvar Alterações':'Cadastrar Veículo'}
      </button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { const c = document.getElementById('mv-marca'); if (c) c.focus(); }, 150);
}

/**
 * Lê, valida e persiste os dados do formulário de veículo.
 */
function salvarVeiculo() {
  const marca  = sanitizar(document.getElementById('mv-marca')?.value);
  const modelo = sanitizar(document.getElementById('mv-modelo')?.value);
  const ano    = sanitizar(document.getElementById('mv-ano')?.value);
  const obs    = sanitizar(document.getElementById('mv-obs')?.value);

  if (!marca)  { exibirToast('error', '❌ Marca é obrigatória.');  return; }
  if (!modelo) { exibirToast('error', '❌ Modelo é obrigatório.'); return; }

  if (estado.idEditando) {
    estado.veiculos = estado.veiculos.map(v => v.id !== estado.idEditando ? v : { ...v, marca, modelo, ano, obs });
    exibirToast('success', '✅ Veículo atualizado!');
  } else {
    estado.veiculos.push({ id: gerarId(), marca, modelo, ano, obs });
    exibirToast('success', '✅ Veículo cadastrado!');
  }
  Armazenamento.salvarVeiculos(estado.veiculos);
  fecharModal();
  renderizarEstatisticasLateral();
  renderizarVisao();
}

/** Abre o formulário de edição para o veículo informado */
function editarVeiculo(id) { abrirModalVeiculo(id); }

/**
 * Abre modal de confirmação antes de excluir um veículo.
 * Exibe aviso se houver peças vinculadas.
 * @param {string} id - ID do veículo a excluir
 */
function confirmarExclusaoVeiculo(id) {
  const veiculo = estado.veiculos.find(x => x.id === id);
  if (!veiculo) return;
  const totalVinculadas = estado.pecas.filter(p => (p.veiculosIds||[]).includes(id)).length;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon" style="background:var(--red-glow);color:var(--red-400)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
        <span class="modal-title">Excluir Veículo</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:32px 24px">
      <div style="font-size:3rem;margin-bottom:16px">🗑️</div>
      <p style="font-size:1rem;font-weight:600;color:var(--text-primary);margin-bottom:8px">Excluir "${escaparHTML(veiculo.marca)} ${escaparHTML(veiculo.modelo)}"?</p>
      ${totalVinculadas>0?`<p style="font-size:.85rem;color:var(--yellow-400);margin-bottom:8px">⚠️ ${totalVinculadas} peça(s) estão vinculadas a este veículo. O vínculo será removido.</p>`:''}
      <p style="font-size:.85rem;color:var(--text-muted)">Esta ação não pode ser desfeita.</p>
    </div>
    <div class="modal-footer" style="justify-content:center;gap:16px">
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-danger" style="padding:9px 24px" onclick="excluirVeiculo('${id}')">Sim, Excluir</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Remove o veículo e desvincula todas as peças associadas.
 * @param {string} id - ID do veículo a excluir
 */
function excluirVeiculo(id) {
  estado.veiculos = estado.veiculos.filter(v => v.id !== id);
  // Remove o vínculo deste veículo em todas as peças que o referenciam
  estado.pecas = estado.pecas.map(p => ({ ...p, veiculosIds: (p.veiculosIds||[]).filter(vid => vid !== id) }));
  Armazenamento.salvarVeiculos(estado.veiculos);
  Armazenamento.salvarPecas(estado.pecas);
  fecharModal();
  renderizarEstatisticasLateral();
  renderizarVisao();
  exibirToast('success', '🗑️ Veículo excluído.');
}

// ============================================================
// FECHAR MODAL
// ============================================================

/**
 * Fecha o modal ativo e limpa o estado relacionado.
 * Se chamado por evento de clique, verifica se foi na sobreposição.
 * @param {MouseEvent} [evento] - Evento de clique (opcional)
 */
function fecharModal(evento) {
  if (evento && evento.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  // Limpa estado do modal
  estado.modal               = null;
  estado.idEditando          = null;
  estado.veiculosSelecionados = [];
  estado.dropdownTagsAberto  = false;
}

// ============================================================
// TOAST — Mensagens de Feedback
// ============================================================

/**
 * Exibe uma mensagem de feedback temporária (toast) no canto da tela.
 * @param {string} tipo     - 'success' | 'error' | 'info'
 * @param {string} mensagem - Texto a exibir
 * @param {number} duracao  - Duração em ms (padrão: 3500)
 */
function exibirToast(tipo, mensagem, duracao = 3500) {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  const icones    = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${icones[tipo]||'ℹ️'}</span><span>${mensagem}</span>`;
  container.appendChild(toast);
  // Remove o toast após a duração definida
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

// ============================================================
// PONTO DE ENTRADA
// ============================================================

/** Aguarda o carregamento completo do DOM antes de inicializar */
document.addEventListener('DOMContentLoaded', inicializar);

// ============================================================
// MÓDULO DE VENDas
// ============================================================

/**
 * Constrói o HTML da visão Vendas com resumo financeiro,
 * histórico de vendas e botão de registro.
 * @returns {string} HTML completo da visão Vendas
 */
function construirVendas() {
  const vendas = estado.vendas;

  // Métricas do histórico de vendas
  const totalVendas   = vendas.length;
  const receitaTotal  = vendas.reduce((soma, v) => soma + (v.precoTotal || 0), 0);
  const totalItens    = vendas.reduce((soma, v) => soma + (v.quantidade || 0), 0);
  const ultimaVenda   = vendas.length > 0
    ? formatarData(vendas[vendas.length - 1].dataVenda)
    : '—';

  // Filtro de busca local (por nome ou código da peça)
  const termoBusca = (document._buscaVendas || '').toLowerCase();
  const vendasFiltradas = termoBusca
    ? vendas.filter(v =>
        v.codigoPeca.toLowerCase().includes(termoBusca) ||
        v.nomePeca.toLowerCase().includes(termoBusca)   ||
        (v.cliente || '').toLowerCase().includes(termoBusca)
      )
    : vendas;

  // Exibe as mais recentes primeiro
  const vendasOrdenadas = [...vendasFiltradas].reverse();

  return `
    <div class="page-header">
      <div class="page-title-group">
        <h1 class="page-title">Vendas</h1>
        <p class="page-subtitle">${totalVendas} venda${totalVendas !== 1 ? 's' : ''} registrada${totalVendas !== 1 ? 's' : ''}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="exportarVendasCSV()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
        <button class="btn btn-primary" onclick="abrirModalVenda()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Venda
        </button>
      </div>
    </div>

    <!-- Cards de métricas de vendas -->
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-card-header">
          <span class="stat-card-label">Receita Total</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        </div>
        <div class="stat-card-value" style="font-size:1.3rem">R$ ${formatarMoeda(receitaTotal)}</div>
        <div class="stat-card-sub">Soma de todas as vendas</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-card-header">
          <span class="stat-card-label">Total de Vendas</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
        </div>
        <div class="stat-card-value">${totalVendas}</div>
        <div class="stat-card-sub">Transações registradas</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-card-header">
          <span class="stat-card-label">Itens Vendidos</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>
        </div>
        <div class="stat-card-value">${totalItens}</div>
        <div class="stat-card-sub">Unidades saídas do estoque</div>
      </div>
      <div class="stat-card ${vendas.length > 0 ? 'orange' : 'blue'}">
        <div class="stat-card-header">
          <span class="stat-card-label">Última Venda</span>
          <div class="stat-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        </div>
        <div class="stat-card-value" style="font-size:1.1rem">${ultimaVenda}</div>
        <div class="stat-card-sub">Data do registro mais recente</div>
      </div>
    </div>

    <!-- Campo de busca -->
    <div class="search-bar">
      <div class="search-input-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="text" placeholder="Buscar por código, nome da peça ou cliente..."
          oninput="document._buscaVendas=this.value; renderizarVisao()" autocomplete="off" />
      </div>
    </div>

    <!-- Tabela do histórico de vendas -->
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Código</th>
              <th>Peça</th>
              <th>Categoria</th>
              <th>Cliente</th>
              <th>Veículo</th>
              <th>Qtd.</th>
              <th>Preço Unit.</th>
              <th>Total</th>
              <th>Obs.</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${vendasOrdenadas.length === 0 ? `
              <tr><td colspan="11" style="text-align:center;padding:48px">
                <div class="empty-state" style="padding:0">
                  <div class="empty-icon">🛒</div>
                  <p class="empty-title">Nenhuma venda registrada</p>
                  <p class="empty-desc">Registre a primeira saída de peça do estoque.</p>
                  <button class="btn btn-primary" onclick="abrirModalVenda()">Registrar Venda</button>
                </div>
              </td></tr>
            ` : vendasOrdenadas.map(venda => `
              <tr>
                <td style="white-space:nowrap;color:var(--text-secondary)">${formatarData(venda.dataVenda)}</td>
                <td class="td-code">${escaparHTML(venda.codigoPeca)}</td>
                <td class="td-name" title="${escaparHTML(venda.nomePeca)}">${escaparHTML(venda.nomePeca)}</td>
                <td><span class="badge badge-gray">${iconeCategoria(venda.categoria)} ${escaparHTML(venda.categoria)}</span></td>
                <td>${venda.cliente ? escaparHTML(venda.cliente) : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td>${venda.veiculoLabel ? `<span class="vehicle-tag">${escaparHTML(venda.veiculoLabel)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td><span class="badge badge-blue">${venda.quantidade}</span></td>
                <td class="monospace" style="color:var(--text-secondary)">R$ ${formatarMoeda(venda.precoUnitario)}</td>
                <td class="monospace" style="color:var(--green-400);font-weight:700">R$ ${formatarMoeda(venda.precoTotal)}</td>
                <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)" title="${escaparHTML(venda.obs||'')}">${venda.obs ? escaparHTML(venda.obs) : '—'}</td>
                <td>
                  <!-- Excluir venda restaura estoque automaticamente -->
                  <button class="btn btn-icon btn-danger" onclick="confirmarExclusaoVenda('${venda.id}')" title="Cancelar venda (restaura estoque)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span class="table-info">${vendasOrdenadas.length} venda${vendasOrdenadas.length !== 1 ? 's' : ''} exibida${vendasOrdenadas.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `;
}

// ============================================================
// MODAL — REGISTRAR VENDA
// ============================================================

/**
 * Abre o modal de registro de venda.
 * Permite selecionar a peça, definir quantidade, preço e dados do cliente.
 */
function abrirModalVenda() {
  estado.modal              = 'venda';
  estado.idEditando         = null;
  estado.pecaSelecionadaVenda = null;

  document.getElementById('modal-container').innerHTML = construirModalVenda();
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { const c = document.getElementById('mv-peca-select'); if (c) c.focus(); }, 150);
}

/**
 * Constrói o HTML do modal de registro de venda.
 * @returns {string} HTML do modal
 */
function construirModalVenda() {
  // Monta as opções do select agrupadas por categoria
  const opcoesPecas = CATEGORIAS.map(cat => {
    const pecasDaCategoria = estado.pecas.filter(p => p.categoria === cat);
    if (pecasDaCategoria.length === 0) return '';
    return `<optgroup label="${iconeCategoria(cat)} ${cat}">
      ${pecasDaCategoria.map(p => `<option value="${p.id}" ${p.quantidade === 0 ? 'disabled' : ''}>
        ${escaparHTML(p.codigo)} — ${escaparHTML(p.nome)} (Estoque: ${p.quantidade})
      </option>`).join('')}
    </optgroup>`;
  }).join('');

  // Data padrão: hoje
  const hoje = new Date().toISOString().split('T')[0];

  return `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon" style="background:var(--green-glow);color:var(--green-400)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </div>
        <span class="modal-title">Registrar Venda</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">

        <!-- Seleção da peça vendida (obrigatório) -->
        <div class="form-group full">
          <label class="form-label" for="mv-peca-select">Peça Vendida <span class="required">*</span></label>
          <select class="form-select" id="mv-peca-select" onchange="aoSelecionarPecaVenda(this.value)">
            <option value="">Selecione a peça...</option>
            ${opcoesPecas}
          </select>
        </div>

        <!-- Painel de informações da peça selecionada (aparece após seleção) -->
        <div class="form-group full" id="mv-peca-info" style="display:none">
          <div style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:12px;display:flex;gap:16px;align-items:center">
            <div style="font-size:1.8rem" id="mv-peca-icone">📦</div>
            <div style="flex:1">
              <div style="font-weight:700;color:var(--text-primary)" id="mv-peca-nome">—</div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px" id="mv-peca-detalhes">—</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:.72rem;color:var(--text-muted)">Estoque atual</div>
              <div style="font-size:1.4rem;font-weight:800" id="mv-peca-estoque">—</div>
            </div>
          </div>
        </div>

        <!-- Quantidade vendida (valida contra estoque disponível) -->
        <div class="form-group">
          <label class="form-label" for="mv-quantidade">Quantidade <span class="required">*</span></label>
          <input class="form-input" id="mv-quantidade" type="number" min="1" placeholder="0"
            oninput="calcularTotalVenda()" />
          <span class="form-hint" id="mv-hint-estoque">Selecione a peça primeiro</span>
        </div>

        <!-- Preço unitário (pré-preenchido com o preço de venda da peça) -->
        <div class="form-group">
          <label class="form-label" for="mv-preco">Preço Unitário (R$) <span class="required">*</span></label>
          <input class="form-input" id="mv-preco" type="number" min="0" step="0.01" placeholder="0,00"
            oninput="calcularTotalVenda()" />
          <span class="form-hint">Pré-preenchido com o preço de venda da peça</span>
        </div>

        <!-- Total calculado automaticamente (somente leitura) -->
        <div class="form-group full">
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:.82rem;color:var(--text-secondary);font-weight:500">💰 Total da Venda</span>
            <span id="mv-total-display" style="font-size:1.3rem;font-weight:800;color:var(--green-400)">R$ 0,00</span>
          </div>
        </div>

        <!-- Nome do cliente (opcional) -->
        <div class="form-group">
          <label class="form-label" for="mv-cliente">Cliente <span style="color:var(--text-muted);font-weight:400">(opcional)</span></label>
          <input class="form-input" id="mv-cliente" type="text" placeholder="Nome do cliente..." />
        </div>

        <!-- Veículo do cliente (opcional — seleciona dos cadastrados ou digita livre) -->
        <div class="form-group">
          <label class="form-label" for="mv-veiculo">Veículo do Cliente <span style="color:var(--text-muted);font-weight:400">(opcional)</span></label>
          <select class="form-select" id="mv-veiculo">
            <option value="">Não informado</option>
            ${estado.veiculos.map(v => `<option value="${escaparHTML(obterLabelVeiculo(v))}">${escaparHTML(obterLabelVeiculo(v))}</option>`).join('')}
            <option value="__outro__">Outro (digitar manualmente)</option>
          </select>
        </div>

        <!-- Campo de texto para veículo quando selecionado "Outro" -->
        <div class="form-group full" id="mv-veiculo-custom-wrap" style="display:none">
          <label class="form-label" for="mv-veiculo-custom">Descreva o Veículo</label>
          <input class="form-input" id="mv-veiculo-custom" type="text" placeholder="Ex: Honda Fit 2019 prata..." />
        </div>

        <!-- Data da venda (padrão: hoje) -->
        <div class="form-group">
          <label class="form-label" for="mv-data">Data da Venda</label>
          <input class="form-input" id="mv-data" type="date" value="${hoje}" />
        </div>

        <!-- Observações livres -->
        <div class="form-group">
          <label class="form-label" for="mv-obs">Observações</label>
          <input class="form-input" id="mv-obs" type="text" placeholder="Forma de pagamento, garantia, etc..." />
        </div>

      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarVenda()" style="background:linear-gradient(135deg,var(--green-500),#16a34a);box-shadow:0 2px 12px var(--green-glow)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Confirmar Venda
      </button>
    </div>
  `;
}

/**
 * Chamado quando uma peça é selecionada no modal de venda.
 * Atualiza o painel de informações e pré-preenche o preço unitário.
 * @param {string} idPeca - ID da peça selecionada
 */
function aoSelecionarPecaVenda(idPeca) {
  const peca = estado.pecas.find(p => p.id === idPeca);
  estado.pecaSelecionadaVenda = peca || null;

  const infoPanel    = document.getElementById('mv-peca-info');
  const icone        = document.getElementById('mv-peca-icone');
  const nome         = document.getElementById('mv-peca-nome');
  const detalhes     = document.getElementById('mv-peca-detalhes');
  const estoqueEl    = document.getElementById('mv-peca-estoque');
  const hintEstoque  = document.getElementById('mv-hint-estoque');
  const campoQtd     = document.getElementById('mv-quantidade');
  const campoPreco   = document.getElementById('mv-preco');

  if (!peca) {
    infoPanel.style.display = 'none';
    return;
  }

  // Exibe painel de informações da peça
  infoPanel.style.display = 'block';
  if (icone) icone.textContent = iconeCategoria(peca.categoria);
  if (nome)  nome.textContent  = `${peca.codigo} — ${peca.nome}`;
  if (detalhes) detalhes.textContent = `${peca.categoria} · ${peca.localizacao || 'Localização não definida'}`;

  // Exibe estoque com cor de alerta se necessário
  if (estoqueEl) {
    estoqueEl.textContent = `${peca.quantidade} un.`;
    estoqueEl.style.color = peca.quantidade === 0
      ? 'var(--red-400)'
      : peca.quantidade <= (peca.estoqueMinimo || 0)
        ? 'var(--yellow-400)'
        : 'var(--green-400)';
  }

  // Define o máximo da quantidade e atualiza o hint
  if (campoQtd) {
    campoQtd.max = peca.quantidade;
    campoQtd.value = 1;
  }
  if (hintEstoque) hintEstoque.textContent = `Máximo disponível: ${peca.quantidade} unidade(s)`;

  // Pré-preenche com o preço de venda cadastrado
  if (campoPreco) campoPreco.value = peca.precoVenda || '';

  calcularTotalVenda();
}

/**
 * Calcula e exibe o total da venda em tempo real
 * conforme o usuário altera quantidade ou preço unitário.
 */
function calcularTotalVenda() {
  const quantidade = parseFloat(document.getElementById('mv-quantidade')?.value || 0);
  const preco      = parseFloat(document.getElementById('mv-preco')?.value      || 0);
  const total      = quantidade * preco;
  const display    = document.getElementById('mv-total-display');
  if (display) display.textContent = `R$ ${formatarMoeda(total)}`;
}

/**
 * Lê, valida e persiste a venda registrada.
 * Ao salvar: decrementa o estoque da peça automaticamente.
 */
function salvarVenda() {
  const idPeca     = document.getElementById('mv-peca-select')?.value;
  const quantidade = parseInt(document.getElementById('mv-quantidade')?.value || '0');
  const preco      = parseFloat(document.getElementById('mv-preco')?.value || '0');
  const cliente    = sanitizar(document.getElementById('mv-cliente')?.value);
  const veiculoSel = document.getElementById('mv-veiculo')?.value;
  const veiculoCustom = sanitizar(document.getElementById('mv-veiculo-custom')?.value);
  const dataVendaInput = document.getElementById('mv-data')?.value;
  const obs        = sanitizar(document.getElementById('mv-obs')?.value);

  // Determina o rótulo do veículo
  const veiculoLabel = veiculoSel === '__outro__'
    ? veiculoCustom
    : veiculoSel || '';

  // Validações obrigatórias
  if (!idPeca)   { exibirToast('error', '❌ Selecione a peça vendida.');        return; }
  if (quantidade <= 0) { exibirToast('error', '❌ Quantidade deve ser maior que zero.'); return; }
  if (isNaN(preco) || preco < 0) { exibirToast('error', '❌ Preço inválido.');  return; }

  // Verifica se a peça ainda existe e tem estoque suficiente
  const peca = estado.pecas.find(p => p.id === idPeca);
  if (!peca) { exibirToast('error', '❌ Peça não encontrada no inventário.'); return; }
  if (quantidade > peca.quantidade) {
    exibirToast('error', `❌ Estoque insuficiente. Disponível: ${peca.quantidade} unidade(s).`);
    return;
  }

  const dataVenda = dataVendaInput
    ? new Date(dataVendaInput + 'T12:00:00').toISOString()
    : new Date().toISOString();

  // Cria o registro de venda
  const novaVenda = {
    id:            gerarId(),
    dataVenda,                          // Data/hora da venda
    pecaId:        peca.id,
    codigoPeca:    peca.codigo,
    nomePeca:      peca.nome,
    categoria:     peca.categoria,
    quantidade,                         // Unidades vendidas
    precoUnitario: preco,               // Preço cobrado por unidade
    precoTotal:    quantidade * preco,  // Valor total da transação
    cliente,                            // Nome do cliente (opcional)
    veiculoLabel,                       // Veículo do cliente (opcional)
    obs,                                // Observações livres
    dataRegistro:  new Date().toISOString(),
  };

  // Adiciona ao histórico de vendas
  estado.vendas.push(novaVenda);
  Armazenamento.salvarVendas(estado.vendas);

  // Decrementa o estoque da peça vendida
  estado.pecas = estado.pecas.map(p => p.id !== peca.id ? p : {
    ...p,
    quantidade:      p.quantidade - quantidade,
    dataAtualizacao: new Date().toISOString(),
  });
  Armazenamento.salvarPecas(estado.pecas);

  fecharModal();
  renderizarEstatisticasLateral();
  atualizarBadgeNotificacao();
  renderizarVisao();
  exibirToast('success', `✅ Venda registrada! ${quantidade}× ${peca.nome} · R$ ${formatarMoeda(quantidade * preco)}`);
}

/**
 * Abre o modal de confirmação para cancelar/excluir uma venda.
 * O estoque da peça é restaurado ao confirmar.
 * @param {string} id - ID da venda a cancelar
 */
function confirmarExclusaoVenda(id) {
  const venda = estado.vendas.find(v => v.id === id);
  if (!venda) return;

  document.getElementById('modal-container').innerHTML = `
    <div class="modal-header">
      <div class="modal-title-wrap">
        <div class="modal-title-icon" style="background:var(--red-glow);color:var(--red-400)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </div>
        <span class="modal-title">Cancelar Venda</span>
      </div>
      <button class="modal-close" onclick="fecharModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:32px 24px">
      <div style="font-size:3rem;margin-bottom:16px">↩️</div>
      <p style="font-size:1rem;font-weight:600;color:var(--text-primary);margin-bottom:8px">
        Cancelar venda de "${escaparHTML(venda.nomePeca)}"?
      </p>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px">
        ${venda.quantidade} unidade(s) × R$ ${formatarMoeda(venda.precoUnitario)} = R$ ${formatarMoeda(venda.precoTotal)}
      </p>
      <p style="font-size:.82rem;color:var(--yellow-400)">
        ⚠️ O estoque da peça será restaurado em ${venda.quantidade} unidade(s).
      </p>
    </div>
    <div class="modal-footer" style="justify-content:center;gap:16px">
      <button class="btn btn-ghost" onclick="fecharModal()">Manter Venda</button>
      <button class="btn btn-danger" style="padding:9px 24px" onclick="excluirVenda('${id}')">Sim, Cancelar</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Cancela (exclui) uma venda e restaura o estoque da peça.
 * @param {string} id - ID da venda a excluir
 */
function excluirVenda(id) {
  const venda = estado.vendas.find(v => v.id === id);
  if (!venda) return;

  // Remove do histórico
  estado.vendas = estado.vendas.filter(v => v.id !== id);
  Armazenamento.salvarVendas(estado.vendas);

  // Restaura o estoque da peça correspondente
  estado.pecas = estado.pecas.map(p => p.id !== venda.pecaId ? p : {
    ...p,
    quantidade:      p.quantidade + venda.quantidade,
    dataAtualizacao: new Date().toISOString(),
  });
  Armazenamento.salvarPecas(estado.pecas);

  fecharModal();
  renderizarEstatisticasLateral();
  atualizarBadgeNotificacao();
  renderizarVisao();
  exibirToast('info', `↩️ Venda cancelada. Estoque de "${venda.nomePeca}" restaurado em ${venda.quantidade} unidade(s).`);
}

// Handler para campo "Outro veículo"
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'mv-veiculo') {
    const wrap = document.getElementById('mv-veiculo-custom-wrap');
    if (wrap) wrap.style.display = e.target.value === '__outro__' ? 'block' : 'none';
  }
});

/**
 * Exporta o histórico completo de vendas em formato CSV.
 */
function exportarVendasCSV() {
  if (estado.vendas.length === 0) { exibirToast('info', 'ℹ️ Nenhuma venda registrada para exportar.'); return; }
  const cabecalhos = ['Data','Código Peça','Nome Peça','Categoria','Cliente','Veículo','Qtd.','Preço Unit. (R$)','Total (R$)','Observações'];
  const linhas = [...estado.vendas].reverse().map(v => [
    formatarData(v.dataVenda), v.codigoPeca, v.nomePeca, v.categoria,
    v.cliente || '', v.veiculoLabel || '', v.quantidade,
    v.precoUnitario, v.precoTotal, v.obs || '',
  ].map(x => `"${String(x).replace(/"/g,'""')}"`).join(','));
  baixarCSV([cabecalhos.join(','), ...linhas].join('\n'), 'mecastock_vendas.csv');
  exibirToast('success', '✅ Histórico de vendas exportado!');
}
