# 👁️ AdminMenu.jsx

**Ruta**: `src/components/AdminMenu.jsx`  
**Acceso**: AdminDashboard → `"verMenu"` (actual) o `"verMenuProxima"` (próxima)

## Propósito
Muestra el menú semanal completo (actual o próxima semana) al administrador. Permite **editar campos individuales** directamente en la pantalla (click to edit) y **descargar el menú como PDF**.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `tipo` | `'actual'` \| `'proxima'` | `'actual'` | Qué menú cargar |
| `readOnly` | bool | `false` | Si `true`, oculta botón eliminar y desactiva edición inline |
| `onMenuDeleted` | function | — | Callback cuando se elimina el menú (para que AdminDashboard vuelva al dashboard) |

---

## Edición inline

Al hacer click en cualquier valor del menú, aparece un `<input>` sobre ese campo. Al presionar:
- **Enter** o botón ✓ → guarda en Firestore con `{ merge: true }`.
- **Escape** o botón ✗ → cancela.

El estado `editingField` guarda `{ dia, campo, subCampo }` para identificar exactamente qué campo está en edición.

---

## Generación de PDF (`generarPDF`)

Usa `jsPDF` para crear un PDF estructurado:
- Título "MENÚ SEMANAL" + temporada + semana en el encabezado.
- Un bloque por día con todos los campos de `menuStructure.opciones`.
- Maneja saltos de página automáticos cuando `yPosition > 250`.
- Nombre del archivo: `menu_actual_YYYY-MM-DD.pdf` ó `menu_proxima_semana_YYYY-MM-DD.pdf`.

---

## Conexiones Firebase
- `db` → `menus/menuActual` o `menus/menuProxima` (lectura y escritura)
- `db` → `config/menuStructure` (para saber qué categorías mostrar)

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `AdminDashboard` | Padre; pasa `tipo`, `readOnly`, `onMenuDeleted` |
| `SubirMenu` | Componente que carga/crea el menú que AdminMenu visualiza |
| `Modal` | Confirmación para eliminar menú |
| `Spinner` | Loading mientras carga |

---

---

# 🗂️ MenuStructureManager.jsx

**Ruta**: `src/components/MenuStructureManager.jsx`  
**Acceso**: AdminDashboard → `"estructuraMenu"`

## Propósito
Editor de la **estructura del menú**: gestiona la lista de categorías/opciones que aparecen en el formulario (ej: "Beti Jai", "Pastas", "Light"). Esta lista es usada por `SubirMenu` y `Formulario` para renderizar campos.

---

## Firestore
- Lee/escribe `config/menuStructure`: `{ opciones: string[] }`.

---

## Acciones
- **Agregar opción**: input + botón → actualiza el array y guarda en Firestore.
- **Eliminar opción**: botón 🗑️ con `window.confirm` → filtra el array y guarda.
- **Guardar cambios**: botón general que también persiste en Firestore.

---

## Impacto de cambios
Modificar `config/menuStructure` afecta:
- `SubirMenu`: los inputs del formulario de carga de menú.
- `Formulario`: los campos disponibles al pedir (aunque aquí pesa más `opcionesMenuCascada`).
- `AdminMenu`: los campos visualizados al ver/editar el menú.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `readOnly` | bool | `false` | Oculta botones de agregar/eliminar |
