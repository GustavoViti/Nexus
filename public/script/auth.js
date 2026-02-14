import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function register({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  if (name) await updateProfile(cred.user, { displayName: name });

  await setDoc(doc(db, "users", cred.user.uid), {
    name: name || "",
    email,
    currency: "BRL",
    createdAt: serverTimestamp(),
  });

  return cred.user;
}

export async function login({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export function watchAuth({ onIn, onOut }) {
  return onAuthStateChanged(auth, (user) => {
    if (user) onIn?.(user);
    else onOut?.();
  });
}
