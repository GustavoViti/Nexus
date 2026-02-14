import { watchAuth, logout } from "./auth.js";
import { createAccount, createCategory, createTransaction, listAccounts, listCategories } from "./db.js";
import { seedDefaultCategories } from "./seed.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let txType = "expense";
let catType = "expense";

function openModal(id){ $(id).classList.add("show"); $(id).setAttribute("aria-hidden","false"); }
function closeModal(id){ $(id).classList.remove("show"); $(id).setAttribute("aria-hidden","true"); }
function setMsg(el, text, type=""){ el.className = "msg" + (type ? ` ${type}` : ""); el.textContent = text || ""; }

function parseMoneyBR(value){
  // aceita "10,50" ou "10.50" ou "1.234,56"
  const v = String(value || "").trim()
    .replace(/\./g,"")
    .replace(",",".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function refreshSelects(uid){
  const [accounts, categories] = await Promise.all([listAccounts(uid), listCategories(uid)]);

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

function wireCloseButtons(){
  document.querySelectorAll("[data-close]").forEach(btn=>{
    btn.addEventListener("click", ()=> closeModal(btn.dataset.close));
  });

  // fechar clicando fora
  document.querySelectorAll(".modal").forEach(m=>{
    m.addEventListener("click", (e)=>{
      if(e.target === m) closeModal(m.id);
    });
  });
}

function wireSegmented(){
  // tipo da transação
  document.querySelectorAll("#modalTx .seg").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll("#modalTx .seg").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      txType = btn.dataset.type;
      if(currentUser) await refreshSelects(currentUser.uid);
    });
  });

  // tipo da categoria
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
      setMsg(msg, "Categorias criadas ✅", "ok");
    }catch(e){
      setMsg(msg, e.message || "Falha ao criar categorias.", "err");
    }
  });
}

function wireForms(){
  // conta
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
      setMsg(msg, "Conta criada ✅", "ok");
      e.target.reset();
      setTimeout(()=> closeModal("modalAccount"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao criar conta.", "err");
    }
  });

  // categoria
  $("formCategory").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const msg = $("msgCategory");
    setMsg(msg, "Salvando...", "ok");

    try{
      await createCategory(currentUser.uid, {
        name: $("catName").value.trim(),
        type: catType,
      });
      setMsg(msg, "Categoria criada ✅", "ok");
      e.target.reset();
      setTimeout(()=> closeModal("modalCategory"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao criar categoria.", "err");
    }
  });

  // transação
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
        date: $("txDate").value, // YYYY-MM-DD (simples)
        description: $("txDesc").value.trim(),
        accountId: acc,
        categoryId: cat,
        notes: $("txNotes").value.trim(),
      });

      setMsg(msg, "Lançamento salvo ✅", "ok");
      e.target.reset();
      setDefaultDate();
      $("emptyState").style.display = "none";
      setTimeout(()=> closeModal("modalTx"), 350);
    }catch(err){
      setMsg(msg, err.message || "Falha ao salvar lançamento.", "err");
    }
  });
}

watchAuth({
  onIn: async (user) => {
    currentUser = user;
    $("userLabel").textContent = user.displayName || user.email;

    wireCloseButtons();
    wireSegmented();
    wireButtons();
    wireForms();

    // tenta preencher selects; se não tiver dados, vai mostrar “crie primeiro”
    await refreshSelects(user.uid);
  },
  onOut: () => (window.location.href = "./index.html"),
});
