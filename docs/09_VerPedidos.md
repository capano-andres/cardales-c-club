# 📋 VerPedidos.jsx + VerPedidosProximaSemana.jsx

**Ruta**: `src/components/VerPedidos.jsx`  
**Acceso**: AdminDashboard → `"pedidosActual"` o `"pedidosProxima"`

## Propósito
Muestra todos los pedidos de los usuarios para la semana actual o próxima. Permite editar pedidos individuales, eliminar todos los pedidos y exportar a Excel.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `tipo` | `'actual'` \| `'proxima'` \| `'tardio'` | `'actual'` | Si es `'proxima'`, delega en `VerPedidosProximaSemana` |
| `readOnly` | bool | `false` | Oculta botones de edición y eliminación |

---

## Decisión de renderizado
```js
if (tipo === 'proxima') return <VerPedidosProximaSemana readOnly={readOnly} />;
```
`VerPedidos` solo maneja `tipo === 'actual'` directamente. Los pedidos de próxima semana tienen su propio componente.

---

## Datos cargados

| Fuente | Datos |
|---|---|
| `users` | Lista completa de usuarios (excepto admins) |
| `pedidos` donde `tipo == 'actual'` | Pedidos de la semana actual |
| `config/precioMenu` | Precio del menú y porcentaje de bonificación |
| `menus/menuActual` | Menú actual (para mostrar contexto) |
| `config/opcionesMenu` | Legacy (compatibilidad) |
| `config/opcionesMenuCascada` | Para parsear y contar pedidos correctamente |

---

## Vista de pedidos

Para cada usuario (con o sin pedido) muestra una fila con:
- Nombre, Legajo
- Lo que pidió cada día (Lunes–Viernes), o "NO COMPLETÓ" / "NO PIDIÓ"
- Precio total y estado de bonificación
- Botones de edición y eliminación (si no readOnly)

---

## Contadores (`calcularContadores`)

Calcula cuántos usuarios pidieron cada opción por día:
```
{
  conteo: {
    "BETI JAI": { LUNES: 5, MARTES: 3, ... },
    "PASTAS": { ... }
  },
  conteoPostres: { ... },
  conteoBebidas: { ... },
  todasLasOpciones: Map
}
```

Usa `opcionesCascada` para hacer el match correcto entre el string guardado y el nombre de la opción.

---

## Exportación a Excel (`exportarAExcel`)

Genera un archivo `.xlsx` con múltiples hojas:
1. **Pedidos** — una fila por usuario con sus elecciones y precios.
2. **Contadores** — resumen de menús pedidos por tipo y por día.
3. **Bonificaciones** — totales de bonificaciones por tipo.
4. **Postres** — resumen de postres (si los hay).
5. **Bebidas** — resumen de bebidas (si las hay).
6. **Etiquetado Lunes/Martes/...** — hojas de etiquetado: columnas por tipo de menú, filas con nombres de usuarios.

---

## Cálculo de precios

```
bonificacion == true  → 0 (completamente bonificado)
bonificacion == false → precio * (100 - porcentaje) / 100  (parcialmente bonificado)
bonificacion == undefined → precio completo
```

---

## VerPedidosProximaSemana.jsx
- Mismo concepto pero para `tipo == 'proxima'`.
- Carga `pedidos` donde `tipo == 'proxima'`.
- Lógica de edición y visualización idéntica.
- Archivo separado por su tamaño (~1300 líneas cada uno).

---

## Connexiones Firebase
- `db` → `users`, `pedidos`, `menus/menuActual`, `config/precioMenu`, `config/opcionesMenu`, `config/opcionesMenuCascada`

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `AdminDashboard` | Padre; pasa `tipo` y `readOnly` |
| `VerPedidosProximaSemana` | Delegado para `tipo='proxima'` |
| `Modal` | Confirmación de eliminación y edición |
| `Spinner` | Loading |
