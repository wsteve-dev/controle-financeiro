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
const STORAGE_KEY = "transacoes";

let transactions = [];
let storageOK = true;

const fmtBRL = (n) => (n||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

function uid(){ return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }

// data local em formato AAAA-MM-DD, sem conversão para UTC (evita bug de fuso horário)
function toISODateLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ---------- período ----------
let periodState = { mode: 'mes', anchorDate: null };

function computeRange(state){
  const today = new Date(); today.setHours(0,0,0,0);
  let start, end;
  if(state.mode === 'semanal'){
    start = new Date(state.anchorDate + 'T00:00:00');
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if(state.mode === 'mes'){
    start = new Date(state.anchorDate + 'T00:00:00');
    const nextMonthYear = start.getFullYear() + (start.getMonth() === 11 ? 1 : 0);
    const nextMonth = (start.getMonth() + 1) % 12;
    const daysInNextMonth = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
    const clampedDay = Math.min(start.getDate(), daysInNextMonth);
    end = new Date(nextMonthYear, nextMonth, clampedDay);
    end.setDate(end.getDate() - 1);
  } else if(state.mode === 'ano'){
    start = new Date(state.anchorDate + 'T00:00:00');
    const nextYear = start.getFullYear() + 1;
    const daysInTargetMonth = new Date(nextYear, start.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(start.getDate(), daysInTargetMonth);
    end = new Date(nextYear, start.getMonth(), clampedDay);
    end.setDate(end.getDate() - 1);
  } else if(state.mode === 'personalizado'){
    start = new Date(state.customStart + 'T00:00:00');
    end = new Date(state.customEnd + 'T00:00:00');
  } else if(state.mode === 'preset'){
    end = new Date(today);
    if(state.presetKey === '7d'){ start = new Date(today); start.setDate(start.getDate() - 6); }
    else if(state.presetKey === '30d'){ start = new Date(today); start.setDate(start.getDate() - 29); }
    else if(state.presetKey === '90d'){ start = new Date(today); start.setDate(start.getDate() - 89); }
    else if(state.presetKey === '12m'){ start = new Date(today); start.setMonth(start.getMonth() - 12); start.setDate(start.getDate() + 1); }
    else if(state.presetKey === 'ytd'){ start = new Date(today.getFullYear(), 0, 1); }
  }
  return { start, end };
}

function formatPeriodLabel(state){
  const { start, end } = computeRange(state);
  const shortFmt = (d)=> d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
  const monthYearFmt = (d)=>{
    const s = d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  if(state.mode === 'mes'){
    const lastDayOfMonth = new Date(end.getFullYear(), end.getMonth()+1, 0).getDate();
    const isCalendarMonth = start.getDate()===1 && end.getDate()===lastDayOfMonth &&
      start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear();
    return isCalendarMonth ? monthYearFmt(start) : `${shortFmt(start)} – ${shortFmt(end)}`;
  }
  if(state.mode === 'ano'){
    const isCalendarYear = start.getMonth()===0 && start.getDate()===1 &&
      end.getMonth()===11 && end.getDate()===31 && start.getFullYear()===end.getFullYear();
    return isCalendarYear ? String(start.getFullYear()) : `${shortFmt(start)} ${start.getFullYear()} – ${shortFmt(end)} ${end.getFullYear()}`;
  }
  if(state.mode === 'preset'){
    const labels = { '7d':'Últimos 7 dias', '30d':'Últimos 30 dias', '90d':'Últimos 90 dias', '12m':'Últimos 12 meses', 'ytd':'Acumulado no ano' };
    return labels[state.presetKey] || 'Período';
  }
  return `${shortFmt(start)} – ${shortFmt(end)}`;
}
function updatePeriodLabel(){
  document.getElementById('periodLabel').textContent = formatPeriodLabel(periodState);
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

// ---------- recorrência ----------
// calcula em quais datas um lançamento (recorrente ou não) ocorre dentro do intervalo [rangeStart, rangeEnd]
function occurrencesInRange(t, rangeStart, rangeEnd){
  const repeticao = t.repeticao || 'nenhuma';
  const anchor = new Date(t.data + 'T00:00:00');
  const endLimit = t.repetirDataFim ? new Date(t.repetirDataFim + 'T00:00:00') : null;
  const results = [];

  if(repeticao === 'nenhuma'){
    if(anchor >= rangeStart && anchor <= rangeEnd) results.push(t.data);
    return results;
  }

  if(repeticao === 'semanal'){
    let cursor = new Date(anchor);
    if(cursor < rangeStart){
      const diffDays = Math.round((rangeStart - cursor) / 86400000);
      const weeksToAdd = Math.ceil(diffDays / 7);
      cursor.setDate(cursor.getDate() + weeksToAdd * 7);
    }
    while(cursor <= rangeEnd){
      if(cursor >= anchor && (!endLimit || cursor <= endLimit)){
        results.push(toISODateLocal(cursor));
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return results;
  }

  if(repeticao === 'mensal'){
    const anchorDay = anchor.getDate();
    const startYM = Math.max(anchor.getFullYear()*12 + anchor.getMonth(), rangeStart.getFullYear()*12 + rangeStart.getMonth());
    const endYM = rangeEnd.getFullYear()*12 + rangeEnd.getMonth();
    for(let ym = startYM; ym <= endYM; ym++){
      const year = Math.floor(ym / 12);
      const month = ym % 12;
      const daysInMonth = new Date(year, month+1, 0).getDate();
      const day = Math.min(anchorDay, daysInMonth);
      const occDate = new Date(year, month, day);
      if(occDate >= anchor && occDate >= rangeStart && occDate <= rangeEnd && (!endLimit || occDate <= endLimit)){
        results.push(toISODateLocal(occDate));
      }
    }
    return results;
  }
  return results;
}
function repeatLabel(t){
  const repeticao = t.repeticao || 'nenhuma';
  if(repeticao === 'nenhuma') return 'Não repete';
  const freq = repeticao === 'semanal' ? 'Semanalmente' : 'Mensalmente';
  if(t.repetirAte === 'data' && t.repetirDataFim){
    const fimFmt = new Date(t.repetirDataFim + 'T00:00:00').toLocaleDateString('pt-BR');
    return `${freq}, até ${fimFmt}`;
  }
  return `${freq}, para sempre`;
}

// ---------- rendering ----------
function filteredForPeriod(){
  const { start, end } = computeRange(periodState);
  const result = [];
  transactions.forEach(t=>{
    occurrencesInRange(t, start, end).forEach(dateStr=>{
      result.push({ ...t, data: dateStr });
    });
  });
  return result.sort((a,b)=> a.data.localeCompare(b.data));
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
    const isRecurring = (t.repeticao || 'nenhuma') !== 'nenhuma';
    const recurBadge = isRecurring ? `<span class="recur-badge" title="${repeatLabel(t)}">↻</span>` : '';
    return `
      <button type="button" class="ledger-row" data-id="${t.id}" data-date="${t.data}">
        <span class="entry-no"><span class="badge">Nº ${num}</span></span>
        <span>${dataFmt}${recurBadge}</span>
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
    btn.addEventListener('click', ()=> openDetail(btn.dataset.id, btn.dataset.date));
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

  if(!valor || valor <= 0){
    msg.textContent = 'Informe um valor maior que zero.';
    const valorInput = document.getElementById('fValor');
    const valorRow = valorInput.closest('.add-valor-row');
    valorRow.classList.remove('error');
    void valorRow.offsetWidth; // força reflow para reiniciar a animação
    valorRow.classList.add('error');
    valorInput.focus();
    return;
  }
  if(!data){
    msg.textContent = 'Selecione a data do lançamento.';
    return;
  }

  const repeticao = currentRepeat; // 'nenhuma' | 'semanal' | 'mensal'
  let repetirAte = null;
  let repetirDataFim = null;
  if(repeticao !== 'nenhuma'){
    repetirAte = currentRepeatUntil; // 'sempre' | 'data'
    if(repetirAte === 'data'){
      repetirDataFim = document.getElementById('fRepeatEndDate').value;
      if(!repetirDataFim){
        msg.textContent = 'Escolha até quando o lançamento deve se repetir.';
        return;
      }
      if(repetirDataFim < data){
        msg.textContent = 'A data final da repetição precisa ser depois da data inicial.';
        return;
      }
    }
  }
  msg.textContent = '';

  transactions.push({ id: uid(), data, tipo, categoria, subcategoria, descricao, valor, repeticao, repetirAte, repetirDataFim });
  await saveTransactions();

  // muda a visão de período para o mês do novo lançamento, para que ele fique visível de imediato
  const d = new Date(data + 'T00:00:00');
  periodState = { mode: 'mes', anchorDate: toISODateLocal(new Date(d.getFullYear(), d.getMonth(), 1)) };
  updatePeriodLabel();

  render();
  closeAddSheet();
});

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
  if(periodSheet.classList.contains('open')) closePeriodSheet();
  else if(addSheet.classList.contains('open')) closeAddSheet();
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

function openDetail(id, occurrenceDate){
  const t = transactions.find(tr=>tr.id === id);
  if(!t) return;
  openDetailId = id;

  const isReceita = t.tipo === 'Receita';
  const displayDate = occurrenceDate || t.data;
  document.getElementById('detailTitle').textContent = t.descricao || t.subcategoria;
  document.getElementById('detailData').textContent = new Date(displayDate+'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('detailTipo').textContent = t.tipo;
  document.getElementById('detailCategoria').textContent = t.categoria;
  document.getElementById('detailSubcategoria').textContent = t.subcategoria;
  document.getElementById('detailDescricao').textContent = t.descricao || '—';
  document.getElementById('detailRepeticao').textContent = repeatLabel(t);
  const valorEl = document.getElementById('detailValor');
  valorEl.textContent = (isReceita ? '+ ' : '− ') + fmtBRL(t.valor);
  valorEl.classList.toggle('receita', isReceita);
  valorEl.classList.toggle('despesa', !isReceita);

  const note = document.getElementById('detailNote');
  note.textContent = (t.repeticao && t.repeticao !== 'nenhuma')
    ? 'Excluir remove toda a série de repetições, não só esta ocorrência.'
    : '';

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
fabOverlay.addEventListener('click', ()=>{
  closeSpeedDial();
  closeAddSheet();
  closeDetail();
});
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
  document.querySelectorAll('#dateQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.date === which));
  const now = new Date();
  if(which === 'hoje'){
    dateInput.hidden = true;
    dateInput.value = toISODateLocal(now);
  } else if(which === 'ontem'){
    dateInput.hidden = true;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    dateInput.value = toISODateLocal(y);
  } else {
    dateInput.hidden = false;
    if(!dateInput.value) dateInput.value = toISODateLocal(now);
    dateInput.focus();
  }
}
document.querySelectorAll('#dateQuick .date-pill').forEach(p=>{
  p.addEventListener('click', ()=> setQuickDate(p.dataset.date));
});

// ---------- repetição ----------
let currentRepeat = 'nenhuma';
let currentRepeatUntil = 'sempre';

function setRepeat(which){
  currentRepeat = which;
  document.querySelectorAll('#repeatQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.repeat === which));
  const untilField = document.getElementById('repeatUntilField');
  untilField.hidden = (which === 'nenhuma');
  if(which !== 'nenhuma'){
    setRepeatUntil(currentRepeatUntil);
  }
}
function setRepeatUntil(which){
  currentRepeatUntil = which;
  document.querySelectorAll('#repeatUntilQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.until === which));
  const endInput = document.getElementById('fRepeatEndDate');
  endInput.hidden = (which !== 'data');
  if(which === 'data'){
    endInput.focus();
  }
}
document.querySelectorAll('#repeatQuick .date-pill').forEach(p=>{
  p.addEventListener('click', ()=> setRepeat(p.dataset.repeat));
});
document.querySelectorAll('#repeatUntilQuick .date-pill').forEach(p=>{
  p.addEventListener('click', ()=> setRepeatUntil(p.dataset.until));
});

function resetRepeatFields(){
  currentRepeat = 'nenhuma';
  currentRepeatUntil = 'sempre';
  document.querySelectorAll('#repeatQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.repeat === 'nenhuma'));
  document.querySelectorAll('#repeatUntilQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.until === 'sempre'));
  document.getElementById('repeatUntilField').hidden = true;
  document.getElementById('fRepeatEndDate').hidden = true;
  document.getElementById('fRepeatEndDate').value = '';
}

function openAddSheet(tipo){
  document.getElementById('fTipo').value = tipo;
  const isReceita = tipo === 'Receita';
  addSheetTitle.textContent = isReceita ? 'Nova receita' : 'Nova despesa';
  addSheetBand.classList.toggle('receita', isReceita);
  addSheetBand.classList.toggle('despesa', !isReceita);

  populateCategoriaSelect();
  setQuickDate('hoje');
  resetRepeatFields();
  document.getElementById('fDescricao').value = '';
  document.getElementById('fValor').value = '';
  document.getElementById('fValor').closest('.add-valor-row').classList.remove('error');
  document.getElementById('formMsg').textContent = '';

  addSheet.classList.add('open');
  addOverlay.classList.add('open');
  addSheet.setAttribute('aria-hidden', 'false');
  // pequeno atraso garante que o campo já está visível/pintado antes de focar (evita falha de foco em mobile)
  setTimeout(()=> document.getElementById('fValor').focus(), 80);
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

// ---------- period sheet (seletor de período) ----------
const periodBtn = document.getElementById('periodBtn');
const periodSheet = document.getElementById('periodSheet');
const periodOverlay = document.getElementById('periodOverlay');

function showPeriodMode(mode){
  document.querySelectorAll('#periodModeQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.mode === mode));
  const idByMode = { semanal:'periodModeSemanal', mes:'periodModeMes', ano:'periodModeAno', personalizado:'periodModePersonalizado', preset:'periodModePreset' };
  Object.entries(idByMode).forEach(([m, id])=>{
    document.getElementById(id).hidden = (m !== mode);
  });
}

function currentPickerRange(){
  const mode = document.querySelector('#periodModeQuick .date-pill.active').dataset.mode;
  if(mode === 'semanal'){
    const d = document.getElementById('pSemanalDate').value;
    if(!d) return { mode };
    const start = new Date(d + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return { mode, start, end, anchorDate: d };
  }
  if(mode === 'mes'){
    const d = document.getElementById('pMesDate').value;
    if(!d) return { mode };
    const start = new Date(d + 'T00:00:00');
    const end = new Date(start); end.setMonth(end.getMonth()+1); end.setDate(end.getDate()-1);
    return { mode, start, end, anchorDate: d };
  }
  if(mode === 'ano'){
    const d = document.getElementById('pAnoDate').value;
    if(!d) return { mode };
    const start = new Date(d + 'T00:00:00');
    const end = new Date(start); end.setFullYear(end.getFullYear()+1); end.setDate(end.getDate()-1);
    return { mode, start, end, anchorDate: d };
  }
  if(mode === 'personalizado'){
    const s = document.getElementById('pCustomStart').value;
    const e = document.getElementById('pCustomEnd').value;
    if(!s || !e) return { mode, customStart: s, customEnd: e };
    return { mode, start: new Date(s+'T00:00:00'), end: new Date(e+'T00:00:00'), customStart: s, customEnd: e };
  }
  if(mode === 'preset'){
    const activeBtn = document.querySelector('#presetList .preset-option.active');
    const presetKey = activeBtn ? activeBtn.dataset.preset : null;
    if(!presetKey) return { mode };
    const range = computeRange({ mode:'preset', presetKey });
    return { mode, start: range.start, end: range.end, presetKey };
  }
  return { mode };
}

function updatePeriodPreview(){
  const r = currentPickerRange();
  const preview = document.getElementById('periodPreview');
  if(!r.start || !r.end || isNaN(r.start) || isNaN(r.end)){
    preview.textContent = 'Selecione as datas.';
    return;
  }
  if(r.end < r.start){
    preview.textContent = 'A data final precisa ser depois da inicial.';
    return;
  }
  const days = Math.round((r.end - r.start) / 86400000) + 1;
  const fmt = (d)=> d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
  preview.textContent = `${fmt(r.start)} – ${fmt(r.end)} · ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

document.querySelectorAll('#periodModeQuick .date-pill').forEach(p=>{
  p.addEventListener('click', ()=>{
    showPeriodMode(p.dataset.mode);
    updatePeriodPreview();
  });
});
['pSemanalDate','pMesDate','pAnoDate','pCustomStart','pCustomEnd'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updatePeriodPreview);
});
document.querySelectorAll('#presetList .preset-option').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#presetList .preset-option').forEach(b=> b.classList.toggle('active', b === btn));
    updatePeriodPreview();
  });
});

function openPeriodSheet(){
  const now = new Date();
  showPeriodMode(periodState.mode);

  document.getElementById('pSemanalDate').value = periodState.mode === 'semanal' ? periodState.anchorDate : toISODateLocal(now);
  document.getElementById('pMesDate').value = periodState.mode === 'mes' ? periodState.anchorDate : toISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  document.getElementById('pAnoDate').value = periodState.mode === 'ano' ? periodState.anchorDate : toISODateLocal(new Date(now.getFullYear(), 0, 1));

  if(periodState.mode === 'personalizado'){
    document.getElementById('pCustomStart').value = periodState.customStart;
    document.getElementById('pCustomEnd').value = periodState.customEnd;
  } else {
    const r = computeRange(periodState.mode === 'preset' && !periodState.presetKey ? { mode:'preset', presetKey:'7d' } : periodState);
    document.getElementById('pCustomStart').value = toISODateLocal(r.start);
    document.getElementById('pCustomEnd').value = toISODateLocal(r.end);
  }

  document.querySelectorAll('#presetList .preset-option').forEach(b=>{
    b.classList.toggle('active', periodState.mode === 'preset' && b.dataset.preset === periodState.presetKey);
  });

  updatePeriodPreview();
  periodSheet.classList.add('open');
  periodOverlay.classList.add('open');
  periodSheet.setAttribute('aria-hidden', 'false');
}
function closePeriodSheet(){
  periodSheet.classList.remove('open');
  periodOverlay.classList.remove('open');
  periodSheet.setAttribute('aria-hidden', 'true');
}
periodBtn.addEventListener('click', openPeriodSheet);
document.getElementById('periodCloseBtn').addEventListener('click', closePeriodSheet);
document.getElementById('periodCancelBtn').addEventListener('click', closePeriodSheet);
periodOverlay.addEventListener('click', closePeriodSheet);

document.getElementById('periodApplyBtn').addEventListener('click', ()=>{
  const r = currentPickerRange();
  if(!r.start || !r.end || isNaN(r.start) || isNaN(r.end) || r.end < r.start) return;

  if(r.mode === 'semanal') periodState = { mode:'semanal', anchorDate: r.anchorDate };
  else if(r.mode === 'mes') periodState = { mode:'mes', anchorDate: r.anchorDate };
  else if(r.mode === 'ano') periodState = { mode:'ano', anchorDate: r.anchorDate };
  else if(r.mode === 'personalizado') periodState = { mode:'personalizado', customStart: r.customStart, customEnd: r.customEnd };
  else if(r.mode === 'preset') periodState = { mode:'preset', presetKey: r.presetKey };

  updatePeriodLabel();
  closePeriodSheet();
  render();
});

// ---------- init ----------
(async function init(){
  const now = new Date();
  periodState = { mode: 'mes', anchorDate: toISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1)) };
  updatePeriodLabel();
  document.getElementById('fData').value = toISODateLocal(now);

  populateCategoriaSelect();
  await loadTheme();
  await loadTransactions();
  render();
  updateFooter();
})();
