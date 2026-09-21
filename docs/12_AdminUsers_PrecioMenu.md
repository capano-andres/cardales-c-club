# 👥 AdminUsers.jsx

**Ruta**: `src/components/AdminUsers.jsx`  
**Acceso**: AdminDashboard → `"usuarios"`

## Propósito
Gestión completa de usuarios: listado, creación, edición de bonificación y estado de usuario, edición de nombre de usuario (`usuario`) y eliminación.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `mode` | string | `"view"` | (legacy, no tiene efecto visible) |
| `readOnly` | bool | `false` | Oculta acciones de creación y eliminación |
| `canEditUsername` | bool | `true` | Muestra el botón ✏️ para editar el campo `usuario` |

---

## Estructura del documento `users/{uid}`

```json
{
  "email": "pepe@empresa.com",
  "nombre": "Pepe",
  "apellido": "García",
  "usuario": "pepe.garcia",
  "legajo": "12345",
  "rol": "usuario",
  "bonificacion": true,
  "beneficio": "estandar",
  "fechaCreacion": Timestamp
}
```

---

## Creación de usuario (`createUserWithSecondaryAuth`)

Para crear un usuario sin cerrar la sesión del admin:
1. Activa `window.isCreatingUser = true` (flag global para pausar `ProtectedRoute`).
2. Valida unicidad de `email`, `usuario` y `legajo` en Firestore.
3. Llama a `createUserWithEmailAndPassword(secondaryAuth, email, password)`.
4. Crea `users/{uid}` en Firestore con los datos del formulario.
5. Llama a `secondaryAuth.signOut()`.
6. Desactiva `window.isCreatingUser = false` con un delay de 500ms.

---

## Edición de bonificación (`handleEditUser`)

Toggle del campo `bonificacion` (true/false) usando `setDoc + merge`.

**Impacto de `bonificacion`** en el sistema:
- `true` → precio = $0 (completamente bonificado)
- `false` → precio = precio * (100 - porcentaje) / 100 (parcialmente bonificado)
- `undefined` → precio completo

---

## Edición de nombre de usuario inline

Al hacer click en ✏️ junto al nombre de usuario:
- Aparece un input inline con el valor actual.
- Enter o botón ✓ → valida unicidad → `setDoc + merge`.
- Escape o botón ✗ → cancela.

---

## Eliminación de usuario

Solo elimina el documento de Firestore (`users/{uid}`). **No elimina** al usuario de Firebase Auth.  
> Nota: esto significa que el usuario podría volver a loguearse con sus credenciales pero no tendría acceso ya que su documento en `users` no existiría.

---

## Filtros

La lista de usuarios **excluye administradores** (rol `'admin'`).

---

## Conexiones Firebase
- `db` → colección `users`
- `secondaryAuth` → creación de usuarios (sin cerrar sesión del admin)
- `auth` → lectura del auth actual (`getAuth()`)

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `AdminDashboard` | Padre |
| `firebase.js → secondaryAuth` | Clave para la creación de usuarios |
| `firebase.js → db` | CRUD en colección `users` |
| `Modal` | Confirmaciones y mensajes |
| `Spinner` | Loading |

---

---

# 💰 PrecioMenu.jsx

**Ruta**: `src/components/PrecioMenu.jsx`  
**Acceso**: AdminDashboard → `"precioMenu"`

## Propósito
Configura el precio del menú y el sistema de bonificaciones en `config/precioMenu`.

## Campos

| Campo | Descripción |
|---|---|
| `precio` | Precio completo del menú (para usuarios sin bonificación) |
| `porcentajeBonificacion` | % de descuento para usuarios bonificados |
| `montoBonificacion` | Monto fijo de descuento (sincronizado con `%`) |

Los campos `porcentajeBonificacion` y `montoBonificacion` se calculan automáticamente el uno a partir del otro cuando el usuario cambia cualquiera de los dos.

## Precio final bonificado = `precio - montoBonificacion`

## Conexiones Firebase
- `db` → `config/precioMenu`

## Props
| Prop | Tipo | Default |
|---|---|---|
| `readOnly` | bool | `false` |
