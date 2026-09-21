# 🖼️ ImagenesMenu.jsx

**Ruta**: `src/components/ImagenesMenu.jsx`  
**Acceso**: AdminDashboard → `"imagenesMenu"`

## Propósito
Gestiona el **catálogo central de imágenes de platos**. Cada imagen se asocia a un texto de plato (el nombre tal como aparece en el menú). Estas imágenes se muestran como tooltips en `Formulario.jsx` cuando el usuario elige su pedido.

---

## Arquitectura del catálogo

Las imágenes se guardan en el **proyecto Firebase del catálogo** (`beti-jai-catalogo`), no en el proyecto del cliente. Esto permite compartir la galería entre múltiples proyectos clientes:

```
catalogDb  → config/textoImagenes  = { "Milanesa napolitana": { url, path }, ... }
catalogStorage → platos/milanesa_napolitana_1234567890.jpg
```

---

## Textos de platos

Los textos se extraen automáticamente de los menús activos del cliente (`menus/menuActual` y `menus/menuProxima`). La función `extraerTextos()` parsea todos los campos de cada día:
- Strings simples → un texto.
- Campo `postre` → puede ser `"Flan / Gelatina / Yogurt"` → 3 textos separados.
- Objetos (sandwichMiga, ensaladas) → extrae los valores de string.
- Ignora: `esFeriado`, `hayCambios`, `diasModificados`, campos `_img`.

Además, cualquier texto que ya tenga imagen asociada en el catálogo también aparece, aunque no esté en el menú actual.

---

## Flujo de subida de imagen

```
handleFileChange(texto, file)
  → subirImagen(texto, file)
    → uploadBytesResumable(catalogStorage, path, file)
    → progress tracking: setUploading({ [texto]: pct })
    → onComplete:
        url = getDownloadURL(...)
        borrar imagen anterior (si existe en catalogStorage)
        setDoc(catalogDb, config/textoImagenes, { ...prev, [texto]: { url, path } })
```

---

## Búsqueda y filtrado

- Input de búsqueda filtra la lista de platos por texto (insensible a mayúsculas).
- Tarjetas con preview de imagen, barra de progreso durante subida.
- Estadísticas: N con imagen / M sin imagen.

---

## Agregar texto manualmente

Si un plato no está en el menú activo pero se quiere agregar al catálogo, se puede ingresar manualmente con el input "Agregar plato manualmente".

---

## Props
| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `readOnly` | bool | `false` | Oculta botones de subida y eliminación |

---

## Conexiones Firebase

| Firebase | Colección/Ruta | Uso |
|---|---|---|
| `db` (cliente) | `menus/menuActual`, `menus/menuProxima` | Extrae textos de platos |
| `catalogDb` | `config/textoImagenes` | Lee y escribe el mapa de imágenes |
| `catalogStorage` | `platos/*` | Sube y elimina archivos de imagen |

---

## Relación con otros componentes
| Componente | Relación |
|---|---|
| `Formulario` | Consume `catalogDb/config/textoImagenes` para mostrar tooltips de imágenes |
| `AdminDashboard` | Padre |
| `Modal` | Confirmación de eliminación |
| `Spinner` | Loading inicial |

---

## Normalización de texto para matching

En `Formulario.jsx`, el matching entre el texto del plato en el menú y la clave en `textoImagenes` se hace con `normalizarTexto()`:
```js
t.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // elimina tildes
  .replace(/[^a-z0-9\s]/gi, '')                      // elimina puntuación
  .replace(/\s+/g, ' ')                              // colapsa espacios
```

Por eso si un plato se llama "Milanesa Napolitana" en el menú pero en el catálogo la clave es "milanesa napolitana", se matchean correctamente.
