import { watchAuth, logout } from "./auth.js";

import {
  createAccount,
  createCategory,
  createTransaction,
  listAccounts,
  listCategories,
  watchTransactionsMonth,
  watchTransactionsAll,
  watchAccounts,
  watchSettings,
  setMonthlyBudget
} from "./db.js";


import { seedDefaultCategories } from "./seed.js";


const $ = (id) => document.getElementById(id);

let chartCategory = null;
let chartBalance = null;

let unsubBalances = null;
let unsubAccounts = null;
let unsubSettings = null;

let allTxCache = [];
let settings = { monthlyBudget: 0 };


let viewMode = "month"; // "month" | "history"
let selectedMonth = new Date(); // controla qual mês está vendo


let currentUser = null;
let txType = "expense";
let catType = "expense";
let unsubTx = null;

let accounts = [];
let categories = [];
let accountMap = new Map();
let categoryMap = new Map();

function openModal(id){ $(id).classList.add("show"); $(id).setAttribute("aria-hidden","false"); }
function closeModal(id){ $(id).classList.remove("show"); $(id).setAttribute("aria-hidden","true"); }
function setMsg(el, text, type=""){ el.className = "msg" + (type ? ` ${type}` : ""); el.textContent = text || ""; }

function parseMoneyBR(value){
  const v = String(value || "").trim()
    .replace(/\./g,"")
    .replace(",",".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatBRL(n){
  return (Number(n) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function formatDateBR(yyyyMmDd){
  // "2026-02-18" -> "18/02/2026"
  if(!yyyyMmDd || typeof yyyyMmDd !== "string") return "";
  const [y,m,d] = yyyyMmDd.split("-");
  return (d && m && y) ? `${d}/${m}/${y}` : yyyyMmDd;
}

function getMonthRange(date = new Date()){
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0); // último dia do mês

  const toStr = (dt) => {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2,"0");
    const dd = String(dt.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return { startDate: toStr(start), endDate: toStr(end) };
}

async function loadLookups(uid){
  [accounts, categories] = await Promise.all([listAccounts(uid), listCategories(uid)]);
  accountMap = new Map(accounts.map(a => [a.id, a]));
  categoryMap = new Map(categories.map(c => [c.id, c]));
}

async function refreshSelects(uid){
  await refreshCategories(uid);

  const selCat = $("txCategory");
  const filtered = categories.filter(c => c.type === txType);
  selCat.innerHTML = filtered.length
    ? filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
    : `<option value="" disabled selected>Crie uma categoria (${txType === "expense" ? "saída" : "entrada"})</option>`;
}


function renderTransactions(items){
  const list = $("txList");
  const empty = $("emptyState");

  if(!items.length){
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  list.innerHTML = items.map(tx => {
    const cat = categoryMap.get(tx.categoryId);
    const acc = accountMap.get(tx.accountId);

    const signClass = tx.type === "income" ? "pos" : "neg";
    const prefix = tx.type === "income" ? "+" : "-";

    const metaParts = [
      formatDateBR(tx.date),
      cat?.name ? `• ${cat.name}` : "",
      acc?.name ? `• ${acc.name}` : ""
    ].filter(Boolean).join(" ");

    return `
      <div class="tx">
        <div class="tx__left">
          <div class="tx__title">${escapeHtml(tx.description || "Sem descrição")}</div>
          <div class="tx__meta">${escapeHtml(metaParts)}</div>
        </div>
        <div class="tx__value ${signClass}">
          ${prefix} ${formatBRL(tx.amount)}
        </div>
      </div>
    `;
  }).join("");
}

function computeDashboard(items){
  let income = 0;
  let expense = 0;

  for(const tx of items){
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income") income += amt;
    else expense += amt;
  }

  const balance = income - expense;

  $("sumIncome").textContent = formatBRL(income);
  $("sumExpense").textContent = formatBRL(expense);
  $("sumBalance").textContent = formatBRL(balance);

  // Saúde financeira
  const rate = income > 0 ? (balance / income) : 0; // taxa de poupança
  let cls = "warn";
  let text = `Saúde financeira: ${(rate*100).toFixed(0)}%`;

  if(rate >= 0.20) cls = "ok";
  else if(rate < 0) cls = "bad";

  $("healthHint").innerHTML = `<span class="badge ${cls}">● ${escapeHtml(text)}</span>`;

  // Meta mensal (gastos)
  const budget = Number(settings?.monthlyBudget || 0);
  const box = $("budgetBox");
  if(!box) return;

  if(budget > 0){
    box.style.display = "block";
    $("budgetLabel").textContent = `Meta: ${formatBRL(budget)}`;

    const pct = Math.min(100, Math.round((expense / budget) * 100));
    $("budgetFill").style.width = `${isFinite(pct) ? pct : 0}%`;

    $("budgetSpent").textContent = `Gasto: ${formatBRL(expense)}`;
    $("budgetRemaining").textContent = `Restante: ${formatBRL(budget - expense)}`;

    // se estourou, fica vermelho
    if(expense > budget){
      $("budgetFill").style.background = "linear-gradient(135deg, #EF4444, #B91C1C)";
    }else{
      $("budgetFill").style.background = "linear-gradient(135deg, var(--accent), var(--accent2))";
    }
  } else {
    box.style.display = "none";
  }
}


function renderAccounts(balances){
  const grid = $("accountsGrid");
  if(!grid) return;

  if(!accounts.length){
    grid.innerHTML = `<div class="muted">Crie uma conta para começar.</div>`;
    return;
  }

  grid.innerHTML = accounts.map(a => {
    const bal = balances.get(a.id) ?? (Number(a.initialBalance) || 0);
    return `
      <div class="acc">
        <div class="acc__top">
          <div>
            <div class="acc__name">${escapeHtml(a.name)}</div>
            <div class="acc__type">${escapeHtml(a.type || "")}</div>
          </div>
        </div>
        <div class="acc__bal">${formatBRL(bal)}</div>
      </div>
    `;
  }).join("");
}

function computeAccountBalances(){
  // saldo inicial
  const balances = new Map();
  for(const a of accounts){
    balances.set(a.id, Number(a.initialBalance) || 0);
  }

  // aplica todas as transações (histórico completo)
  for(const tx of allTxCache){
    const id = tx.accountId;
    if(!id) continue;

    const cur = balances.get(id) ?? 0;
    const amt = Number(tx.amount) || 0;

    if(tx.type === "income") balances.set(id, cur + amt);
    else if(tx.type === "expense") balances.set(id, cur - amt);
  }

  renderAccounts(balances);
}


function renderCharts(items){
  const ctxCat = document.getElementById("chartCategory");
  const ctxBal = document.getElementById("chartBalance");

  if(!ctxCat || !ctxBal) return;

  // destruir gráficos antigos
  if(chartCategory) chartCategory.destroy();
  if(chartBalance) chartBalance.destroy();

  // Agrupar por categoria (somente despesas)
  const byCategory = {};
  let income = 0;
  let expense = 0;

  for(const tx of items){
    const amt = Number(tx.amount) || 0;

    if(tx.type === "income"){
      income += amt;
    } else {
      expense += amt;
      const cat = categoryMap.get(tx.categoryId)?.name || "Outros";
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    }
  }

  // Gráfico pizza por categoria
  chartCategory = new Chart(ctxCat, {
    type: "doughnut",
    data: {
      labels: Object.keys(byCategory),
      datasets: [{
        data: Object.values(byCategory),
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#F3F4F6" } }
      }
    }
  });

  // Gráfico barras entrada vs saída
  chartBalance = new Chart(ctxBal, {
    type: "bar",
    data: {
      labels: ["Entradas", "Saídas"],
      datasets: [{
        data: [income, expense],
        backgroundColor: ["#22C55E", "#EF4444"]
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { ticks: { color: "#F3F4F6" } },
        x: { ticks: { color: "#F3F4F6" } }
      }
    }
  });
}


function monthLabel(dt){
  const m = dt.toLocaleString("pt-BR", { month: "long" });
  const y = dt.getFullYear();
  return `${m[0].toUpperCase() + m.slice(1)} ${y}`;
}

function watchView(uid){
  if(unsubTx) unsubTx();

  $("monthNav").style.display = (viewMode === "month") ? "flex" : "none";

  if(viewMode === "history"){
    $("monthLabel").textContent = "Histórico";
    unsubTx = watchTransactionsAll(uid, {
      onChange: (items) => {
        computeDashboard(items);     // dashboard no histórico = geral (por enquanto)
        renderTransactions(items);
        renderCharts(items);
        $("listHint").textContent = `Histórico • ${items.length} item(ns)`;
      },
      onError: (err) => {
        console.error(err);
        $("listHint").textContent = "Erro ao carregar histórico (ver console).";
      }
    });
    return;
  }

  // viewMode === "month"
  $("monthLabel").textContent = monthLabel(selectedMonth);

  const { startDate, endDate } = getMonthRange(selectedMonth);
  unsubTx = watchTransactionsMonth(uid, {
    startDate,
    endDate,
    onChange: (items) => {
  computeDashboard(items);
  renderTransactions(items);
  renderCharts(items); // ✅ FALTAVA ISSO AQUI
  $("listHint").textContent = `Mês • ${items.length} item(ns)`;
},

    onError: (err) => {
      console.error(err);
      $("listHint").textContent = "Erro ao carregar mês (ver console).";
    }
  });
}


function wireCloseButtons(){
  document.querySelectorAll("[data-close]").forEach(btn=>{
    btn.addEventListener("click", ()=> closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".modal").forEach(m=>{
    m.addEventListener("click", (e)=>{
      if(e.target === m) closeModal(m.id);
    });
  });
}

function wireSegmented(){
  document.querySelectorAll("#modalTx .seg").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll("#modalTx .seg").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      txType = btn.dataset.type;
      if(currentUser) await refreshSelects(currentUser.uid);
    });
  });

  document.querySelectorAll("#modalCategory [data-cat-type]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll("#modalCategory [data-cat-type]").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      catType = btn.dataset.catType;
    });
  });

  // toggle Mês / Histórico
document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-view]').forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    viewMode = btn.dataset.view;
    watchView(currentUser.uid);
  });
});

}

function setDefaultDate(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  $("txDate").value = `${yyyy}-${mm}-${dd}`;
}

function wireButtons(){
  $("btnNewTx").addEventListener("click", async ()=>{
    openModal("modalTx");
    setDefaultDate();
    if(currentUser) await refreshSelects(currentUser.uid);
  });

  $("btnNewAccount").addEventListener("click", ()=> openModal("modalAccount"));
  $("btnNewCategory").addEventListener("click", ()=> openModal("modalCategory"));
  $("btnOpenSettings").addEventListener("click", ()=> openModal("modalSettings"));

  $("btnLogout").addEventListener("click", async ()=>{
    await logout();
    window.location.href = "./index.html";
  });

  $("btnSeed").addEventListener("click", async ()=>{
    const msg = $("msgSettings");
    setMsg(msg, "Criando categorias padrão...", "ok");
    try{
      await seedDefaultCategories(currentUser.uid);
      await refreshSelects(currentUser.uid);
      setMsg(msg, "Categorias criadas ✅", "ok");
    }catch(e){
      setMsg(msg, e.message || "Falha ao criar categorias.", "err");
    }
  });

  $("btnPrevMonth").addEventListener("click", () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
  watchView(currentUser.uid);
});

$("btnNextMonth").addEventListener("click", () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
  watchView(currentUser.uid);
});

// salvar meta mensal
const btnSaveBudget = $("btnSaveBudget");
if(btnSaveBudget){
  btnSaveBudget.addEventListener("click", async () => {
    const msg = $("msgSettings");
    const val = parseMoneyBR($("monthlyBudget")?.value || "0");

    if(!Number.isFinite(val) || val < 0){
      if(msg) setMsg(msg, "Meta inválida.", "err");
      return;
    }

    try{
      await setMonthlyBudget(currentUser.uid, val);
      if(msg) setMsg(msg, "Meta salva ✅", "ok");
    }catch(e){
      console.error(e);
      if(msg) setMsg(msg, e.message || "Falha ao salvar meta.", "err");
    }
  });
}

// abrir modal de transferência
const btnTransfer = $("btnTransfer");
if(btnTransfer){
  btnTransfer.addEventListener("click", () => {
    openModal("modalTransfer");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    const trDate = $("trDate");
    if(trDate) trDate.value = `${yyyy}-${mm}-${dd}`;
  });
}


}

function wireForms(){
  $("formAccount").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const msg = $("msgAccount");
    setMsg(msg, "Salvando...", "ok");

    try{
      await createAccount(currentUser.uid, {
        name: $("accName").value.trim(),
        type: $("accType").value,
        initialBalance: parseMoneyBR($("accInitial").value || "0"),
      });

      await refreshSelects(currentUser.uid);
      setMsg(msg, "Conta criada ✅", "ok");
      e.target.reset();
      setTimeout(()=> closeModal("modalAccount"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao criar conta.", "err");
    }
  });

  $("formCategory").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const msg = $("msgCategory");
    setMsg(msg, "Salvando...", "ok");

    try{
      await createCategory(currentUser.uid, {
        name: $("catName").value.trim(),
        type: catType,
      });

      await refreshSelects(currentUser.uid);
      setMsg(msg, "Categoria criada ✅", "ok");
      e.target.reset();
      setTimeout(()=> closeModal("modalCategory"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao criar categoria.", "err");
    }
  });

  $("formTx").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const msg = $("msgTx");
    setMsg(msg, "Salvando...", "ok");

    const amount = parseMoneyBR($("txAmount").value);
    if(!Number.isFinite(amount) || amount <= 0){
      setMsg(msg, "Valor inválido.", "err");
      return;
    }

    const acc = $("txAccount").value;
    const cat = $("txCategory").value;
    if(!acc || !cat){
      setMsg(msg, "Crie uma conta e categoria antes.", "err");
      return;
    }

    try{
      await createTransaction(currentUser.uid, {
        type: txType,
        amount,
        date: $("txDate").value, // YYYY-MM-DD
        description: $("txDesc").value.trim(),
        accountId: acc,
        categoryId: cat,
        notes: $("txNotes").value.trim(),
      });

      setMsg(msg, "Lançamento salvo ✅", "ok");
      e.target.reset();
      setDefaultDate();
      setTimeout(()=> closeModal("modalTx"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao salvar lançamento.", "err");
    }
  });
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function refreshCategories(uid){
  categories = await listCategories(uid);
  categoryMap = new Map(categories.map(c => [c.id, c]));

  const formTransfer = $("formTransfer");
if(formTransfer){
  formTransfer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("msgTransfer");
    setMsg(msg, "Transferindo...", "ok");

    const from = $("trFrom")?.value;
    const to = $("trTo")?.value;
    const amount = parseMoneyBR($("trAmount")?.value);
    const date = $("trDate")?.value;

    if(!from || !to || from === to){
      setMsg(msg, "Escolha contas diferentes.", "err");
      return;
    }
    if(!Number.isFinite(amount) || amount <= 0){
      setMsg(msg, "Valor inválido.", "err");
      return;
    }

    try{
      const notes = ($("trNotes")?.value || "").trim();
      const descOut = `Transferência para ${accountMap.get(to)?.name || "conta"}`;
      const descIn  = `Transferência de ${accountMap.get(from)?.name || "conta"}`;

      const catOut = categories.find(c => c.type === "expense" && c.name === "Transferência")?.id || "";
      const catIn  = categories.find(c => c.type === "income"  && c.name === "Transferência")?.id || "";

      await createTransaction(currentUser.uid, {
        type: "expense",
        amount,
        date,
        description: descOut,
        accountId: from,
        categoryId: catOut,
        notes,
      });

      await createTransaction(currentUser.uid, {
        type: "income",
        amount,
        date,
        description: descIn,
        accountId: to,
        categoryId: catIn,
        notes,
      });

      setMsg(msg, "Transferência realizada ✅", "ok");
      formTransfer.reset();

      // mantém a data preenchida
      if($("trDate")) $("trDate").value = date;

      setTimeout(()=> closeModal("modalTransfer"), 350);
    }catch(err){
      console.error(err);
      setMsg(msg, err.message || "Falha ao transferir.", "err");
    }
  });
}


}


watchAuth({
  onIn: async (user) => {
    currentUser = user;
    $("userLabel").textContent = user.displayName || user.email;

    wireCloseButtons();
    wireSegmented();
    wireButtons();
    wireForms();

    // 1) Settings (meta mensal)
    if(unsubSettings) unsubSettings();
    unsubSettings = watchSettings(user.uid, {
      onChange: (data) => {
        settings = data || { monthlyBudget: 0 };
        const el = $("monthlyBudget");
        if(el){
          el.value = settings.monthlyBudget
            ? String(settings.monthlyBudget).replace(".", ",")
            : "";
        }
      },
      onError: console.error
    });

    // 2) Accounts realtime (para cards + selects)
    if(unsubAccounts) unsubAccounts();
    unsubAccounts = watchAccounts(user.uid, {
      onChange: (items) => {
        accounts = items;
        accountMap = new Map(accounts.map(a => [a.id, a]));

        const options = accounts.length
          ? accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")
          : `<option value="" disabled selected>Crie uma conta</option>`;

        // selects do lançamento
        const txAcc = $("txAccount");
        if(txAcc) txAcc.innerHTML = options;

        // selects da transferência (se existirem no HTML)
        const trFrom = $("trFrom");
        const trTo = $("trTo");
        if(trFrom) trFrom.innerHTML = options;
        if(trTo) trTo.innerHTML = options;

        computeAccountBalances();
      },
      onError: console.error
    });

    // 3) Watcher global (saldos por conta sempre corretos)
    if(unsubBalances) unsubBalances();
    unsubBalances = watchTransactionsAll(user.uid, {
      onChange: (items) => {
        allTxCache = items;
        computeAccountBalances();
      },
      onError: console.error
    });

    // 4) Categorias + seed automático
    await refreshCategories(user.uid);
    if(categories.length === 0){
      await seedDefaultCategories(user.uid);
      await refreshCategories(user.uid);
    }

    // 5) Atualizar select de categorias conforme txType
    await refreshSelects(user.uid);

    // 6) Estado inicial de visualização
    viewMode = "month";
    selectedMonth = new Date();

    document.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle("active", b.dataset.view === "month");
    });

    watchView(user.uid);
  },

  onOut: () => {
    if(unsubTx) unsubTx();
    if(unsubBalances) unsubBalances();
    if(unsubAccounts) unsubAccounts();
    if(unsubSettings) unsubSettings();
    window.location.href = "./index.html";
  },
});
