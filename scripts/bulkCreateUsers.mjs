// Script de carga masiva de usuarios desde "LISTADO PARA BETIJAI.xlsx".
// Uso:
//   node scripts/bulkCreateUsers.mjs           -> dry-run (no crea nada, solo muestra el plan)
//   node scripts/bulkCreateUsers.mjs --apply   -> crea los usuarios de verdad en Firebase

import 'dotenv/config';
import xlsx from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const FILE_PATH = new URL('../LISTADO PARA BETIJAI.xlsx', import.meta.url);

// --- 1. Leer la planilla ---------------------------------------------------
const workbook = xlsx.readFile(FILE_PATH);
const sheet = workbook.Sheets['Hoja1'];
// Encabezados en la fila 2 (apellido, nombre, email, legajo). Datos desde la fila 3.
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: '' });
const [, ...dataRows] = rows; // saltar fila de encabezado

const records = dataRows
  .map((r, idx) => ({
    fila: idx + 3,
    apellido: String(r[0] ?? '').trim(),
    nombre: String(r[1] ?? '').trim(),
    email: String(r[2] ?? '').trim().toLowerCase(),
    legajo: String(r[3] ?? '').trim(),
  }))
  .filter((r) => r.email && r.legajo);

// --- 2. Detectar emails duplicados y desambiguar ---------------------------
const emailCounts = {};
for (const r of records) emailCounts[r.email] = (emailCounts[r.email] || 0) + 1;

// Firebase Auth puede rechazar direcciones con caracteres no-ASCII (ej. "ñ") en el
// local-part. Como el email no se usa para enviar correos reales, solo como
// identificador de login, se normaliza (ñ -> n, tildes fuera) para el email de Auth
// y el usuario, sin tocar el email tal como está escrito en la planilla.
const normalizar = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');

for (const r of records) {
  const [localRaw, domain] = r.email.split('@');
  const local = normalizar(localRaw);
  if (emailCounts[r.email] > 1) {
    // Email real duplicado: se agrega el legajo al usuario y al email de Auth
    // para que ambos campos sean únicos, tal como se acordó con el cliente.
    r.usuario = `${local}${r.legajo}`;
    r.authEmail = `${local}${r.legajo}@${domain}`;
  } else {
    r.usuario = local;
    r.authEmail = `${local}@${domain}`;
  }
  // Password = legajo, rellenado con ceros a la izquierda hasta 6 dígitos
  // (mínimo que exige Firebase Auth).
  r.password = r.legajo.padStart(6, '0');
}

// --- 3. Mostrar el plan ------------------------------------------------------
console.log(`Registros a procesar: ${records.length}\n`);
console.log('fila | apellido | nombre | email original | email Auth | usuario | password | legajo');
for (const r of records) {
  const marca = emailCounts[r.email] > 1 ? '  <-- email duplicado, desambiguado' : '';
  console.log(`${r.fila} | ${r.apellido} | ${r.nombre} | ${r.email} | ${r.authEmail} | ${r.usuario} | ${r.password} | ${r.legajo}${marca}`);
}

const usuarioCounts = {};
for (const r of records) usuarioCounts[r.usuario] = (usuarioCounts[r.usuario] || 0) + 1;
const usuariosRepetidos = Object.entries(usuarioCounts).filter(([, c]) => c > 1);
if (usuariosRepetidos.length) {
  console.log('\n⚠️  Usuarios que quedarían repetidos:', usuariosRepetidos);
}

if (!APPLY) {
  console.log('\nDry-run: no se creó ningún usuario. Ejecutá con --apply para crearlos en Firebase.');
  process.exit(0);
}

// --- 4. Crear usuarios en Firebase ------------------------------------------
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Traer usuarios/emails/usuarios/legajos existentes para no duplicar si se corre más de una vez.
const existingSnap = await getDocs(collection(db, 'users'));
const existingEmails = new Set();
const existingUsuarios = new Set();
existingSnap.forEach((d) => {
  const data = d.data();
  if (data.email) existingEmails.add(String(data.email).toLowerCase());
  if (data.usuario) existingUsuarios.add(String(data.usuario).toLowerCase());
});

const resultados = { creados: [], omitidos: [], fallidos: [] };

for (const r of records) {
  if (existingEmails.has(r.authEmail.toLowerCase()) || existingUsuarios.has(r.usuario.toLowerCase())) {
    resultados.omitidos.push({ ...r, motivo: 'ya existe (email o usuario)' });
    continue;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, r.authEmail, r.password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: r.authEmail,
      nombre: r.nombre,
      apellido: r.apellido,
      rol: 'usuario',
      usuario: r.usuario,
      legajo: r.legajo,
      beneficio: 'estandar',
      bonificacion: false,
      fechaCreacion: serverTimestamp(),
    });
    await signOut(auth);
    resultados.creados.push(r);
    console.log(`✅ Creado: ${r.usuario} (${r.authEmail})`);
  } catch (err) {
    resultados.fallidos.push({ ...r, error: err.message });
    console.log(`❌ Falló: ${r.usuario} (${r.authEmail}) - ${err.message}`);
  }
}

console.log('\n--- Resumen ---');
console.log(`Creados: ${resultados.creados.length}`);
console.log(`Omitidos (ya existían): ${resultados.omitidos.length}`);
console.log(`Fallidos: ${resultados.fallidos.length}`);
if (resultados.fallidos.length) {
  console.log('\nDetalle de fallidos:');
  for (const f of resultados.fallidos) console.log(`  - fila ${f.fila} (${f.authEmail}): ${f.error}`);
}

process.exit(0);
