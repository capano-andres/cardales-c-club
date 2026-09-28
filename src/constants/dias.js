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
