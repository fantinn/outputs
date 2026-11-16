import { firebaseConfig } from "./firebase-config.js";

const sdk = "https://www.gstatic.com/firebasejs/12.19.0";
const required = ["apiKey", "authDomain", "projectId", "appId"];
const configured = required.every(key => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim().length > 0);
const status = detail => window.dispatchEvent(new CustomEvent("mesclaro:cloud-status", { detail }));

if (!configured) {
  window.MesClaroCloud = { queueSync() {} };
  status({ enabled: false, online: false, text: "Modo local — configure firebase-config.js para sincronizar" });
} else {
  try {
    const [appSdk, authSdk, dbSdk] = await Promise.all([
      import(`${sdk}/firebase-app.js`),
      import(`${sdk}/firebase-auth.js`),
      import(`${sdk}/firebase-firestore.js`)
    ]);
    const app = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = dbSdk.getFirestore(app);
    const provider = new authSdk.GoogleAuthProvider();
    let signedInUser = null;
    let ready = false;
    let stopListening = null;
    let writeTimer = null;

    const refFor = uid => dbSdk.doc(db, "users", uid, "appData", "main");
    const currentState = () => window.MesClaroApp?.getState() || { expenses: [], months: {} };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    function mergeStates(local, remote) {
      const cloud = remote && Array.isArray(remote.expenses) && remote.months && typeof remote.months === "object"
        ? remote : { expenses: [], months: {} };
      const device = local && Array.isArray(local.expenses) && local.months && typeof local.months === "object"
        ? local : { expenses: [], months: {} };
      const expenses = [...cloud.expenses];
      const knownIds = new Set(expenses.map(item => item.id));
      for (const item of device.expenses) if (!knownIds.has(item.id)) expenses.push(item);

      const months = { ...device.months, ...cloud.months };
      for (const [key, localMonth] of Object.entries(device.months)) {
        const cloudMonth = cloud.months[key];
        if (!cloudMonth) { months[key] = localMonth; continue; }
        const paid = { ...(localMonth?.paid || {}), ...(cloudMonth?.paid || {}) };
        for (const [id, localTime] of Object.entries(localMonth?.paid || {})) {
          const cloudTime = cloudMonth?.paid?.[id];
          if (cloudTime && Date.parse(localTime) > Date.parse(cloudTime)) paid[id] = localTime;
        }
        months[key] = {
          ...localMonth,
          ...cloudMonth,
          paid,
          card: { ...(localMonth?.card || {}), ...(cloudMonth?.card || {}) }
        };
      }
      return { expenses, months };
    }

    function setStatus(text, { online = false, error = false } = {}) {
      status({ enabled: true, signedIn: !!signedInUser, email: signedInUser?.email || "", online, error, text });
    }

    async function writeNow(data = currentState()) {
      if (!signedInUser || !ready) return;
      setStatus("Salvando no Firebase…");
      await dbSdk.setDoc(refFor(signedInUser.uid), { data, updatedAt: dbSdk.serverTimestamp() });
      setStatus("Sincronizado com o Firebase", { online: true });
    }

    window.MesClaroCloud = {
      queueSync(data) {
        if (!signedInUser || !ready) return;
        setStatus("Salvando no Firebase…");
        clearTimeout(writeTimer);
        writeTimer = setTimeout(() => writeNow(data).catch(() => setStatus("Falha ao sincronizar. Verifique sua conexão e as regras do Firestore.", { error: true })), 450);
      }
    };

    document.getElementById("authButton").addEventListener("click", async () => {
      try {
        if (signedInUser) await authSdk.signOut(auth);
        else if (window.matchMedia("(max-width: 740px)").matches) await authSdk.signInWithRedirect(auth, provider);
        else {
          try { await authSdk.signInWithPopup(auth, provider); }
          catch (error) {
            if (error.code === "auth/popup-blocked") await authSdk.signInWithRedirect(auth, provider);
            else throw error;
          }
        }
      } catch (error) {
        setStatus(error.code === "auth/unauthorized-domain"
          ? "Adicione este endereço em Firebase Authentication > Domínios autorizados."
          : "Não foi possível conectar. Confira o provedor Google no Firebase.", { error: true });
      }
    });

    authSdk.getRedirectResult(auth).catch(() => setStatus("Não foi possível concluir a entrada com Google.", { error: true }));
    authSdk.onAuthStateChanged(auth, async user => {
      stopListening?.();
      stopListening = null;
      signedInUser = user;
      ready = false;
      if (!user) {
        setStatus("Modo local — conecte o Google para sincronizar");
        return;
      }

      setStatus("Conectando ao Firebase…");
      const ref = refFor(user.uid);
      try {
        const snapshot = await dbSdk.getDoc(ref);
        const local = currentState();
        const remote = snapshot.exists() ? snapshot.data().data : null;
        const merged = remote ? mergeStates(local, remote) : local;
        window.MesClaroApp?.replaceState(merged);
        ready = true;
        stopListening = dbSdk.onSnapshot(ref, cloudSnapshot => {
          if (!cloudSnapshot.exists()) return;
          const cloudState = cloudSnapshot.data().data;
          if (!cloudState || !Array.isArray(cloudState.expenses) || !cloudState.months) return;
          const localState = currentState();
          if (same(localState, cloudState)) {
            setStatus("Sincronizado com o Firebase", { online: true });
            return;
          }
          const next = mergeStates(localState, cloudState);
          window.MesClaroApp?.replaceState(next);
          if (!same(next, cloudState)) window.MesClaroCloud.queueSync(next);
          else setStatus("Sincronizado com o Firebase", { online: true });
        }, () => setStatus("Falha ao receber atualizações do Firestore.", { error: true }));
        if (!remote || !same(merged, remote)) await writeNow(merged);
        else setStatus("Sincronizado com o Firebase", { online: true });
      } catch (error) {
        ready = false;
        setStatus(error.code === "permission-denied"
          ? "Firestore bloqueou o acesso. Publique as regras de firestore.rules."
          : "Não foi possível acessar o Firestore. Confira o projeto e a conexão.", { error: true });
      }
    });
  } catch (error) {
    window.MesClaroCloud = { queueSync() {} };
    status({ enabled: false, online: false, error: true, text: "Não foi possível carregar o SDK do Firebase. Abra o app por um endereço web." });
  }
}
