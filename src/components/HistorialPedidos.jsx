import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import Modal from './Modal';
import Spinner from './Spinner';
import './HistorialPedidos.css';
import * as XLSX from 'xlsx';

const HistorialPedidos = ({ readOnly = false }) => {
  const [usuarios, setUsuarios] = useState([]); // [{uid, nombre, email, pedidos: []}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [historialSeleccionado, setHistorialSeleccionado] = useState([]);
  const [editandoPedido, setEditandoPedido] = useState(null); // {pedido, modo: 'historial'|'actual'}
  const [formEdit, setFormEdit] = useState({ lunes: '', martes: '', miercoles: '', jueves: '', viernes: '', precioTotal: 0 });
  const [opcionesMenuConfig, setOpcionesMenuConfig] = useState(null);
  const [precioMenuConfig, setPrecioMenuConfig] = useState(null);
  const [opcionesCascada, setOpcionesCascada] = useState(null);
  const editFormRef = useRef(null);

  useEffect(() => {
    cargarUsuariosYHistorial();
    cargarOpcionesMenu();
    cargarPrecioMenu();
    cargarOpcionesCascada();
  }, []);

  useEffect(() => {
    if (editandoPedido && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [editandoPedido]);

  // Calcular precio automáticamente
  useEffect(() => {
    if (editandoPedido) {
      const dias = [formEdit.lunes, formEdit.martes, formEdit.miercoles, formEdit.jueves, formEdit.viernes];
      const precio = dias.filter(dia => dia && dia !== 'no_pedir').length * 1700;
      setFormEdit(prev => ({ ...prev, precioTotal: precio }));
    }
    // eslint-disable-next-line
  }, [formEdit.lunes, formEdit.martes, formEdit.miercoles, formEdit.jueves, formEdit.viernes]);

  // Recargar historial del usuario seleccionado tras editar/eliminar
  const recargarHistorialSeleccionado = async (uidUsuario) => {
    const historialRef = collection(db, 'historial_pedidos');
    const historialSnapshot = await getDocs(historialRef);
    const pedidos = [];
    historialSnapshot.forEach(docu => {
      const data = docu.data();
      if (data.uidUsuario === uidUsuario) {
        pedidos.push({ id: docu.id, ...data });
      }
    });
    pedidos.sort((a, b) => {
      const fechaA = a.fechaPedido?.toDate ? a.fechaPedido.toDate() : new Date(a.fechaPedido);
      const fechaB = b.fechaPedido?.toDate ? b.fechaPedido.toDate() : new Date(b.fechaPedido);
      return fechaB - fechaA;
    });
    setHistorialSeleccionado(pedidos);
    setUsuarioSeleccionado(prev => prev && prev.uid === uidUsuario ? { ...prev } : prev);
  };

  const cargarUsuariosYHistorial = async () => {
    try {
      setLoading(true);
      // 1. Obtener todos los usuarios
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usuariosMap = {};
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        usuariosMap[doc.id] = {
          uid: doc.id,
          nombre: `${data.nombre || ''} ${data.apellido || ''}`.trim() || 'Usuario sin nombre',
          email: data.email || '',
          bonificado: data.bonificacion === true, // Solo true si existe y es true
          pedidos: []
        };
      });

      // 2. Obtener todos los historiales
      const historialRef = collection(db, 'historial_pedidos');
      const historialSnapshot = await getDocs(historialRef);
      historialSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.uidUsuario && usuariosMap[data.uidUsuario]) {
          usuariosMap[data.uidUsuario].pedidos.push({
            id: doc.id,
            ...data
          });
        }
      });

      // 3. Ordenar los historiales de cada usuario por fechaPedido
      Object.values(usuariosMap).forEach(usuario => {
        usuario.pedidos.sort((a, b) => {
          const fechaA = a.fechaPedido?.toDate ? a.fechaPedido.toDate() : new Date(a.fechaPedido);
          const fechaB = b.fechaPedido?.toDate ? b.fechaPedido.toDate() : new Date(b.fechaPedido);
          return fechaB - fechaA;
        });
      });

      // 4. Convertir a array y filtrar solo usuarios con historial
      const usuariosConHistorial = Object.values(usuariosMap).filter(u => u.pedidos.length > 0);
      setUsuarios(usuariosConHistorial);
    } catch (error) {
      console.error('Error al cargar historial:', error);
      setError('Error al cargar el historial de pedidos');
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al cargar el historial: ' + error.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const cargarOpcionesMenu = async () => {
    try {
      const opcionesRef = doc(db, 'config', 'opcionesMenu');
      const opcionesSnap = await getDoc(opcionesRef);
      if (opcionesSnap.exists()) {
        setOpcionesMenuConfig(opcionesSnap.data());
      }
    } catch (error) {
      console.error('Error al cargar opciones de menú:', error);
    }
  };

  const cargarPrecioMenu = async () => {
    try {
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);
      if (precioSnap.exists()) {
        setPrecioMenuConfig(precioSnap.data());
      }
    } catch (error) {
      console.error('Error al cargar configuración de precios:', error);
    }
  };

  const cargarOpcionesCascada = async () => {
    try {
      const cascadaRef = doc(db, 'config', 'opcionesMenuCascada');
      const cascadaSnap = await getDoc(cascadaRef);
      if (cascadaSnap.exists()) {
        setOpcionesCascada(cascadaSnap.data());
      }
    } catch (error) {
      console.error('Error al cargar opciones cascada:', error);
    }
  };

  // Enriquecer el string del pedido con la vianda del menú
  const enrichWithVianda = (pedidoStr, dia, menuDias) => {
    try {
      if (!pedidoStr || !menuDias || !menuDias[dia]) return pedidoStr;
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const diaData = menuDias[dia];
      if (typeof diaData !== 'object' || diaData === null) return pedidoStr;

      // Obtener la lista de menús configurados para este día
      const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
      const diaLabel = labelMap[dia] || dia;
      let menusList = [];
      if (opcionesCascada?.menus) {
        const menusKey = Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(diaLabel)) || diaLabel;
        menusList = opcionesCascada.menus[menusKey] || [];
      }

      // Encontrar qué menú tipo matchea el inicio del pedido
      let menuTipo = '';
      const pedidoUpper = pedidoStr.toUpperCase();
      for (const m of menusList) {
        if (norm(pedidoUpper).startsWith(norm(m))) {
          menuTipo = m;
          break;
        }
      }
      if (!menuTipo) return pedidoStr;

      // Buscar la vianda en menuDias[dia] que corresponda a este tipo de menú
      // Las claves en menuDias[dia] son: opcion1, opcionpebetex2, pastas, light, clasico, etc.
      // Usamos un mapeo explícito nombre→clave para buscar la vianda
      let viandaDesc = '';
      const menuNorm = norm(menuTipo);

      // Mapeo explícito de nombres de menú a claves de Firestore
      const mappings = [
        { names: ['beti jai'], keys: ['opcion1'] },
        { names: ['menu pbt', 'pbt', 'opcion pebete', 'pebete'], keys: ['opcionpebetex2'] },
        { names: ['pastas', 'pasta'], keys: ['pastas', 'pasta'] },
        { names: ['light'], keys: ['light'] },
        { names: ['clasico', 'clásico'], keys: ['clasico'] },
        { names: ['ensalada'], keys: ['ensaladas', 'ensalada'] },
        { names: ['dieta blanda'], keys: ['dietaBlanda', 'dieta_blanda', 'dietablanda'] },
        { names: ['sand de miga', 'sandwich', 'sand miga'], keys: ['sandwichMiga'] },
      ];

      for (const mapping of mappings) {
        if (mapping.names.some(n => menuNorm.includes(norm(n)))) {
          for (const k of mapping.keys) {
            const val = diaData[k];
            if (val && typeof val === 'string') {
              viandaDesc = val;
              break;
            }
            // Handle object values (sandwichMiga has {tipo, cantidad})
            if (val && typeof val === 'object' && val.tipo) {
              viandaDesc = `${val.tipo}. ${val.cantidad || ''} triángulos`.trim();
              break;
            }
          }
          if (viandaDesc) break;
        }
      }

      // Fallback genérico: intentar matchear por nombre de clave normalizado
      if (!viandaDesc) {
        for (const [key, value] of Object.entries(diaData)) {
          if (key === 'esFeriado' || key === 'postre') continue;
          if (typeof value !== 'string') continue;
          const keyNorm = norm(key.replace(/([A-Z])/g, ' $1').trim());
          if (menuNorm.includes(keyNorm) || keyNorm.includes(menuNorm)) {
            viandaDesc = value;
            break;
          }
        }
      }

      if (!viandaDesc) return pedidoStr;

      // Limpiar la descripción de la vianda (tomar solo la primera oración)
      const viandaClean = viandaDesc.split('.')[0].trim();
      if (!viandaClean) return pedidoStr;

      // Insertar la vianda después del nombre del menú
      // "BETI JAI C/FLAN Y COCA" → "BETI JAI (Milanesa con puré) C/FLAN Y COCA"
      const restOfOrder = pedidoStr.substring(menuTipo.length).trim();
      return `${menuTipo} (${viandaClean}) ${restOfOrder}`.trim();
    } catch (error) {
      // En caso de cualquier error, devolver el string original sin enriquecer
      console.error('Error al enriquecer pedido con vianda:', error);
      return pedidoStr;
    }
  };

  const formatearFecha = (timestamp) => {
    if (!timestamp) return 'Fecha desconocida';
    try {
      let dateObj;
      if (timestamp.toDate) {
        dateObj = timestamp.toDate();
      } else if (typeof timestamp === 'string') {
        dateObj = new Date(timestamp);
      } else {
        dateObj = new Date(timestamp);
      }
      return dateObj.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const formatearOpcion = (opcion, dia = null, menuDias = null) => {
    if (!opcion) return 'No seleccionado';
    let pedidoStr = '';
    if (typeof opcion === 'object') {
      if (opcion.pedido === 'no_pedir') return 'No pidió';
      pedidoStr = opcion.pedido?.replace(/_/g, ' ')?.toUpperCase() || '';
    } else {
      if (opcion === 'no_pedir') return 'No pidió';
      pedidoStr = opcion.replace(/_/g, ' ').toUpperCase();
    }
    // Enriquecer con vianda si hay datos del menú disponibles
    if (dia && menuDias) {
      pedidoStr = enrichWithVianda(pedidoStr, dia, menuDias);
    }
    return pedidoStr;
  };

  const formatearMesAnio = (timestamp) => {
    try {
      let dateObj;
      if (timestamp?.toDate) {
        dateObj = timestamp.toDate();
      } else if (typeof timestamp === 'string') {
        dateObj = new Date(timestamp);
      } else {
        dateObj = new Date(timestamp);
      }
      return ` (${dateObj.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })})`;
    } catch {
      return '';
    }
  };

  const formatearSemanaCompleta = (semana) => semana;

  const extraerFechaDeSemana = (nombreSemana) => {
    // Buscar patrones de fecha en el nombre de la semana
    // Ejemplos: "Lunes 17/06/2025 al Jueves 19/06/2025", "Semana del 15 al 19 de enero"
    
    // Patrón 1: DD/MM/YYYY
    const patron1 = /(\d{2})\/(\d{2})\/(\d{4})/;
    const match1 = nombreSemana.match(patron1);
    if (match1) {
      const [, dia, mes, anio] = match1;
      return new Date(anio, mes - 1, dia).getTime();
    }
    
    // Patrón 2: "Semana del DD al DD de mes"
    const patron2 = /Semana del (\d{1,2}) al (\d{1,2}) de (\w+)/;
    const match2 = nombreSemana.match(patron2);
    if (match2) {
      const [, diaInicio, diaFin, mes] = match2;
      const meses = {
        'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
        'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
      };
      const mesNum = meses[mes.toLowerCase()];
      if (mesNum !== undefined) {
        // Usar el año actual o el año de la fecha más reciente
        const anioActual = new Date().getFullYear();
        return new Date(anioActual, mesNum, parseInt(diaInicio)).getTime();
      }
    }
    
    // Si no se puede extraer fecha, retornar null
    return null;
  };

  const calcularPrecioCorrecto = (usuario, pedido) => {
    if (!precioMenuConfig) return pedido.precioTotal || 0;
    
    // Los días son objetos con estructura {pedido: 'valor', esTardio: false}
    const dias = [pedido.lunes, pedido.martes, pedido.miercoles, pedido.jueves, pedido.viernes];
    
    // Filtrar días que tengan pedido y no sea 'no_pedir'
    const diasConPedido = dias.filter(dia => {
      if (!dia) return false;
      // Si es un objeto, verificar la propiedad pedido
      if (typeof dia === 'object' && dia.pedido) {
        return dia.pedido !== 'no_pedir';
      }
      // Si es un string, verificar directamente
      return dia !== 'no_pedir';
    }).length;
    
    // Determinar si el usuario es bonificado
    const esBonificado = usuario.bonificado === true;
    
    if (esBonificado) {
      // Usuario bonificado: precio = 0
      return 0;
    } else {
      // Usuario no bonificado: aplicar el porcentaje de bonificación
      const porcentaje = parseFloat(precioMenuConfig.porcentajeBonificacion) || 70;
      const precioConBonificacion = Math.round(precioMenuConfig.precio * (100 - porcentaje) / 100);
      return diasConPedido * precioConBonificacion;
    }
  };

  const calcularPrecioPorDia = (usuario, dia) => {
    if (!precioMenuConfig) return 0;
    
    // Verificar si el día tiene pedido
    const tienePedido = dia && (
      (typeof dia === 'object' && dia.pedido && dia.pedido !== 'no_pedir') ||
      (typeof dia === 'string' && dia !== 'no_pedir')
    );
    
    if (!tienePedido) return 0;
    
    // Determinar si el usuario es bonificado
    const esBonificado = usuario.bonificado === true;
    
    if (esBonificado) {
      // Usuario bonificado: precio = 0
      return 0;
    } else {
      // Usuario no bonificado: aplicar el porcentaje de bonificación
      const porcentaje = parseFloat(precioMenuConfig.porcentajeBonificacion) || 70;
      const precioConBonificacion = Math.round(precioMenuConfig.precio * (100 - porcentaje) / 100);
      return precioConBonificacion;
    }
  };

  const handleVerHistorial = (usuario) => {
    setUsuarioSeleccionado(usuario);
    setHistorialSeleccionado(usuario.pedidos);
    setModal({
      isOpen: true,
      title: `Historial de ${usuario.nombre}`,
      message: '',
      type: 'info'
    });
  };

  const handleEditarPedido = (pedido, modo) => {
    setEditandoPedido({ pedido, modo });
    setFormEdit({
      lunes: pedido.lunes || '',
      martes: pedido.martes || '',
      miercoles: pedido.miercoles || '',
      jueves: pedido.jueves || '',
      viernes: pedido.viernes || '',
      precioTotal: pedido.precioTotal || 0
    });
  };

  const handleChangeEdit = (e) => {
    const { name, value } = e.target;
    setFormEdit(prev => ({ ...prev, [name]: value }));
  };

  const handleGuardarEdicion = async () => {
    try {
      if (!editandoPedido) return;
      const { pedido, modo } = editandoPedido;
      if (modo === 'historial') {
        // Actualizar en historial_pedidos
        const ref = doc(db, 'historial_pedidos', pedido.id);
        await updateDoc(ref, {
          lunes: formEdit.lunes,
          martes: formEdit.martes,
          miercoles: formEdit.miercoles,
          jueves: formEdit.jueves,
          viernes: formEdit.viernes,
          precioTotal: Number(formEdit.precioTotal)
        });
        await recargarHistorialSeleccionado(pedido.uidUsuario);
      } else if (modo === 'actual') {
        // Buscar si ya existe un pedido actual para este usuario
        const pedidosRef = collection(db, 'pedidos');
        const q = query(pedidosRef, where('uidUsuario', '==', pedido.uidUsuario), where('tipo', '==', 'actual'));
        const querySnapshot = await getDocs(q);
        let ref;
        if (!querySnapshot.empty) {
          // Actualizar el primero encontrado
          ref = doc(db, 'pedidos', querySnapshot.docs[0].id);
        } else {
          // Crear uno nuevo con un ID único
          ref = doc(pedidosRef);
        }
        await setDoc(ref, {
          ...pedido,
          lunes: formEdit.lunes,
          martes: formEdit.martes,
          miercoles: formEdit.miercoles,
          jueves: formEdit.jueves,
          viernes: formEdit.viernes,
          precioTotal: Number(formEdit.precioTotal),
          tipo: 'actual',
          uidUsuario: pedido.uidUsuario
        }, { merge: true });
      }
      setEditandoPedido(null);
      setModal({ isOpen: true, title: 'Éxito', message: 'Pedido actualizado correctamente.', type: 'success' });
      cargarUsuariosYHistorial();
    } catch (error) {
      alert('Error al guardar los cambios: ' + error.message);
    }
  };

  const handleEliminarPedidoHistorial = async (pedidoId) => {
    const pedido = historialSeleccionado.find(p => p.id === pedidoId);
    setModal({
      isOpen: true,
      title: 'Confirmar eliminación',
      message: '¿Estás seguro de que deseas eliminar este registro del historial?',
      type: 'warning',
      actions: [
        {
          label: 'Cancelar',
          type: 'secondary',
          onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
        },
        {
          label: 'Eliminar',
          type: 'danger',
          onClick: async () => {
            try {
              await deleteDoc(doc(db, 'historial_pedidos', pedidoId));
              setModal({ isOpen: true, title: 'Eliminado', message: 'Registro eliminado correctamente.', type: 'success' });
              await recargarHistorialSeleccionado(pedido.uidUsuario);
              cargarUsuariosYHistorial();
            } catch (error) {
              setModal({
                isOpen: true,
                title: 'Error',
                message: 'Error al eliminar el registro: ' + error.message,
                type: 'error'
              });
            }
          }
        }
      ]
    });
  };

  const exportarAExcel = () => {
    try {
      // Obtener todas las semanas únicas del historial
      const todasLasSemanas = new Set();
      usuarios.forEach(usuario => {
        usuario.pedidos.forEach(pedido => {
          // Incluir pedidos del historial que tengan semana
          if (pedido.semana) {
            todasLasSemanas.add(pedido.semana);
          }
        });
      });

      // Ordenar las semanas cronológicamente (por fecha)
      const semanasOrdenadas = Array.from(todasLasSemanas).sort((a, b) => {
        // Extraer fechas de los nombres de semana
        const fechaA = extraerFechaDeSemana(a);
        const fechaB = extraerFechaDeSemana(b);
        
        if (fechaA && fechaB) {
          return fechaA - fechaB; // Orden cronológico
        }
        
        // Si no se pueden extraer fechas, usar orden alfabético como fallback
        return a.localeCompare(b);
      });



      // Preparar los datos para el Excel
      const datosExcel = usuarios
        .sort((a, b) => a.nombre.localeCompare(b.nombre)) // Ordenar usuarios alfabéticamente
        .map(usuario => {
          // Crear objeto base solo con nombre
          const filaUsuario = {
            'Nombre': usuario.nombre
          };

          // Agregar columnas para cada semana (5 columnas por semana: Lunes a Viernes)
          semanasOrdenadas.forEach(semana => {
            // Encontrar el pedido correspondiente a esta semana
            const pedidoSemana = usuario.pedidos.find(pedido => {
              return pedido.semana === semana;
            });

            // Crear 5 columnas para los días de la semana
            const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
            nombresDias.forEach((dia, index) => {
              const columnaKey = `${semana}_${dia}`;
              
              if (pedidoSemana) {
                const dias = [pedidoSemana.lunes, pedidoSemana.martes, pedidoSemana.miercoles, pedidoSemana.jueves, pedidoSemana.viernes];
                const precioDia = calcularPrecioPorDia(usuario, dias[index]);
                filaUsuario[columnaKey] = Number(precioDia);
              } else {
                filaUsuario[columnaKey] = 0;
              }
            });
          });

          return filaUsuario;
        });

      // Detectar columnas que tienen solo valores 0
      const columnasConDatos = new Set();
      const todasLasColumnas = new Set();
      
      // Obtener todas las columnas posibles
      semanasOrdenadas.forEach(semana => {
        const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
        nombresDias.forEach(dia => {
          todasLasColumnas.add(`${semana}_${dia}`);
        });
      });

      // Verificar qué columnas tienen al menos un valor mayor a 0
      datosExcel.forEach(fila => {
        todasLasColumnas.forEach(columna => {
          if (fila[columna] && fila[columna] > 0) {
            columnasConDatos.add(columna);
          }
        });
      });

      // Crear array ordenado de columnas (por semana y luego por día)
      const columnasOrdenadas = ['Nombre'];
      semanasOrdenadas.forEach(semana => {
        const columnasSemana = Array.from(columnasConDatos).filter(columna => {
          const [semanaColumna] = columna.split('_');
          return semanaColumna === semana;
        });
        
        if (columnasSemana.length > 0) {
          // Ordenar columnas por día
          const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
          columnasSemana.sort((a, b) => {
            const [, diaA] = a.split('_');
            const [, diaB] = b.split('_');
            return nombresDias.indexOf(diaA) - nombresDias.indexOf(diaB);
          });
          
          columnasOrdenadas.push(...columnasSemana);
        }
      });

      // Filtrar datos para incluir solo columnas con datos en el orden correcto
      const datosFiltrados = datosExcel.map(fila => {
        const filaFiltrada = {};
        
        // Incluir columnas en el orden correcto
        columnasOrdenadas.forEach(columna => {
          filaFiltrada[columna] = fila[columna] || 0;
        });
        
        return filaFiltrada;
      });

      // Crear el libro de Excel (empezar desde la fila 2 para dejar espacio a los encabezados)
      const ws = XLSX.utils.json_to_sheet(datosFiltrados, { origin: 'A2' });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Resumen de Pedidos");

      // Crear encabezados combinados para las semanas (solo para columnas con datos)
      const merges = [];
      let colIndex = 1; // Empezar después de la columna "Nombre"
      
      // Agrupar columnas por semana
      const columnasPorSemana = new Map();
      columnasConDatos.forEach(columna => {
        const [semana, dia] = columna.split('_');
        if (!columnasPorSemana.has(semana)) {
          columnasPorSemana.set(semana, []);
        }
        columnasPorSemana.get(semana).push({ dia, columna });
      });
      
      // Crear encabezados para cada semana que tenga datos (en orden cronológico)
      semanasOrdenadas.forEach(semana => {
        const columnasSemana = columnasPorSemana.get(semana);
        if (columnasSemana && columnasSemana.length > 0) {
          // Ordenar columnas por día (Lunes, Martes, Miércoles, Jueves, Viernes)
          const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
          columnasSemana.sort((a, b) => {
            return nombresDias.indexOf(a.dia) - nombresDias.indexOf(b.dia);
          });
          
          // Combinar celda para el nombre de la semana
          merges.push({
            s: { r: 0, c: colIndex }, // Fila 0, columna colIndex
            e: { r: 0, c: colIndex + columnasSemana.length - 1 } // Fila 0, columna final
          });
          
          // Agregar el nombre de la semana en la celda combinada
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
          ws[cellRef] = { v: semana, s: { alignment: { horizontal: 'center' } } };
          
          // Agregar encabezados de días en la segunda fila
          columnasSemana.forEach((col, index) => {
            const diaCellRef = XLSX.utils.encode_cell({ r: 1, c: colIndex + index });
            ws[diaCellRef] = { v: col.dia, s: { alignment: { horizontal: 'center' } } };
          });
          
          colIndex += columnasSemana.length; // Avanzar según la cantidad de columnas con datos
        }
      });
      
      // Agregar los merges al worksheet
      ws['!merges'] = merges;

      // Ajustar el ancho de las columnas
      const wscols = columnasOrdenadas.map(columna => {
        return columna === 'Nombre' ? {wch: 30} : {wch: 15};
      });
      ws['!cols'] = wscols;

      // Guardar el archivo
      XLSX.writeFile(wb, "resumen_pedidos_detallado.xlsx");
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al generar el archivo Excel: ' + error.message,
        type: 'error',
        actions: [
          {
            label: 'Cerrar',
            type: 'primary',
            onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
          }
        ]
      });
    }
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="historial-container">
      <div className="historial-header">
        <h2>Historial de Pedidos (por usuario)</h2>
        <button 
          className="exportar-excel-btn" 
          onClick={exportarAExcel}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          Exportar a Excel
        </button>
      </div>
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      >
        {/* Contenido del historial individual */}
        {usuarioSeleccionado && (
          <div className="historial-modal-content">
            <h3>{usuarioSeleccionado.nombre} ({usuarioSeleccionado.email})</h3>
            {historialSeleccionado.length === 0 ? (
              <div>No hay pedidos en el historial</div>
            ) : (
              <div className="pedidos-grid">
                {historialSeleccionado.map((pedido) => (
                  // console.log('DEBUG pedido:', pedido),
                  <div key={pedido.id} className="pedido-card">
                    <div className="pedido-header">
                      <h4>Pedido del {formatearFecha(pedido.fechaPedido || pedido.fechaCreacion)}</h4>
                      <span className="tipo-pedido">
                        {pedido.semana
                          ? `Semana: ${formatearSemanaCompleta(pedido.semana)}`
                          : (pedido.tipo === 'actual' ? 'Semana Actual' : 'Próxima Semana')}
                      </span>
                    </div>
                    <div className="pedido-dias">
                      <div className="dia-pedido"><strong>Lunes:</strong> {formatearOpcion(pedido.lunes, 'lunes', pedido.menuDias)}</div>
                      <div className="dia-pedido"><strong>Martes:</strong> {formatearOpcion(pedido.martes, 'martes', pedido.menuDias)}</div>
                      <div className="dia-pedido"><strong>Miércoles:</strong> {formatearOpcion(pedido.miercoles, 'miercoles', pedido.menuDias)}</div>
                      <div className="dia-pedido"><strong>Jueves:</strong> {formatearOpcion(pedido.jueves, 'jueves', pedido.menuDias)}</div>
                      <div className="dia-pedido"><strong>Viernes:</strong> {formatearOpcion(pedido.viernes, 'viernes', pedido.menuDias)}</div>
                    </div>
                    <div className="pedido-footer">
                      <span className="precio-total">Total: ${pedido.precioTotal || 0}</span>
                    </div>
                    {!readOnly && (
                      <div style={{marginTop: '1rem', display: 'flex', gap: '0.5rem'}}>
                        <button className="ver-historial-btn" onClick={() => handleEditarPedido(pedido, 'historial')}>Modificar en historial</button>
                        <button className="ver-historial-btn" style={{background:'#b22222'}} onClick={() => handleEliminarPedidoHistorial(pedido.id)}>Eliminar del historial</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Modal de edición */}
        {!readOnly && editandoPedido && (
          <div className="editar-pedido-modal" ref={editFormRef}>
            <h4>Editar pedido ({editandoPedido.modo === 'historial' ? 'Historial' : 'Pedido Actual'})</h4>
            <form onSubmit={e => {e.preventDefault(); handleGuardarEdicion();}} style={{display:'flex', flexDirection:'column', gap:'0.5rem'}}>
              <label>Lunes:
                <select name="lunes" value={formEdit.lunes} onChange={handleChangeEdit} className="select-edit">
                  <option value="">Selecciona una opción</option>
                  {opcionesMenuConfig?.Lunes
                    ?.sort((a, b) => {
                      if (a === "NO PEDIR") return -1;
                      if (b === "NO PEDIR") return 1;
                      return a.localeCompare(b);
                    })
                    .map((opcion, index) => (
                      <option key={index} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                        {opcion}
                      </option>
                    ))}
                </select>
              </label>
              <label>Martes:
                <select name="martes" value={formEdit.martes} onChange={handleChangeEdit} className="select-edit">
                  <option value="">Selecciona una opción</option>
                  {opcionesMenuConfig?.Martes
                    ?.sort((a, b) => {
                      if (a === "NO PEDIR") return -1;
                      if (b === "NO PEDIR") return 1;
                      return a.localeCompare(b);
                    })
                    .map((opcion, index) => (
                      <option key={index} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                        {opcion}
                      </option>
                    ))}
                </select>
              </label>
              <label>Miércoles:
                <select name="miercoles" value={formEdit.miercoles} onChange={handleChangeEdit} className="select-edit">
                  <option value="">Selecciona una opción</option>
                  {opcionesMenuConfig?.['Miércoles']
                    ?.sort((a, b) => {
                      if (a === "NO PEDIR") return -1;
                      if (b === "NO PEDIR") return 1;
                      return a.localeCompare(b);
                    })
                    .map((opcion, index) => (
                      <option key={index} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                        {opcion}
                      </option>
                    ))}
                </select>
              </label>
              <label>Jueves:
                <select name="jueves" value={formEdit.jueves} onChange={handleChangeEdit} className="select-edit">
                  <option value="">Selecciona una opción</option>
                  {opcionesMenuConfig?.Jueves
                    ?.sort((a, b) => {
                      if (a === "NO PEDIR") return -1;
                      if (b === "NO PEDIR") return 1;
                      return a.localeCompare(b);
                    })
                    .map((opcion, index) => (
                      <option key={index} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                        {opcion}
                      </option>
                    ))}
                </select>
              </label>
              <label>Viernes:
                <select name="viernes" value={formEdit.viernes} onChange={handleChangeEdit} className="select-edit">
                  <option value="">Selecciona una opción</option>
                  {opcionesMenuConfig?.Viernes
                    ?.sort((a, b) => {
                      if (a === "NO PEDIR") return -1;
                      if (b === "NO PEDIR") return 1;
                      return a.localeCompare(b);
                    })
                    .map((opcion, index) => (
                      <option key={index} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                        {opcion}
                      </option>
                    ))}
                </select>
              </label>
              <label>Precio Total: <input name="precioTotal" type="number" value={formEdit.precioTotal} onChange={handleChangeEdit} className="input-edit" /></label>
              <div style={{display:'flex', gap:'1rem', marginTop:'1rem'}}>
                <button type="submit" className="ver-historial-btn">Guardar</button>
                <button type="button" className="ver-historial-btn" style={{background:'#888'}} onClick={()=>setEditandoPedido(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}
      </Modal>
      {usuarios.length === 0 ? (
        <div className="no-pedidos">No hay historiales de pedidos</div>
      ) : (
        <table className="tabla-historial-usuarios">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Cantidad de Pedidos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(usuario => (
              <tr key={usuario.uid}>
                <td>{usuario.nombre}</td>
                <td>{usuario.email}</td>
                <td>{usuario.pedidos.length}</td>
                <td>
                  <button className="ver-historial-btn" onClick={() => handleVerHistorial(usuario)}>
                    Ver historial
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default HistorialPedidos; 