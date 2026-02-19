import { watchAuth, logout } from "./auth.js";
import {
  createAccount, createCategory, createTransaction,
  listAccounts, listCategories,
  watchTransactionsMonth
} from "./db.js";
import { seedDefaultCategories } from "./seed.js";

const $ = (id) => document.getElementById(id);

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
  await loadLookups(uid);

  const selAcc = $("txAccount");
  selAcc.innerHTML = accounts.length
    ? accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")
    : `<option value="" disabled selected>Crie uma conta primeiro</option>`;

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
}

function watchMonth(uid){
  // limpa watcher anterior
  if(unsubTx) unsubTx();

  const { startDate, endDate } = getMonthRange(new Date());

  unsubTx = watchTransactionsMonth(uid, {
    startDate,
    endDate,
    onChange: (items) => {
      computeDashboard(items);
      renderTransactions(items);
      $("listHint").textContent = `Mês atual: ${startDate.slice(5,7)}/${startDate.slice(0,4)} • ${items.length} item(ns)`;
    },
    onError: (err) => {
      console.error(err);
      $("listHint").textContent = "Erro ao carregar transações (ver console).";
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

watchAuth({
  onIn: async (user) => {
    currentUser = user;
    $("userLabel").textContent = user.displayName || user.email;

    wireCloseButtons();
    wireSegmented();
    wireButtons();
    wireForms();

    await refreshSelects(user.uid);
    watchMonth(user.uid);
  },
  onOut: () => {
    if(unsubTx) unsubTx();
    window.location.href = "./index.html";
  },
});
