// Fuente única de verdad para la semana de servicio (lunes a domingo, 7 días).
export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export const DIA_LABELS = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

// Índice de Date.getDay() (0=domingo..6=sábado) -> clave de día.
export const JSDAY_TO_KEY = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Posición del día dentro de la semana de servicio (lunes=0 ... domingo=6).
export function ordenEnSemana(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function claveDelDia(jsDay) {
  return DIAS_SEMANA[ordenEnSemana(jsDay)];
}

// Sábado y domingo tienen una estructura de menú fija y distinta a la de lunes-viernes:
// solo Menú A, Menú B, Opción Pebete y Dieta Blanda (sin postre). Un feriado con vianda usa
// la misma estructura. Las claves coinciden con las que resuelve el parser de PDF.
export const CAMPOS_FINDE_SEMANA = [
  { key: 'menuA', label: 'Menú A' },
  { key: 'menuB', label: 'Menú B' },
  { key: 'menupbtx2', label: 'Opción Pebete' },
  { key: 'dietablanda', label: 'Dieta Blanda' },
];
export const CLAVES_FINDE = CAMPOS_FINDE_SEMANA.map((c) => c.key);

export const esFinDeSemana = (dia) => dia === 'sabado' || dia === 'domingo';

// Un feriado tiene vianda si el día trae al menos un campo de fin de semana cargado;
// si esos campos están vacíos, es un feriado sin servicio.
export const feriadoConServicio = (diaData) =>
  !!diaData?.esFeriado &&
  CLAVES_FINDE.some((k) => typeof diaData[k] === 'string' && diaData[k].trim() !== '');

export const feriadoSinServicio = (diaData) => !!diaData?.esFeriado && !feriadoConServicio(diaData);

// Día "tipo fin de semana": sábado, domingo o feriado con vianda.
export const esDiaTipoFinde = (dia, diaData) => esFinDeSemana(dia) || feriadoConServicio(diaData);

// Clave de día cuya lista de menús (config/opcionesMenuCascada.menus) corresponde usar.
// Un feriado con vianda de entre semana usa la lista del sábado.
export const claveMenusDelDia = (dia, diaData) =>
  feriadoConServicio(diaData) && !esFinDeSemana(dia) ? 'sabado' : dia;
