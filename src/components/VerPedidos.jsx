import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, doc, getDoc, deleteDoc, where, updateDoc, addDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import Spinner from './Spinner';
import VerPedidosProximaSemana from './VerPedidosProximaSemana';
import './VerPedidos.css';

const VerPedidos = ({ tipo = 'actual', readOnly = false }) => {
  // Si el tipo es 'proxima', renderizar el componente VerPedidosProximaSemana
  if (tipo === 'proxima') {
    return <VerPedidosProximaSemana readOnly={readOnly} />;
  }

  const [pedidos, setPedidos] = useState([]);
  const [contadores, setContadores] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hayMenu, setHayMenu] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [editingUser, setEditingUser] = useState(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', type: 'info', actions: [] });
  const [menuData, setMenuData] = useState(null);
  const [precioMenu, setPrecioMenu] = useState(0);
  const [porcentajeBonificacion, setPorcentajeBonificacion] = useState(70);
  const [isPrecioLoaded, setIsPrecioLoaded] = useState(false);
  const [isMenuLoaded, setIsMenuLoaded] = useState(false);
  const [isPedidosLoaded, setIsPedidosLoaded] = useState(false);
  const [opcionesMenuConfig, setOpcionesMenuConfig] = useState(null);
  const [opcionesCascada, setOpcionesCascada] = useState(null);
  const [editSeleccion, setEditSeleccion] = useState({});
  const [filtroNombre, setFiltroNombre] = useState('');

  const diasSemana = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const diasSemanaFirestore = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  const cargarPedidos = async () => {
    try {
      setLoading(true);
      setError(null);

      // Obtener todos los usuarios registrados de la colección users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      // Crear un mapa de usuarios (excluyendo al administrador)
      const usuarios = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        if (userData.rol !== 'admin') {
          usuarios.set(doc.id, {
            id: doc.id,
            nombre: `${userData.nombre || ''} ${userData.apellido || ''}`.trim() || 'Usuario sin nombre',
            email: userData.email,
            legajo: userData.legajo || 'Sin asignar',
            bonificacion: userData.bonificacion // Preservar el valor original (true, false, o undefined)
          });
        }
      });

      // Obtener los pedidos según el tipo
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('tipo', '==', 'actual'));
      const pedidosSnapshot = await getDocs(q);

      // Crear un mapa de los pedidos más recientes por usuario
      const pedidosPorUsuario = new Map();
      const pedidosOrdenados = pedidosSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          const fechaA = a.fechaCreacion ? new Date(a.fechaCreacion) : new Date(0);
          const fechaB = b.fechaCreacion ? new Date(b.fechaCreacion) : new Date(0);
          return fechaB - fechaA;
        });

      pedidosOrdenados.forEach(pedido => {
        if (!pedidosPorUsuario.has(pedido.uidUsuario)) {
          pedidosPorUsuario.set(pedido.uidUsuario, pedido);
        }
      });

      // Crear lista final de usuarios con sus pedidos
      const usuariosConPedidos = Array.from(usuarios.values())
        .map(usuario => {
          const pedido = pedidosPorUsuario.get(usuario.id);

          // Calcular el precio total basado en los pedidos y la bonificación
          let precioTotal = 0;
          if (pedido) {
            diasSemana.forEach(dia => {
              const diaData = pedido[dia];
              if (diaData && diaData.pedido && !esNoPedir(diaData.pedido)) {
                if (usuario.bonificacion === true) {
                  // Si está completamente bonificado, el precio es 0
                  precioTotal += 0;
                } else if (usuario.bonificacion === false) {
                  // Si tiene bonificación parcial, aplicar el porcentaje
                  const porcentaje = parseFloat(porcentajeBonificacion) || 70;
                  const precioConBonificacion = Math.round(precioMenu * (100 - porcentaje) / 100);
                  precioTotal += precioConBonificacion;
                } else {
                  // Si no tiene la propiedad bonificacion (undefined), precio completo
                  precioTotal += precioMenu;
                }
              }
            });
          }

          return {
            id: usuario.id,
            nombre: usuario.nombre,
            legajo: usuario.legajo,
            fecha: pedido ? pedido.fechaCreacion : '',
            lunesData: pedido ? pedido.lunes : null,
            martesData: pedido ? pedido.martes : null,
            miercolesData: pedido ? pedido.miercoles : null,
            juevesData: pedido ? pedido.jueves : null,
            viernesData: pedido ? pedido.viernes : null,
            tienePedido: !!pedido,
            precioTotal: precioTotal,
            bonificacion: usuario.bonificacion
          };
        })
        .filter(usuario => usuario !== null);

      // Ordenar alfabéticamente por nombre
      usuariosConPedidos.sort((a, b) => a.nombre.localeCompare(b.nombre));

      setPedidos(usuariosConPedidos);
      setIsPedidosLoaded(true);
    } catch (error) {
      setError(`Error al cargar la información: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cargarMenu = async () => {
    try {
      const menuRef = doc(db, 'menus', 'menuActual');
      const menuDoc = await getDoc(menuRef);

      if (menuDoc.exists()) {
        setMenuData(menuDoc.data());
        setHayMenu(true);
      } else {
        setHayMenu(false);
      }
      setIsMenuLoaded(true);
    } catch (error) {
      setError('Error al cargar el menú');
    }
  };

  const cargarPrecioMenu = async () => {
    try {
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);
      if (precioSnap.exists()) {
        const data = precioSnap.data();
        setPrecioMenu(data.precio || 0);
        setPorcentajeBonificacion(data.porcentajeBonificacion ?? 70);
      }
      setIsPrecioLoaded(true);
    } catch (error) {
      setPrecioMenu(0);
      setPorcentajeBonificacion(70);
      setIsPrecioLoaded(true);
    }
  };

  const cargarOpcionesMenu = async () => {
    try {
      const opcionesRef = doc(db, 'config', 'opcionesMenu');
      const opcionesSnap = await getDoc(opcionesRef);
      if (opcionesSnap.exists()) {
        const opcionesData = opcionesSnap.data();
        setOpcionesMenuConfig(opcionesData);
      }
    } catch (error) {
      setError('Error al cargar opciones de menú');
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

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        await cargarPrecioMenu();
        await cargarMenu();
        await cargarOpcionesMenu();
        await cargarOpcionesCascada();
        await cargarPedidos();
      } catch (error) {
        setError('Error al cargar los datos iniciales');
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();

    const handlePedidosActualizados = () => {
      cargarPedidos();
    };

    window.addEventListener('pedidosActualizados', handlePedidosActualizados);

    return () => {
      window.removeEventListener('pedidosActualizados', handlePedidosActualizados);
    };
  }, [precioMenu]);

  const limpiarPedidosActuales = async () => {
    setModal({
      isOpen: true,
      title: 'Confirmar eliminación',
      message: '¿Estás seguro de que deseas eliminar todos los pedidos? Esta acción no se puede deshacer.',
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
          onClick: confirmarEliminacion
        }
      ]
    });
  };

  const confirmarEliminacion = async () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
    setIsDeleting(true);
    try {
      const pedidosRef = collection(db, 'pedidos');
      const pedidosSnapshot = await getDocs(pedidosRef);

      if (pedidosSnapshot.empty) {
        setModal({
          isOpen: true,
          title: 'Sin pedidos',
          message: 'No hay pedidos para eliminar',
          type: 'info'
        });
        return;
      }

      for (const doc of pedidosSnapshot.docs) {
        await deleteDoc(doc.ref);
      }

      setModal({
        isOpen: true,
        title: 'Éxito',
        message: `Se han eliminado ${pedidosSnapshot.size} pedidos correctamente`,
        type: 'success'
      });

      await cargarPedidos();
    } catch (error) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al eliminar los pedidos: ' + error.message,
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const calcularContadores = (pedidosData) => {
    const conteo = {};
    const conteoPostres = {};
    const conteoBebidas = {};
    const labelsUnicos = new Map();
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Función para extraer menú, postre y bebida de un pedido
    const extraerPartes = (pedidoStr, dia) => {
      if (!pedidoStr || esNoPedir(pedidoStr)) return null;

      if (opcionesCascada) {
        const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
        const menusKey = Object.keys(opcionesCascada.menus || {}).find(k => norm(k) === norm(labelMap[dia])) || labelMap[dia];
        const menusList = opcionesCascada.menus?.[menusKey] || [];

        let menuEncontrado = pedidoStr.toUpperCase();
        let postre = '';
        let bebida = '';

        // Separar bebida por " Y "
        const yIndex = pedidoStr.lastIndexOf(' Y ');
        if (yIndex !== -1) {
          bebida = pedidoStr.substring(yIndex + 3).trim().toUpperCase();
          const menuYPostre = pedidoStr.substring(0, yIndex).trim();

          // Buscar cuál menú matchea
          for (const m of menusList) {
            if (norm(menuYPostre).startsWith(norm(m))) {
              menuEncontrado = m.toUpperCase();
              postre = menuYPostre.substring(m.length).trim().toUpperCase();
              break;
            }
          }
        } else {
          // Sin " Y ", solo buscar el menú
          for (const m of menusList) {
            if (norm(pedidoStr).startsWith(norm(m))) {
              menuEncontrado = m.toUpperCase();
              break;
            }
          }
        }

        return { menu: menuEncontrado, postre, bebida };
      }

      // Fallback viejo
      const index = diasSemana.indexOf(dia);
      const diaFirestore = diasSemanaFirestore[index];
      if (opcionesMenuConfig?.[diaFirestore]) {
        for (const label of opcionesMenuConfig[diaFirestore]) {
          if (label.trim().toUpperCase() === 'NO PEDIR COMIDA ESTE DIA') continue;
          const value = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
          if (value === pedidoStr) return { menu: label, postre: '', bebida: '' };
        }
      }
      return { menu: pedidoStr.toUpperCase().replace(/_/g, ' '), postre: '', bebida: '' };
    };

    // Contar los pedidos por menú/postre/bebida y día
    pedidosData.forEach(usuario => {
      diasSemana.forEach((dia, index) => {
        const diaData = usuario[`${dia}Data`];
        if (!diaData) return;
        const opcion = diaData.pedido;
        if (opcion && !esNoPedir(opcion)) {
          const partes = extraerPartes(opcion, dia);
          if (partes) {
            const diaCompleto = diasSemanaFirestore[index].toUpperCase();

            // Contar menú
            if (!conteo[partes.menu]) {
              conteo[partes.menu] = { LUNES: 0, MARTES: 0, 'MIÉRCOLES': 0, JUEVES: 0, VIERNES: 0 };
            }
            conteo[partes.menu][diaCompleto]++;
            const labelNorm = partes.menu.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            if (!labelsUnicos.has(labelNorm)) {
              labelsUnicos.set(labelNorm, partes.menu);
            }

            // Contar postre
            if (partes.postre) {
              if (!conteoPostres[partes.postre]) {
                conteoPostres[partes.postre] = { LUNES: 0, MARTES: 0, 'MIÉRCOLES': 0, JUEVES: 0, VIERNES: 0 };
              }
              conteoPostres[partes.postre][diaCompleto]++;
            }

            // Contar bebida
            if (partes.bebida) {
              if (!conteoBebidas[partes.bebida]) {
                conteoBebidas[partes.bebida] = { LUNES: 0, MARTES: 0, 'MIÉRCOLES': 0, JUEVES: 0, VIERNES: 0 };
              }
              conteoBebidas[partes.bebida][diaCompleto]++;
            }
          }
        }
      });
    });
    return { conteo, conteoPostres, conteoBebidas, todasLasOpciones: labelsUnicos };
  };

  useEffect(() => {
    if (pedidos.length > 0) {
      const resultado = calcularContadores(pedidos);
      setContadores(resultado);
    }
  }, [pedidos, opcionesMenuConfig]);

  // Parsear un string de pedido (ej: "Menu1 Postre1 Y Bebida1") a sus componentes
  const parseSeleccionFromPedido = (pedidoStr, diaLabel) => {
    if (!pedidoStr || esNoPedir(pedidoStr)) {
      return { menu: 'NO PEDIR', postre: '', bebida: '' };
    }
    if (!opcionesCascada) return { menu: '', postre: '', bebida: '' };

    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const menusKey = opcionesCascada.menus ? (Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(diaLabel)) || diaLabel) : diaLabel;
    const menusList = opcionesCascada.menus?.[menusKey] || [];
    const postresList = opcionesCascada.postres || [];
    const bebidasList = opcionesCascada.bebidas || [];

    // El formato es: "{menu} {postre} Y {bebida}"
    // Intentar matchear buscando " Y " para separar la bebida
    const yIndex = pedidoStr.lastIndexOf(' Y ');
    if (yIndex === -1) {
      // Formato antiguo o sin cascada, intentar encontrar el menú en la lista
      const menuMatch = menusList.find(m => norm(pedidoStr).startsWith(norm(m)));
      return { menu: menuMatch || pedidoStr, postre: '', bebida: '' };
    }

    const bebida = pedidoStr.substring(yIndex + 3).trim();
    const menuYPostre = pedidoStr.substring(0, yIndex).trim();

    // Buscar cuál menú de la lista matchea el inicio del string
    let menuEncontrado = '';
    let postreEncontrado = '';
    for (const m of menusList) {
      if (norm(menuYPostre).startsWith(norm(m))) {
        menuEncontrado = m;
        postreEncontrado = menuYPostre.substring(m.length).trim();
        break;
      }
    }

    // Si no encontramos el menú exacto, intentar con el postre
    if (!menuEncontrado) {
      for (const p of postresList) {
        const pIdx = norm(menuYPostre).lastIndexOf(norm(p));
        if (pIdx > 0) {
          menuEncontrado = menuYPostre.substring(0, pIdx).trim();
          postreEncontrado = p;
          break;
        }
      }
    }

    if (!menuEncontrado) {
      menuEncontrado = menuYPostre;
    }

    return {
      menu: menuEncontrado,
      postre: postreEncontrado,
      bebida: bebida
    };
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return 'Fecha desconocida';
    try {
      // Firestore Timestamp
      if (fecha.seconds) {
        return new Date(fecha.seconds * 1000).toLocaleString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      // String ISO
      if (typeof fecha === 'string') {
        return new Date(fecha).toLocaleString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      // Date object
      if (fecha instanceof Date) {
        return fecha.toLocaleString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return 'Fecha desconocida';
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const esNoPedir = (valor) => {
    if (!valor) return true;
    if (valor === 'no_pedir') return true;
    if (typeof valor === 'string' && valor.trim().toUpperCase().normalize('NFD').replace(/\u0300-\u036f/g, '') === 'NO PEDIR COMIDA ESTE DIA') return true;
    return false;
  };

  const formatearOpcion = (opcion) => {
    if (!opcion) return 'NO COMPLETÓ';
    if (typeof opcion === 'object') {
      if (esNoPedir(opcion.pedido)) return 'NO PIDIÓ';
      // El pedido ahora es un string concatenado tipo "Menu Postre Y Bebida"
      const menuLabel = opcion.pedido.toUpperCase().replace(/_/g, ' ');
      return opcion.esTardio ? `${menuLabel} (Pedido Tarde)` : menuLabel;
    }
    if (esNoPedir(opcion)) return 'NO PIDIÓ';
    return opcion.toUpperCase().replace(/_/g, ' ');
  };

  const esPedidoTardio = (opcion) => {
    if (!opcion) return false;
    if (typeof opcion === 'object') {
      return opcion.esTardio === true;
    }
    return false;
  };

  const exportarAExcel = () => {
    // Preparar los datos de pedidos para Excel
    const datosPedidos = pedidos.map(usuario => {
      // Calcular cantidad de menús pedidos en la semana
      const cantidadMenus = diasSemana.reduce((total, dia) => {
        const diaData = usuario[`${dia}Data`];
        return total + (diaData && diaData.pedido && !esNoPedir(diaData.pedido) ? 1 : 0);
      }, 0);

      // Calcular el precio que paga el usuario
      const precioUsuario = usuario.bonificacion ? 0 : Math.round(precioMenu * (100 - parseFloat(porcentajeBonificacion)) / 100);
      const precioTotalUsuario = cantidadMenus * precioUsuario;

      // Calcular bonificación (diferencia entre precio completo y lo que paga el usuario)
      const bonificacionTotal = (cantidadMenus * precioMenu) - precioTotalUsuario;

      return {
        'Nombre': usuario.nombre,
        'Legajo': usuario.legajo,
        'Fecha': usuario.fecha ? formatearFecha(usuario.fecha) : '',
        'Lunes': usuario.lunesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.lunesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.lunesData)),
        'Martes': usuario.martesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.martesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.martesData)),
        'Miércoles': usuario.miercolesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.miercolesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.miercolesData)),
        'Jueves': usuario.juevesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.juevesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.juevesData)),
        'Viernes': usuario.viernesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.viernesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.viernesData)),
        'Cantidad de Pedidos': cantidadMenus,
        'Precio con Bonificaciones': usuario.tienePedido ? (usuario.precioTotal || 0) : 0,
        'Bonificacion Total': bonificacionTotal,
        'Precio Completo': cantidadMenus * precioMenu
      };
    });

    // Preparar los datos de contadores para Excel
    let datosContadores = [];

    // Mostrar todas las opciones únicas de Firestore en el resumen, agrupadas por tipo base
    const opcionesResumen = Array.from(contadores?.todasLasOpciones?.values() || [])
      .filter(label => !label.toUpperCase().includes('NO PEDIR')) // Filtrar NO PEDIR
      .sort((a, b) => a.localeCompare(b));

    // Agrupar menús por tipo base (sin el postre)
    const menusPorTipo = {};
    const totales = { LUNES: 0, MARTES: 0, MIÉRCOLES: 0, JUEVES: 0, VIERNES: 0, TOTAL: 0 };

    opcionesResumen.forEach(label => {
      // Extraer el nombre base del menú (antes de "C/")
      const menuBase = label.includes('C/') ? label.split('C/')[0].trim() : label;

      // Obtener los contadores para este label específico
      const fila = (contadores?.conteo && contadores.conteo[label]) || { LUNES: 0, MARTES: 0, MIÉRCOLES: 0, JUEVES: 0, VIERNES: 0 };

      // Si no existe este tipo base, crearlo
      if (!menusPorTipo[menuBase]) {
        menusPorTipo[menuBase] = { LUNES: 0, MARTES: 0, MIÉRCOLES: 0, JUEVES: 0, VIERNES: 0 };
      }

      // Sumar los contadores al tipo base
      menusPorTipo[menuBase].LUNES += fila.LUNES;
      menusPorTipo[menuBase].MARTES += fila.MARTES;
      menusPorTipo[menuBase].MIÉRCOLES += fila.MIÉRCOLES;
      menusPorTipo[menuBase].JUEVES += fila.JUEVES;
      menusPorTipo[menuBase].VIERNES += fila.VIERNES;

      // Sumar a los totales generales
      totales.LUNES += fila.LUNES;
      totales.MARTES += fila.MARTES;
      totales.MIÉRCOLES += fila.MIÉRCOLES;
      totales.JUEVES += fila.JUEVES;
      totales.VIERNES += fila.VIERNES;
    });

    // Convertir el objeto agrupado a array para Excel
    Object.entries(menusPorTipo).forEach(([menuBase, conteos]) => {
      const totalFila = conteos.LUNES + conteos.MARTES + conteos.MIÉRCOLES + conteos.JUEVES + conteos.VIERNES;
      totales.TOTAL += totalFila;

      datosContadores.push({
        'MENU': menuBase,
        'LUNES': conteos.LUNES,
        'MARTES': conteos.MARTES,
        'MIÉRCOLES': conteos.MIÉRCOLES,
        'JUEVES': conteos.JUEVES,
        'VIERNES': conteos.VIERNES,
        'TOTAL': totalFila
      });
    });

    // Ordenar por MENU alfabéticamente
    datosContadores.sort((a, b) =>
      a.MENU.trim().normalize('NFD').replace(/\u0300-\u036f/g, '').toLowerCase()
        .localeCompare(
          b.MENU.trim().normalize('NFD').replace(/\u0300-\u036f/g, '').toLowerCase()
        )
    );

    // Preparar datos del resumen de bonificaciones
    const menusCompletamenteBonificados = pedidos.reduce((total, usuario) => {
      if (usuario.bonificacion) {
        return total + diasSemana.reduce((subtotal, dia) => {
          const diaData = usuario[`${dia}Data`];
          return subtotal + (diaData && diaData.pedido && !esNoPedir(diaData.pedido) ? 1 : 0);
        }, 0);
      }
      return total;
    }, 0);

    const menusBonificacionParcial = pedidos.reduce((total, usuario) => {
      if (!usuario.bonificacion) {
        return total + diasSemana.reduce((subtotal, dia) => {
          const diaData = usuario[`${dia}Data`];
          return subtotal + (diaData && diaData.pedido && !esNoPedir(diaData.pedido) ? 1 : 0);
        }, 0);
      }
      return total;
    }, 0);

    // Calcular valores totales
    const valorTotalCompletamenteBonificados = menusCompletamenteBonificados * precioMenu;
    const precioConBonificacion = Math.round(precioMenu * (100 - parseFloat(porcentajeBonificacion)) / 100);
    const bonificacionNormalTotal = menusBonificacionParcial * (precioMenu - precioConBonificacion);
    const totalAbonarBetiJai = (menusCompletamenteBonificados + menusBonificacionParcial) * precioMenu;

    const datosBonificaciones = [
      {
        'Tipo de Bonificación': 'Menús Completamente Bonificados',
        'Cantidad': menusCompletamenteBonificados,
        'Total Bonificaciones': valorTotalCompletamenteBonificados,
        'Total a Abonar Beti Jai': menusCompletamenteBonificados * precioMenu
      },
      {
        'Tipo de Bonificación': 'Menús con Bonificación Parcial',
        'Cantidad': menusBonificacionParcial,
        'Total Bonificaciones': bonificacionNormalTotal,
        'Total a Abonar Beti Jai': menusBonificacionParcial * precioMenu
      },
      {
        'Tipo de Bonificación': 'Total de Menús',
        'Cantidad': menusCompletamenteBonificados + menusBonificacionParcial,
        'Total Bonificaciones': valorTotalCompletamenteBonificados + bonificacionNormalTotal,
        'Total a Abonar Beti Jai': totalAbonarBetiJai
      }
    ];

    // Crear el libro de trabajo y las hojas
    const wb = XLSX.utils.book_new();
    const wsPedidos = XLSX.utils.json_to_sheet(datosPedidos);
    const wsContadores = XLSX.utils.json_to_sheet(datosContadores);
    const wsBonificaciones = XLSX.utils.json_to_sheet(datosBonificaciones);

    // Crear hojas de Resumen de Postres y Bebidas
    let wsPostres = null;
    let wsBebidas = null;

    if (contadores?.conteoPostres && Object.keys(contadores.conteoPostres).length > 0) {
      const datosPostres = Object.entries(contadores.conteoPostres)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([postre, valores]) => ({
          'POSTRE': postre,
          'LUNES': valores.LUNES,
          'MARTES': valores.MARTES,
          'MIÉRCOLES': valores['MIÉRCOLES'],
          'JUEVES': valores.JUEVES,
          'VIERNES': valores.VIERNES,
          'TOTAL': valores.LUNES + valores.MARTES + valores['MIÉRCOLES'] + valores.JUEVES + valores.VIERNES
        }));
      wsPostres = XLSX.utils.json_to_sheet(datosPostres);
      wsPostres['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    }

    if (contadores?.conteoBebidas && Object.keys(contadores.conteoBebidas).length > 0) {
      const datosBebidas = Object.entries(contadores.conteoBebidas)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bebida, valores]) => ({
          'BEBIDA': bebida,
          'LUNES': valores.LUNES,
          'MARTES': valores.MARTES,
          'MIÉRCOLES': valores['MIÉRCOLES'],
          'JUEVES': valores.JUEVES,
          'VIERNES': valores.VIERNES,
          'TOTAL': valores.LUNES + valores.MARTES + valores['MIÉRCOLES'] + valores.JUEVES + valores.VIERNES
        }));
      wsBebidas = XLSX.utils.json_to_sheet(datosBebidas);
      wsBebidas['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    }

    // Crear hojas de etiquetado por día
    const hojasEtiquetado = [];

    diasSemana.forEach((dia, indexDia) => {
      const diaFirestore = diasSemanaFirestore[indexDia];
      const datosDelDia = {};

      // Recopilar tipos de menú únicos para este día
      const tiposDelDia = new Set();

      pedidos.forEach(usuario => {
        if (!usuario.tienePedido) return;

        const diaData = usuario[`${dia}Data`];
        if (!diaData || !diaData.pedido || esNoPedir(diaData.pedido)) return;

        // El pedido ahora es un string legible
        let labelCompleto = diaData.pedido.toUpperCase();

        if (!labelCompleto) return;

        // Extraer el tipo base del menú
        const tipoBase = labelCompleto.includes('C/') ? labelCompleto.split('C/')[0].trim() : labelCompleto;
        tiposDelDia.add(tipoBase);

        // Inicializar array si no existe
        if (!datosDelDia[tipoBase]) {
          datosDelDia[tipoBase] = [];
        }

        // Agregar el nombre del usuario
        datosDelDia[tipoBase].push(usuario.nombre.toUpperCase());
      });

      // Solo crear hoja si hay datos para este día
      if (tiposDelDia.size > 0) {
        const tiposOrdenados = Array.from(tiposDelDia).sort();

        // Encontrar la longitud máxima para normalizar el array
        const maxLength = Math.max(...Object.values(datosDelDia).map(arr => arr.length));

        // Crear el array para este día
        const arrayDelDia = [];
        for (let i = 0; i < maxLength; i++) {
          const fila = {};
          tiposOrdenados.forEach(tipo => {
            fila[tipo] = datosDelDia[tipo][i] || '';
          });
          arrayDelDia.push(fila);
        }

        // Crear la hoja de trabajo para este día
        const wsDelDia = XLSX.utils.json_to_sheet(arrayDelDia);

        // Configurar anchos de columna
        const wscolsDelDia = tiposOrdenados.map(() => ({ wch: 25 }));
        wsDelDia['!cols'] = wscolsDelDia;

        // Guardar la hoja con su nombre
        hojasEtiquetado.push({
          nombre: `Etiquetado ${diaFirestore}`,
          hoja: wsDelDia
        });
      }
    });

    // Ajustar el ancho de las columnas
    const wscols = [
      { wch: 30 }, // Nombre
      { wch: 15 }, // Legajo
      { wch: 30 }, // Fecha
      { wch: 30 }, // Lunes
      { wch: 30 }, // Martes
      { wch: 30 }, // Miércoles
      { wch: 30 }, // Jueves
      { wch: 30 }, // Viernes
      { wch: 20 }, // Cantidad de Pedidos
      { wch: 30 }, // Precio con Bonificaciones
      { wch: 30 }, // Bonificacion Total
      { wch: 30 }, // Precio Completo
    ];
    wsPedidos['!cols'] = wscols;
    wsContadores['!cols'] = wscols;
    wsBonificaciones['!cols'] = [
      { wch: 40 }, // Tipo de Bonificación
      { wch: 20 }, // Cantidad
      { wch: 30 }, // Total Bonificaciones
      { wch: 30 }  // Total a Abonar Beti Jai
    ];

    // Agregar las hojas al libro
    XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos');
    XLSX.utils.book_append_sheet(wb, wsContadores, 'Resumen');
    if (wsPostres) XLSX.utils.book_append_sheet(wb, wsPostres, 'Resumen Postres');
    if (wsBebidas) XLSX.utils.book_append_sheet(wb, wsBebidas, 'Resumen Bebidas');
    XLSX.utils.book_append_sheet(wb, wsBonificaciones, 'Bonificaciones');

    // Agregar todas las hojas de etiquetado
    hojasEtiquetado.forEach(({ nombre, hoja }) => {
      XLSX.utils.book_append_sheet(wb, hoja, nombre);
    });

    // Guardar el archivo
    const fecha = new Date().toLocaleDateString().replace(/\//g, '-');
    XLSX.writeFile(wb, `Pedidos_${fecha}.xlsx`);
  };

  const handleRowClick = (usuario) => {
    if (!menuData) return;

    // Parsear los pedidos existentes para pre-cargar los selects cascada
    const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
    const nuevaSeleccion = {};
    diasSemana.forEach(dia => {
      const diaData = usuario[`${dia}Data`];
      const pedido = diaData?.pedido || '';
      nuevaSeleccion[dia] = parseSeleccionFromPedido(pedido, labelMap[dia] || dia);
    });
    setEditSeleccion(nuevaSeleccion);
    setEditingUser(usuario);
    setIsEditingModalOpen(true);
  };

  const handleEditSeleccionCascada = (dia, campo, valor) => {
    const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
    setEditSeleccion(prev => {
      const nueva = { ...prev[dia], [campo]: valor };
      if (campo === 'menu') { nueva.postre = ''; nueva.bebida = ''; }

      let pedidoStr = '';
      if (nueva.menu === 'NO PEDIR') {
        pedidoStr = 'no_pedir';
      } else if (nueva.menu && nueva.postre && nueva.bebida) {
        pedidoStr = `${nueva.menu} ${nueva.postre} Y ${nueva.bebida}`;
      }

      // Actualizar el editingUser con el nuevo pedido
      if (pedidoStr) {
        const newDiaData = { ...(editingUser[`${dia}Data`] || {}), pedido: pedidoStr };
        const updatedUser = { ...editingUser, [`${dia}Data`]: newDiaData };
        const nuevoPrecioTotal = actualizarPrecioTotal(updatedUser);
        setEditingUser({ ...updatedUser, precioTotal: nuevoPrecioTotal });
      }

      return { ...prev, [dia]: nueva };
    });
  };

  const handleCloseEditingModal = () => {
    setEditingUser(null);
    setIsEditingModalOpen(false);
  };

  const actualizarPrecioTotal = (usuario) => {
    let total = 0;
    diasSemana.forEach(dia => {
      const diaData = usuario[`${dia}Data`];
      if (diaData && diaData.pedido && !esNoPedir(diaData.pedido)) {
        if (usuario.bonificacion === true) {
          // Si está completamente bonificado, el precio es 0
          total += 0;
        } else if (usuario.bonificacion === false) {
          // Si tiene bonificación parcial, aplicar el porcentaje
          const porcentaje = parseFloat(porcentajeBonificacion) || 70;
          const precioConBonificacion = Math.round(precioMenu * (100 - porcentaje) / 100);
          total += precioConBonificacion;
        } else {
          // Si no tiene la propiedad bonificacion (undefined), precio completo
          total += precioMenu;
        }
      }
    });
    return total;
  };

  const handleSaveEdit = async (updatedUser) => {
    try {
      const precioTotal = actualizarPrecioTotal(updatedUser);
      const usuarioActualizado = { ...updatedUser, precioTotal };

      // Buscar el documento de pedido correspondiente al usuario
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('uidUsuario', '==', usuarioActualizado.id), where('tipo', '==', 'actual'));
      const querySnapshot = await getDocs(q);

      const pedidoData = {
        uidUsuario: usuarioActualizado.id,
        lunes: { ...(usuarioActualizado.lunesData || {}), esTardio: usuarioActualizado.lunesData?.esTardio || false },
        martes: { ...(usuarioActualizado.martesData || {}), esTardio: usuarioActualizado.martesData?.esTardio || false },
        miercoles: { ...(usuarioActualizado.miercolesData || {}), esTardio: usuarioActualizado.miercolesData?.esTardio || false },
        jueves: { ...(usuarioActualizado.juevesData || {}), esTardio: usuarioActualizado.juevesData?.esTardio || false },
        viernes: { ...(usuarioActualizado.viernesData || {}), esTardio: usuarioActualizado.viernesData?.esTardio || false },
        precioTotal: precioTotal,
        tipo: 'actual',
        fechaCreacion: new Date()
      };

      if (!querySnapshot.empty) {
        // Si existe el pedido, actualizarlo
        const pedidoDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'pedidos', pedidoDoc.id), pedidoData);
      } else {
        // Si no existe el pedido, crearlo
        await addDoc(pedidosRef, pedidoData);
      }

      handleCloseEditingModal();
      cargarPedidos();
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'El pedido ha sido guardado correctamente',
        type: 'success',
        actions: [
          {
            label: 'Aceptar',
            type: 'primary',
            onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
          }
        ]
      });
    } catch (error) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: `Error al guardar los cambios: ${error.message}`,
        type: 'error',
        actions: [
          {
            label: 'Aceptar',
            type: 'primary',
            onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
          }
        ]
      });
    }
  };

  const handleDeletePedido = async (usuario) => {
    try {
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('uidUsuario', '==', usuario.id), where('tipo', '==', 'actual'));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const pedidoDoc = querySnapshot.docs[0];
        await deleteDoc(doc(db, 'pedidos', pedidoDoc.id));
        handleCloseEditingModal();
        cargarPedidos();
        setModal({
          isOpen: true,
          title: 'Éxito',
          message: 'El pedido ha sido eliminado correctamente',
          type: 'success',
          actions: [
            {
              label: 'Aceptar',
              type: 'primary',
              onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
            }
          ]
        });
      }
    } catch (error) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: `Error al eliminar el pedido: ${error.message}`,
        type: 'error',
        actions: [
          {
            label: 'Aceptar',
            type: 'primary',
            onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
          }
        ]
      });
    }
  };

  // Filtrar pedidos por nombre
  const pedidosFiltrados = pedidos.filter(usuario =>
    usuario.nombre.toLowerCase().includes(filtroNombre.toLowerCase())
  );

  if (loading || !isPrecioLoaded || !isMenuLoaded || !isPedidosLoaded) {
    return <Spinner />;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!menuData) {
    return (
      <div className="no-menu-message">
        <h2>No hay menú de la semana actual disponible</h2>
        <p>Por favor, carga el menú antes de gestionar o editar pedidos.</p>
      </div>
    );
  }

  return (
    <div className="ver-pedidos-container">
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      />
      <div className="header-container">
        <h2>Estado de Pedidos {tipo === 'actual' ? 'Semana Actual' : 'Próxima Semana'}</h2>
        <div className="header-buttons">
          <div className="filtro-container">
            <input
              type="text"
              placeholder="Filtrar por nombre..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="filtro-input"
            />
            {filtroNombre && (
              <button
                onClick={() => setFiltroNombre('')}
                className="limpiar-filtro-btn"
                title="Limpiar filtro"
              >
                ✕
              </button>
            )}
          </div>
          <button
            className="exportar-btn"
            onClick={exportarAExcel}
          >
            Exportar a Excel
          </button>
        </div>
      </div>

      <div className="tabla-container">
        <table className="tabla-pedidos">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Fecha</th>
              <th>Lunes</th>
              <th>Martes</th>
              <th>Miércoles</th>
              <th>Jueves</th>
              <th>Viernes</th>
              <th>Precio Total</th>
            </tr>
          </thead>
          <tbody>
            {pedidosFiltrados.map((usuario) => (
              <tr key={usuario.id} className={usuario.tienePedido ? (readOnly ? '' : 'clickable-row') : (readOnly ? 'sin-pedido' : 'sin-pedido clickable-row')} onClick={() => !readOnly && handleRowClick(usuario)}>
                <td>{usuario.nombre}</td>
                <td>{usuario.fecha ? formatearFecha(usuario.fecha) : ''}</td>
                {diasSemana.map(dia => {
                  const diaData = usuario[`${dia}Data`];
                  return (
                    <td key={dia}>
                      {formatearOpcion(diaData)}
                    </td>
                  );
                })}
                <td>${usuario.tienePedido ? (usuario.precioTotal || 0).toLocaleString() : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEditingModalOpen && editingUser && (
        <Modal
          isOpen={isEditingModalOpen}
          onClose={handleCloseEditingModal}
          title={`Editar Pedido de ${editingUser.nombre}`}
          message={null}
          type="info"
        >
          <form onSubmit={e => { e.preventDefault(); handleSaveEdit(editingUser); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {diasSemana.map((dia, index) => {
              const diaData = editingUser[`${dia}Data`];
              const diaFirestore = diasSemanaFirestore[index];
              const sel = editSeleccion[dia] || { menu: '', postre: '', bebida: '' };
              const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
              const menusKey = opcionesCascada?.menus ? (Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(labelMap[dia])) || labelMap[dia]) : labelMap[dia];
              const menusList = opcionesCascada?.menus?.[menusKey] || [];

              // Resolver postres por día (auto/manual)
              const postresBase = opcionesCascada?.postres || [];
              const postreDesdeMenuConfig = opcionesCascada?.postreDesdeMenu;
              let esAutoDia;
              if (typeof postreDesdeMenuConfig === 'boolean') {
                esAutoDia = postreDesdeMenuConfig;
              } else if (typeof postreDesdeMenuConfig === 'object' && postreDesdeMenuConfig !== null) {
                const matchEntry = Object.entries(postreDesdeMenuConfig).find(([k]) => norm(k) === norm(labelMap[dia]));
                esAutoDia = matchEntry ? matchEntry[1] : true;
              } else {
                esAutoDia = true;
              }

              let postresList;
              if (esAutoDia) {
                const postreRaw = menuData?.dias?.[dia]?.postre;
                const postreDelDia = postreRaw
                  ? postreRaw.split('/').map(p => p.trim()).filter(p => {
                      const upper = p.toUpperCase();
                      return !upper.includes('GELATINA') && !upper.includes('YOGURT');
                    })[0] || null
                  : null;
                const base = postresBase.length > 0 ? [...postresBase] : ['C/GELATINA', 'C/POSTRE', 'C/YOGURT'];
                if (postreDelDia) {
                  const postreLabel = `C/${postreDelDia.toUpperCase()}`;
                  if (base.includes('C/POSTRE')) {
                    postresList = base.map(p => p === 'C/POSTRE' ? postreLabel : p);
                  } else {
                    postresList = [postreLabel, ...base].sort();
                  }
                } else {
                  postresList = base;
                }
              } else if (opcionesCascada?.postresPorDia) {
                const postresDiaKey = Object.keys(opcionesCascada.postresPorDia).find(k => norm(k) === norm(labelMap[dia])) || labelMap[dia];
                postresList = opcionesCascada.postresPorDia[postresDiaKey] || postresBase;
              } else {
                postresList = postresBase;
              }

              const bebidasList = opcionesCascada?.bebidas || [];
              return (
                <div key={dia} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontWeight: 'bold', color: '#FFA000' }}>
                    {diaFirestore}:
                  </label>
                  {menuData?.dias?.[dia]?.esFeriado ? (
                    <div style={{ color: '#b91c1c', fontWeight: 'bold', margin: '0.5rem 0' }}>
                      FERIADO - No hay servicio de comida este día
                    </div>
                  ) : opcionesCascada ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <select
                        className="select-edit"
                        value={sel.menu}
                        onChange={e => handleEditSeleccionCascada(dia, 'menu', e.target.value)}
                      >
                        <option value="">-- Menú --</option>
                        <option value="NO PEDIR">NO PEDIR COMIDA ESTE DIA</option>
                        {menusList.map((m, i) => <option key={i} value={m}>{m}</option>)}
                      </select>
                      {sel.menu && sel.menu !== 'NO PEDIR' && (
                        <select
                          className="select-edit"
                          value={sel.postre}
                          onChange={e => handleEditSeleccionCascada(dia, 'postre', e.target.value)}
                        >
                          <option value="">-- Postre --</option>
                          {postresList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                        </select>
                      )}
                      {sel.menu && sel.menu !== 'NO PEDIR' && sel.postre && (
                        <select
                          className="select-edit"
                          value={sel.bebida}
                          onChange={e => handleEditSeleccionCascada(dia, 'bebida', e.target.value)}
                        >
                          <option value="">-- Bebida --</option>
                          {bebidasList.map((b, i) => <option key={i} value={b}>{b}</option>)}
                        </select>
                      )}
                      {diaData?.pedido && !esNoPedir(diaData.pedido) && (
                        <div style={{ background: '#1a2e1a', border: '1px solid #4ade80', color: '#86efac', borderRadius: '4px', padding: '4px 8px', fontSize: '0.85em', marginTop: '2px', wordBreak: 'break-word' }}>
                          {diaData.pedido}
                        </div>
                      )}
                    </div>
                  ) : (
                    <select
                      name={dia}
                      value={diaData ? diaData.pedido : 'no_pedir'}
                      onChange={(e) => {
                        const newDiaData = { ...diaData, pedido: e.target.value };
                        const updatedUser = { ...editingUser, [`${dia}Data`]: newDiaData };
                        const nuevoPrecioTotal = actualizarPrecioTotal(updatedUser);
                        setEditingUser({ ...updatedUser, precioTotal: nuevoPrecioTotal });
                      }}
                      className="select-edit"
                    >
                      {opcionesMenuConfig?.[diaFirestore]
                        ?.slice()
                        ?.sort((a, b) => {
                          const aIsNoPedir = a.trim().toUpperCase().includes('NO PEDIR');
                          const bIsNoPedir = b.trim().toUpperCase().includes('NO PEDIR');
                          if (aIsNoPedir && !bIsNoPedir) return -1;
                          if (!aIsNoPedir && bIsNoPedir) return 1;
                          return a.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                            .localeCompare(b.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
                        })
                        ?.map((opcion, idx) => (
                          <option key={idx} value={opcion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}>
                            {opcion}
                          </option>
                        ))}
                    </select>
                  )}
                  {!menuData?.dias?.[dia]?.esFeriado && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={diaData?.esTardio || false}
                        onChange={(e) => {
                          const newDiaData = { ...diaData, esTardio: e.target.checked };
                          setEditingUser({ ...editingUser, [`${dia}Data`]: newDiaData });
                        }}
                        style={{ width: '1.2rem', height: '1.2rem' }}
                      />
                      <span style={{ color: '#666', fontSize: '0.9rem' }}>Pedido tarde</span>
                    </label>
                  )}
                </div>
              );
            })}
            <div style={{ fontWeight: 'bold', marginTop: '1rem', color: '#FFA000', fontSize: '1.1rem' }}>
              Precio total: ${editingUser.precioTotal || 0}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="submit"
                className="modal-button primary"
                style={{
                  background: '#FFA000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 1.5rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  flex: 1,
                  transition: 'background 0.2s'
                }}
              >
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Confirmar eliminación',
                    message: '¿Está seguro que desea eliminar este pedido? Esta acción no se puede deshacer.',
                    type: 'warning',
                    actions: [
                      {
                        label: 'Cancelar',
                        type: 'secondary',
                        onClick: () => setConfirmModal({ isOpen: false, title: '', message: '', type: 'info', actions: [] })
                      },
                      {
                        label: 'Eliminar',
                        type: 'danger',
                        onClick: () => {
                          setConfirmModal({ isOpen: false, title: '', message: '', type: 'info', actions: [] });
                          handleDeletePedido(editingUser);
                        }
                      }
                    ]
                  });
                }}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 1.5rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  flex: 1,
                  transition: 'background 0.2s'
                }}
              >
                Eliminar pedido
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={handleCloseEditingModal}
                style={{
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 2rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                Cerrar
              </button>
            </div>
          </form>
        </Modal>
      )}

      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', type: 'info', actions: [] })}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        actions={confirmModal.actions}
      />

      {/* Tabla de Resumen */}
      <div className="resumen-container">
        <h3>Resumen de Pedidos</h3>
        <div className="tablas-resumen">
          <table className="tabla-resumen">
            <thead>
              <tr>
                <th>MENU</th>
                <th>LUNES</th>
                <th>MARTES</th>
                <th>MIÉRCOLES</th>
                <th>JUEVES</th>
                <th>VIERNES</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Agrupar menús por tipo base (sin el postre) para la tabla de resumen
                const menusPorTipo = {};

                Object.entries(contadores?.conteo || {}).forEach(([categoria, valores]) => {
                  // Filtrar NO PEDIR y FRUTAS
                  if (categoria === 'FRUTAS' || categoria.toUpperCase().includes('NO PEDIR')) {
                    return;
                  }

                  // Extraer el nombre base del menú (antes de "C/")
                  const menuBase = categoria.includes('C/') ? categoria.split('C/')[0].trim() : categoria;

                  // Si no existe este tipo base, crearlo
                  if (!menusPorTipo[menuBase]) {
                    menusPorTipo[menuBase] = { LUNES: 0, MARTES: 0, MIÉRCOLES: 0, JUEVES: 0, VIERNES: 0 };
                  }

                  // Sumar los contadores al tipo base
                  menusPorTipo[menuBase].LUNES += valores.LUNES;
                  menusPorTipo[menuBase].MARTES += valores.MARTES;
                  menusPorTipo[menuBase].MIÉRCOLES += valores.MIÉRCOLES;
                  menusPorTipo[menuBase].JUEVES += valores.JUEVES;
                  menusPorTipo[menuBase].VIERNES += valores.VIERNES;
                });

                // Convertir a array y calcular totales
                const filas = Object.entries(menusPorTipo).map(([menuBase, valores]) => ({
                  MENU: menuBase,
                  LUNES: valores.LUNES,
                  MARTES: valores.MARTES,
                  MIÉRCOLES: valores.MIÉRCOLES,
                  JUEVES: valores.JUEVES,
                  VIERNES: valores.VIERNES,
                  TOTAL: valores.LUNES + valores.MARTES + valores.MIÉRCOLES + valores.JUEVES + valores.VIERNES
                }));

                // Ordenar alfabéticamente
                filas.sort((a, b) =>
                  a.MENU.trim().normalize('NFD').replace(/\u0300-\u036f/g, '').toLowerCase()
                    .localeCompare(
                      b.MENU.trim().normalize('NFD').replace(/\u0300-\u036f/g, '').toLowerCase()
                    )
                );

                return filas.map(fila => (
                  <tr key={fila.MENU}>
                    <td>{fila.MENU}</td>
                    <td>{fila.LUNES}</td>
                    <td>{fila.MARTES}</td>
                    <td>{fila.MIÉRCOLES}</td>
                    <td>{fila.JUEVES}</td>
                    <td>{fila.VIERNES}</td>
                    <td>{fila.TOTAL}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* Tabla de Resumen de Postres */}
        {Object.keys(contadores?.conteoPostres || {}).length > 0 && (
          <>
            <h3 style={{ marginTop: '2rem' }}>Resumen de Postres</h3>
            <div className="tablas-resumen">
              <table className="tabla-resumen">
                <thead>
                  <tr>
                    <th>POSTRE</th>
                    <th>LUNES</th>
                    <th>MARTES</th>
                    <th>MIÉRCOLES</th>
                    <th>JUEVES</th>
                    <th>VIERNES</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(contadores.conteoPostres)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([postre, valores]) => {
                      const total = valores.LUNES + valores.MARTES + valores['MIÉRCOLES'] + valores.JUEVES + valores.VIERNES;
                      return (
                        <tr key={postre}>
                          <td>{postre}</td>
                          <td>{valores.LUNES}</td>
                          <td>{valores.MARTES}</td>
                          <td>{valores['MIÉRCOLES']}</td>
                          <td>{valores.JUEVES}</td>
                          <td>{valores.VIERNES}</td>
                          <td>{total}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tabla de Resumen de Bebidas */}
        {Object.keys(contadores?.conteoBebidas || {}).length > 0 && (
          <>
            <h3 style={{ marginTop: '2rem' }}>Resumen de Bebidas</h3>
            <div className="tablas-resumen">
              <table className="tabla-resumen">
                <thead>
                  <tr>
                    <th>BEBIDA</th>
                    <th>LUNES</th>
                    <th>MARTES</th>
                    <th>MIÉRCOLES</th>
                    <th>JUEVES</th>
                    <th>VIERNES</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(contadores.conteoBebidas)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([bebida, valores]) => {
                      const total = valores.LUNES + valores.MARTES + valores['MIÉRCOLES'] + valores.JUEVES + valores.VIERNES;
                      return (
                        <tr key={bebida}>
                          <td>{bebida}</td>
                          <td>{valores.LUNES}</td>
                          <td>{valores.MARTES}</td>
                          <td>{valores['MIÉRCOLES']}</td>
                          <td>{valores.JUEVES}</td>
                          <td>{valores.VIERNES}</td>
                          <td>{total}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Nuevo resumen de bonificaciones */}
        <div className="resumen-bonificaciones" style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '1rem', color: '#333' }}>Resumen de Bonificaciones</h3>
          <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fff', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h4 style={{ color: '#666', marginBottom: '0.5rem' }}>Menús Completamente Bonificados</h4>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FFA000' }}>
                {pedidos.reduce((total, usuario) => {
                  if (usuario.bonificacion) {
                    return total + diasSemana.reduce((subtotal, dia) => {
                      const diaData = usuario[`${dia}Data`];
                      return subtotal + (diaData && diaData.pedido && !esNoPedir(diaData.pedido) ? 1 : 0);
                    }, 0);
                  }
                  return total;
                }, 0)}
              </p>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fff', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h4 style={{ color: '#666', marginBottom: '0.5rem' }}>Menús con Bonificación Parcial</h4>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FFA000' }}>
                {pedidos.reduce((total, usuario) => {
                  if (!usuario.bonificacion) {
                    return total + diasSemana.reduce((subtotal, dia) => {
                      const diaData = usuario[`${dia}Data`];
                      return subtotal + (diaData && diaData.pedido && !esNoPedir(diaData.pedido) ? 1 : 0);
                    }, 0);
                  }
                  return total;
                }, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerPedidos; 