# ⚙️ ConfiguracionOpciones.jsx

**Ruta**: `src/components/ConfiguracionOpciones.jsx`  
**Acceso**: AdminDashboard → `"configuracionOpciones"`

## Propósito
Gestiona las opciones en **cascada** que aparecen en el formulario de pedidos (`Formulario.jsx`): menús disponibles por día, postres y bebidas.

Esta es la pieza de configuración más importante para el flujo de pedidos: define exactamente qué puede elegir el usuario en cada paso de la selección.

---

## Firestore
- Lee/escribe `config/opcionesMenuCascada`

### Estructura del documento
```json
{
  "menus": {
    "Lunes": ["BETI JAI", "PASTAS", "LIGHT", ...],
    "Martes": ["BETI JAI", "CLASICO", ...],
    "Miércoles": [...],
    "Jueves": [...],
    "Viernes": [...]
  },
  "postres": ["C/GELATINA", "C/POSTRE", "C/YOGURT"],
  "postresPorDia": {
    "Lunes": ["C/GELATINA", "C/POSTRE", "C/YOGURT"],
    "Martes": [...],
    ...
  },
  "bebidas": ["AGUA CON GAS", "COCA", "SPRITE", ...],
  "postreDesdeMenu": {
    "Lunes": true,
    "Martes": true,
    ...
  }
}
```

---

## Secciones del editor

### 1. Menús por día
- Tabs para cada día de la semana.
- Lista de menús disponibles ese día (chips editables).
- Botón "Copiar a todos los días" para replicar la configuración de un día a todos.
- Edición inline con doble-click en un chip.

### 2. Postres
- **Modo automático** (`postreDesdeMenu[dia] = true`): el postre `C/POSTRE` se extrae directamente del menú del día. Los fijos (gelatina, yogurt) vienen de la lista global `postres`.
- **Modo manual** (`postreDesdeMenu[dia] = false`): postres configurados específicamente para ese día desde `postresPorDia[dia]`.
- Toggle por día individual.

### 3. Bebidas
- Lista global (misma para todos los días).
- Chips editables con doble-click.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `readOnly` | bool | `false` | Oculta todo el sistema de edición (visor) |

---

## Relación con otros componentes

| Componente | Cómo usa `opcionesMenuCascada` |
|---|---|
| `Formulario` | Muestra los menús/postres/bebidas disponibles por día |
| `VerPedidos` | Usa la lista de menús para parsear y contar pedidos |
| `VerPedidosProximaSemana` | Ídem |
| `HistorialPedidos` | Usa menúsList para enriquecer la visualización con la vianda |
| `CierreSemanal` | Carga la cascada para enriquecer pedidos en el historial |

---

## Valores por defecto (si no existe el documento)
```js
MENUS_DEFAULT = ['BETI JAI', 'CLASICO', 'DIETA BLANDA', 'ENSALADA', 'LIGHT', 'MENU PBT X 2', 'PASTAS', 'SAND DE MIGA']
POSTRES_DEFAULT = ['C/GELATINA', 'C/POSTRE', 'C/YOGURT']
BEBIDAS_DEFAULT = ['AGUA CON GAS', 'AGUA SIN GAS', 'AQUARIOS MANZANA', 'COCA', 'COCA ZERO', 'SPRITE']
```

---

## Notas
- La migración de `postreDesdeMenu: boolean` (viejo) a `postreDesdeMenu: { [dia]: boolean }` (nuevo) se maneja automáticamente al cargar.
- Al crear el documento por primera vez, se generan las estructuras por defecto.
