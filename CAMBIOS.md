# Registro de cambios — Beti Jai (Cardales C. Club)

Resumen de los cambios hechos en el sistema de pedidos hasta el 2026-09-29.

## 1. Usuarios

- Creación masiva de los usuarios del personal en Firebase a partir del Excel del
  cliente (usuario = parte del mail antes del `@`, contraseña = legajo).
- Excel de credenciales generado para entregar al área administrativa.
- Eliminada la función de "cambiar contraseña" — este cliente no la va a usar.

## 2. Seguridad

- `admin.txt` (credenciales de acceso a la app) agregado al `.gitignore`. Nunca se sube
  al repositorio.

## 3. Semana completa (lunes a domingo)

- El sistema pasó de manejar lunes a viernes a manejar los **7 días de la semana**,
  porque este cliente también tiene viandas sábado y domingo.
- Se creó `src/constants/dias.js` como fuente única de los días de la semana, usado en
  todos los componentes (formulario de pedido, subida de menú, reportes, admin, etc.).
- El parser de PDF, la configuración del admin, los reportes y el formulario de
  pedido del empleado se actualizaron para soportar los 7 días.

## 4. Eliminación del "pedido tardío"

- Se sacó por completo el corte de las 8:30am, el badge/alerta de "Tarde" y el
  checkbox manual de pedido tardío en el panel de admin.
- Se mantuvo la config de "Fecha de inicio" / "Fecha límite" del admin, que se usa para
  otra cosa: habilitar el botón "Próxima Semana" en la pantalla principal.

## 5. Menú A / Menú B (sábado y domingo)

- Sábado y domingo tienen su propia estructura fija de 4 opciones: **Menú A**, **Menú B**,
  Opción Pebete y Dieta Blanda (sin postre ningún día del fin de semana).
- En "Subir Menú" se agregaron campos de texto manuales para cargar Menú A y Menú B.
- El parser de PDF reconoce "MENÚ A:" / "MENÚ B:" igual que ya hacía con Beti Jai y
  Dieta Blanda.
- Se configuró en Firestore (`config/opcionesMenuCascada`) la lista real de opciones
  para Sábado y Domingo.

## 6. Bebidas opcionales

- Este cliente no ofrece bebidas. Se agregó el mismo manejo que ya existía para el
  postre: si no hay bebidas configuradas, el pedido en cascada salta ese paso en vez de
  bloquear el envío del pedido completo.

## 7. Mejoras al parser de PDF (Subir Menú)

- Detección automática de días **feriados** dentro del PDF (antes había que marcarlos
  a mano en cada carga).
- La validación de "campos vacíos" ahora compara contra los campos correctos según el
  día (los 4 del fin de semana o los de entre semana), en vez de exigir siempre la
  lista completa de categorías los 7 días.
- Reconocimiento más flexible de la ensalada: ahora toma la línea "ENSALADA:" del PDF
  aunque no diga literalmente "Ensalada Completa".

## 8. Visualización del menú semanal

- Arreglado: los nombres de los platos aparecían pegados sin espacios (ej. "Menupbtx2"
  en vez de "Menu PBT X 2"). Ahora se usa el nombre real configurado en "Gestionar
  Estructura del Menú".
- Arreglado: las opciones de postre se mostraban una debajo de la otra sin ningún
  separador. Ahora se muestran en una sola línea separadas por "/" (ej. "PASTA FROLA /
  YOGURT / GELATINA"), sin perder la foto de cada plato al pasar el mouse.

## 9. Cierre semanal (rotación de menús)

- El mecanismo real de rotación es el botón **"Cerrar semana y guardar historial"**
  (sigue siendo 100% manual, no automático).
- Restringido para que solo pueda usarse **los lunes desde las 8:00hs** — cualquier
  otro día el botón queda deshabilitado.
- Arreglado: si un admin tenía abierta la pantalla de "Pedidos Próxima Semana" (o
  "Pedidos Semana Actual") mientras se hacía el cierre en otra pestaña, no se
  actualizaba sola. Ahora esas pantallas se refrescan automáticamente al terminar el
  cierre.
- Confirmado que el cierre semanal sí archiva los pedidos de la semana en el
  "Historial de Pedidos" antes de reemplazar el menú, y que ya soporta sábado/domingo
  y Menú A/B correctamente.
- Arreglado un bug ya existente: el pedido de "Opción Pebete" / "Menu PBT X 2" nunca
  quedaba guardado en el historial con la descripción real del plato (por una clave de
  Firestore mal escrita en el código). Afectaba tanto a los pedidos de entre semana
  como a los del fin de semana.
