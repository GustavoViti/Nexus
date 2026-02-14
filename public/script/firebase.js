import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDaaHZFJUsYe2W4WkvGWfq4MQ1Jd1CuRz4",
  authDomain: "nexus-11148.firebaseapp.com",
  projectId: "nexus-11148",
  storageBucket: "nexus-11148.firebasestorage.app",
  messagingSenderId: "144641800330",
  appId: "1:144641800330:web:7b56b1671161bc1a56d573",
  measurementId: "G-X53M7YR01B"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);