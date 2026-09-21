# 📝 Formulario.jsx

**Ruta**: `src/components/Formulario.jsx`  
**Rutas de app**: `/menu/actual` y `/menu/proxima`

## Propósito
Formulario de pedidos semanal para empleados. Muestra el menú de la semana (actual o próxima) y permite al usuario elegir sus opciones día a día con un sistema de selección en cascada: **Menú → Postre → Bebida**.

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `tipo` | `'actual'` \| `'proxima'` | `'actual'` | Qué menú/semana mostrar |
| `readOnly` | bool | `false` | La versión readOnly nunca se usa desde App.jsx, pero está disponible |

---

## Datos cargados al iniciar

| Fuente Firestore | Uso |
|---|---|
| `config/menuStructure` | Define qué categorías existen (Beti Jai, Pastas, etc.) |
| `config/opcionesMenu` | Opciones legacy/planas (compatibilidad) |
| `catalogDb/config/textoImagenes` | Mapa `{ nombrePlato: { url } }` del catálogo central |
| `config/opcionesMenuCascada` | Menús por día, postres, bebidas (selección en cascada) |
| `config/fechasLimite` | `inicioPedidos` y `proximaSemana` para validar si el pedido está disponible |
| `menus/menuActual` o `menus/menuProxima` | Contenido del menú de la semana |
| `users/{uid}` | Datos del usuario activo (nombre, legajo, bonificación) |
| `pedidos` donde `uidUsuario == uid` y `tipo == tipo` | Pedido previo del usuario (para pre-rellenar) |
| `config/precioMenu` | Precio del menú y porcentaje de bonificación |

---

## Lógica de disponibilidad temporal

### Tipo `'proxima'`
- Sólo disponible si `ahora >= fechaInicio` y `ahora <= fechaLimite`.
- Si `ahora < fechaInicio` → muestra mensaje "Todavía no".
- Si `ahora > fechaLimite` → muestra mensaje tardío.

### Tipo `'actual'`
- Disponible según reglas de días y horario:
  - Los días pasados de la semana están bloqueados.
  - El día actual está disponible sólo hasta las **8:30 hs** (hora Argentina).
  - Si ya es tarde, el usuario puede pedir "tardío" (flag `esTardio`).

---

## Sistema de selección en cascada

El usuario elige para cada día de lunes a viernes:
1. **Menú** → lista de opciones del día (`opcionesMenuCascada.menus[dia]`)
2. **Postre** → depende del día y del menú elegido (`opcionesMenuCascada.postres` / `postresPorDia`)
3. **Bebida** → lista global (`opcionesMenuCascada.bebidas`)

La selección del día se guarda en el estado `seleccion`:
```js
{
  lunes: { menu: '', postre: '', bebida: '' },
  martes: { menu: '', postre: '', bebida: '' },
  // ...
}
```

Al guardar, se concatena como string: `"BETI JAI C/POSTRE Y COCA"`.

---

## Imágenes con tooltip

El componente carga `textoImagenes` del catálogo central. Para cada plato del menú, si el texto coincide (normalizado: sin tildes, sin puntuación, lowercase) con alguna clave en `textoImagenes`, muestra un **tooltip con la imagen del plato** al hacer hover. Al hacer clic en la imagen se abre un **lightbox** a pantalla completa.

---

## Guardado del pedido

Al hacer submit, `setDoc` en Firestore:
```json
{
  "uidUsuario": "uid",
  "nombre": "...",
  "legajo": "...",
  "tipo": "actual" | "proxima",
  "lunes": { "pedido": "BETI JAI C/POSTRE Y COCA", "esTardio": false },
  "martes": { "pedido": "no_pedir", "esTardio": false },
  ...
  "precioTotal": 1920,
  "fechaCreacion": "...",
  "semana": "Lunes 17 al Viernes 21"
}
```

---

## Precio calculado

```
Si bonificacion == true  → precio = 0
Si bonificacion == false → precio = precioMenu * (100 - porcentaje) / 100
Si bonificacion == undefined → precio = precioMenu (completo)
```

---

## Conexiones
| Módulo | Relación |
|---|---|
| `firebase.js → db` | Firestore principal |
| `firebase.js → catalogDb` | Catálogo de imágenes |
| `Modal` | Confirmaciones y alertas |
| `Spinner` | Loading inicial |
| `MenuSelector` | Componente padre que navega aquí |

---

## Notas
- El componente es el más extenso del proyecto (~1800 líneas) y combina visualización del menú + formulario de selección.
- La normalización de texto para buscar imágenes usa `normalizarTexto()`: elimina tildes, puntuación y colapsa espacios.
- El `id` del pedido en Firestore es el `uid` del usuario (un solo pedido activo por usuario por tipo).
