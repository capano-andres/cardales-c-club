# 🏠 AdminDashboard.jsx

**Ruta**: `src/components/AdminDashboard.jsx`  
**Ruta de app**: `/admin`

## Propósito
Panel de administración principal. Es un **hub** de navegación: en lugar de cargar páginas separadas, usa un estado `activeSection` para mostrar/ocultar sub-componentes dentro de la misma pantalla.

---

## Props
| Prop | Tipo | Descripción |
|---|---|---|
| `userRole` | string | `"admin"` o `"visor"`. Inyectado por `ProtectedRoute` vía `React.cloneElement` |

---

## Estado interno principal
| Estado | Descripción |
|---|---|
| `activeSection` | Qué sección mostrar (`'dashboard'`, `'subirMenu'`, `'verMenu'`, etc.) |
| `modal` | Config del Modal general de confirmación |
| `fechaLimite` / `fechaLimiteInput` | Fecha tope para pedidos próxima semana |
| `fechaInicio` / `fechaInicioInput` | Fecha a partir de la cual se habilita pedir próxima semana |
| `fechaLimiteMaxima` | Calculada automáticamente: viernes de la semana de `fechaInicio` |

---

## Sub-componentes que renderiza

```
activeSection
├── 'dashboard'           → Botones del panel principal
├── 'subirMenu'           → <SubirMenu />
├── 'menu'                → <MenuForm /> (legacy, comentado)
├── 'verMenu'             → <AdminMenu tipo="actual" />
├── 'verMenuProxima'      → <AdminMenu tipo="proxima" />
├── 'usuarios'            → <AdminUsers />
├── 'pedidosActual'       → <VerPedidos tipo="actual" />
├── 'pedidosProxima'      → <VerPedidos tipo="proxima" />
├── 'pedidosTardios'      → <VerPedidos tipo="tardio" /> (comentado)
├── 'historial'           → <HistorialPedidos />
├── 'estructuraMenu'      → <MenuStructureManager />
├── 'precioMenu'          → <PrecioMenu />
├── 'configuracionOpciones' → <ConfiguracionOpciones />
└── 'imagenesMenu'        → <ImagenesMenu />
```

---

## Botones del dashboard y acceso según rol

| Botón | Sección | ¿Solo admin? |
|---|---|---|
| Menú Semana Actual | `verMenu` | No (visor también) |
| Subir Menú / Editar Menú | `subirMenu` | **Sí** (oculto a visor) |
| Menú Próxima Semana | `verMenuProxima` | No |
| Gestionar Estructura del Menú | `estructuraMenu` | No |
| Historial de Pedidos | `historial` | No |
| Configurar Opciones del Menú | `configuracionOpciones` | No |
| Imágenes de Menús | `imagenesMenu` | No |
| Pedidos Semana Actual | `pedidosActual` | No |
| Usuarios | `usuarios` | No |
| Pedidos Próxima Semana | `pedidosProxima` | No |
| Cierre Semanal | navega a `/admin/cierre-semanal` | **Sí** |
| Configurar Fechas | modal interno | **Sí** |
| Configurar Precio Menú | `precioMenu` | No |
| Cerrar Sesión | `signOut` + navega `/` | Siempre visible |

El flag `isVisor = userRole === 'visor'` oculta botones y pasa `readOnly={true}` a sub-componentes.

---

## Operación: Finalizar Pedidos
`handleFinalizarPedidos()` — operación atómica que:
1. Obtiene todos los pedidos `tipo == "proxima"` de Firestore.
2. Los actualiza a `tipo == "actual"` y agrega `fechaFinalizacion`.
3. Los copia a `historial_pedidos` con flag `corteSemana: true`.
4. Copia `menus/menuProxima` → `menus/menuActual`.
5. Elimina `menus/menuProxima`.

> ⚠️ Esta operación es diferente al **Cierre Semanal** (`CierreSemanal.jsx`). Actualmente el botón "Cierre Semanal" del dashboard navega a la página `/admin/cierre-semanal` que usa `CierreSemanal.jsx`.

---

## Configuración de fechas
El modal de fechas edita `config/fechasLimite` en Firestore:
```json
{
  "inicioPedidos": Timestamp,
  "proximaSemana": Timestamp
}
```
- `inicioPedidos`: desde cuándo pueden pedir para la próxima semana.
- `proximaSemana`: fecha límite para pedir.
- La fecha límite máxima se calcula automáticamente como el viernes de la semana de inicio.

---

## Conexiones Firebase
- `auth` → `signOut`
- `db` → `config/fechasLimite`, `pedidos`, `historial_pedidos`, `menus/menuActual`, `menus/menuProxima`

---

## Componentes relacionados
| Componente | Relación |
|---|---|
| `ProtectedRoute` | Padre; inyecta `userRole` |
| `Modal` | Diálogos de confirmación y el modal de fechas |
| Todos los sub-componentes | Renderizados condicionalmente según `activeSection` |
| `CierreSemanalPage` | Página separada navegada con `useNavigate('/admin/cierre-semanal')` |
