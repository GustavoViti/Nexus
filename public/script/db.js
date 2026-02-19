import { db } from "./firebase.js";
import {
  collection, addDoc, getDocs, query, orderBy, where, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

