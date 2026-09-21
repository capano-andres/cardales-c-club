# 🍽️ MenuSelector.jsx + EditarUsuario.jsx + Utilidades

---

## MenuSelector.jsx

**Ruta**: `src/components/MenuSelector.jsx`  
**Ruta de app**: `/menu`

### Propósito
Pantalla de selección de menú para empleados. Muestra botones para "Menú Semana Actual" y "Menú Próxima Semana" según disponibilidad, más acceso a editar usuario y cerrar sesión.

### Lógica de visibilidad de botones

```
mostrarMenuActual():
  ├── Si es viernes >= 18:00 → false
  └── Si menuActual existe  → true

mostrarMenuProxima():
  ├── Si es viernes >= 18:00 → false
  ├── Si hay fechas configuradas:
  │   └── Si ahora >= fechaInicio Y ahora <= fechaLimite Y menuProxima existe → true
  └── Si no hay fechas → si menuProxima existe → true
```

### Datos cargados
- `config/fechasLimite` → `inicioPedidos` y `proximaSemana`
- `menus/menuActual` y `menus/menuProxima` → existencia (no contenido)

### Navegación
- "Menú de la Semana Actual" → `/menu/actual` → `Formulario tipo="actual"`
- "Menú de la Próxima Semana" → `/menu/proxima` → `Formulario tipo="proxima"`
- "Editar Usuario" → `/menu/editar-usuario`
- "Cerrar Sesión" → `signOut()` → `/`

### Alertas especiales
- Si es viernes tarde: "Cierre semanal en proceso".
- Si no hay menús disponibles: "No hay menús disponibles en este momento".

---

## EditarUsuario.jsx

**Ruta**: `src/components/EditarUsuario.jsx`  
**Ruta de app**: `/menu/editar-usuario`

### Propósito
Permite al empleado cambiar su **contraseña** sin intervención del administrador.

### Flujo
1. Formulario: contraseña actual + nueva contraseña + confirmación.
2. Reautenticación con `EmailAuthProvider.credential` + `reauthenticateWithCredential`.
3. Cambio con `updatePassword(user, newPassword)`.

### Validaciones
- Todos los campos completos.
- Nueva contraseña ≥ 6 caracteres.
- Nueva contraseña ≠ contraseña actual.
- Las dos entradas nuevas deben coincidir.

### Conexiones Firebase
- `auth` → `getAuth().currentUser`, `reauthenticateWithCredential`, `updatePassword`

---

## Modal.jsx

**Ruta**: `src/components/Modal.jsx`

### Propósito
Componente de diálogo/modal reutilizable. Usado extensivamente en todo el proyecto para confirmaciones, alertas y formularios embebidos.

### Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `isOpen` | bool | — | Controla visibilidad |
| `onClose` | function | — | Callback al cerrar |
| `title` | string | — | Título del modal |
| `message` | string | — | Mensaje principal |
| `type` | `'info'` \| `'success'` \| `'error'` \| `'warning'` | `'info'` | Determina el ícono y color del header |
| `actions` | array | `[]` | Botones personalizados `{ label, type, onClick }` |
| `children` | ReactNode | — | Contenido adicional en el cuerpo |
| `canClose` | bool | `true` | Si `false`, oculta el botón ✕ y el botón "Cerrar" |

### Tipos de acción
```js
actions={[
  { label: 'Cancelar', type: 'secondary', onClick: () => setModal({isOpen: false}) },
  { label: 'Eliminar', type: 'danger',    onClick: confirmarEliminacion }
]}
```

---

## Spinner.jsx

**Ruta**: `src/components/Spinner.jsx`

Componente mínimo (165 bytes). Solo renderiza un `<div className="spinner" />` con animación CSS de rotación. Usado por todos los componentes durante estados de carga.

---

## MenuForm.jsx (legacy)

**Ruta**: `src/components/MenuForm.jsx`

Componente legacy para cargar menús. Actualmente no está activo en el flujo principal (reemplazado por `SubirMenu`). Se mantiene como referencia/fallback.

---

## MenuRotator.jsx + VerMenu.jsx

**Rutas**: `src/components/MenuRotator.jsx` · `src/components/VerMenu.jsx`

Componentes auxiliares posiblemente usados en versiones anteriores del flujo. No están actualmente referenciados en `App.jsx` o `AdminDashboard.jsx` como rutas activas.
