# 🛡️ ProtectedRoute.jsx + AutoRedirect.jsx

**Rutas**: `src/components/ProtectedRoute.jsx` · `src/components/AutoRedirect.jsx`

---

## ProtectedRoute.jsx

### Propósito
Wrapper de rutas que verifica si el usuario está autenticado y tiene el rol apropiado antes de renderizar el componente hijo.

### Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `children` | ReactElement | — | Componente a proteger |
| `requireAdmin` | bool | `false` | Si `true`, solo `admin` y `visor` pueden acceder |

### Lógica de guardado
```
onAuthStateChanged
  ├── sin usuario → <Navigate to="/" />
  ├── con usuario
  │   ├── query Firestore users where email == user.email → obtiene rol
  │   ├── requireAdmin=true  y  rol != admin|visor → <Navigate to="/menu" />
  │   ├── requireAdmin=false y  rol == admin|visor  → <Navigate to="/admin" />
  │   └── OK → cloneElement(children, { userRole })
  └── loading → <Spinner /> centrado
```

### Nota importante: `window.isCreatingUser`
Si `AdminUsers` está creando un usuario con `secondaryAuth`, se activa el flag global `window.isCreatingUser = true`. `ProtectedRoute` (y `AutoRedirect`) checan este flag en el listener `onAuthStateChanged` para **ignorar** ese cambio de sesión (evitar que el admin sea deslogueado o redirigido accidentalmente durante la creación).

### Conexiones Firebase
- `auth` → `onAuthStateChanged`
- `db` → colección `users`, campo `email` y `rol`

---

## AutoRedirect.jsx

### Propósito
Se renderiza junto a `<Login />` en la ruta `/`. Si detecta una sesión activa, redirige automáticamente al usuario sin que tenga que ver el formulario de login.

### Lógica
```
onAuthStateChanged
  ├── sin usuario → null (renderiza Login)
  ├── con usuario
  │   ├── rol == admin|visor → <Navigate to="/admin" />
  │   └── rol == usuario     → <Navigate to="/menu" />
  └── loading → <Spinner />
```

### Conexiones Firebase
- `auth` → `onAuthStateChanged`
- `db` → colección `users`, campo `email` y `rol`

---

## Diferencia entre ProtectedRoute y AutoRedirect

| | ProtectedRoute | AutoRedirect |
|---|---|---|
| **Propósito** | Proteger rutas específicas | Redirigir desde `/` si ya hay sesión |
| **Renderiza hijos** | Sí (si OK) | No (es transparente) |
| **Ubicación** | Wrappea cada ruta protegida | Solo en ruta `/` junto a `<Login>` |

---

## Componentes que los usan
- `App.jsx` usa `ProtectedRoute` para todas las rutas excepto `/`
- `App.jsx` usa `AutoRedirect` en la ruta `/`
- `Spinner` es usado por ambos durante la carga
