import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, deleteDoc, addDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import Spinner from './Spinner';
import { DIAS_SEMANA, DIA_LABELS } from '../constants/dias';
import './VerPedidos.css';

// Mismo menú especial que en Formulario.jsx (ver ese archivo para el detalle):
// no forma parte de opcionesMenuCascada, solo se ofrece a usuarios con `menuEspecial`.
const MENU_SIN_ALMIDON_AZUCAR = 'Menú sin almidón y sin azúcar';

const VerPedidosProximaSemana = ({ readOnly = false }) => {
  const [pedidos, setPedidos] = useState([]);
  const [contadores, setContadores] = useState({ conteo: {}, todasLasOpciones: new Set() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formEdit, setFormEdit] = useState(Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, ''])));
  const [editLoading, setEditLoading] = useState(false);
  const [menuData, setMenuData] = useState(null);
  const [precioPorDia, setPrecioPorDia] = useState(2000);
  const [opcionesMenuConfig, setOpcionesMenuConfig] = useState(null);
  const [opcionesCascada, setOpcionesCascada] = useState(null);
  const [editSeleccion, setEditSeleccion] = useState({});
  const [filtroNombre, setFiltroNombre] = useState('');

  const diasSemana = DIAS_SEMANA;
  const diasSemanaFirestore = DIAS_SEMANA.map((dia) => DIA_LABELS[dia]);
  const diasUpper = diasSemanaFirestore.map((dia) => dia.toUpperCase());

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
            bonificacion: userData.bonificacion, // Preservar el valor original (true, false, o undefined)
            menuEspecial: userData.menuEspecial
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
            ...Object.fromEntries(DIAS_SEMANA.map((dia) => [`${dia}Data`, pedido ? pedido[dia] : null])),
            tienePedido: !!pedido,
            precioTotal: precioTotal,
            bonificacion: usuario.bonificacion,
            menuEspecial: usuario.menuEspecial
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
        const labelMap = DIA_LABELS;
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
          // Sin " Y " (no hay bebida configurada): buscar el menú y, si queda texto, es el postre
          for (const m of menusList) {
            if (norm(pedidoStr).startsWith(norm(m))) {
              menuEncontrado = m.toUpperCase();
              postre = pedidoStr.substring(m.length).trim().toUpperCase();
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
        if (!diaData) return;
        const opcion = diaData.pedido;
        if (opcion && !esNoPedir(opcion)) {
          const partes = extraerPartes(opcion, dia);
          if (partes) {
            const diaCompleto = diasSemanaFirestore[index].toUpperCase();

            if (!conteo[partes.menu]) {
              conteo[partes.menu] = Object.fromEntries(diasUpper.map((d) => [d, 0]));
            }
            conteo[partes.menu][diaCompleto]++;
            const labelNorm = partes.menu.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            if (!labelsUnicos.has(labelNorm)) {
              labelsUnicos.set(labelNorm, partes.menu);
            }

            if (partes.postre) {
              if (!conteoPostres[partes.postre]) {
                conteoPostres[partes.postre] = Object.fromEntries(diasUpper.map((d) => [d, 0]));
              }
              conteoPostres[partes.postre][diaCompleto]++;
            }

            if (partes.bebida) {
              if (!conteoBebidas[partes.bebida]) {
                conteoBebidas[partes.bebida] = Object.fromEntries(diasUpper.map((d) => [d, 0]));
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
      // Sin " Y " (no hay bebida configurada): buscar el menú y, si queda texto, es el postre
      const menuMatch = menusList.find(m => norm(pedidoStr).startsWith(norm(m)));
      if (!menuMatch) return { menu: pedidoStr, postre: '', bebida: '' };
      const postreMatch = pedidoStr.substring(menuMatch.length).trim();
      return { menu: menuMatch, postre: postreMatch, bebida: '' };
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
      ...Object.fromEntries(DIAS_SEMANA.map((dia) => {
        const diaData = usuario[`${dia}Data`];
        const valor = diaData === null ? 'NO COMPLETÓ' : (formatearOpcion(diaData) === 'NO PIDIÓ' ? '' : formatearOpcion(diaData));
        return [DIA_LABELS[dia], valor];
      })),
      'Precio Total': usuario.tienePedido ? (usuario.precioTotal || 0) : 0
    }));

    // Preparar los datos de contadores para Excel
    let datosContadores = [];

    // Mostrar todas las opciones únicas de Firestore en el resumen, agrupadas por tipo base
    const opcionesResumen = Array.from(contadores?.todasLasOpciones?.values() || [])
      .filter(label => !label.toUpperCase().includes('NO PEDIR')) // Filtrar NO PEDIR
      .sort((a, b) => a.localeCompare(b));

    // Agrupar menús por tipo base (sin el postre)
    const nuevaFilaDias = () => Object.fromEntries(diasUpper.map((d) => [d, 0]));
    const menusPorTipo = {};
    const totales = { ...nuevaFilaDias(), TOTAL: 0 };

    opcionesResumen.forEach(label => {
      // Extraer el nombre base del menú (antes de "C/")
      const menuBase = label.includes('C/') ? label.split('C/')[0].trim() : label;

      // Obtener los contadores para este label específico
      const fila = (contadores?.conteo && contadores.conteo[label]) || nuevaFilaDias();

      // Si no existe este tipo base, crearlo
      if (!menusPorTipo[menuBase]) {
        menusPorTipo[menuBase] = nuevaFilaDias();
      }

      // Sumar los contadores al tipo base y a los totales generales
      diasUpper.forEach((d) => {
        menusPorTipo[menuBase][d] += fila[d] || 0;
        totales[d] += fila[d] || 0;
      });
    });

    // Convertir el objeto agrupado a array para Excel
    Object.entries(menusPorTipo).forEach(([menuBase, conteos]) => {
      const totalFila = diasUpper.reduce((sum, d) => sum + conteos[d], 0);
      totales.TOTAL += totalFila;

      datosContadores.push({
        'MENU': menuBase,
        ...conteos,
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

    const colsResumen = [{ wch: 25 }, ...diasUpper.map(() => ({ wch: 10 })), { wch: 10 }];

    if (contadores?.conteoPostres && Object.keys(contadores.conteoPostres).length > 0) {
      const datosPostres = Object.entries(contadores.conteoPostres)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([postre, valores]) => ({
          'POSTRE': postre,
          ...valores,
          'TOTAL': diasUpper.reduce((sum, d) => sum + (valores[d] || 0), 0)
        }));
      wsPostres = XLSX.utils.json_to_sheet(datosPostres);
      wsPostres['!cols'] = colsResumen;
    }

    if (contadores?.conteoBebidas && Object.keys(contadores.conteoBebidas).length > 0) {
      const datosBebidas = Object.entries(contadores.conteoBebidas)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bebida, valores]) => ({
          'BEBIDA': bebida,
          ...valores,
          'TOTAL': diasUpper.reduce((sum, d) => sum + (valores[d] || 0), 0)
        }));
      wsBebidas = XLSX.utils.json_to_sheet(datosBebidas);
      wsBebidas['!cols'] = colsResumen;
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
      ...DIAS_SEMANA.map(() => ({ wch: 25 })), // Lunes..Domingo
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

  const handleFilaClick = (usuario) => {
    // Parsear los pedidos existentes para pre-cargar los selects cascada
    const labelMap = DIA_LABELS;
    const nuevaSeleccion = {};
    diasSemana.forEach(dia => {
      const diaData = usuario[`${dia}Data`];
      const pedido = diaData?.pedido || '';
      nuevaSeleccion[dia] = parseSeleccionFromPedido(pedido, labelMap[dia] || dia);
    });
    setEditSeleccion(nuevaSeleccion);
    setUsuarioEditando(usuario);
    setFormEdit(Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, usuario[`${dia}Data`]?.pedido || ''])));
  };

  const handleChangeEdit = (e) => {
    const { name, value } = e.target;
    setFormEdit(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSeleccionCascada = (dia, campo, valor, requierePostre = true, requiereBebida = true) => {
    setEditSeleccion(prev => {
      const nueva = { ...prev[dia], [campo]: valor };
      if (campo === 'menu') { nueva.postre = ''; nueva.bebida = ''; }

      let pedidoStr = '';
      const postreListo = !requierePostre || nueva.postre;
      const bebidaLista = !requiereBebida || nueva.bebida;
      if (nueva.menu === 'NO PEDIR') {
        pedidoStr = 'no_pedir';
      } else if (nueva.menu && postreListo && bebidaLista) {
        const menuConPostre = requierePostre ? `${nueva.menu} ${nueva.postre}` : nueva.menu;
        pedidoStr = requiereBebida ? `${menuConPostre} Y ${nueva.bebida}` : menuConPostre;
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
        ...Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, { pedido: formEdit[dia] }])),
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

  const limpiarPedidosProxima = () => {
    setModal({
      isOpen: true,
      title: 'Confirmar eliminación',
      message: '¿Estás seguro de que deseas eliminar TODOS los pedidos de la próxima semana? Esta acción no se puede deshacer.',
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
          onClick: confirmarEliminacionProxima
        }
      ]
    });
  };

  const confirmarEliminacionProxima = async () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
    setIsDeleting(true);
    try {
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('tipo', '==', 'proxima'));
      const pedidosSnapshot = await getDocs(q);

      if (pedidosSnapshot.empty) {
        setModal({ isOpen: true, title: 'Sin pedidos', message: 'No hay pedidos de la próxima semana para eliminar', type: 'info' });
        return;
      }

      for (const docSnapshot of pedidosSnapshot.docs) {
        await deleteDoc(docSnapshot.ref);
      }

      setModal({
        isOpen: true,
        title: 'Éxito',
        message: `Se han eliminado ${pedidosSnapshot.size} pedidos de la próxima semana correctamente`,
        type: 'success'
      });

      await cargarPedidos();
      window.dispatchEvent(new CustomEvent('pedidosActualizados'));
    } catch (error) {
      setModal({ isOpen: true, title: 'Error', message: 'Error al eliminar los pedidos: ' + error.message, type: 'error' });
    } finally {
      setIsDeleting(false);
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
              {diasSemanaFirestore.map((dia) => <th key={dia}>{dia}</th>)}
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

      {!readOnly && pedidos.length > 0 && (
        <div className="eliminar-todos-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <button
            className="eliminar-todos-btn"
            onClick={limpiarPedidosProxima}
            disabled={isDeleting}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.7rem 1.5rem',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1
            }}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar todos los pedidos'}
          </button>
        </div>
      )}

      {/* Tabla de Resumen */}
      <div className="resumen-container">
        <h3>Resumen de Pedidos</h3>
        <div className="tablas-resumen">
          <table className="tabla-resumen">
            <thead>
              <tr>
                <th>MENU</th>
                {diasUpper.map((dia) => <th key={dia}>{dia}</th>)}
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
                    menusPorTipo[menuBase] = Object.fromEntries(diasUpper.map((d) => [d, 0]));
                  }

                  // Sumar los contadores al tipo base
                  diasUpper.forEach((d) => {
                    menusPorTipo[menuBase][d] += valores[d] || 0;
                  });
                });

                // Convertir a array y calcular totales
                const filas = Object.entries(menusPorTipo).map(([menuBase, valores]) => ({
                  MENU: menuBase,
                  ...valores,
                  TOTAL: diasUpper.reduce((sum, d) => sum + valores[d], 0)
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
                    {diasUpper.map((dia) => <td key={dia}>{fila[dia]}</td>)}
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
                    {diasUpper.map((dia) => <th key={dia}>{dia}</th>)}
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(contadores.conteoPostres)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([postre, valores]) => {
                      const total = diasUpper.reduce((sum, d) => sum + (valores[d] || 0), 0);
                      return (
                        <tr key={postre}>
                          <td>{postre}</td>
                          {diasUpper.map((dia) => <td key={dia}>{valores[dia]}</td>)}
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
                    {diasUpper.map((dia) => <th key={dia}>{dia}</th>)}
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(contadores.conteoBebidas)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([bebida, valores]) => {
                      const total = diasUpper.reduce((sum, d) => sum + (valores[d] || 0), 0);
                      return (
                        <tr key={bebida}>
                          <td>{bebida}</td>
                          {diasUpper.map((dia) => <td key={dia}>{valores[dia]}</td>)}
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
              const labelMap = DIA_LABELS;
              const menusKey = opcionesCascada?.menus ? (Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(labelMap[dia])) || labelMap[dia]) : labelMap[dia];
              const menusListBase = opcionesCascada?.menus?.[menusKey] || [];
              const menusList = usuarioEditando.menuEspecial ? [...menusListBase, MENU_SIN_ALMIDON_AZUCAR] : menusListBase;

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
              const hayPostres = postresList.length > 0;
              const hayBebidas = bebidasList.length > 0;
              const esMenuSinPostre = sel.menu === MENU_SIN_ALMIDON_AZUCAR;
              const hayPostresEfectivo = hayPostres && !esMenuSinPostre;
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
                        onChange={e => {
                          const nuevoMenu = e.target.value;
                          const requierePostreNuevo = hayPostres && nuevoMenu !== MENU_SIN_ALMIDON_AZUCAR;
                          handleEditSeleccionCascada(dia, 'menu', nuevoMenu, requierePostreNuevo, hayBebidas);
                        }}
                      >
                        <option value="">-- Menú --</option>
                        <option value="NO PEDIR">NO PEDIR COMIDA ESTE DIA</option>
                        {menusList.map((m, i) => <option key={i} value={m}>{m}</option>)}
                      </select>
                      {sel.menu && sel.menu !== 'NO PEDIR' && hayPostresEfectivo && (
                        <select
                          className="select-edit"
                          value={sel.postre}
                          onChange={e => handleEditSeleccionCascada(dia, 'postre', e.target.value, hayPostresEfectivo, hayBebidas)}
                        >
                          <option value="">-- Postre --</option>
                          {postresList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                        </select>
                      )}
                      {sel.menu && sel.menu !== 'NO PEDIR' && (hayPostresEfectivo ? sel.postre : true) && hayBebidas && (
                        <select
                          className="select-edit"
                          value={sel.bebida}
                          onChange={e => handleEditSeleccionCascada(dia, 'bebida', e.target.value, hayPostresEfectivo, hayBebidas)}
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