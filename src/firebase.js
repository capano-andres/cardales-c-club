// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inicializar Firebase del cliente
const app = initializeApp(firebaseConfig);

// Auth del cliente
export const auth = getAuth(app);

// Segunda instancia para creación de usuarios (sin cerrar sesión principal)
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);

// Firestore y Storage del cliente
export const db = getFirestore(app);
export const storage = getStorage(app);

// ─────────────────────────────────────────────────────────
// Catálogo central de imágenes de platos (compartido entre
// TODOS los proyectos de clientes). Las imágenes se suben
// acá una sola vez y se ven en todos los formularios.
// ─────────────────────────────────────────────────────────
const catalogoConfig = {
  apiKey: import.meta.env.VITE_CATALOGO_API_KEY,
  authDomain: import.meta.env.VITE_CATALOGO_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_CATALOGO_PROJECT_ID,
  storageBucket: import.meta.env.VITE_CATALOGO_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_CATALOGO_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_CATALOGO_APP_ID
};

const catalogoApp = initializeApp(catalogoConfig, "catalogo");
export const catalogDb = getFirestore(catalogoApp);
export const catalogStorage = getStorage(catalogoApp);

export { app };
