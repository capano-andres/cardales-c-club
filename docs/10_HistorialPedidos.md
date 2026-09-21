# 📊 HistorialPedidos.jsx

**Ruta**: `src/components/HistorialPedidos.jsx`  
**Acceso**: AdminDashboard → `"historial"`

## Propósito
Visualiza el historial de todos los pedidos pasados por usuario. Permite ver detalle de cada semana, editar registros del historial y exportar un resumen financiero por semana en Excel.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `readOnly` | bool | `false` | Oculta botones de edición y eliminación |

---

## Datos cargados

| Fuente | Datos |
|---|---|
| `users` | Todos los usuarios (para cruzar con el historial) |
| `historial_pedidos` | Todos los registros históricos |
| `config/opcionesMenu` | Para los selects de edición de pedido |
| `config/precioMenu` | Precio y porcentaje de bonificación |
| `config/opcionesMenuCascada` | Para enriquecer visualización con viandas |

---

## Estructura del historial por usuario

```
[
  {
    uid, nombre, email, bonificado,
    pedidos: [
      { id, lunes, martes, miercoles, jueves, viernes, precioTotal, semana, fechaPedido, menuDias, ... }
    ]
  }
]
```

Solo se muestran usuarios que tienen al menos un pedido en el historial.

---

## Enriquecimiento con vianda (`enrichWithVianda`)

Cuando un pedido tiene `menuDias` guardado (desde `CierreSemanal`), el historial puede mostrar el nombre real de la vianda junto al tipo de menú. Ejemplo:
- Guardado: `"BETI JAI C/POSTRE Y COCA"`
- Mostrado: `"BETI JAI (Milanesa napolitana) C/POSTRE Y COCA"`

Usa mappings explícitos de nombre de menú a clave Firestore para buscar la descripción en `menuDias[dia]`.

---

## Modal de detalle por usuario

Al clickear "Ver Historial" → abre un `<Modal>` con:
- Lista de pedidos del usuario ordenados por fecha (más reciente primero).
- Para cada pedido: días, semana, precio total.
- Botones "Modificar en historial" y "Eliminar del historial" (si no readOnly).

---

## Edición de pedidos (`handleEditarPedido`)

```
modo = 'historial' → updateDoc en historial_pedidos/{id}
modo = 'actual'    → setDoc en pedidos/{uid} tipo "actual"
```

El formulario de edición usa selects con las opciones de `opcionesMenuConfig`.

---

## Exportación Excel (`exportarAExcel`)

Genera una hoja de cálculo con encabezados combinados por semana:

```
| Nombre | Semana X_Lunes | Semana X_Martes | ... | Semana Y_Lunes | ... |
|--------|----------------|-----------------|-----|----------------|-----|
| Juan   |     1920       |       0         | ... |     1920       | ... |
```

- Solo incluye columnas que tienen al menos un valor > 0.
- Ordena semanas cronológicamente extrayendo fechas de los nombres.
- Intenta extraer fechas del formato `DD/MM/YYYY` o `Semana del DD al DD de mes`.

---

## Conexiones Firebase
- `db` → `users`, `historial_pedidos`, `pedidos`, `config/opcionesMenu`, `config/precioMenu`, `config/opcionesMenuCascada`

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `AdminDashboard` | Padre |
| `CierreSemanal` | Es quien llena `historial_pedidos` con los datos de cierre |
| `Modal` | Vista de detalle y confirmaciones |
| `Spinner` | Loading |
