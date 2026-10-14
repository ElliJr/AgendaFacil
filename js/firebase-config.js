// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCppcnfUc5N4xuWq0UUmg6_idNLY8vRQdw",
    authDomain: "agendafacil-1.firebaseapp.com",
    projectId: "agendafacil-1",
    storageBucket: "agendafacil-1.appspot.com",
    messagingSenderId: "862585496599",
    appId: "1:862585496599:web:2a360f1147a334d1342852"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, firebaseConfig };