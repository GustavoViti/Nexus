import { createCategory } from "./db.js";

export async function seedDefaultCategories(uid) {
  const expense = ["Alimentação", "Transporte", "Assinaturas", "Lazer", "Saúde", "Casa", "Compras"];
  const income = ["Salário", "Freela", "Reembolso", "Outros"];

  for (const name of expense) await createCategory(uid, { name, type: "expense" });
  for (const name of income) await createCategory(uid, { name, type: "income" });
}
