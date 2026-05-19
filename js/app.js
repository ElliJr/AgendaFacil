// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAa4sZN42xSCw1nggj5wi-_AsuzGMfBEYg",
    authDomain: "barbershopsaas-2af6c.firebaseapp.com",
    projectId: "barbershopsaas-2af6c",
    storageBucket: "barbershopsaas-2af6c.firebasestorage.app",
    messagingSenderId: "939177796204",
    appId: "1:939177796204:web:f54a3cd48c485076d8ae49",
    measurementId: "G-NP7SYJHN84"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Força a persistência sem travar a inicialização
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Erro persistência:", err));

// --- SAFETY TRIGGER: Se em 4 segundos nada acontecer, tira o loading ---
setTimeout(() => {
    const loader = document.getElementById("loading");
    if (loader && !loader.classList.contains("hidden")) {
        console.warn("Firebase demorou demais. Forçando saída do loading.");
        loader.classList.add("hidden");
    }
}, 4000);

// --- NAVEGAÇÃO ---
window.tab = (id) => {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    const target = document.getElementById('view-' + id);
    if(target) target.classList.remove('hidden');
    const btn = document.getElementById('t-' + id);
    if(btn) btn.classList.add('tab-active');
};

// --- MONITOR DE LOGIN ---
onAuthStateChanged(auth, (user) => {
    document.getElementById("loading").classList.add("hidden");
    if (user) {
        document.getElementById("login").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        document.getElementById('user-email-display').innerText = user.email;
        carregarTudo();
    } else {
        document.getElementById("dashboard").classList.add("hidden");
        document.getElementById("login").classList.remove("hidden");
    }
});

// --- FUNÇÕES DE SALVAMENTO ---
async function salvarAgendamento() {
    const selectCli = document.getElementById("input-cliente");
    const selectSer = document.getElementById("input-servico");
    const dataAg = document.getElementById("data").value;
    const horaAg = document.getElementById("hora").value;

    if(!selectCli.value || !selectSer.value || !dataAg || !horaAg) return alert("Preencha todos os campos!");

    const data = {
        cliente: selectCli.value,
        data: dataAg,
        hora: horaAg,
        servico: selectSer.options[selectSer.selectedIndex].text.split(' - ')[0],
        preco: parseFloat(selectSer.value),
        userId: auth.currentUser.uid,
        criado: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "agendamentos"), data);
        modal(false);
    } catch(e) { alert("Erro ao salvar: " + e.message); }
}

async function salvarCliente() {
    const nome = document.getElementById("c-nome").value;
    const fone = document.getElementById("c-fone").value;
    if(!nome) return alert("Nome é obrigatório!");
    try {
        await addDoc(collection(db, "clientes"), { nome, fone, userId: auth.currentUser.uid });
        closeModal('modal-cliente');
    } catch(e) { alert("Erro ao salvar cliente."); }
}

async function salvarServico() {
    const nome = document.getElementById("s-nome").value;
    const preco = parseFloat(document.getElementById("s-preco").value);
    if(!nome || isNaN(preco)) return alert("Nome e preço válidos!");
    try {
        await addDoc(collection(db, "servicos"), { nome, preco, userId: auth.currentUser.uid });
        closeModal('modal-servico');
    } catch(e) { alert("Erro ao salvar serviço."); }
}

// --- CARREGAMENTO REALTIME ---
function carregarTudo() {
    const uid = auth.currentUser.uid;

    // Agenda
    onSnapshot(query(collection(db, "agendamentos"), where("userId", "==", uid), orderBy("hora")), snap => {
        let html = ""; let total = 0; let atend = 0;
        snap.forEach(d => {
            const item = d.data(); 
            total += item.preco; atend++;
            html += `
            <div class="card p-4 rounded-xl flex justify-between items-center border-l-4 border-yellow-400">
                <div>
                    <p class="font-bold text-sm text-yellow-400">${item.hora}</p>
                    <p class="text-xs font-bold">${item.cliente}</p>
                    <p class="text-[9px] text-gray-500 uppercase">${item.servico}</p>
                </div>
                <div class="flex items-center gap-4">
                    <span class="font-bold text-white text-sm">R$${item.preco.toFixed(2)}</span>
                    <button onclick="remover('agendamentos','${d.id}')" class="text-gray-700">✕</button>
                </div>
            </div>`;
        });
        document.getElementById("agenda").innerHTML = html || "<p class='text-center text-gray-600 text-xs py-10'>Sem agendamentos.</p>";
        document.getElementById("faturamento").innerText = "R$ " + total.toFixed(2);
        document.getElementById("atendimentos").innerText = atend;
    });

    // Clientes
    onSnapshot(query(collection(db, "clientes"), where("userId", "==", uid)), snap => {
        let html = ""; let select = "<option value=''>Selecionar Cliente...</option>";
        snap.forEach(d => {
            const c = d.data();
            html += `<div class="card p-4 rounded-xl flex justify-between items-center"><span>${c.nome}</span><button onclick="remover('clientes','${d.id}')" class="text-xs text-red-900">Excluir</button></div>`;
            select += `<option value="${c.nome}">${c.nome}</option>`;
        });
        document.getElementById("lista-clientes").innerHTML = html;
        document.getElementById("input-cliente").innerHTML = select;
    });

    // Serviços
    onSnapshot(query(collection(db, "servicos"), where("userId", "==", uid)), snap => {
        let html = ""; let select = "<option value=''>Selecionar Serviço...</option>";
        snap.forEach(d => {
            const s = d.data();
            html += `<div class="card p-4 rounded-xl flex justify-between items-center"><span>${s.nome}</span><span class="text-yellow-400 font-bold">R$${s.preco.toFixed(2)}</span></div>`;
            select += `<option value="${s.preco}">${s.nome} - R$${s.preco.toFixed(2)}</option>`;
        });
        document.getElementById("lista-servicos").innerHTML = html;
        document.getElementById("input-servico").innerHTML = select;
    });
}

// --- GLOBALIZANDO FUNÇÕES ---
window.modal = (v) => document.getElementById("modal").classList.toggle("hidden", !v);
window.openModal = (id) => document.getElementById(id).classList.remove("hidden");
window.closeModal = (id) => document.getElementById(id).classList.add("hidden");
window.remover = async (col, id) => { if(confirm("Remover?")) await deleteDoc(doc(db, col, id)); };

document.getElementById("btn-login").onclick = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById("email").value, document.getElementById("senha").value); } 
    catch(e) { alert("Falha no login: " + e.message); }
};
document.getElementById("btn-cadastro").onclick = async () => {
    try { await createUserWithEmailAndPassword(auth, document.getElementById("email").value, document.getElementById("senha").value); } 
    catch(e) { alert("Erro no cadastro."); }
};
document.getElementById("logout").onclick = () => signOut(auth);
document.getElementById("abrirModal").onclick = () => modal(true);
document.getElementById("salvar").onclick = salvarAgendamento;
document.getElementById("btn-save-cliente").onclick = salvarCliente;
document.getElementById("btn-save-servico").onclick = salvarServico;