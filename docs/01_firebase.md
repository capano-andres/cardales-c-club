# 🔥 firebase.js — Configuración Firebase

**Ruta**: `src/firebase.js`

## Propósito
Inicializa las conexiones a Firebase y exporta las instancias de servicios que usan el resto de los componentes.

---

## Instancias exportadas

| Export | Tipo | Proyecto | Descripción |
|---|---|---|---|
| `auth` | `Auth` | Principal | Auth del proyecto cliente (login, sesión) |
| `secondaryAuth` | `Auth` | Principal | Segunda instancia para crear usuarios sin cerrar sesión del admin |
| `db` | `Firestore` | Principal | Base de datos del proyecto cliente |
| `storage` | `Storage` | Principal | Storage del proyecto cliente |
| `catalogDb` | `Firestore` | Catálogo | DB compartida de imágenes de platos |
| `catalogStorage` | `Storage` | Catálogo | Storage compartido de imágenes de platos |
| `app` | `FirebaseApp` | Principal | Instancia raíz (raramente usada directamente) |

---

## Dos proyectos Firebase

```
firebase.js
├── app (principal)           ← VITE_FIREBASE_*
│   ├── auth                  ← login/sesión
│   ├── secondaryAuth         ← crear usuarios sin logout del admin
│   ├── db                    ← colecciones: users, pedidos, menus, config, historial_pedidos
│   └── storage               ← assets del proyecto
└── catalogoApp               ← VITE_CATALOGO_*
    ├── catalogDb             ← config/textoImagenes
    └── catalogStorage        ← platos/*.jpg
```

### ¿Por qué `secondaryAuth`?
Cuando el admin crea un nuevo usuario con `createUserWithEmailAndPassword`, Firebase cambia la sesión activa al nuevo usuario. Para evitar esto, se inicializa una segunda instancia de la app con el mismo `firebaseConfig` pero con el nombre `"secondary"`. La creación de usuario ocurre en `secondaryAuth`, y al terminar se hace `secondaryAuth.signOut()`. El admin permanece logueado en `auth`.

### ¿Por qué `catalogoApp`?
La galería de imágenes de platos (tooltips en el formulario) es **compartida entre todos los proyectos** de clientes que use este sistema. Se centraliza en un único proyecto Firebase aparte. `Formulario.jsx` e `ImagenesMenu.jsx` son los únicos componentes que la consumen.

---

## Variables de entorno requeridas (`.env`)

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID

VITE_CATALOGO_API_KEY
VITE_CATALOGO_AUTH_DOMAIN
VITE_CATALOGO_PROJECT_ID
VITE_CATALOGO_STORAGE_BUCKET
VITE_CATALOGO_MESSAGING_SENDER_ID
VITE_CATALOGO_APP_ID

VITE_OPENAI_API_KEY   ← usado en SubirMenu.jsx para parseo GPT (fallback)
```

---

## Quién usa cada export

| Export | Componentes que lo importan |
|---|---|
| `auth` | `Login`, `ProtectedRoute`, `AutoRedirect`, `AdminDashboard`, `MenuSelector`, `EditarUsuario` |
| `secondaryAuth` | `AdminUsers` (creación de usuarios) |
| `db` | Casi todos los componentes |
| `storage` | (no usado directamente fuera de firebase.js en la versión actual) |
| `catalogDb` | `Formulario`, `ImagenesMenu` |
| `catalogStorage` | `ImagenesMenu` |
