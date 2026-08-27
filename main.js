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
const CONTAS_STORAGE_KEY = "contas";
const CONTA_CORES = ["#3e7bfa", "#2c9c6b", "#c9803a", "#b0473f", "#8a5cd6", "#3aa0b0", "#c76fa8", "#6f7a8a"];

let transactions = [];
let contas = [];
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
    const raw = localStorage.getItem(STORAGE_KEY);
    transactions = raw ? JSON.parse(raw) : [];
  }catch(e){
    transactions = [];
  }
}
async function saveTransactions(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    storageOK = true;
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

// ---------- contas (bancos) ----------
const MOEDA_INFO = {
  BRL: { label: 'Real', simbolo: 'R$' },
  USD: { label: 'Dólar', simbolo: 'US$' },
  JPY: { label: 'Iene', simbolo: '¥' }
};
let pendingFotoDataUrl = null;

async function loadContas(){
  try{
    const raw = localStorage.getItem(CONTAS_STORAGE_KEY);
    contas = raw ? JSON.parse(raw) : [];
  }catch(e){
    contas = [];
  }
}
async function saveContas(){
  try{
    localStorage.setItem(CONTAS_STORAGE_KEY, JSON.stringify(contas));
  }catch(e){ /* preferência não será mantida entre sessões — provavelmente localStorage cheio (fotos ocupam espaço) */ }
}
function renderColorSwatches(){
  const row = document.getElementById('colorSwatchRow');
  row.innerHTML = '';
  CONTA_CORES.forEach((cor, i)=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch' + (i === 0 ? ' active' : '');
    btn.style.background = cor;
    btn.dataset.cor = cor;
    btn.setAttribute('aria-label', 'Cor ' + cor);
    btn.addEventListener('click', ()=>{
      row.querySelectorAll('.color-swatch').forEach(s=> s.classList.remove('active'));
      btn.classList.add('active');
    });
    row.appendChild(btn);
  });
}

// ---------- foto da conta (lida, redimensiona para quadrado e comprime) ----------
function resizeImageToDataUrl(file, size){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function setPhotoPreview(dataUrl){
  const preview = document.getElementById('photoPreview');
  const removeBtn = document.getElementById('photoRemoveBtn');
  if(dataUrl){
    preview.innerHTML = `<img src="${dataUrl}" alt="">`;
    removeBtn.hidden = false;
  } else {
    preview.innerHTML = '<span class="photo-placeholder" id="photoPlaceholder">＋</span>';
    removeBtn.hidden = true;
  }
}
document.getElementById('photoBtnTrigger').addEventListener('click', ()=>{
  document.getElementById('fContaFoto').click();
});
document.getElementById('fContaFoto').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    pendingFotoDataUrl = await resizeImageToDataUrl(file, 160);
    setPhotoPreview(pendingFotoDataUrl);
  }catch(err){
    document.getElementById('accountMsg').textContent = 'Não foi possível carregar essa foto.';
  }
  e.target.value = '';
});
document.getElementById('photoRemoveBtn').addEventListener('click', ()=>{
  pendingFotoDataUrl = null;
  setPhotoPreview(null);
});

function accountAvatarHTML(conta){
  if(conta.foto){
    return `<img class="account-avatar" src="${conta.foto}" alt="">`;
  }
  const inicial = (conta.nome || '?').trim().charAt(0).toUpperCase();
  return `<span class="account-avatar-fallback" style="background:${conta.cor}">${inicial}</span>`;
}
function renderAccountList(){
  const list = document.getElementById('accountList');
  const emptyNote = document.getElementById('accountEmptyNote');
  list.querySelectorAll('.account-row').forEach(el=> el.remove());
  emptyNote.hidden = contas.length > 0;
  contas.forEach(conta=>{
    const moeda = MOEDA_INFO[conta.moeda] || MOEDA_INFO.BRL;
    const row = document.createElement('div');
    row.className = 'account-row';
    row.innerHTML = `
      ${accountAvatarHTML(conta)}
      <span class="account-info">
        <span class="account-name">${conta.nome}</span>
        <span class="account-moeda">${moeda.simbolo} ${moeda.label}</span>
      </span>
      <button type="button" class="account-del-btn" title="Excluir conta" aria-label="Excluir conta ${conta.nome}">×</button>
    `;
    row.querySelector('.account-del-btn').addEventListener('click', async ()=>{
      contas = contas.filter(c=> c.id !== conta.id);
      await saveContas();
      renderAccountList();
    });
    list.appendChild(row);
  });
}
// ---------- abrir/fechar sheet de nova conta (centralizado, igual ao de lançamentos) ----------
const accountSheet = document.getElementById('accountSheet');
const accountOverlay = document.getElementById('accountOverlay');
const addAccountBtn = document.getElementById('addAccountBtn');

function resetAccountForm(){
  document.getElementById('fContaNome').value = '';
  document.getElementById('fContaMoeda').value = 'BRL';
  document.querySelectorAll('.color-swatch').forEach((s, i)=> s.classList.toggle('active', i === 0));
  pendingFotoDataUrl = null;
  setPhotoPreview(null);
  document.getElementById('accountMsg').textContent = '';
}
function openAccountSheet(){
  resetAccountForm();
  accountSheet.classList.add('open');
  accountOverlay.classList.add('open');
  accountSheet.setAttribute('aria-hidden', 'false');
  setTimeout(()=> document.getElementById('fContaNome').focus(), 80);
}
function closeAccountSheet(){
  accountSheet.classList.remove('open');
  accountOverlay.classList.remove('open');
  accountSheet.setAttribute('aria-hidden', 'true');
}
addAccountBtn.addEventListener('click', openAccountSheet);
document.getElementById('accountSheetCloseBtn').addEventListener('click', closeAccountSheet);
document.getElementById('accountCancelBtn').addEventListener('click', closeAccountSheet);
accountOverlay.addEventListener('click', closeAccountSheet);

document.getElementById('accountForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('accountMsg');
  const nomeInput = document.getElementById('fContaNome');
  const nome = nomeInput.value.trim();
  if(!nome){
    msg.textContent = 'Dê um nome para a conta.';
    return;
  }
  if(contas.some(c=> c.nome.toLowerCase() === nome.toLowerCase())){
    msg.textContent = 'Já existe uma conta com esse nome.';
    return;
  }
  msg.textContent = '';
  const corAtiva = document.querySelector('.color-swatch.active');
  const cor = corAtiva ? corAtiva.dataset.cor : CONTA_CORES[0];
  const moeda = document.getElementById('fContaMoeda').value;

  contas.push({ id: uid(), nome, cor, moeda, foto: pendingFotoDataUrl });
  await saveContas();
  renderAccountList();

  closeAccountSheet();
});

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

const DONUT_COLORS = ['var(--green)','var(--gold)','var(--rust)','var(--green-light)','var(--gold-light)','var(--rust-light)'];

function renderDonut(porCategoria){
  const svg = document.getElementById('donutSvg');
  const legend = document.getElementById('donutLegend');
  const centerValue = document.getElementById('donutCenterValue');
  const entries = Object.entries(porCategoria).sort((a,b)=> b[1]-a[1]);
  const total = entries.reduce((s,[,v])=> s+v, 0);
  centerValue.textContent = fmtBRL(total);

  const r = 50, cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;
  let svgParts = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--paper-2)" stroke-width="14"></circle>`;

  if(entries.length === 0){
    svg.innerHTML = svgParts;
    legend.innerHTML = '<p class="empty-note">Nenhuma despesa lançada neste período ainda.</p>';
    return;
  }

  let offset = 0;
  let legendHTML = '';
  entries.forEach(([cat, val], i)=>{
    const pct = val / total;
    const segLen = pct * circumference;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    svgParts += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:${color}" stroke-width="14"
      stroke-dasharray="${segLen.toFixed(2)} ${(circumference - segLen).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"></circle>`;
    offset += segLen;
    legendHTML += `
      <div class="donut-legend-row">
        <span class="donut-legend-dot" style="background:${color}"></span>
        <span class="donut-legend-name">${cat}</span>
        <span class="donut-legend-pct">${Math.round(pct*100)}%</span>
        <span class="donut-legend-val">${fmtBRL(val)}</span>
      </div>`;
  });
  svg.innerHTML = svgParts;
  legend.innerHTML = legendHTML;
}

function renderRecentList(list){
  const container = document.getElementById('recentList');
  const recent = [...list].sort((a,b)=> b.data.localeCompare(a.data)).slice(0, 6);

  if(recent.length === 0){
    container.innerHTML = '<p class="empty-note">Nenhum lançamento neste período ainda.</p>';
    return;
  }

  container.innerHTML = recent.map(t=>{
    const dataFmt = new Date(t.data+'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
    const cls = tipoClass(t.tipo);
    const sign = tipoSign(t.tipo);
    const nome = t.tipo === 'Transferencia' ? (t.descricao || 'Transferência') : (t.descricao || t.subcategoria);
    const sub = t.tipo === 'Transferencia' ? `${contaNome(t.contaOrigemId)} → ${contaNome(t.contaDestinoId)}` : `${dataFmt} · ${t.categoria}`;
    return `
      <button type="button" class="recent-row" data-id="${t.id}" data-date="${t.data}">
        <span class="recent-icon ${cls}">${sign}</span>
        <span class="recent-info">
          <span class="recent-name">${nome}</span>
          <span class="recent-sub">${sub}</span>
        </span>
        <span class="recent-val ${cls}">${sign} ${fmtBRL(t.valor)}</span>
      </button>`;
  }).join('');

  container.querySelectorAll('.recent-row').forEach(btn=>{
    btn.addEventListener('click', ()=> openDetail(btn.dataset.id, btn.dataset.date));
  });
}
document.getElementById('recentSeeAll').addEventListener('click', (e)=>{
  e.preventDefault();
  switchView('lancamento');
});

function render(){
  const list = filteredForPeriod();

  const receitas = list.filter(t=>t.tipo==='Receita').reduce((s,t)=>s+t.valor,0);
  const despesas = list.filter(t=>t.tipo==='Despesa').reduce((s,t)=>s+t.valor,0);
  const saldo = receitas - despesas;

  document.getElementById('totReceitas').textContent = fmtBRL(receitas);
  document.getElementById('totDespesas').textContent = fmtBRL(despesas);
  const totSaldoEl = document.getElementById('totSaldo');
  totSaldoEl.textContent = fmtBRL(saldo);
  totSaldoEl.style.color = saldo >= 0 ? 'var(--color-receita)' : 'var(--color-despesa)';

  const stamp = document.getElementById('stamp');
  const stampVerdict = document.getElementById('stampVerdict');
  const balanceWord = document.getElementById('balanceWord');
  const positive = saldo >= 0;
  stamp.style.setProperty('--sc', positive ? 'var(--color-receita)' : 'var(--color-despesa)');
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

  // categorias (donut de despesas)
  const porCategoria = {};
  list.filter(t=>t.tipo==='Despesa').forEach(t=>{
    porCategoria[t.categoria] = (porCategoria[t.categoria]||0) + t.valor;
  });
  renderDonut(porCategoria);
  renderRecentList(list);

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
    const cls = tipoClass(t.tipo);
    const sign = tipoSign(t.tipo);
    const catCellHTML = t.tipo === 'Transferencia'
      ? `${contaNome(t.contaOrigemId)}<span class="sub">→ ${contaNome(t.contaDestinoId)}</span>`
      : `${t.categoria}<span class="sub">${t.subcategoria}</span>`;
    return `
      <button type="button" class="ledger-row" data-id="${t.id}" data-date="${t.data}">
        <span class="entry-no"><span class="badge">Nº ${num}</span></span>
        <span>${dataFmt}${recurBadge}</span>
        <span><span class="tipo-tag ${cls}">${tipoLabel(t.tipo)}</span></span>
        <span class="cat-cell">${catCellHTML}</span>
        <span class="desc-cell">${t.descricao || '—'}</span>
        <span class="val-cell ${cls}">${sign} ${fmtBRL(t.valor)}</span>
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

  if(tipo === 'Transferencia'){
    const contaOrigemId = document.getElementById('fContaOrigem').value;
    const contaDestinoId = document.getElementById('fContaDestino').value;
    if(contas.length < 2){
      msg.textContent = 'Cadastre pelo menos 2 contas para poder transferir.';
      return;
    }
    if(!contaOrigemId || !contaDestinoId){
      msg.textContent = 'Escolha a conta de origem e a de destino.';
      return;
    }
    if(contaOrigemId === contaDestinoId){
      msg.textContent = 'As contas de origem e destino precisam ser diferentes.';
      return;
    }
    msg.textContent = '';

    transactions.push({ id: uid(), data, tipo, contaOrigemId, contaDestinoId, descricao, valor, repeticao: 'nenhuma' });
    await saveTransactions();

    const d = new Date(data + 'T00:00:00');
    periodState = { mode: 'mes', anchorDate: toISODateLocal(new Date(d.getFullYear(), d.getMonth(), 1)) };
    updatePeriodLabel();

    render();
    closeAddSheet();
    return;
  }

  const categoria = document.getElementById('fCategoria').value;
  const subcategoria = document.getElementById('fSubcategoria').value;

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

// ---------- navigation (side nav fixa + views) ----------
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  if(periodSheet.classList.contains('open')) closePeriodSheet();
  else if(addSheet.classList.contains('open')) closeAddSheet();
  else if(accountSheet.classList.contains('open')) closeAccountSheet();
  else if(detailSheet.classList.contains('open')) closeDetail();
  else if(fabWrap.classList.contains('open')) closeSpeedDial();
});

function switchView(view){
  document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.id === 'view' + view.charAt(0).toUpperCase() + view.slice(1)));
  document.querySelectorAll('.nav-item').forEach(b=> b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo({top: 0, behavior: 'auto'});
}
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    switchView(btn.dataset.view);
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

  const isTransferencia = t.tipo === 'Transferencia';
  const displayDate = occurrenceDate || t.data;
  document.getElementById('detailTitle').textContent = isTransferencia
    ? (t.descricao || 'Transferência')
    : (t.descricao || t.subcategoria);
  document.getElementById('detailData').textContent = new Date(displayDate+'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('detailTipo').textContent = tipoLabel(t.tipo);

  if(isTransferencia){
    document.getElementById('detailCategoriaLabel').textContent = 'De (conta)';
    document.getElementById('detailSubcategoriaLabel').textContent = 'Para (conta)';
    document.getElementById('detailCategoria').textContent = contaNome(t.contaOrigemId);
    document.getElementById('detailSubcategoria').textContent = contaNome(t.contaDestinoId);
  } else {
    document.getElementById('detailCategoriaLabel').textContent = 'Categoria';
    document.getElementById('detailSubcategoriaLabel').textContent = 'Subcategoria';
    document.getElementById('detailCategoria').textContent = t.categoria;
    document.getElementById('detailSubcategoria').textContent = t.subcategoria;
  }

  document.getElementById('detailDescricao').textContent = t.descricao || '—';
  document.getElementById('detailRepeticao').textContent = isTransferencia ? 'Não repete' : repeatLabel(t);
  const valorEl = document.getElementById('detailValor');
  const cls = tipoClass(t.tipo);
  const sign = tipoSign(t.tipo);
  valorEl.textContent = sign + ' ' + fmtBRL(t.valor);
  valorEl.classList.remove('receita', 'despesa', 'transferencia');
  valorEl.classList.add(cls);

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
  const calSlot = document.getElementById('calSlotEntryDate');
  document.querySelectorAll('#dateQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.date === which));
  const now = new Date();
  if(which === 'hoje'){
    calSlot.hidden = true;
    dateInput.value = toISODateLocal(now);
  } else if(which === 'ontem'){
    calSlot.hidden = true;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    dateInput.value = toISODateLocal(y);
  } else {
    function handleEntryDateSelect(iso){
      dateInput.value = iso;
      calMountFor(calSlot, iso, null, handleEntryDateSelect);
    }
    calMountFor(calSlot, dateInput.value || toISODateLocal(now), null, handleEntryDateSelect);
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
  const calSlot = document.getElementById('calSlotRepeatEnd');
  calSlot.hidden = (which !== 'data');
  if(which === 'data'){
    const now = new Date();
    let defaultDate = endInput.value;
    if(!defaultDate){
      const d = new Date(now); d.setMonth(d.getMonth() + 3);
      defaultDate = toISODateLocal(d);
    }
    function handleRepeatEndSelect(iso){
      endInput.value = iso;
      calMountFor(calSlot, iso, null, handleRepeatEndSelect);
    }
    calMountFor(calSlot, defaultDate, null, handleRepeatEndSelect);
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
  document.getElementById('calSlotRepeatEnd').hidden = true;
  document.getElementById('fRepeatEndDate').value = '';
}

function populateContaSelects(){
  const selOrigem = document.getElementById('fContaOrigem');
  const selDestino = document.getElementById('fContaDestino');
  selOrigem.innerHTML = '';
  selDestino.innerHTML = '';
  contas.forEach(conta=>{
    const optA = document.createElement('option');
    optA.value = conta.id; optA.textContent = conta.nome;
    selOrigem.appendChild(optA);
    const optB = document.createElement('option');
    optB.value = conta.id; optB.textContent = conta.nome;
    selDestino.appendChild(optB);
  });
  if(contas.length > 1) selDestino.selectedIndex = 1;
}
function contaNome(id){
  const c = contas.find(c=> c.id === id);
  return c ? c.nome : 'Conta removida';
}
function tipoClass(tipo){
  if(tipo === 'Receita') return 'receita';
  if(tipo === 'Transferencia') return 'transferencia';
  return 'despesa';
}
function tipoSign(tipo){
  if(tipo === 'Receita') return '+';
  if(tipo === 'Transferencia') return '⇄';
  return '−';
}
function tipoLabel(tipo){
  if(tipo === 'Transferencia') return 'Transferência';
  return tipo;
}

function openAddSheet(tipo){
  document.getElementById('fTipo').value = tipo;
  const isReceita = tipo === 'Receita';
  const isTransferencia = tipo === 'Transferencia';
  const titles = { Receita: 'Nova receita', Despesa: 'Nova despesa', Transferencia: 'Nova transferência' };
  addSheetTitle.textContent = titles[tipo];
  addSheetBand.classList.toggle('receita', isReceita);
  addSheetBand.classList.toggle('despesa', tipo === 'Despesa');
  addSheetBand.classList.toggle('transferencia', isTransferencia);

  document.getElementById('camposCategoria').hidden = isTransferencia;
  document.getElementById('camposTransferencia').hidden = !isTransferencia;
  document.getElementById('camposRepetir').hidden = isTransferencia;
  document.getElementById('repeatUntilField').hidden = true;
  const avisoContas = document.getElementById('transferAvisoContas');
  if(isTransferencia){
    populateContaSelects();
    avisoContas.hidden = contas.length >= 2;
  } else {
    avisoContas.hidden = true;
    populateCategoriaSelect();
  }

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
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){ /* preferência não será mantida entre sessões */ }
}
async function loadTheme(){
  let theme = 'claro';
  try{
    const saved = localStorage.getItem(THEME_KEY);
    if(saved){
      theme = saved;
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

// ---------- calendário reutilizável (usado no período e em qualquer campo de data do app) ----------
const sharedCalendarEl = document.getElementById('sharedCalendar');
let calState = { viewYear: 2026, viewMonth: 0, selectedDates: [], rangeStart: null, rangeEnd: null, onSelect: null };

function calMountFor(slotEl, selectedDate, rangeMode, onSelect){
  const base = selectedDate || toISODateLocal(new Date());
  let rangeStart = null, rangeEnd = null;
  if(rangeMode && selectedDate){
    rangeStart = new Date(selectedDate + 'T00:00:00');
    rangeEnd = computeRange({ mode: rangeMode, anchorDate: selectedDate }).end;
  }
  calMountForRange(slotEl, base, selectedDate ? [selectedDate] : [], rangeStart, rangeEnd, onSelect);
}

function calMountForRange(slotEl, viewAnchorDate, selectedDates, rangeStart, rangeEnd, onSelect){
  slotEl.hidden = false;
  slotEl.appendChild(sharedCalendarEl);
  sharedCalendarEl.hidden = false;
  const base = viewAnchorDate || toISODateLocal(new Date());
  const d = new Date(base + 'T00:00:00');
  calState = { viewYear: d.getFullYear(), viewMonth: d.getMonth(), selectedDates, rangeStart, rangeEnd, onSelect };
  renderCalendar();
}

function renderCalendar(){
  const monthName = new Date(calState.viewYear, calState.viewMonth, 1).toLocaleDateString('pt-BR', { month:'long' });
  document.getElementById('calMonthLabel').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  document.getElementById('calYearLabel').textContent = calState.viewYear;

  const todayStr = toISODateLocal(new Date());
  const { rangeStart, rangeEnd } = calState;
  const selectedSet = new Set(calState.selectedDates || []);

  const firstDow = new Date(calState.viewYear, calState.viewMonth, 1).getDay();
  const totalDays = new Date(calState.viewYear, calState.viewMonth + 1, 0).getDate();

  const cells = [];
  for(let i = firstDow; i > 0; i--){
    const d = new Date(calState.viewYear, calState.viewMonth, 1 - i);
    cells.push({ date: d, muted: true });
  }
  for(let day = 1; day <= totalDays; day++){
    cells.push({ date: new Date(calState.viewYear, calState.viewMonth, day), muted: false });
  }
  while(cells.length < 42){
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, muted: true });
  }

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  cells.forEach(cell=>{
    const iso = toISODateLocal(cell.date);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = cell.date.getDate();

    if(cell.muted) btn.classList.add('muted');
    if(iso === todayStr) btn.classList.add('today');
    if(selectedSet.has(iso)) btn.classList.add('selected');
    if(rangeStart && rangeEnd && cell.date >= rangeStart && cell.date <= rangeEnd) btn.classList.add('in-range');

    if(cell.muted){
      btn.disabled = true;
      btn.tabIndex = -1;
    } else {
      btn.addEventListener('click', ()=>{
        if(calState.onSelect) calState.onSelect(iso);
      });
    }
    grid.appendChild(btn);
  });
}
document.getElementById('calPrevBtn').addEventListener('click', ()=>{
  calState.viewMonth--;
  if(calState.viewMonth < 0){ calState.viewMonth = 11; calState.viewYear--; }
  renderCalendar();
});
document.getElementById('calNextBtn').addEventListener('click', ()=>{
  calState.viewMonth++;
  if(calState.viewMonth > 11){ calState.viewMonth = 0; calState.viewYear++; }
  renderCalendar();
});

// ---------- period sheet (seletor de período) ----------
const periodBtn = document.getElementById('periodBtn');
const periodSheet = document.getElementById('periodSheet');
const periodOverlay = document.getElementById('periodOverlay');
const CAL_MODES = ['semanal', 'mes'];
const CAL_CAPTIONS = {
  semanal: 'Escolha o dia inicial — a semana pega ele e os próximos 6 dias.',
  mes: 'Escolha o dia de referência do mês.'
};

function showPeriodMode(mode){
  document.querySelectorAll('#periodModeQuick .date-pill').forEach(p=> p.classList.toggle('active', p.dataset.mode === mode));
  document.getElementById('periodModeCalendar').hidden = !CAL_MODES.includes(mode);
  document.getElementById('periodModeYear').hidden = (mode !== 'ano');
  document.getElementById('periodModePersonalizado').hidden = (mode !== 'personalizado');
  document.getElementById('periodModePreset').hidden = (mode !== 'preset');
}

function initCalForMode(mode){
  const now = new Date();
  let selected;
  if(periodState.mode === mode && periodState.anchorDate){
    selected = periodState.anchorDate;
  } else if(mode === 'mes'){
    selected = toISODateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  } else {
    selected = toISODateLocal(now);
  }
  document.getElementById('calCaption').textContent = CAL_CAPTIONS[mode];

  function handleAnchorSelect(iso){
    calMountFor(document.getElementById('calSlotAnchor'), iso, mode, handleAnchorSelect);
    updatePeriodPreview();
  }
  calMountFor(document.getElementById('calSlotAnchor'), selected, mode, handleAnchorSelect);
}

// ---------- ano (grade de anos) ----------
let yearPickerState = { baseYear: 2020, selectedYear: null };

function initYearPicker(){
  const now = new Date();
  let selectedYear;
  if(periodState.mode === 'ano' && periodState.anchorDate){
    selectedYear = new Date(periodState.anchorDate + 'T00:00:00').getFullYear();
  } else {
    selectedYear = now.getFullYear();
  }
  yearPickerState = { baseYear: selectedYear - (selectedYear % 12), selectedYear };
  renderYearPicker();
}
function renderYearPicker(){
  const start = yearPickerState.baseYear;
  document.getElementById('yearRangeLabel').textContent = `${start} – ${start + 11}`;
  const thisYear = new Date().getFullYear();
  const grid = document.getElementById('yearGrid');
  grid.innerHTML = '';
  for(let y = start; y < start + 12; y++){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'year-cell';
    btn.textContent = y;
    if(y === thisYear) btn.classList.add('today');
    if(y === yearPickerState.selectedYear) btn.classList.add('selected');
    btn.addEventListener('click', ()=>{
      yearPickerState.selectedYear = y;
      renderYearPicker();
      updatePeriodPreview();
    });
    grid.appendChild(btn);
  }
}
document.getElementById('yearPrevBtn').addEventListener('click', ()=>{
  yearPickerState.baseYear -= 12;
  renderYearPicker();
});
document.getElementById('yearNextBtn').addEventListener('click', ()=>{
  yearPickerState.baseYear += 12;
  renderYearPicker();
});

// ---------- personalizado (Início / Fim via chips + calendário) ----------
let customStartVal = null, customEndVal = null;
let customActiveTarget = 'start';
function fmtDateShort(iso){
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}
function refreshCustomChips(){
  document.getElementById('chipCustomStart').textContent = 'Início: ' + (customStartVal ? fmtDateShort(customStartVal) : '—');
  document.getElementById('chipCustomEnd').textContent = 'Fim: ' + (customEndVal ? fmtDateShort(customEndVal) : '—');
}
function activateCustomTarget(target){
  customActiveTarget = target;
  document.querySelectorAll('.chip-date').forEach(c=> c.classList.toggle('active', c.dataset.target === target));
  renderCustomCalendar();
}
function renderCustomCalendar(){
  const anchor = customActiveTarget === 'start' ? (customStartVal || customEndVal) : (customEndVal || customStartVal);
  const viewAnchor = anchor || toISODateLocal(new Date());
  const rangeStart = customStartVal ? new Date(customStartVal + 'T00:00:00') : null;
  const rangeEnd = customEndVal ? new Date(customEndVal + 'T00:00:00') : null;
  const selectedDates = [customStartVal, customEndVal].filter(Boolean);
  calMountForRange(document.getElementById('calSlotCustom'), viewAnchor, selectedDates, rangeStart, rangeEnd, (iso)=>{
    if(customActiveTarget === 'start') customStartVal = iso; else customEndVal = iso;
    refreshCustomChips();
    updatePeriodPreview();
    renderCustomCalendar();
  });
}
document.querySelectorAll('.chip-date').forEach(chip=>{
  chip.addEventListener('click', ()=> activateCustomTarget(chip.dataset.target));
});

function currentPickerRange(){
  const mode = document.querySelector('#periodModeQuick .date-pill.active').dataset.mode;
  if(CAL_MODES.includes(mode)){
    const d = calState.selectedDate;
    if(!d) return { mode };
    const { start, end } = computeRange({ mode, anchorDate: d });
    return { mode, start, end, anchorDate: d };
  }
  if(mode === 'ano'){
    const y = yearPickerState.selectedYear;
    if(!y) return { mode };
    const anchorDate = toISODateLocal(new Date(y, 0, 1));
    const { start, end } = computeRange({ mode, anchorDate });
    return { mode, start, end, anchorDate };
  }
  if(mode === 'personalizado'){
    if(!customStartVal || !customEndVal) return { mode, customStart: customStartVal, customEnd: customEndVal };
    return { mode, start: new Date(customStartVal+'T00:00:00'), end: new Date(customEndVal+'T00:00:00'), customStart: customStartVal, customEnd: customEndVal };
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
    if(CAL_MODES.includes(p.dataset.mode)) initCalForMode(p.dataset.mode);
    else if(p.dataset.mode === 'ano') initYearPicker();
    else if(p.dataset.mode === 'personalizado') activateCustomTarget(document.querySelector('.chip-date.active')?.dataset.target || 'start');
    updatePeriodPreview();
  });
});
document.querySelectorAll('#presetList .preset-option').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#presetList .preset-option').forEach(b=> b.classList.toggle('active', b === btn));
    updatePeriodPreview();
  });
});

function openPeriodSheet(){
  showPeriodMode(periodState.mode);

  if(CAL_MODES.includes(periodState.mode)){
    initCalForMode(periodState.mode);
  } else if(periodState.mode === 'ano'){
    initYearPicker();
  }

  if(periodState.mode === 'personalizado'){
    customStartVal = periodState.customStart;
    customEndVal = periodState.customEnd;
  } else {
    const r = computeRange(periodState.mode === 'preset' && !periodState.presetKey ? { mode:'preset', presetKey:'7d' } : periodState);
    customStartVal = toISODateLocal(r.start);
    customEndVal = toISODateLocal(r.end);
  }
  refreshCustomChips();
  if(periodState.mode === 'personalizado'){
    activateCustomTarget('start');
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
  renderColorSwatches();
  await loadTheme();
  await loadTransactions();
  await loadContas();
  renderAccountList();
  render();
  updateFooter();
})();
