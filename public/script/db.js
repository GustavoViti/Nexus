import { db } from "./firebase.js";
import {
  collection, doc, addDoc, setDoc, getDocs, query, orderBy,
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
