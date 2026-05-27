import { db } from "./firebase.js";
import {
  collection, doc, addDoc, getDocs, query, orderBy, where, onSnapshot,
  serverTimestamp, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {updateDoc, deleteDoc } from 
"https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function updateTransaction(uid, txId, data){
  const ref = doc(db, "users", uid, "transactions", txId);
  await updateDoc(ref, data);
}

export async function deleteTransaction(uid, txId){
  const ref = doc(db, "users", uid, "transactions", txId);
  await deleteDoc(ref);
}

export async function createAccount(uid, { name, type, initialBalance }) {
  const ref = collection(db, "users", uid, "accounts");
  return addDoc(ref, {
    name,
    type,
    initialBalance: Number(initialBalance || 0),
    createdAt: serverTimestamp(),
  });
}

export async function createCategory(uid, { name, type }) {
  const ref = collection(db, "users", uid, "categories");
  return addDoc(ref, {
    name,
    type, // income | expense
    createdAt: serverTimestamp(),
  });
}

export async function createTransaction(uid, tx) {
  const ref = collection(db, "users", uid, "transactions");
  return addDoc(ref, {
    ...tx,
    createdAt: serverTimestamp(),
  });
}

export async function listAccounts(uid) {
  const ref = collection(db, "users", uid, "accounts");
  const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listCategories(uid) {
  const ref = collection(db, "users", uid, "categories");
  const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Observa transações do mês (tempo real)
 * date está como "YYYY-MM-DD", então dá pra filtrar por range de strings.
 */
export function watchTransactionsMonth(uid, { startDate, endDate, onChange, onError }) {
  const ref = collection(db, "users", uid, "transactions");
  const q = query(
    ref,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange?.(items);
    },
    (err) => onError?.(err)
  );
}

export function watchTransactionsAll(uid, { onChange, onError }) {
  const ref = collection(db, "users", uid, "transactions");
  const q = query(ref, orderBy("date", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange?.(items);
    },
    (err) => onError?.(err)
  );
}

export function watchAccounts(uid, { onChange, onError }) {
  const ref = collection(db, "users", uid, "accounts");
  const q = query(ref, orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange?.(items);
    },
    (err) => onError?.(err)
  );
}

export function watchSettings(uid, { onChange, onError }) {
  const ref = doc(db, "users", uid, "settings", "main");
  return onSnapshot(
    ref,
    (snap) => onChange?.(snap.exists() ? snap.data() : null),
    (err) => onError?.(err)
  );
}

export async function setMonthlyBudget(uid, monthlyBudget) {
  const ref = doc(db, "users", uid, "settings", "main");
  await setDoc(ref, { monthlyBudget: Number(monthlyBudget || 0) }, { merge: true });
}

export async function updateAccount(uid, accountId, data) {
  const ref = doc(db, "users", uid, "accounts", accountId);
  await updateDoc(ref, data);
}

export async function deleteAccount(uid, accountId) {
  const ref = doc(db, "users", uid, "accounts", accountId);
  await deleteDoc(ref);
}

export async function updateCategory(uid, categoryId, data) {
  const ref = doc(db, "users", uid, "categories", categoryId);
  await updateDoc(ref, data);
}

export async function deleteCategory(uid, categoryId) {
  const ref = doc(db, "users", uid, "categories", categoryId);
  await deleteDoc(ref);
}
