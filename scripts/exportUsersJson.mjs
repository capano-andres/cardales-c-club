// Exporta los usuarios recién creados en Firestore a JSON, para armar el Excel de credenciales.
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFileSync } from 'fs';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'users'));
const users = [];
snap.forEach((d) => {
  const data = d.data();
  if (data.rol === 'admin') return;
  users.push({
    apellido: data.apellido || '',
    nombre: data.nombre || '',
    usuario: data.usuario || '',
    legajo: data.legajo || '',
    email: data.email || '',
    password: String(data.legajo || '').padStart(6, '0'),
  });
});

users.sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));

writeFileSync(new URL('./usuarios_export.json', import.meta.url), JSON.stringify(users, null, 2));
console.log(`Exportados ${users.length} usuarios a scripts/usuarios_export.json`);
