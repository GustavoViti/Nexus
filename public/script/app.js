import { watchAuth, logout } from "./auth.js";

import {
  createAccount,
  updateAccount,
  deleteAccount,
  createCategory,
  updateCategory,
  deleteCategory,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listAccounts,
  listCategories,
  watchTransactionsMonth,
  watchTransactionsAll,
  watchAccounts,
  watchSettings,
  setMonthlyBudget,
  setCategoryLimits
} from "./db.js";

import { seedDefaultCategories } from "./seed.js";

const $ = (id) => document.getElementById(id);

let chartCategory = null;
let chartBalance  = null;

let unsubBalances = null;
let unsubAccounts = null;
let unsubSettings = null;

let allTxCache = [];
let currentTxList = [];
let settings = { monthlyBudget: 0 };

let catLimits = {};

let editingTxId       = null;
let editingAccountId  = null;

let viewMode      = "month";
let selectedMonth = new Date();

let currentUser = null;
let txType  = "expense";
let catType = "expense";
let unsubTx = null;
let catChartType = "expense";

let accounts    = [];
let categories  = [];
let accountMap  = new Map();
let categoryMap = new Map();

// ─── Modal helpers ───────────────────────────────────
function openModal(id)  { $(id).classList.add("show");    $(id).setAttribute("aria-hidden","false"); }
function closeModal(id) { $(id).classList.remove("show"); $(id).setAttribute("aria-hidden","true");  }
function setMsg(el, text, type="") { el.className = "msg" + (type ? ` ${type}` : ""); el.textContent = text || ""; }

// ─── Formatting ──────────────────────────────────────
function formatBRL(n){
  return (Number(n) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function formatDateBR(yyyyMmDd){
  if(!yyyyMmDd || typeof yyyyMmDd !== "string") return "";
  const [y,m,d] = yyyyMmDd.split("-");
  return (d && m && y) ? `${d}/${m}/${y}` : yyyyMmDd;
}

function parseMoneyBR(value){
  const v = String(value || "").trim().replace(/\./g,"").replace(",",".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function getMonthRange(date = new Date()){
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1);
  const end   = new Date(y, m + 1, 0);
  const toStr = (dt) => {
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth()+1).padStart(2,"0");
    const dd   = String(dt.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  };
  return { startDate: toStr(start), endDate: toStr(end) };
}

function monthLabel(dt){
  const m = dt.toLocaleString("pt-BR", { month: "long" });
  const y = dt.getFullYear();
  return `${m[0].toUpperCase() + m.slice(1)} ${y}`;
}

function monthShort(dt){
  return dt.toLocaleString("pt-BR", { month: "short" }).replace(".","") + " " + String(dt.getFullYear()).slice(2);
}

function addMonths(dateStr, n){
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt     = new Date(y, m - 1 + n, 1);
  const maxDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const day    = Math.min(d, maxDay);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// ─── Data loading ─────────────────────────────────────
async function loadLookups(uid){
  [accounts, categories] = await Promise.all([listAccounts(uid), listCategories(uid)]);
  accountMap  = new Map(accounts.map(a => [a.id, a]));
  categoryMap = new Map(categories.map(c => [c.id, c]));
}

async function refreshCategories(uid){
  categories  = await listCategories(uid);
  categoryMap = new Map(categories.map(c => [c.id, c]));

  const formTransfer = $("formTransfer");
  if(formTransfer && !formTransfer.dataset.wired){
    formTransfer.dataset.wired = "1";
    formTransfer.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg    = $("msgTransfer");
      setMsg(msg, "Transferindo...", "ok");

      const from   = $("trFrom")?.value;
      const to     = $("trTo")?.value;
      const amount = parseMoneyBR($("trAmount")?.value);
      const date   = $("trDate")?.value;

      if(!from || !to || from === to){ setMsg(msg, "Escolha contas diferentes.", "err"); return; }
      if(!Number.isFinite(amount) || amount <= 0){ setMsg(msg, "Valor inválido.", "err"); return; }

      try{
        const notes  = ($("trNotes")?.value || "").trim();
        const descOut = `Transferência para ${accountMap.get(to)?.name  || "conta"}`;
        const descIn  = `Transferência de ${accountMap.get(from)?.name || "conta"}`;

        let catOutObj = categories.find(c => c.type === "expense" && c.name === "Transferência");
        let catInObj  = categories.find(c => c.type === "income"  && c.name === "Transferência");
        if(!catOutObj){
          const ref = await createCategory(currentUser.uid, { name: "Transferência", type: "expense" });
          catOutObj = { id: ref.id };
          await refreshCategories(currentUser.uid);
        }
        if(!catInObj){
          const ref = await createCategory(currentUser.uid, { name: "Transferência", type: "income" });
          catInObj  = { id: ref.id };
          await refreshCategories(currentUser.uid);
        }
        const catOut = catOutObj.id;
        const catIn  = catInObj.id;

        await createTransaction(currentUser.uid, { type:"expense", amount, date, description:descOut, accountId:from, categoryId:catOut, notes });
        await createTransaction(currentUser.uid, { type:"income",  amount, date, description:descIn,  accountId:to,   categoryId:catIn,  notes });

        setMsg(msg, "Transferência realizada ✅", "ok");
        formTransfer.reset();
        if($("trDate")) $("trDate").value = date;
        setTimeout(() => closeModal("modalTransfer"), 350);
      }catch(err){
        console.error(err);
        setMsg(msg, err.message || "Falha ao transferir.", "err");
      }
    });
  }
}

async function refreshSelects(uid){
  await refreshCategories(uid);
  const selCat   = $("txCategory");
  const filtered = categories.filter(c => c.type === txType);
  selCat.innerHTML = filtered.length
    ? filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
    : `<option value="" disabled selected>Crie uma categoria (${txType === "expense" ? "saída" : "entrada"})</option>`;
}

// ─── Search / filter ──────────────────────────────────
function normalizeStr(str){
  return String(str || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function filterTx(items){
  const q = normalizeStr($("txSearch")?.value || "").trim();
  if(!q) return items;
  return items.filter(tx => {
    const desc  = normalizeStr(tx.description);
    const notes = normalizeStr(tx.notes);
    const cat   = normalizeStr(categoryMap.get(tx.categoryId)?.name);
    const acc   = normalizeStr(accountMap.get(tx.accountId)?.name);
    return desc.includes(q) || notes.includes(q) || cat.includes(q) || acc.includes(q);
  });
}

// ─── Dashboard ───────────────────────────────────────
function computeDashboard(items){
  let income = 0, expense = 0;
  for(const tx of items){
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income") income += amt; else expense += amt;
  }

  const balance = income - expense;
  $("sumIncome").textContent  = formatBRL(income);
  $("sumExpense").textContent = formatBRL(expense);

  // Monthly net in hero footer
  const heroMonthly = $("heroMonthly");
  if(heroMonthly){
    const sign  = balance >= 0 ? "+" : "";
    const cls   = balance >= 0 ? "pos" : "neg";
    const label = viewMode === "history" ? "Histórico" : "Mês";
    heroMonthly.innerHTML = `${label}: <span class="${cls}">${sign}${formatBRL(balance)}</span>`;
  }

  // Health badge
  const rate = income > 0 ? (balance / income) : 0;
  let cls  = rate >= 0.20 ? "ok" : rate < 0 ? "bad" : "warn";
  let text = `Saúde: ${(rate * 100).toFixed(0)}%`;
  $("healthHint").innerHTML = `<span class="badge ${cls}">● ${escapeHtml(text)}</span>`;

  // Budget
  const budget = Number(settings?.monthlyBudget || 0);
  const box    = $("budgetBox");
  if(!box) return;

  if(budget > 0){
    box.style.display = "block";
    $("budgetLabel").textContent   = `Meta: ${formatBRL(budget)}`;
    const pct = Math.min(100, Math.round((expense / budget) * 100));
    $("budgetFill").style.width    = `${isFinite(pct) ? pct : 0}%`;
    $("budgetSpent").textContent   = `Gasto: ${formatBRL(expense)}`;
    $("budgetRemaining").textContent = `Restante: ${formatBRL(budget - expense)}`;
    $("budgetFill").style.background = expense > budget
      ? "linear-gradient(90deg, #EF4444, #B91C1C)"
      : "linear-gradient(90deg, var(--accent), var(--accent2))";
  } else {
    box.style.display = "none";
  }

  renderComparison(items);
  renderInsights(items);
}

// ─── Month comparison badges ──────────────────────────
function renderComparison(items){
  const cmpIncome  = $("cmpIncome");
  const cmpExpense = $("cmpExpense");
  if(!cmpIncome || !cmpExpense) return;

  if(viewMode === "history"){
    cmpIncome.innerHTML  = "";
    cmpExpense.innerHTML = "";
    return;
  }

  const pm = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
  const { startDate: pmStart, endDate: pmEnd } = getMonthRange(pm);
  let prevIncome = 0, prevExpense = 0;
  for(const tx of allTxCache){
    if(tx.date < pmStart || tx.date > pmEnd) continue;
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income") prevIncome += amt; else prevExpense += amt;
  }

  let curIncome = 0, curExpense = 0;
  for(const tx of items){
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income") curIncome += amt; else curExpense += amt;
  }

  const badge = (cur, prev, higherIsGood) => {
    if(prev === 0) return "";
    const pct  = ((cur - prev) / prev) * 100;
    const sign = pct >= 0 ? "+" : "";
    const cls  = (pct >= 0) === higherIsGood ? "pos" : "neg";
    return `<span class="${cls}">${sign}${pct.toFixed(0)}% vs mês ant.</span>`;
  };

  cmpIncome.innerHTML  = badge(curIncome, prevIncome, true);
  cmpExpense.innerHTML = badge(curExpense, prevExpense, false);
}

// ─── Insights panel ───────────────────────────────────
function renderInsights(items){
  const section = $("insightsSection");
  if(!section) return;

  const expenses = items.filter(tx => tx.type === "expense");
  if(!expenses.length){ section.style.display = "none"; return; }

  const chips = [];

  // Category limit alerts
  const spentById = {};
  for(const tx of expenses){
    spentById[tx.categoryId] = (spentById[tx.categoryId] || 0) + (Number(tx.amount) || 0);
  }
  for(const [catId, limit] of Object.entries(catLimits)){
    if(!(limit > 0)) continue;
    const cat      = categoryMap.get(catId);
    if(!cat) continue;
    const spentAmt = spentById[catId] || 0;
    const pct      = spentAmt / limit;
    if(pct >= 0.8){
      const over  = spentAmt >= limit;
      chips.push({
        label: over ? "Limite ultrapassado" : "Limite quase atingido",
        value: `${escapeHtml(cat.name)} · ${formatBRL(spentAmt)} / ${formatBRL(limit)}`,
        cls: over ? "neg" : "warn"
      });
    }
  }

  // Biggest single expense
  const biggest = expenses.reduce((a, b) => Number(a.amount) >= Number(b.amount) ? a : b);
  chips.push({
    label: "Maior gasto",
    value: `${escapeHtml(biggest.description || "—")} · ${formatBRL(biggest.amount)}`,
    cls: "neg"
  });

  // Top spending category
  const byCat = {};
  for(const tx of expenses){
    const name = categoryMap.get(tx.categoryId)?.name || "Outros";
    byCat[name] = (byCat[name] || 0) + (Number(tx.amount) || 0);
  }
  const [topName, topAmt] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0] || [];
  if(topName) chips.push({
    label: "Categoria líder",
    value: `${escapeHtml(topName)} · ${formatBRL(topAmt)}`,
    cls: "neg"
  });

  // Savings rate
  let income = 0, expense = 0;
  for(const tx of items){
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income") income += amt; else expense += amt;
  }
  if(income > 0){
    const rate = ((income - expense) / income) * 100;
    const cls  = rate >= 20 ? "pos" : rate < 0 ? "neg" : "warn";
    chips.push({ label: "Taxa de economia", value: `${rate.toFixed(0)}% da renda`, cls });
  }

  // Net vs prev month
  if(viewMode !== "history"){
    const pm = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    const { startDate: pmStart, endDate: pmEnd } = getMonthRange(pm);
    let prevInc = 0, prevExp = 0;
    for(const tx of allTxCache){
      if(tx.date < pmStart || tx.date > pmEnd) continue;
      const amt = Number(tx.amount) || 0;
      if(tx.type === "income") prevInc += amt; else prevExp += amt;
    }
    const prevNet = prevInc - prevExp;
    const curNet  = income  - expense;
    if(prevNet !== 0){
      const diff = curNet - prevNet;
      const sign = diff >= 0 ? "+" : "";
      const cls  = diff >= 0 ? "pos" : "neg";
      chips.push({ label: "vs mês anterior", value: `${sign}${formatBRL(diff)} no saldo`, cls });
    }
  }

  section.style.display = "block";
  section.innerHTML = `
    <div class="insights__scroll">
      ${chips.map(c => `
        <div class="insight__chip">
          <div class="insight__chip__label">${c.label}</div>
          <div class="insight__chip__value ${c.cls}">${c.value}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Account balances + patrimônio total ──────────────
function computeAccountBalances(){
  const balances = new Map();
  for(const a of accounts) balances.set(a.id, Number(a.initialBalance) || 0);

  for(const tx of allTxCache){
    if(!tx.accountId) continue;
    const cur = balances.get(tx.accountId) ?? 0;
    const amt = Number(tx.amount) || 0;
    if(tx.type === "income")  balances.set(tx.accountId, cur + amt);
    else if(tx.type === "expense") balances.set(tx.accountId, cur - amt);
  }

  // Patrimônio total no hero
  const total    = Array.from(balances.values()).reduce((s, v) => s + v, 0);
  const heroEl   = $("heroPatrimonial");
  if(heroEl) heroEl.textContent = formatBRL(total);

  renderAccounts(balances);
}

// ─── Render accounts ─────────────────────────────────
function renderAccounts(balances){
  const grid = $("accountsGrid");
  if(!grid) return;

  if(!accounts.length){
    grid.innerHTML = `<div class="muted">Crie uma conta para começar.</div>`;
    return;
  }

  grid.innerHTML = accounts.map(a => {
    const bal = balances.get(a.id) ?? (Number(a.initialBalance) || 0);
    const isPos = bal >= 0;
    return `
      <div class="acc" data-acc-id="${a.id}" style="cursor:pointer;" title="Clique para editar">
        <div class="acc__top">
          <div>
            <div class="acc__name">${escapeHtml(a.name)}</div>
            <div class="acc__type">${escapeHtml(a.type || "")}</div>
          </div>
        </div>
        <div class="acc__bal ${isPos ? "pos" : "neg"}">${formatBRL(bal)}</div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".acc").forEach(el => {
    el.addEventListener("click", () => {
      const acc = accounts.find(a => a.id === el.dataset.accId);
      if(acc) openEditAccountModal(acc);
    });
  });
}

// ─── Edit account modal ───────────────────────────────
function openEditAccountModal(acc){
  editingAccountId = acc.id;
  $("editAccName").value = acc.name || "";
  $("editAccType").value = acc.type || "bank";
  setMsg($("msgEditAccount"), "");
  openModal("modalEditAccount");
}

// ─── Render transactions ──────────────────────────────
function renderTransactions(items){
  const list  = $("txList");
  const empty = $("emptyState");

  if(!items.length){
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  list.innerHTML = items.map(tx => {
    const cat       = categoryMap.get(tx.categoryId);
    const acc       = accountMap.get(tx.accountId);
    const signClass = tx.type === "income" ? "pos" : "neg";
    const prefix    = tx.type === "income" ? "+" : "-";

    const metaParts = [
      formatDateBR(tx.date),
      cat?.name ? `• ${cat.name}` : "",
      acc?.name ? `• ${acc.name}` : "",
    ].filter(Boolean).join(" ");

    const notesHtml = tx.notes
      ? `<div class="tx__notes">${escapeHtml(tx.notes)}</div>`
      : "";

    return `
      <div class="tx" data-id="${tx.id}">
        <div class="tx__left">
          <div class="tx__title">${escapeHtml(tx.description || "Sem descrição")}</div>
          <div class="tx__meta">${escapeHtml(metaParts)}</div>
          ${notesHtml}
        </div>
        <div class="tx__value ${signClass}">${prefix} ${formatBRL(tx.amount)}</div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".tx").forEach(el => {
    el.addEventListener("click", async () => {
      const tx = items.find(t => t.id === el.dataset.id);
      if(tx) await openEditModal(tx);
    });
  });
}

// ─── Render charts ────────────────────────────────────
function renderCharts(items){
  const ctxCat = document.getElementById("chartCategory");
  const ctxBal = document.getElementById("chartBalance");
  if(!ctxCat || !ctxBal) return;

  if(chartCategory) chartCategory.destroy();
  if(chartBalance)  chartBalance.destroy();

  // ── Doughnut: category distribution (expense or income, per catChartType) ──
  const byCategory = {};
  for(const tx of items){
    if(tx.type !== catChartType) continue;
    const cat = categoryMap.get(tx.categoryId)?.name || "Outros";
    byCategory[cat] = (byCategory[cat] || 0) + (Number(tx.amount) || 0);
  }

  const PALETTE = [
    "#6366F1","#8B5CF6","#EC4899","#F59E0B",
    "#10B981","#06B6D4","#F97316","#84CC16",
    "#EF4444","#3B82F6","#E879F9","#14B8A6",
  ];
  const labels   = Object.keys(byCategory);
  const bgColors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  chartCategory = new Chart(ctxCat, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: Object.values(byCategory),
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: "rgba(8,11,18,.9)",
        hoverOffset: 6,
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      }
    }
  });

  const legendEl = document.getElementById("chartCategoryLegend");
  if(legendEl){
    legendEl.innerHTML = labels.length
      ? labels.map((label, i) =>
          `<div class="chart-legend-item">
            <span class="chart-legend-dot" style="background:${bgColors[i]}"></span>
            <span class="chart-legend-label" title="${label}">${label}</span>
          </div>`
        ).join("")
      : "";
  }

  // ── Line: monthly evolution (last 6 months from allTxCache) ──
  const now      = new Date();
  const months6  = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d;
  });

  const monthData = months6.map(d => {
    const { startDate, endDate } = getMonthRange(d);
    let inc = 0, exp = 0;
    for(const tx of allTxCache){
      if(tx.date < startDate || tx.date > endDate) continue;
      const amt = Number(tx.amount) || 0;
      if(tx.type === "income")  inc += amt;
      else                      exp += amt;
    }
    return { label: monthShort(d), inc, exp };
  });

  chartBalance = new Chart(ctxBal, {
    type: "bar",
    data: {
      labels: monthData.map(m => m.label),
      datasets: [
        {
          label: "Entradas",
          data: monthData.map(m => m.inc),
          backgroundColor: "#22C55E",
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: "Saídas",
          data: monthData.map(m => m.exp),
          backgroundColor: "#EF4444",
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#8B95B0", boxWidth: 10, boxHeight: 10, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatBRL(ctx.parsed.y)}`,
            afterBody: ctx => {
              const i = ctx[0].dataIndex;
              const { inc, exp } = monthData[i];
              return `Saldo: ${formatBRL(inc - exp)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: { color: "#8B95B0", callback: v => formatBRL(v) },
          grid:  { color: "rgba(30,38,64,.5)" },
        },
        x: {
          ticks: { color: "#8B95B0" },
          grid:  { display: false },
        }
      }
    }
  });
}

// ─── Category limits modal ────────────────────────────
function renderCategoryLimits(){
  const el = $("catLimitsList");
  if(!el) return;

  const expCats = categories.filter(c => c.type === "expense");
  if(!expCats.length){
    el.innerHTML = `<div class="muted" style="padding:16px">Nenhuma categoria de saída.</div>`;
    return;
  }

  const spent = {};
  for(const tx of currentTxList){
    if(tx.type !== "expense") continue;
    spent[tx.categoryId] = (spent[tx.categoryId] || 0) + (Number(tx.amount) || 0);
  }

  el.innerHTML = expCats.map(c => {
    const s     = spent[c.id] || 0;
    const limit = catLimits[c.id] || 0;
    const pct   = limit > 0 ? Math.min(100, (s / limit) * 100) : 0;
    const barColor = pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#6366F1";
    return `
      <div class="catlimit__item">
        <div class="catlimit__top">
          <div class="catlimit__name">${escapeHtml(c.name)}</div>
          <div class="catlimit__spent">${formatBRL(s)}${limit > 0 ? " / " + formatBRL(limit) : ""}</div>
        </div>
        ${limit > 0 ? `<div class="catlimit__bar-wrap"><div class="catlimit__bar" style="width:${pct}%;background:${barColor}"></div></div>` : ""}
        <input class="catlimit__input" type="text" inputmode="decimal"
               data-cat-id="${c.id}"
               value="${limit ? String(limit).replace(".", ",") : ""}"
               placeholder="Limite mensal (ex: 500,00)" />
      </div>
    `;
  }).join("");
}

// ─── Export CSV ───────────────────────────────────────
function exportCSV(){
  const list = viewMode === "history" ? allTxCache : currentTxList;
  const BOM  = "﻿";
  const header = ["Data","Tipo","Descrição","Valor","Conta","Categoria","Observação"].join(";");
  const rows = list.map(tx => [
    tx.date || "",
    tx.type === "income" ? "Entrada" : "Saída",
    `"${(tx.description || "").replace(/"/g, '""')}"`,
    String(Number(tx.amount) || 0).replace(".", ","),
    `"${(accountMap.get(tx.accountId)?.name  || "").replace(/"/g, '""')}"`,
    `"${(categoryMap.get(tx.categoryId)?.name || "").replace(/"/g, '""')}"`,
    `"${(tx.notes || "").replace(/"/g, '""')}"`,
  ].join(";"));

  const csv  = BOM + header + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `nexus-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Render category list ─────────────────────────────
async function renderCatList(){
  const el = $("catList");
  if(!el) return;

  if(!categories.length){
    el.innerHTML = `<div class="muted" style="padding:16px">Nenhuma categoria.</div>`;
    return;
  }

  const expCats = categories.filter(c => c.type === "expense");
  const incCats = categories.filter(c => c.type === "income");

  const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

  const renderGroup = (title, cats) => {
    if(!cats.length) return "";
    return `
      <div class="catgroup__title">${title}</div>
      ${cats.map(c => `
        <div class="catitem">
          <span class="catitem__name">${escapeHtml(c.name)}</span>
          <button class="catitem__del" data-del-cat="${c.id}" aria-label="Excluir ${escapeHtml(c.name)}">${trashIcon}</button>
        </div>
      `).join("")}
    `;
  };

  el.innerHTML = renderGroup("Saídas", expCats) + renderGroup("Entradas", incCats);

  el.querySelectorAll("[data-del-cat]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id   = btn.dataset.delCat;
      const name = btn.closest(".catitem")?.querySelector(".catitem__name")?.textContent || "esta categoria";
      if(!confirm(`Excluir "${name}"?`)) return;
      try{
        await deleteCategory(currentUser.uid, id);
        await refreshCategories(currentUser.uid);
        await renderCatList();
      }catch(e){
        console.error(e);
        alert(e.message || "Falha ao excluir.");
      }
    });
  });
}

// ─── Edit transaction modal ───────────────────────────
async function openEditModal(tx){
  editingTxId = tx.id;
  txType = tx.type;

  document.querySelectorAll("#modalTx .seg").forEach(b => {
    b.classList.toggle("active", b.dataset.type === txType);
  });

  if(currentUser) await refreshSelects(currentUser.uid);

  openModal("modalTx");

  $("txAmount").value   = String(tx.amount).replace(".", ",");
  $("txDate").value     = tx.date;
  $("txDesc").value     = tx.description || "";
  $("txAccount").value  = tx.accountId;
  $("txCategory").value = tx.categoryId;
  $("txNotes").value    = tx.notes || "";

  $("btnSaveTx").textContent = "Salvar alterações";
  const del = $("btnDeleteTx");
  if(del) del.style.display = "block";
}

// ─── View watcher ─────────────────────────────────────
function watchView(uid){
  if(unsubTx) unsubTx();

  const srch = $("txSearch");
  if(srch) srch.value = "";

  $("monthNav").style.display = (viewMode === "month") ? "flex" : "none";

  if(viewMode === "history"){
    $("monthLabel").textContent = "Histórico";
    unsubTx = watchTransactionsAll(uid, {
      onChange: (items) => {
        currentTxList = items;
        computeDashboard(items);
        renderTransactions(filterTx(items));
        renderCharts(items);
        $("listHint").textContent = `Histórico • ${items.length} item(ns)`;
      },
      onError: (err) => {
        console.error(err);
        $("listHint").textContent = "Erro ao carregar histórico.";
      }
    });
    return;
  }

  $("monthLabel").textContent = monthLabel(selectedMonth);
  const { startDate, endDate } = getMonthRange(selectedMonth);
  unsubTx = watchTransactionsMonth(uid, {
    startDate, endDate,
    onChange: (items) => {
      currentTxList = items;
      computeDashboard(items);
      renderTransactions(filterTx(items));
      renderCharts(items);
      $("listHint").textContent = `Mês • ${items.length} item(ns)`;
    },
    onError: (err) => {
      console.error(err);
      $("listHint").textContent = "Erro ao carregar mês.";
    }
  });
}

// ─── Default date ─────────────────────────────────────
function setDefaultDate(){
  const d    = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth()+1).padStart(2,"0");
  const dd   = String(d.getDate()).padStart(2,"0");
  $("txDate").value = `${yyyy}-${mm}-${dd}`;
}

// ─── Wire: close buttons ──────────────────────────────
function wireCloseButtons(){
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", (e) => { if(e.target === m) closeModal(m.id); });
  });
}

// ─── Wire: segmented controls ─────────────────────────
function wireSegmented(){
  document.querySelectorAll("#modalTx .seg").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#modalTx .seg").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      txType = btn.dataset.type;
      if(currentUser) await refreshSelects(currentUser.uid);
    });
  });

  document.querySelectorAll("#modalCategory [data-cat-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modalCategory [data-cat-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      catType = btn.dataset.catType;
    });
  });

  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      viewMode = btn.dataset.view;
      watchView(currentUser.uid);
    });
  });

  document.querySelectorAll("[data-cat-chart]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cat-chart]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      catChartType = btn.dataset.catChart;
      renderCharts(currentTxList);
    });
  });
}

// ─── Wire: action buttons ─────────────────────────────
function wireButtons(){
  $("btnNewTx").addEventListener("click", async () => {
    // reset edit state
    editingTxId = null;
    $("btnSaveTx").textContent = "Salvar";
    const del = $("btnDeleteTx");
    if(del) del.style.display = "none";
    openModal("modalTx");
    setDefaultDate();
    if(currentUser) await refreshSelects(currentUser.uid);
  });

  $("btnNewAccount").addEventListener("click",  () => openModal("modalAccount"));
  $("btnNewCategory").addEventListener("click", () => openModal("modalCategory"));
  $("btnOpenSettings").addEventListener("click",() => openModal("modalSettings"));

  $("btnLogout").addEventListener("click", async () => {
    await logout();
    window.location.href = "./index.html";
  });

  $("btnSeed").addEventListener("click", async () => {
    const msg = $("msgSettings");
    setMsg(msg, "Criando...", "ok");
    try{
      await seedDefaultCategories(currentUser.uid);
      await refreshSelects(currentUser.uid);
      setMsg(msg, "Categorias criadas ✅", "ok");
    }catch(e){
      setMsg(msg, e.message || "Falha.", "err");
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

  const btnSaveBudget = $("btnSaveBudget");
  if(btnSaveBudget){
    btnSaveBudget.addEventListener("click", async () => {
      const msg = $("msgSettings");
      const val = parseMoneyBR($("monthlyBudget")?.value || "0");
      if(!Number.isFinite(val) || val < 0){ if(msg) setMsg(msg, "Meta inválida.", "err"); return; }
      try{
        await setMonthlyBudget(currentUser.uid, val);
        if(msg) setMsg(msg, "Meta salva ✅", "ok");
      }catch(e){
        if(msg) setMsg(msg, e.message || "Falha.", "err");
      }
    });
  }

  const btnTransfer = $("btnTransfer");
  if(btnTransfer){
    btnTransfer.addEventListener("click", () => {
      openModal("modalTransfer");
      const d  = new Date();
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      const trDate = $("trDate");
      if(trDate) trDate.value = `${d.getFullYear()}-${mm}-${dd}`;
    });
  }

  const btnDeleteTx = $("btnDeleteTx");
  if(btnDeleteTx){
    btnDeleteTx.addEventListener("click", async () => {
      if(!editingTxId) return;
      if(!confirm("Excluir esta transação?")) return;
      try{
        await deleteTransaction(currentUser.uid, editingTxId);
        editingTxId = null;
        $("btnSaveTx").textContent = "Salvar";
        btnDeleteTx.style.display = "none";
        closeModal("modalTx");
      }catch(e){
        alert(e.message || "Falha ao excluir.");
      }
    });
  }

  // ── Edit account ──
  const formEditAccount = $("formEditAccount");
  if(formEditAccount){
    formEditAccount.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("msgEditAccount");
      setMsg(msg, "Salvando...", "ok");
      try{
        await updateAccount(currentUser.uid, editingAccountId, {
          name: $("editAccName").value.trim(),
          type: $("editAccType").value,
        });
        setMsg(msg, "Conta atualizada ✅", "ok");
        setTimeout(() => closeModal("modalEditAccount"), 350);
      }catch(err){
        setMsg(msg, err.message || "Falha.", "err");
      }
    });
  }

  const btnDeleteAccount = $("btnDeleteAccount");
  if(btnDeleteAccount){
    btnDeleteAccount.addEventListener("click", async () => {
      if(!editingAccountId) return;
      const acc  = accounts.find(a => a.id === editingAccountId);
      const name = acc?.name || "esta conta";
      if(!confirm(`Excluir "${name}"? As transações vinculadas não serão removidas.`)) return;
      try{
        await deleteAccount(currentUser.uid, editingAccountId);
        editingAccountId = null;
        closeModal("modalEditAccount");
      }catch(e){
        alert(e.message || "Falha ao excluir conta.");
      }
    });
  }

  // ── Manage categories ──
  const btnManageCategories = $("btnManageCategories");
  if(btnManageCategories){
    btnManageCategories.addEventListener("click", async () => {
      closeModal("modalSettings");
      await refreshCategories(currentUser.uid);
      await renderCatList();
      openModal("modalManageCategories");
    });
  }

  // ── Export CSV ──
  const btnExportCSV = $("btnExportCSV");
  if(btnExportCSV) btnExportCSV.addEventListener("click", () => exportCSV());

  // ── Category limits ──
  const btnCategoryLimits = $("btnCategoryLimits");
  if(btnCategoryLimits){
    btnCategoryLimits.addEventListener("click", () => {
      closeModal("modalSettings");
      renderCategoryLimits();
      openModal("modalCategoryLimits");
    });
  }

  const btnSaveCatLimits = $("btnSaveCatLimits");
  if(btnSaveCatLimits){
    btnSaveCatLimits.addEventListener("click", async () => {
      const msg    = $("msgCatLimits");
      const inputs = document.querySelectorAll("#catLimitsList .catlimit__input");
      const limits = {};
      for(const inp of inputs){
        const catId = inp.dataset.catId;
        const val   = parseMoneyBR(inp.value || "0");
        if(catId && Number.isFinite(val) && val > 0) limits[catId] = val;
      }
      setMsg(msg, "Salvando...", "ok");
      try{
        await setCategoryLimits(currentUser.uid, limits);
        catLimits = limits;
        setMsg(msg, "Limites salvos ✅", "ok");
        setTimeout(() => closeModal("modalCategoryLimits"), 600);
      }catch(e){
        setMsg(msg, e.message || "Falha.", "err");
      }
    });
  }

  // ── Parcelamento toggle ──
  const txInstallment = $("txInstallment");
  if(txInstallment){
    txInstallment.addEventListener("change", () => {
      const countInput = $("txInstallmentCount");
      if(countInput) countInput.style.display = txInstallment.checked ? "block" : "none";
    });
  }

  // ── Search ──
  const txSearch = $("txSearch");
  if(txSearch){
    txSearch.addEventListener("input", () => {
      renderTransactions(filterTx(currentTxList));
    });
  }

  // ── Bottom nav ──
  const navNewTx = $("navNewTx");
  if(navNewTx){
    navNewTx.addEventListener("click", async () => {
      editingTxId = null;
      $("btnSaveTx").textContent = "Salvar";
      const del = $("btnDeleteTx");
      if(del) del.style.display = "none";
      openModal("modalTx");
      setDefaultDate();
      if(currentUser) await refreshSelects(currentUser.uid);
    });
  }

  const navTransfer = $("navTransfer");
  if(navTransfer) navTransfer.addEventListener("click", () => { const btn = $("btnTransfer"); if(btn) btn.click(); });

  const navMore = $("navMore");
  if(navMore) navMore.addEventListener("click", () => openModal("modalSettings"));

  const navScrollTop = $("navScrollTop");
  if(navScrollTop) navScrollTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  const navScrollCharts = $("navScrollCharts");
  if(navScrollCharts) navScrollCharts.addEventListener("click", () => {
    document.querySelector(".charts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const btnLogoutMobile = $("btnLogoutMobile");
  if(btnLogoutMobile){
    btnLogoutMobile.addEventListener("click", async () => {
      await logout();
      window.location.href = "./index.html";
    });
  }
}

// ─── Wire: money inputs ───────────────────────────────
function wireMoneyInputs(){
  const sanitize = (e) => {
    e.target.value = e.target.value.replace(/[^0-9,.]/g, "");
  };
  ["txAmount", "trAmount", "accInitial", "monthlyBudget"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", sanitize);
  });
}

// ─── Wire: forms ──────────────────────────────────────
function wireForms(){
  $("formAccount").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("msgAccount");
    setMsg(msg, "Salvando...", "ok");
    try{
      await createAccount(currentUser.uid, {
        name:           $("accName").value.trim(),
        type:           $("accType").value,
        initialBalance: parseMoneyBR($("accInitial").value || "0"),
      });
      await refreshSelects(currentUser.uid);
      setMsg(msg, "Conta criada ✅", "ok");
      e.target.reset();
      setTimeout(() => closeModal("modalAccount"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha.", "err");
    }
  });

  $("formCategory").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("msgCategory");
    setMsg(msg, "Salvando...", "ok");
    try{
      await createCategory(currentUser.uid, { name: $("catName").value.trim(), type: catType });
      await refreshSelects(currentUser.uid);
      setMsg(msg, "Categoria criada ✅", "ok");
      e.target.reset();
      setTimeout(() => closeModal("modalCategory"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha.", "err");
    }
  });

  $("formTx").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("msgTx");
    setMsg(msg, "Salvando...", "ok");

    const amount = parseMoneyBR($("txAmount").value);
    if(!Number.isFinite(amount) || amount <= 0){ setMsg(msg, "Valor inválido.", "err"); return; }

    const acc = $("txAccount").value;
    const cat = $("txCategory").value;
    if(!acc || !cat){ setMsg(msg, "Crie uma conta e categoria antes.", "err"); return; }

    try{
      const installmentCheck = $("txInstallment");
      const isInstallment    = !editingTxId && (installmentCheck?.checked === true);
      const installmentCount = isInstallment
        ? Math.max(2, Math.min(60, parseInt($("txInstallmentCount")?.value || "2")))
        : 1;

      const basePayload = {
        type:        txType,
        amount,
        date:        $("txDate").value,
        description: $("txDesc").value.trim(),
        accountId:   acc,
        categoryId:  cat,
        notes:       $("txNotes").value.trim(),
      };

      if(editingTxId){
        await updateTransaction(currentUser.uid, editingTxId, basePayload);
        setMsg(msg, "Alterado ✅", "ok");
      }else if(isInstallment){
        const baseDesc = basePayload.description;
        for(let i = 0; i < installmentCount; i++){
          await createTransaction(currentUser.uid, {
            ...basePayload,
            date:        addMonths(basePayload.date, i),
            description: `${baseDesc} (${i + 1}/${installmentCount})`,
          });
        }
        setMsg(msg, `${installmentCount} parcelas criadas ✅`, "ok");
      }else{
        await createTransaction(currentUser.uid, basePayload);
        setMsg(msg, "Lançamento salvo ✅", "ok");
      }

      editingTxId = null;
      $("btnSaveTx").textContent = "Salvar";
      const del = $("btnDeleteTx");
      if(del) del.style.display = "none";
      if(installmentCheck) installmentCheck.checked = false;
      if($("txInstallmentCount")) $("txInstallmentCount").style.display = "none";

      e.target.reset();
      setDefaultDate();
      setTimeout(() => closeModal("modalTx"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha.", "err");
    }
  });
}

// ─── Auth watcher ─────────────────────────────────────
watchAuth({
  onIn: async (user) => {
    currentUser = user;
    $("userLabel").textContent = user.displayName || user.email;

    wireCloseButtons();
    wireSegmented();
    wireButtons();
    wireForms();
    wireMoneyInputs();

    if(unsubSettings) unsubSettings();
    unsubSettings = watchSettings(user.uid, {
      onChange: (data) => {
        settings  = data || { monthlyBudget: 0 };
        catLimits = settings.categoryLimits || {};
        const el  = $("monthlyBudget");
        const bv  = Number(settings.monthlyBudget);
        if(el) el.value = (Number.isFinite(bv) && bv > 0) ? String(bv).replace(".", ",") : "";
      },
      onError: console.error
    });

    if(unsubAccounts) unsubAccounts();
    unsubAccounts = watchAccounts(user.uid, {
      onChange: (items) => {
        accounts   = items;
        accountMap = new Map(accounts.map(a => [a.id, a]));

        const options = accounts.length
          ? accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")
          : `<option value="" disabled selected>Crie uma conta</option>`;

        const txAcc = $("txAccount");
        if(txAcc) txAcc.innerHTML = options;

        const trFrom = $("trFrom"), trTo = $("trTo");
        if(trFrom) trFrom.innerHTML = options;
        if(trTo)   trTo.innerHTML   = options;

        computeAccountBalances();
      },
      onError: console.error
    });

    if(unsubBalances) unsubBalances();
    unsubBalances = watchTransactionsAll(user.uid, {
      onChange: (items) => {
        allTxCache = items;
        computeAccountBalances();
      },
      onError: console.error
    });

    await refreshCategories(user.uid);
    if(categories.length === 0){
      await seedDefaultCategories(user.uid);
      await refreshCategories(user.uid);
    }

    await refreshSelects(user.uid);

    viewMode      = "month";
    selectedMonth = new Date();

    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("active", b.dataset.view === "month");
    });

    watchView(user.uid);
  },

  onOut: () => {
    if(unsubTx)       unsubTx();
    if(unsubBalances) unsubBalances();
    if(unsubAccounts) unsubAccounts();
    if(unsubSettings) unsubSettings();
    window.location.href = "./index.html";
  },
});
