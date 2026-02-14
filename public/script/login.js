import { login, watchAuth } from "./auth.js";

const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

function setMsg(text, type = "") {
  msg.className = "msg" + (type ? ` ${type}` : "");
  msg.textContent = text || "";
}

watchAuth({
  onIn: () => (window.location.href = "./app.html"),
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("Entrando...", "ok");
  btn.disabled = true;

  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    await login({ email, password });
    window.location.href = "./app.html";
  } catch (err) {
    setMsg(traduzErroAuth(err), "err");
  } finally {
    btn.disabled = false;
  }
});

function traduzErroAuth(err) {
  const code = err?.code || "";
  if (code.includes("auth/invalid-credential")) return "Email ou senha inválidos.";
  if (code.includes("auth/invalid-email")) return "Email inválido.";
  if (code.includes("auth/too-many-requests")) return "Muitas tentativas. Tente de novo mais tarde.";
  return err?.message || "Falha ao entrar.";
}
