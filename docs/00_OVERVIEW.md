# 📋 Overview del Proyecto — Beti Jai Sistema de Pedidos

## Descripción general
Sistema web de gestión de pedidos de menú semanal para el comedor "Beti Jai". Los empleados eligen sus opciones de menú día a día; los administradores gestionan menús, pedidos, usuarios y configuración.

---

## Stack tecnológico
- **Frontend**: React + Vite (JSX)
- **Routing**: `react-router-dom` v6
- **Backend / DB**: Firebase (Auth, Firestore, Storage)
- **Exportación**: `xlsx` (Excel), `jsPDF` (PDF)
- **PDF parsing**: `pdfjs-dist`

---

## Firebase — Proyectos y colecciones

### Proyecto principal (`beti-jai` o similar)
| Colección / Documento | Descripción |
|---|---|
| `users/{uid}` | Datos del usuario: email, nombre, apellido, usuario, legajo, rol, bonificacion |
| `pedidos/{id}` | Pedidos activos de usuarios. Campo `tipo`: `"actual"` o `"proxima"` |
| `historial_pedidos/{id}` | Copia histórica de pedidos tras cierre semanal |
| `menus/menuActual` | Menú de la semana en curso |
| `menus/menuProxima` | Menú de la semana próxima |
| `config/fechasLimite` | `inicioPedidos` y `proximaSemana` (Timestamps) |
| `config/precioMenu` | `precio`, `porcentajeBonificacion`, `montoBonificacion` |
| `config/menuStructure` | `opciones: string[]` — categorías del menú (Beti Jai, Pastas, etc.) |
| `config/opcionesMenuCascada` | Menús por día, postres, bebidas (formato cascada de selección) |
| `config/opcionesMenu` | Opciones legacy por día (plano) |
| `config/ultimaRotacion` | Timestamp del último cierre semanal |

### Proyecto catálogo (`beti-jai-catalogo`)
| Colección / Documento | Descripción |
|---|---|
| `config/textoImagenes` | Mapa `{ [textoPlatoNombre]: { url, path } }` — imágenes de platos compartidas |

---

## Roles de usuario
| Rol | Acceso |
|---|---|
| `admin` | Panel completo de administración, escritura total |
| `visor` | Panel admin en modo lectura (no puede editar ni cerrar semana) |
| `usuario` | Solo formulario de pedidos propios |

---

## Rutas de la aplicación (`App.jsx`)
| Ruta | Componente | Protección |
|---|---|---|
| `/` | `Login` + `AutoRedirect` | Pública |
| `/admin` | `AdminDashboard` | `requireAdmin=true` |
| `/admin/cierre-semanal` | `CierreSemanalPage` | `requireAdmin=true` |
| `/menu` | `MenuSelector` | Autenticado, no-admin |
| `/menu/actual` | `Formulario tipo="actual"` | Autenticado, no-admin |
| `/menu/proxima` | `Formulario tipo="proxima"` | Autenticado, no-admin |
| `/menu/editar-usuario` | `EditarUsuario` | Autenticado, no-admin |

---

## Mapa de componentes

```
App
├── AutoRedirect          ← detecta sesión activa y redirige
├── Login                 ← login por email o username
├── ProtectedRoute        ← guard de rutas
│   ├── AdminDashboard    ← hub admin (sección activa por estado)
│   │   ├── AdminMenu           (ver menú actual/próxima)
│   │   ├── SubirMenu           (cargar/editar menú desde PDF o manual)
│   │   ├── MenuStructureManager (gestionar categorías del menú)
│   │   ├── ConfiguracionOpciones (opciones en cascada: menú/postre/bebida)
│   │   ├── ImagenesMenu        (subir imágenes a catálogo central)
│   │   ├── AdminUsers          (CRUD usuarios)
│   │   ├── VerPedidos          (pedidos actuales y próximos)
│   │   │   └── VerPedidosProximaSemana
│   │   ├── HistorialPedidos    (historial por usuario + export Excel)
│   │   ├── PrecioMenu          (configurar precio y bonificaciones)
│   │   ├── CierreSemanal       (rotación semanal de menús y pedidos)
│   │   └── Modal               (diálogos de confirmación)
│   ├── CierreSemanalPage ← wrapper de CierreSemanal como página
│   ├── MenuSelector      ← selector de menú para usuarios
│   ├── Formulario        ← formulario de pedidos (actual o próxima)
│   └── EditarUsuario     ← cambio de contraseña del usuario
└── Spinner / Modal       ← utilitarios globales
```

---

## Flujo semanal típico
1. **Admin sube menú próxima semana** → `SubirMenu` → `menus/menuProxima`
2. **Admin configura fechas** → `AdminDashboard` → `config/fechasLimite`
3. **Usuarios piden** → `Formulario tipo="proxima"` → `pedidos/{id}` (tipo: "proxima")
4. **Admin ve pedidos** → `VerPedidos` / `VerPedidosProximaSemana`
5. **Admin hace cierre semanal** → `CierreSemanal`:
   - pedidos "proxima" → "actual"
   - `menuProxima` → `menuActual`
   - pedidos "actual" previos → `historial_pedidos`
6. **Usuarios piden semana actual** → `Formulario tipo="actual"` → `pedidos/{id}` (tipo: "actual")
