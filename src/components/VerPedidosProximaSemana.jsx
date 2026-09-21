import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, deleteDoc, addDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import Spinner from './Spinner';
import './VerPedidos.css';

const VerPedidosProximaSemana = ({ readOnly = false }) => {
  const [pedidos, setPedidos] = useState([]);
  const [contadores, setContadores] = useState({ conteo: {}, todasLasOpciones: new Set() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formEdit, setFormEdit] = useState({ lunes: '', martes: '', miercoles: '', jueves: '', viernes: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [menuData, setMenuData] = useState(null);
  const [precioPorDia, setPrecioPorDia] = useState(2000);
  const [opcionesMenuConfig, setOpcionesMenuConfig] = useState(null);
  const [opcionesCascada, setOpcionesCascada] = useState(null);
  const [editSeleccion, setEditSeleccion] = useState({});
  const [filtroNombre, setFiltroNombre] = useState('');

  const diasSemana = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const diasSemanaFirestore = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  useEffect(() => {
    cargarPedidos();
    cargarMenu();
    cargarPrecio();
    cargarOpcionesMenu();
    cargarOpcionesCascada();

    const handlePedidosActualizados = () => {
      cargarPedidos();
    };

    window.addEventListener('pedidosActualizados', handlePedidosActualizados);

    return () => {
      window.removeEventListener('pedidosActualizados', handlePedidosActualizados);
    };
  }, []);

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

      // Obtener el precio del menú y la bonificación
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);
      const precioMenu = precioSnap.exists() ? precioSnap.data().precio : 0;
      const porcentajeBonificacion = precioSnap.exists() ? precioSnap.data().porcentajeBonificacion : 70;

      // Obtener los pedidos de próxima semana
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('tipo', '==', 'proxima'));
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
                  const porcentaje = parseFloat(porcentajeBonificacion ?? 70);
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
        });

      // Ordenar alfabéticamente por nombre
      usuariosConPedidos.sort((a, b) => a.nombre.localeCompare(b.nombre));

      setPedidos(usuariosConPedidos);
    } catch (error) {
      setError(`Error al cargar la información: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cargarMenu = async () => {
    try {
      const menuRef = doc(db, 'menus', 'menuProxima');
      const menuSnap = await getDoc(menuRef);
      if (menuSnap.exists()) {
        setMenuData(menuSnap.data());
      }
    } catch (error) {
      setMenuData(null);
    }
  };

  const cargarPrecio = async () => {
    try {
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);

      if (precioSnap.exists()) {
        setPrecioPorDia(precioSnap.data().precio);
      }
    } catch (error) {
      console.error('Error al cargar el precio:', error);
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
      console.error('Error al cargar opciones de menú:', error);
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

  const calcularContadores = (pedidosData) => {
    const conteo = {};
    const conteoPostres = {};
    const conteoBebidas = {};
    const labelsUnicos = new Map();
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const extraerPartes = (pedidoStr, dia) => {
      if (!pedidoStr || esNoPedir(pedidoStr)) return null;

      if (opcionesCascada) {
        const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
        const menusKey = Object.keys(opcionesCascada.menus || {}).find(k => norm(k) === norm(labelMap[dia])) || labelMap[dia];
        const menusList = opcionesCascada.menus?.[menusKey] || [];

        let menuEncontrado = pedidoStr.toUpperCase();
        let postre = '';
        let bebida = '';

        const yIndex = pedidoStr.lastIndexOf(' Y ');
        if (yIndex !== -1) {
          bebida = pedidoStr.substring(yIndex + 3).trim().toUpperCase();
          const menuYPostre = pedidoStr.substring(0, yIndex).trim();
          for (const m of menusList) {
            if (norm(menuYPostre).startsWith(norm(m))) {
              menuEncontrado = m.toUpperCase();
              postre = menuYPostre.substring(m.length).trim().toUpperCase();
              break;
            }
          }
        } else {
          for (const m of menusList) {
            if (norm(pedidoStr).startsWith(norm(m))) {
              menuEncontrado = m.toUpperCase();
              break;
            }
          }
        }
        return { menu: menuEncontrado, postre, bebida };
      }

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

    pedidosData.forEach(usuario => {
      diasSemana.forEach((dia, index) => {
        const diaData = usuario[`${dia}Data`];
        if (!diaData || diaData.esTardio) return;
        const opcion = diaData.pedido;
        if (opcion && !esNoPedir(opcion)) {
          const partes = extraerPartes(opcion, dia);
          if (partes) {
            const diaCompleto = diasSemanaFirestore[index].toUpperCase();

            if (!conteo[partes.menu]) {
              conteo[partes.menu] = { LUNES: 0, MARTES: 0, 'MIÉRCOLES': 0, JUEVES: 0, VIERNES: 0 };
            }
            conteo[partes.menu][diaCompleto]++;
            const labelNorm = partes.menu.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            if (!labelsUnicos.has(labelNorm)) {
              labelsUnicos.set(labelNorm, partes.menu);
            }

            if (partes.postre) {
              if (!conteoPostres[partes.postre]) {
                conteoPostres[partes.postre] = { LUNES: 0, MARTES: 0, 'MIÉRCOLES': 0, JUEVES: 0, VIERNES: 0 };
              }
              conteoPostres[partes.postre][diaCompleto]++;
            }

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
  }, [pedidos]);

  const formatearFecha = (fecha) => {
    if (!fecha) return 'Fecha desconocida';
    try {
      if (fecha.seconds) {
        return new Date(fecha.seconds * 1000).toLocaleString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      if (typeof fecha === 'string') {
        return new Date(fecha).toLocaleString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
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
      if (opcion.esTardio) return 'Pedido Tarde';
      const menuLabel = opcion.pedido.toUpperCase().replace(/_/g, ' ');
      return menuLabel;
    }
    if (esNoPedir(opcion)) return 'NO PIDIÓ';
    return opcion.toUpperCase().replace(/_/g, ' ');
  };

  // Parsear un string de pedido a sus componentes de cascada
  const parseSeleccionFromPedido = (pedidoStr, diaLabel) => {
    if (!pedidoStr || esNoPedir(pedidoStr)) {
      return { menu: 'NO PEDIR', postre: '', bebida: '' };
    }
    if (!opcionesCascada) return { menu: '', postre: '', bebida: '' };

    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const menusKey = opcionesCascada.menus ? (Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(diaLabel)) || diaLabel) : diaLabel;
    const menusList = opcionesCascada.menus?.[menusKey] || [];
    const postresList = opcionesCascada.postres || [];

    const yIndex = pedidoStr.lastIndexOf(' Y ');
    if (yIndex === -1) {
      const menuMatch = menusList.find(m => norm(pedidoStr).startsWith(norm(m)));
      return { menu: menuMatch || pedidoStr, postre: '', bebida: '' };
    }

    const bebida = pedidoStr.substring(yIndex + 3).trim();
    const menuYPostre = pedidoStr.substring(0, yIndex).trim();

    let menuEncontrado = '';
    let postreEncontrado = '';
    for (const m of menusList) {
      if (norm(menuYPostre).startsWith(norm(m))) {
        menuEncontrado = m;
        postreEncontrado = menuYPostre.substring(m.length).trim();
        break;
      }
    }

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

    return { menu: menuEncontrado, postre: postreEncontrado, bebida: bebida };
  };

  const exportarAExcel = () => {
    // Preparar los datos de pedidos para Excel
    const datosPedidos = pedidos.map(usuario => ({
      'Nombre': usuario.nombre,
      'Legajo': usuario.legajo,
      'Fecha': usuario.fecha ? formatearFecha(usuario.fecha) : '',
      'Lunes': usuario.lunesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.lunesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.lunesData)),
      'Martes': usuario.martesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.martesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.martesData)),
      'Miércoles': usuario.miercolesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.miercolesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.miercolesData)),
      'Jueves': usuario.juevesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.juevesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.juevesData)),
      'Viernes': usuario.viernesData === null ? 'NO COMPLETÓ' : (formatearOpcion(usuario.viernesData) === 'NO PIDIÓ' ? '' : formatearOpcion(usuario.viernesData)),
      'Precio Total': usuario.tienePedido ? (usuario.precioTotal || 0) : 0
    }));

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

    // Crear el libro de trabajo y las hojas
    const wb = XLSX.utils.book_new();
    const wsPedidos = XLSX.utils.json_to_sheet(datosPedidos);
    const wsContadores = XLSX.utils.json_to_sheet(datosContadores);

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

        let labelCompleto = diaData.pedido.toUpperCase();
        if (!labelCompleto) return;

        const tipoBase = labelCompleto.includes('C/') ? labelCompleto.split('C/')[0].trim() : labelCompleto;
        tiposDelDia.add(tipoBase);

        if (!datosDelDia[tipoBase]) {
          datosDelDia[tipoBase] = [];
        }
        datosDelDia[tipoBase].push(usuario.nombre.toUpperCase());
      });

      if (tiposDelDia.size > 0) {
        const tiposOrdenados = Array.from(tiposDelDia).sort();
        const maxLength = Math.max(...Object.values(datosDelDia).map(arr => arr.length));

        const arrayDelDia = [];
        for (let i = 0; i < maxLength; i++) {
          const fila = {};
          tiposOrdenados.forEach(tipo => {
            fila[tipo] = datosDelDia[tipo][i] || '';
          });
          arrayDelDia.push(fila);
        }

        const wsDelDia = XLSX.utils.json_to_sheet(arrayDelDia);
        const wscolsDelDia = tiposOrdenados.map(() => ({ wch: 25 }));
        wsDelDia['!cols'] = wscolsDelDia;

        hojasEtiquetado.push({
          nombre: `Etiquetado ${diaFirestore}`,
          hoja: wsDelDia
        });
      }
    });

    // Ajustar el ancho de las columnas para las hojas principales
    const wscols = [
      { wch: 25 }, // Nombre
      { wch: 15 }, // Legajo
      { wch: 20 }, // Fecha
      { wch: 25 }, // Lunes
      { wch: 25 }, // Martes
      { wch: 25 }, // Miércoles
      { wch: 25 }, // Jueves
      { wch: 25 }, // Viernes
      { wch: 15 }  // Precio Total
    ];

    wsPedidos['!cols'] = wscols;
    wsContadores['!cols'] = wscols;

    // Agregar las hojas al libro
    XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos Próxima Semana');
    XLSX.utils.book_append_sheet(wb, wsContadores, 'Resumen');
    if (wsPostres) XLSX.utils.book_append_sheet(wb, wsPostres, 'Resumen Postres');
    if (wsBebidas) XLSX.utils.book_append_sheet(wb, wsBebidas, 'Resumen Bebidas');

    // Agregar todas las hojas de etiquetado
    hojasEtiquetado.forEach(({ nombre, hoja }) => {
      XLSX.utils.book_append_sheet(wb, hoja, nombre);
    });


    // Guardar el archivo
    const fecha = new Date().toLocaleDateString().replace(/\//g, '-');
    XLSX.writeFile(wb, `Pedidos_Proxima_Semana_${fecha}.xlsx`);
  };

  // Calcular usuarios con al menos un día NO tardío
  const filasNormales = pedidos.filter(usuario =>
    diasSemana.some(dia => {
      const diaData = usuario[`${dia}Data`];
      return diaData && (!diaData.esTardio || diaData.esTardio === false);
    })
  );

  const handleFilaClick = (usuario) => {
    // Parsear los pedidos existentes para pre-cargar los selects cascada
    const labelMap = { 'lunes': 'Lunes', 'martes': 'Martes', 'miercoles': 'Miercoles', 'jueves': 'Jueves', 'viernes': 'Viernes' };
    const nuevaSeleccion = {};
    diasSemana.forEach(dia => {
      const diaData = usuario[`${dia}Data`];
      const pedido = diaData?.pedido || '';
      nuevaSeleccion[dia] = parseSeleccionFromPedido(pedido, labelMap[dia] || dia);
    });
    setEditSeleccion(nuevaSeleccion);
    setUsuarioEditando(usuario);
    setFormEdit({
      lunes: usuario.lunesData?.pedido || '',
      martes: usuario.martesData?.pedido || '',
      miercoles: usuario.miercolesData?.pedido || '',
      jueves: usuario.juevesData?.pedido || '',
      viernes: usuario.viernesData?.pedido || ''
    });
  };

  const handleChangeEdit = (e) => {
    const { name, value } = e.target;
    setFormEdit(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSeleccionCascada = (dia, campo, valor) => {
    setEditSeleccion(prev => {
      const nueva = { ...prev[dia], [campo]: valor };
      if (campo === 'menu') { nueva.postre = ''; nueva.bebida = ''; }

      let pedidoStr = '';
      if (nueva.menu === 'NO PEDIR') {
        pedidoStr = 'no_pedir';
      } else if (nueva.menu && nueva.postre && nueva.bebida) {
        pedidoStr = `${nueva.menu} ${nueva.postre} Y ${nueva.bebida}`;
      }

      if (pedidoStr) {
        setFormEdit(prevForm => ({ ...prevForm, [dia]: pedidoStr }));
      }

      return { ...prev, [dia]: nueva };
    });
  };

  const handleGuardarEdicion = async () => {
    if (!usuarioEditando) return;
    setEditLoading(true);
    try {
      // Obtener el precio del menú y la bonificación
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);
      const precioMenu = precioSnap.exists() ? precioSnap.data().precio : 0;
      const porcentajeBonificacion = precioSnap.exists() ? precioSnap.data().porcentajeBonificacion : 70;

      // Buscar el pedido de este usuario
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('uidUsuario', '==', usuarioEditando.id), where('tipo', '==', 'proxima'));
      const querySnapshot = await getDocs(q);

      // Calcular nuevo precio total usando la misma lógica que en cargarPedidos
      let nuevoPrecioTotal = 0;
      diasSemana.forEach(dia => {
        const pedidoDia = formEdit[dia];
        if (pedidoDia && !esNoPedir(pedidoDia)) {
          if (usuarioEditando.bonificacion === true) {
            // Si está completamente bonificado, el precio es 0
            nuevoPrecioTotal += 0;
          } else if (usuarioEditando.bonificacion === false) {
            // Si tiene bonificación parcial, aplicar el porcentaje
            const porcentaje = parseFloat(porcentajeBonificacion ?? 70);
            const precioConBonificacion = Math.round(precioMenu * (100 - porcentaje) / 100);
            nuevoPrecioTotal += precioConBonificacion;
          } else {
            // Si no tiene la propiedad bonificacion (undefined), precio completo
            nuevoPrecioTotal += precioMenu;
          }
        }
      });

      // Preparar los datos del pedido
      const pedidoData = {
        uidUsuario: usuarioEditando.id,
        tipo: 'proxima',
        fechaCreacion: new Date(),
        precioTotal: nuevoPrecioTotal,
        lunes: { pedido: formEdit.lunes, esTardio: usuarioEditando.lunesData?.esTardio || false },
        martes: { pedido: formEdit.martes, esTardio: usuarioEditando.martesData?.esTardio || false },
        miercoles: { pedido: formEdit.miercoles, esTardio: usuarioEditando.miercolesData?.esTardio || false },
        jueves: { pedido: formEdit.jueves, esTardio: usuarioEditando.juevesData?.esTardio || false },
        viernes: { pedido: formEdit.viernes, esTardio: usuarioEditando.viernesData?.esTardio || false }
      };

      if (!querySnapshot.empty) {
        // Si existe un pedido, actualizarlo
        const pedidoDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'pedidos', pedidoDoc.id), pedidoData);
        setModal({ isOpen: true, title: 'Éxito', message: 'Pedido actualizado correctamente.', type: 'success' });
      } else {
        // Si no existe un pedido, crear uno nuevo
        await addDoc(collection(db, 'pedidos'), pedidoData);
        setModal({ isOpen: true, title: 'Éxito', message: 'Nuevo pedido creado correctamente.', type: 'success' });
      }

      setUsuarioEditando(null);
      cargarPedidos();
    } catch (error) {
      setModal({ isOpen: true, title: 'Error', message: 'Error al guardar los cambios: ' + error.message, type: 'error' });
    } finally {
      setEditLoading(false);
    }
  };

  const confirmarEliminarPedido = () => {
    // Cerrar temporalmente el modal de edición
    setUsuarioEditando(null);

    // Mostrar el modal de confirmación
    setModal({
      isOpen: true,
      title: 'Confirmar eliminación',
      message: '¿Está seguro que desea eliminar este pedido? Esta acción no se puede deshacer.',
      type: 'warning',
      actions: [
        {
          label: 'Cancelar',
          type: 'secondary',
          onClick: () => {
            setModal({ isOpen: false, title: '', message: '', type: 'info' });
            // Volver a abrir el modal de edición
            setUsuarioEditando(usuarioEditando);
          }
        },
        {
          label: 'Eliminar',
          type: 'danger',
          onClick: async () => {
            setModal({ isOpen: false, title: '', message: '', type: 'info' });
            await handleEliminarPedido();
          }
        }
      ]
    });
  };

  const handleEliminarPedido = async () => {
    if (!usuarioEditando) return;
    setEditLoading(true);
    try {
      // Buscar el pedido de este usuario
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('uidUsuario', '==', usuarioEditando.id), where('tipo', '==', 'proxima'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const pedidoDoc = querySnapshot.docs[0];
        // Eliminar el pedido
        await deleteDoc(doc(db, 'pedidos', pedidoDoc.id));
        setModal({ isOpen: true, title: 'Éxito', message: 'Pedido eliminado correctamente.', type: 'success' });
        setUsuarioEditando(null);
        cargarPedidos();
      } else {
        setModal({ isOpen: true, title: 'Error', message: 'No se encontró el pedido para eliminar.', type: 'error' });
      }
    } catch (error) {
      setModal({ isOpen: true, title: 'Error', message: 'Error al eliminar el pedido: ' + error.message, type: 'error' });
    } finally {
      setEditLoading(false);
    }
  };

  // Filtrar pedidos por nombre
  const pedidosFiltrados = pedidos.filter(usuario =>
    usuario.nombre.toLowerCase().includes(filtroNombre.toLowerCase())
  );

  const spinnerStyle = {
    width: '30px',
    height: '30px',
    border: '3px solid #FFA000',
    borderTop: '3px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginRight: '10px'
  };

  if (loading) {
    return <Spinner style={spinnerStyle} />;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!menuData) {
    return (
      <div className="no-menu-alert" style={{
        background: '#78350f',
        color: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        textAlign: 'center',
        marginBottom: '1.5rem'
      }}>
        <h3>⚠️ No hay menú disponible</h3>
        <p>Actualmente no hay menú configurado para la próxima semana.</p>
        <p>Por favor, contacta al administrador para que configure el menú.</p>
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
        <h2>Pedidos Próxima Semana</h2>
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
              <th>Legajo</th>
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
              <tr key={usuario.id} className={usuario.tienePedido ? '' : 'sin-pedido'} style={{ cursor: readOnly ? 'default' : 'pointer' }} onClick={() => !readOnly && handleFilaClick(usuario)}>
                <td>{usuario.nombre}</td>
                <td>{usuario.legajo}</td>
                <td>{usuario.fecha ? formatearFecha(usuario.fecha) : ''}</td>
                {diasSemana.map(dia => {
                  const diaData = usuario[`${dia}Data`];
                  return (
                    <td key={dia}>
                      {(() => {
                        if (!diaData) return 'NO COMPLETÓ';
                        return formatearOpcion(diaData);
                      })()}
                    </td>
                  );
                })}
                <td>${usuario.precioTotal.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
      </div>

      {/* Modal de edición */}
      {usuarioEditando && (
        <Modal
          isOpen={true}
          onClose={() => setUsuarioEditando(null)}
          title={`Editar pedido de ${usuarioEditando.nombre}`}
          message={null}
          type="info"
        >
          <form onSubmit={e => { e.preventDefault(); handleGuardarEdicion(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {diasSemana.map((dia, index) => {
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
                    {diasSemanaFirestore[index]}:
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
                      {formEdit[dia] && !esNoPedir(formEdit[dia]) && (
                        <div style={{ background: '#1a2e1a', border: '1px solid #4ade80', color: '#86efac', borderRadius: '4px', padding: '4px 8px', fontSize: '0.85em', marginTop: '2px', wordBreak: 'break-word' }}>
                          {formEdit[dia]}
                        </div>
                      )}
                    </div>
                  ) : (
                    <select
                      name={dia}
                      value={formEdit[dia] || 'no_pedir'}
                      onChange={handleChangeEdit}
                      className="select-edit"
                    >
                      {opcionesMenuConfig?.[diasSemanaFirestore[index]]?.filter(
                        opcion => opcion.trim().toUpperCase() !== 'NO PEDIR COMIDA ESTE DÍA'
                      ).map((opcion, idx) => (
                        <option key={idx} value={opcion.toLowerCase().replace(/\s+/g, '_')}>
                          {opcion}
                        </option>
                      ))}
                    </select>
                  )}
                  {!menuData?.dias?.[dia]?.esFeriado && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={usuarioEditando[`${dia}Data`]?.esTardio || false}
                        onChange={(e) => {
                          const newDiaData = { ...usuarioEditando[`${dia}Data`], esTardio: e.target.checked };
                          setUsuarioEditando({ ...usuarioEditando, [`${dia}Data`]: newDiaData });
                        }}
                        style={{ width: '1.2rem', height: '1.2rem' }}
                      />
                      <span style={{ color: '#666', fontSize: '0.9rem' }}>Pedido tarde</span>
                    </label>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="submit"
                disabled={editLoading}
                style={{
                  flex: 1,
                  background: editLoading ? '#90caf9' : '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 1.5rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: editLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={confirmarEliminarPedido}
                disabled={editLoading}
                style={{
                  flex: 1,
                  background: editLoading ? '#fecaca' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 1.5rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: editLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {editLoading ? 'Eliminando...' : 'Eliminar pedido'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setUsuarioEditando(null)}
                disabled={editLoading}
                style={{
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.7rem 2rem',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: editLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                Cerrar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default VerPedidosProximaSemana; 