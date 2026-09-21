# 🔄 CierreSemanal.jsx + CierreSemanalPage.jsx

**Ruta**: `src/components/CierreSemanal.jsx` · `src/components/CierreSemanalPage.jsx`  
**Ruta de app**: `/admin/cierre-semanal`

## Propósito
Ejecuta el **cierre semanal**: archiva los pedidos actuales en el historial, rota el menú de próxima semana al actual, y convierte los pedidos de próxima semana en pedidos actuales.

---

## CierreSemanalPage.jsx

Wrapper simple que:
- Renderiza un header con título y descripción.
- Incluye un botón "←" para volver a `/admin`.
- Renderiza `<CierreSemanal />`.

---

## CierreSemanal.jsx — Lógica de cierre

### Disponibilidad
Solo disponible si la hora actual es ≥ 8:00 hs (verificado con `verificarHorarioCierre()`).

### Operación `cerrarSemanaYGuardarHistorial()`

```
1. Obtener menuActual  →  existe?
2. Obtener menuProxima →  no existe? → abortar

3. Si existe menuActual:
   a. Cargar config/opcionesMenuCascada  (para enriquecer pedidos con vianda)
   b. Para cada pedido tipo="actual":
      - Enriquecer cada día: insertar la vianda del menú en el string del pedido
        Ej: "BETI JAI C/POSTRE" → "BETI JAI / MILANESA NAPOLITANA C/POSTRE"
      - Guardar en historial_pedidos (con menuDias, semana, corteSemana: true)
   c. Eliminar todos los pedidos tipo="actual"

4. Copiar menuProxima → menuActual (setDoc)

5. Cambiar tipo de pedidos "proxima" → "actual"

6. Eliminar menuProxima

7. Actualizar config/ultimaRotacion con Timestamp.now()
```

---

## Enriquecimiento de pedidos (`enrichPedidoStr`)

Al archivar en historial, el string del pedido se enriquece con la descripción de la vianda del menú:

**Antes**: `"BETI JAI C/POSTRE Y COCA"`  
**Después**: `"BETI JAI / MILANESA NAPOLITANA C/POSTRE Y COCA"`

Usa mappings explícitos de tipo de menú → clave Firestore:
```js
{ names: ['beti jai'], keys: ['opcion1'] }
{ names: ['pastas', 'pasta'], keys: ['pastas', 'pasta'] }
{ names: ['light'], keys: ['light'] }
// etc.
```

---

## ¿Diferencia con `handleFinalizarPedidos` en AdminDashboard?

| | CierreSemanal | handleFinalizarPedidos (AdminDashboard) |
|---|---|---|
| **Archiva en historial** | ✅ Sí, con enriquecimiento de vianda y `menuDias` | ✅ Sí (sin enriquecimiento) |
| **Rota menú** | ✅ Sí (próxima → actual, elimina próxima) | ✅ Sí |
| **Convierte pedidos próxima** | ✅ Sí (proxima → actual) | ✅ Sí |
| **Primera semana sin menú actual** | ✅ Maneja el caso | ❌ Aborta si no hay pedidos próxima |
| **Uso recomendado** | **Operación de cierre semanal real** | Operación alternativa (legacy) |

`CierreSemanal` es la operación correcta y más completa.

---

## Estado interno
| Estado | Descripción |
|---|---|
| `isLoading` | Muestra "Procesando..." en el botón |
| `status` | Mensaje de resultado visible en pantalla |
| `modal` | Confirmación de "¿Estás seguro?" |
| `puedeCerrar` | `true` si hora >= 8:00 |

---

## Conexiones Firebase
- `db` → `menus/menuActual`, `menus/menuProxima`, `pedidos`, `historial_pedidos`, `config/opcionesMenuCascada`, `config/ultimaRotacion`

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `CierreSemanalPage` | Wrapper de página; lo renderiza |
| `AdminDashboard` | Navega a `/admin/cierre-semanal` con `useNavigate` |
| `HistorialPedidos` | Lee `historial_pedidos` que este componente genera |
| `Modal` | Confirmación de cierre |
