import { register, watchAuth } from "./auth.js";

const form = document.getElementById("registerForm");
const msg = document.getElementById("msg");
const btn = document.getElementById("btnRegister");

function setMsg(text, type = "") {
  msg.className = "msg" + (type ? ` ${type}` : "");
  msg.textContent = text || "";
}

watchAuth({
  onIn: () => (window.location.href = "./app.html"),
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("", "");

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const password2 = document.getElementById("password2").value;

  if (password !== password2) {
    setMsg("As senhas não coincidem.", "err");
    return;
  }

  btn.disabled = true;
  setMsg("Criando conta...", "ok");

  try {
    await register({ name, email, password });
    window.location.href = "./app.html";
  } catch (err) {
    setMsg(traduzErroAuth(err), "err");
  } finally {
    btn.disabled = false;
  }
});

function traduzErroAuth(err) {
  const code = err?.code || "";
  if (code.includes("auth/email-already-in-use")) return "Esse email já está em uso.";
  if (code.includes("auth/weak-password")) return "Senha fraca. Use pelo menos 6 caracteres.";
  if (code.includes("auth/invalid-email")) return "Email inválido.";
  return err?.message || "Falha ao cadastrar.";
}
