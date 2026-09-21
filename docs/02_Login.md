# 🔑 Login.jsx

**Ruta**: `src/components/Login.jsx`  
**Ruta de app**: `/`

## Propósito
Formulario de inicio de sesión. Permite al usuario ingresar con su **email** o su **nombre de usuario** (`usuario`) y su contraseña.

---

## Lógica de autenticación

1. El usuario ingresa email/usuario + contraseña.
2. Se busca en Firestore (`users`) primero por `email`, luego por `usuario`.
3. Con el `email` encontrado, se llama a `signInWithEmailAndPassword` de Firebase Auth.
4. Si el `rol` del usuario es `"admin"` o `"visor"` → navega a `/admin`.
5. Si el `rol` es `"usuario"` → navega a `/menu`.

```
Login
  ↓ query Firestore: users where email == inputValue
  ↓ si no → query Firestore: users where usuario == inputValue
  ↓ signInWithEmailAndPassword(auth, email, password)
  ↓ rol == admin|visor → /admin
  ↓ rol == usuario    → /menu
```

---

## Estado interno
| Estado | Tipo | Descripción |
|---|---|---|
| `emailOrUsername` | string | Valor del campo de entrada |
| `password` | string | Contraseña |
| `error` | string | Mensaje de error visible |
| `isLoading` | bool | Deshabilita el botón durante la solicitud |
| `showPassword` | bool | Toggle de visibilidad de contraseña |

---

## Conexiones Firebase
- `db` (Firestore): colección `users`, campos `email` y `usuario`
- `getAuth()` + `signInWithEmailAndPassword`

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `AutoRedirect` | Se renderiza en la misma ruta `/`; si hay sesión activa, redirige antes de que el login sea visible |
| `ProtectedRoute` | Después del login exitoso, las rutas protegidas verifican nuevamente el estado de auth |
| `firebase.js` → `db` | Fuente de verdad de los usuarios |

---

## Notas
- El login distingue entre error de contraseña (`auth/wrong-password`) y usuario no encontrado.
- El logo `/logo-beti-jai.png` se carga desde `/public`.
