# 📦 SubirMenu.jsx

**Ruta**: `src/components/SubirMenu.jsx`  
**Acceso**: AdminDashboard → sección `"subirMenu"`

## Propósito
Permite al administrador **cargar o editar el menú semanal** (actual o próxima semana). Soporta dos modos de entrada:
1. **Carga desde PDF**: extrae automáticamente los datos del menú usando un parser local.
2. **Entrada manual**: formulario editable campo por campo.

---

## Flujo principal

```
SubirMenu
  ├── Carga config/menuStructure  (para saber qué campos mostrar)
  ├── Modo PDF: handlePdfUpload()
  │   ├── pdfjs-dist extrae texto visual del PDF (con separadores "|")
  │   ├── parseMenuFromText() → parsea sin IA → rellena formulario
  │   ├── (fallback anterior: processMenuWithGPT → GPT-4o)
  │   └── Campos vacíos → muestra advertencia con lista de faltantes
  ├── Formulario editable por día
  │   └── renderDiaInputs(dia) → un input por opción de menuStructure.opciones
  └── handleSubmit()
      ├── isNewMenu = true  → setDoc(menus/menuActual o menus/menuProxima)
      └── isNewMenu = false → merge en menus/menuActual (edición parcial)
```

---

## Parser local de PDF (`parseMenuFromText`)

Parsea el texto extraído del PDF sin necesidad de API externa. Estrategia:
1. Construye un mapa de categorías desde `menuStructure.opciones`.
2. Busca líneas que empiecen con nombres de día (`LUNES`, `MARTES`...) para saber el día activo.
3. Para cada línea dentro de un día, intenta hacer match con una categoría conocida.
4. Si no hay match y hay categoría activa, concatena como continuación de la descripción.
5. Las líneas de postres (`POSTRE`) detienen la extracción de categorías.

El PDF se procesa con `pdfjs-dist` usando ordenamiento geométrico (posición Y/X de cada elemento de texto), insertando separadores `|` entre columnas visuales para ayudar al parser.

---

## Estado interno principal

| Estado | Descripción |
|---|---|
| `menuData` | Objeto `{ semana, temporada, dias: { lunes: {...}, ... } }` |
| `menuStructure` | `{ opciones: string[] }` — cargado de Firestore |
| `isNewMenu` | Si `true`, sube como nuevo menú; si `false`, edita el actual |
| `menuType` | `'actual'` o `'proxima'` (cuando `isNewMenu = true`) |
| `diasModificados` | Lista de días cambiados respecto al original (para edición) |
| `isPdfLoading` | Muestra spinner mientras procesa el PDF |

---

## Estructura de datos guardada en Firestore

```json
{
  "semana": "SEMANA 1",
  "temporada": "VERANO 2025",
  "dias": {
    "lunes": {
      "esFeriado": false,
      "betijai": "Milanesa napolitana",
      "pastas": "Canelones de ricota",
      "light": "Ensalada de pollo",
      "postre": "Flan"
    },
    "martes": { ... },
    ...
  },
  "ultimaModificacion": Timestamp,
  "tipo": "proxima",
  "esNuevo": true
}
```

Las claves de cada opción se generan con `opcion.toLowerCase().replace(/ /g, '')`.

---

## Fallback GPT (no activo por defecto)

`processMenuWithGPT` existe pero no se llama en el flujo normal. En su momento se usaba para enviar el texto del PDF a la API de OpenAI (`gpt-4o`) con un prompt estructurado que incluía el schema exacto de Firestore. Actualmente el parser local cubre la mayoría de los casos.

---

## Conexiones
| Módulo | Relación |
|---|---|
| `firebase.js → db` | Lee `config/menuStructure`; escribe `menus/menuActual` o `menus/menuProxima` |
| `AdminDashboard` | Padre; renderiza este componente en `activeSection === 'subirMenu'` |
| `Modal` | Alertas de éxito, error y advertencias de campos vacíos |
| `Spinner` | Loading mientras carga la estructura |
| `pdfjs-dist` | Extracción de texto de PDFs |

---

## Notas
- `menuStructure` es la fuente de verdad para qué campos aparecen en el formulario. Si cambia la estructura (vía `MenuStructureManager`), el formulario se adapta automáticamente.
- Cuando `isNewMenu = false` (modo edición), usa `merge: true` en Firestore para no sobrescribir campos no modificados.
