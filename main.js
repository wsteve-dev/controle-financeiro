const CATEGORIAS_DESPESA = {
  "Moradia": ["Aluguel/Financiamento","Condomínio","Água, luz, gás","Internet/TV","Manutenção/Reparos"],
  "Alimentação": ["Mercado","Restaurantes/Delivery"],
  "Transporte": ["Combustível","Transporte público/App","Manutenção do veículo","Estacionamento/Pedágio"],
  "Saúde": ["Plano de saúde","Remédios","Consultas/Exames","Academia"],
  "Educação": ["Cursos","Livros/Materiais","Mensalidade escolar/faculdade"],
  "Lazer": ["Streaming","Viagens","Cinema/Shows/Bares","Jogos"],
  "Financeiro": ["Impostos","Empréstimos","Investimentos/Poupança","Reserva de emergência"],
  "Pessoal": ["Vestuário","Cuidados pessoais","Presentes"],
  "Outros": ["Doações","Imprevistos"]
};
const CATEGORIAS_RECEITA = {
  "Trabalho": ["Salário","Décimo terceiro","Bônus/PLR","Freelance/Autônomo"],
  "Investimentos": ["Dividendos","Juros/Rendimentos","Aluguel recebido","Venda de ativos"],
  "Outras Receitas": ["Reembolsos","Presentes recebidos","Prêmios/Sorteios","Renda extra diversa"]
};
// mapa unificado usado para consultar subcategorias por nome de categoria, independente do tipo
const CATEGORIAS = { ...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA };
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const STORAGE_KEY = "transacoes";

let transactions = [];
let storageOK = true;

const fmtBRL = (n) => (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

function uid(){ return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }

// ---------- populate selects ----------
function populatePeriodSelects(){
  const mesSel = document.getElementById('mesSel');
  const anoSel = document.getElementById('anoSel');
  MESES.forEach((m,i)=>{
    const opt = document.createElement('option');
    opt.value = i+1; opt.textContent = m;
    mesSel.appendChild(opt);
  });
  const now = new Date();
  mesSel.value = now.getMonth()+1;
  const anoAtual = now.getFullYear();
  for(let y = anoAtual - 3; y <= anoAtual + 2; y++){
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    anoSel.appendChild(opt);
  }
  anoSel.value = anoAtual;
  document.getElementById('fData').value = now.toISOString().slice(0,10);
}

function populateCategoriaSelect(){
  const tipo = document.getElementById('fTipo').value;
  const grupo = tipo === 'Receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const catSel = document.getElementById('fCategoria');
  catSel.innerHTML = '';
  Object.keys(grupo).forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    catSel.appendChild(opt);
  });
  syncSubcategorias();
}
function syncSubcategorias(){
  const cat = document.getElementById('fCategoria').value;
  const subSel = document.getElementById('fSubcategoria');
  subSel.innerHTML = '';
  (CATEGORIAS[cat]||[]).forEach(sub=>{
    const opt = document.createElement('option');
    opt.value = sub; opt.textContent = sub;
    subSel.appendChild(opt);
  });
}
function syncTipoDefaults(){
  // ao trocar o tipo, o conjunto inteiro de categorias muda (receita x despesa)
  populateCategoriaSelect();
}

// ---------- storage ----------
async function loadTransactions(){
  try{
    const res = await window.storage.get(STORAGE_KEY, false);
    transactions = res && res.value ? JSON.parse(res.value) : [];
  }catch(e){
    transactions = [];
  }
}
async function saveTransactions(){
  try{
    const res = await window.storage.set(STORAGE_KEY, JSON.stringify(transactions), false);
    storageOK = !!res;
  }catch(e){
    storageOK = false;
  }
  updateFooter();
}
function updateFooter(){
  const el = document.getElementById('statusFooter');
  const txt = el.querySelector('.txt');
  el.classList.toggle('error', !storageOK);
  txt.textContent = storageOK
    ? 'salvo automaticamente neste navegador'
    : 'não foi possível salvar — os lançamentos podem não persistir';
}

// ---------- rendering ----------
function currentPeriod(){
  return {
    mes: parseInt(document.getElementById('mesSel').value, 10),
    ano: parseInt(document.getElementById('anoSel').value, 10)
  };
}
function filteredForPeriod(){
  const {mes, ano} = currentPeriod();
  return transactions.filter(t=>{
    const d = new Date(t.data + 'T00:00:00');
    return (d.getMonth()+1) === mes && d.getFullYear() === ano;
  }).sort((a,b)=> a.data.localeCompare(b.data));
}

function render(){
  const list = filteredForPeriod();

  const receitas = list.filter(t=>t.tipo==='Receita').reduce((s,t)=>s+t.valor,0);
  const despesas = list.filter(t=>t.tipo==='Despesa').reduce((s,t)=>s+t.valor,0);
  const saldo = receitas - despesas;

  document.getElementById('totReceitas').textContent = fmtBRL(receitas);
  document.getElementById('totDespesas').textContent = fmtBRL(despesas);
  document.getElementById('totSaldo').textContent = fmtBRL(saldo);

  const stamp = document.getElementById('stamp');
  const stampVerdict = document.getElementById('stampVerdict');
  const balanceWord = document.getElementById('balanceWord');
  const positive = saldo >= 0;
  stamp.style.setProperty('--sc', positive ? 'var(--green)' : 'var(--rust)');
  stampVerdict.textContent = positive ? 'positivo' : 'negativo';
  if(list.length === 0){
    balanceWord.textContent = 'Registre um lançamento para começar a página deste mês.';
  } else if(positive){
    balanceWord.textContent = saldo === 0
      ? 'As contas fecharam no zero a zero este mês.'
      : `Sobrou ${fmtBRL(saldo)} depois de todas as contas.`;
  } else {
    balanceWord.textContent = `As despesas superaram as receitas em ${fmtBRL(Math.abs(saldo))}.`;
  }

  // category bars (despesas only)
  const porCategoria = {};
  list.filter(t=>t.tipo==='Despesa').forEach(t=>{
    porCategoria[t.categoria] = (porCategoria[t.categoria]||0) + t.valor;
  });
  const bars = document.getElementById('bars');
  const entries = Object.entries(porCategoria).sort((a,b)=>b[1]-a[1]);
  if(entries.length === 0){
    bars.innerHTML = '<p class="empty-note">Nenhuma despesa lançada neste período ainda.</p>';
  } else {
    const max = entries[0][1];
    bars.innerHTML = entries.map(([cat, val])=>`
      <div class="bar-row">
        <span class="name">${cat}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(val/max*100).toFixed(1)}%"></div></div>
        <span class="val">${fmtBRL(val)}</span>
      </div>
    `).join('');
  }

  // ledger table
  const ledgerBody = document.getElementById('ledgerBody');
  const count = document.getElementById('ledgerCount');
  count.textContent = list.length + (list.length===1 ? ' registro' : ' registros');

  if(list.length === 0){
    ledgerBody.innerHTML = `
      <div class="ledger-empty">
        <div class="quill">✒</div>
        <p>A página deste mês ainda está em branco. Toque no botão + para lançar o primeiro.</p>
      </div>`;
    return;
  }

  const rows = list.map((t, i)=>{
    const dataFmt = new Date(t.data+'T00:00:00').toLocaleDateString('pt-BR');
    const num = String(i+1).padStart(3,'0');
    return `
      <button type="button" class="ledger-row" data-id="${t.id}">
        <span class="entry-no"><span class="badge">Nº ${num}</span></span>
        <span>${dataFmt}</span>
        <span><span class="tipo-tag ${t.tipo==='Receita'?'receita':'despesa'}">${t.tipo}</span></span>
        <span class="cat-cell">${t.categoria}<span class="sub">${t.subcategoria}</span></span>
        <span class="desc-cell">${t.descricao || '—'}</span>
        <span class="val-cell ${t.tipo==='Receita'?'receita':'despesa'}">${t.tipo==='Receita'?'+':'−'} ${fmtBRL(t.valor)}</span>
      </button>`;
  }).join('');

  ledgerBody.innerHTML = `
    <div class="ledger-list-head">
      <span>Nº</span><span>Data</span><span>Tipo</span><span>Categoria</span><span>Descrição</span><span class="num">Valor</span>
    </div>
    <div class="ledger-list">${rows}</div>`;

  ledgerBody.querySelectorAll('.ledger-row').forEach(btn=>{
    btn.addEventListener('click', ()=> openDetail(btn.dataset.id));
  });
}

// ---------- form (add sheet) ----------
document.getElementById('fCategoria').addEventListener('change', syncSubcategorias);

document.getElementById('entryForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('formMsg');
  const data = document.getElementById('fData').value;
  const tipo = document.getElementById('fTipo').value;
  const categoria = document.getElementById('fCategoria').value;
  const subcategoria = document.getElementById('fSubcategoria').value;
  const descricao = document.getElementById('fDescricao').value.trim();
  const valor = parseFloat(document.getElementById('fValor').value);

  if(!data || !valor || valor <= 0){
    msg.textContent = 'Preencha a data e um valor maior que zero.';
    return;
  }
  msg.textContent = '';

  transactions.push({ id: uid(), data, tipo, categoria, subcategoria, descricao, valor });
  await saveTransactions();

  // move period view to the entry's month/year so it's visible immediately
  const d = new Date(data + 'T00:00:00');
  document.getElementById('mesSel').value = d.getMonth()+1;
  document.getElementById('anoSel').value = d.getFullYear();

  render();
  closeAddSheet();
});

document.getElementById('mesSel').addEventListener('change', render);
document.getElementById('anoSel').addEventListener('change', render);

// ---------- navigation (hamburger drawer + views) ----------
const menuBtn = document.getElementById('menuBtn');
const navDrawer = document.getElementById('navDrawer');
const navOverlay = document.getElementById('navOverlay');

function openDrawer(){
  navDrawer.classList.add('open');
  navOverlay.classList.add('open');
  menuBtn.classList.add('open');
  menuBtn.setAttribute('aria-expanded', 'true');
  navDrawer.setAttribute('aria-hidden', 'false');
  const activeItem = navDrawer.querySelector('.nav-item.active') || navDrawer.querySelector('.nav-item');
  if(activeItem) activeItem.focus();
}
function closeDrawer(){
  navDrawer.classList.remove('open');
  navOverlay.classList.remove('open');
  menuBtn.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  navDrawer.setAttribute('aria-hidden', 'true');
  menuBtn.focus();
}
menuBtn.addEventListener('click', ()=>{
  navDrawer.classList.contains('open') ? closeDrawer() : openDrawer();
});
navOverlay.addEventListener('click', closeDrawer);
document.getElementById('navCloseBtn').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  if(addSheet.classList.contains('open')) closeAddSheet();
  else if(detailSheet.classList.contains('open')) closeDetail();
  else if(fabWrap.classList.contains('open')) closeSpeedDial();
  else if(navDrawer.classList.contains('open')) closeDrawer();
});

function switchView(view){
  document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.id === 'view' + view.charAt(0).toUpperCase() + view.slice(1)));
  document.querySelectorAll('.nav-item').forEach(b=> b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo({top: 0, behavior: 'auto'});
}
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    switchView(btn.dataset.view);
    closeDrawer();
  });
});

// ---------- detail sheet (dados do lançamento) ----------
const detailSheet = document.getElementById('detailSheet');
const detailOverlay = document.getElementById('detailOverlay');
let openDetailId = null;

function openDetail(id){
  const t = transactions.find(tr=>tr.id === id);
  if(!t) return;
  openDetailId = id;

  const isReceita = t.tipo === 'Receita';
  document.getElementById('detailTitle').textContent = t.descricao || t.subcategoria;
  document.getElementById('detailData').textContent = new Date(t.data+'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('detailTipo').textContent = t.tipo;
  document.getElementById('detailCategoria').textContent = t.categoria;
  document.getElementById('detailSubcategoria').textContent = t.subcategoria;
  document.getElementById('detailDescricao').textContent = t.descricao || '—';
  const valorEl = document.getElementById('detailValor');
  valorEl.textContent = (isReceita ? '+ ' : '− ') + fmtBRL(t.valor);
  valorEl.classList.toggle('receita', isReceita);
  valorEl.classList.toggle('despesa', !isReceita);

  detailSheet.classList.add('open');
  detailOverlay.classList.add('open');
  detailSheet.setAttribute('aria-hidden', 'false');
  document.getElementById('detailCloseBtn').focus();
}
function closeDetail(){
  detailSheet.classList.remove('open');
  detailOverlay.classList.remove('open');
  detailSheet.setAttribute('aria-hidden', 'true');
  openDetailId = null;
}
document.getElementById('detailCloseBtn').addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', closeDetail);
document.getElementById('detailDeleteBtn').addEventListener('click', async ()=>{
  if(!openDetailId) return;
  transactions = transactions.filter(t=>t.id !== openDetailId);
  await saveTransactions();
  closeDetail();
  render();
});

// ---------- FAB + speed dial (novo lançamento) ----------
const fabBtn = document.getElementById('fabBtn');
const fabWrap = document.getElementById('fabWrap');
const fabOverlay = document.getElementById('fabOverlay');

function openSpeedDial(){
  fabWrap.classList.add('open');
  fabOverlay.classList.add('open');
  fabBtn.classList.add('open');
  fabBtn.setAttribute('aria-expanded', 'true');
}
function closeSpeedDial(){
  fabWrap.classList.remove('open');
  fabOverlay.classList.remove('open');
  fabBtn.classList.remove('open');
  fabBtn.setAttribute('aria-expanded', 'false');
}
fabBtn.addEventListener('click', ()=>{
  closeDrawer();
  fabWrap.classList.contains('open') ? closeSpeedDial() : openSpeedDial();
});
fabOverlay.addEventListener('click', closeSpeedDial);
document.querySelectorAll('.speed-option').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    closeSpeedDial();
    openAddSheet(btn.dataset.tipo);
  });
});

// ---------- add sheet (formulário de novo lançamento) ----------
const addSheet = document.getElementById('addSheet');
const addOverlay = document.getElementById('addOverlay');
const addSheetBand = document.getElementById('addSheetBand');
const addSheetTitle = document.getElementById('addSheetTitle');

function setQuickDate(which){
  const dateInput = document.getElementById('fData');
  document.querySelectorAll('.date-pill').forEach(p=> p.classList.toggle('active', p.dataset.date === which));
  const now = new Date();
  if(which === 'hoje'){
    dateInput.hidden = true;
    dateInput.value = now.toISOString().slice(0,10);
  } else if(which === 'ontem'){
    dateInput.hidden = true;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    dateInput.value = y.toISOString().slice(0,10);
  } else {
    dateInput.hidden = false;
    if(!dateInput.value) dateInput.value = now.toISOString().slice(0,10);
    dateInput.focus();
  }
}
document.querySelectorAll('.date-pill').forEach(p=>{
  p.addEventListener('click', ()=> setQuickDate(p.dataset.date));
});

function openAddSheet(tipo){
  document.getElementById('fTipo').value = tipo;
  const isReceita = tipo === 'Receita';
  addSheetTitle.textContent = isReceita ? 'Nova receita' : 'Nova despesa';
  addSheetBand.classList.toggle('receita', isReceita);
  addSheetBand.classList.toggle('despesa', !isReceita);

  populateCategoriaSelect();
  setQuickDate('hoje');
  document.getElementById('fDescricao').value = '';
  document.getElementById('fValor').value = '';
  document.getElementById('formMsg').textContent = '';

  addSheet.classList.add('open');
  addOverlay.classList.add('open');
  addSheet.setAttribute('aria-hidden', 'false');
  document.getElementById('fValor').focus();
}
function closeAddSheet(){
  addSheet.classList.remove('open');
  addOverlay.classList.remove('open');
  addSheet.setAttribute('aria-hidden', 'true');
}
document.getElementById('addSheetCloseBtn').addEventListener('click', closeAddSheet);
document.getElementById('addCancelBtn').addEventListener('click', closeAddSheet);
addOverlay.addEventListener('click', closeAddSheet);

// ---------- theme (claro/escuro) ----------
const THEME_KEY = 'tema';

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme === 'escuro' ? 'dark' : 'light');
  document.querySelectorAll('.theme-option').forEach(btn=>{
    const isActive = btn.dataset.theme === theme;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}
async function saveTheme(theme){
  try{ await window.storage.set(THEME_KEY, theme, false); }catch(e){ /* preferência não será mantida entre sessões */ }
}
async function loadTheme(){
  let theme = 'claro';
  try{
    const res = await window.storage.get(THEME_KEY, false);
    if(res && res.value){
      theme = res.value;
    } else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
      theme = 'escuro';
    }
  }catch(e){
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
      theme = 'escuro';
    }
  }
  applyTheme(theme);
}
document.querySelectorAll('.theme-option').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const theme = btn.dataset.theme;
    applyTheme(theme);
    await saveTheme(theme);
  });
});

// ---------- init ----------
(async function init(){
  populatePeriodSelects();
  populateCategoriaSelect();
  await loadTheme();
  await loadTransactions();
  render();
  updateFooter();
})();
