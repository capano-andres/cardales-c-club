import React, { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, addDoc, Timestamp } from 'firebase/firestore';
import Modal from './Modal';
import './CierreSemanal.css';

const CierreSemanal = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [puedeCerrar, setPuedeCerrar] = useState(false);

  useEffect(() => {
    verificarHorarioCierre();
  }, []);

  const verificarHorarioCierre = () => {
    const hoy = new Date();
    const hora = hoy.getHours();

    // Permitir cierre cualquier día después de las 8:00
    const puedeCerrarAhora = hora >= 8;
    setPuedeCerrar(puedeCerrarAhora);
    return puedeCerrarAhora;
  };

  const cerrarSemanaYGuardarHistorial = async () => {
    if (!verificarHorarioCierre()) {
      setStatus('El cierre semanal solo está disponible después de las 11:00 horas.');
      return;
    }

    setIsLoading(true);
    setStatus('Iniciando proceso de cierre semanal...');
    setModal({ isOpen: false, title: '', message: '', type: 'info' });

    try {
      const db = getFirestore();

      // 1. Obtener el menú actual
      const menuActualRef = doc(db, 'menus', 'menuActual');
      const menuActualSnap = await getDoc(menuActualRef);
      const existeMenuActual = menuActualSnap.exists();

      // 2. Obtener el menú de la próxima semana
      const menuProximaRef = doc(db, 'menus', 'menuProxima');
      const menuProximaSnap = await getDoc(menuProximaRef);

      if (!menuProximaSnap.exists()) {
        setStatus('No hay menú de próxima semana disponible.');
        setIsLoading(false);
        return;
      }

      // 3. Si existe menú actual, guardar pedidos en historial y eliminarlos
      if (existeMenuActual) {
        const pedidosRef = collection(db, "pedidos");
        const q = query(pedidosRef, where("tipo", "==", "actual"));
        const querySnapshot = await getDocs(q);

        // Cargar opciones de menú cascada para enriquecer pedidos con vianda
        const cascadaRef = doc(db, 'config', 'opcionesMenuCascada');
        const cascadaSnap = await getDoc(cascadaRef);
        const opcionesCascada = cascadaSnap.exists() ? cascadaSnap.data() : null;

        // Guardar pedidos en historial con datos del menú
        const historialRef = collection(db, "historial_pedidos");
        const menuActualData = menuActualSnap.data();
        const menuDias = menuActualData?.dias || null;

        // Función para enriquecer un string de pedido con la vianda del menú
        const enrichPedidoStr = (pedidoStr, dia) => {
          try {
            if (!pedidoStr || pedidoStr === 'no_pedir' || !menuDias || !menuDias[dia]) return pedidoStr;
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

            // Normalizar el pedido a upper case con espacios
            const pedidoUpper = pedidoStr.replace(/_/g, ' ').toUpperCase();

            // Encontrar qué menú tipo matchea el inicio del pedido
            let menuTipo = '';
            for (const m of menusList) {
              if (norm(pedidoUpper).startsWith(norm(m))) {
                menuTipo = m;
                break;
              }
            }
            if (!menuTipo) return pedidoStr;

            // Mapeo de nombres de menú a claves de Firestore
            let viandaDesc = '';
            const menuNorm = norm(menuTipo);
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
                  if (val && typeof val === 'object' && val.tipo) {
                    viandaDesc = `${val.tipo}. ${val.cantidad || ''} triángulos`.trim();
                    break;
                  }
                }
                if (viandaDesc) break;
              }
            }

            // Fallback genérico
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
            const viandaClean = viandaDesc.split('.')[0].trim();
            if (!viandaClean) return pedidoStr;

            // Insertar la vianda después del nombre del menú con formato "MENU / VIANDA RESTO"
            const restOfOrder = pedidoUpper.substring(menuTipo.length).trim();
            return `${menuTipo} / ${viandaClean.toUpperCase()} ${restOfOrder}`.trim();
          } catch (error) {
            console.error('Error al enriquecer pedido:', error);
            return pedidoStr;
          }
        };

        // Función para enriquecer un campo de día (puede ser objeto o string)
        const enrichDia = (diaValue, diaKey) => {
          if (!diaValue) return diaValue;
          if (typeof diaValue === 'object' && diaValue.pedido) {
            if (diaValue.pedido === 'no_pedir') return diaValue;
            return { ...diaValue, pedido: enrichPedidoStr(diaValue.pedido, diaKey) };
          }
          if (typeof diaValue === 'string') {
            if (diaValue === 'no_pedir') return diaValue;
            return enrichPedidoStr(diaValue, diaKey);
          }
          return diaValue;
        };

        for (const docSnapshot of querySnapshot.docs) {
          const pedidoData = docSnapshot.data();

          // Enriquecer cada día del pedido con la vianda
          const pedidoEnriquecido = {
            ...pedidoData,
            lunes: enrichDia(pedidoData.lunes, 'lunes'),
            martes: enrichDia(pedidoData.martes, 'martes'),
            miercoles: enrichDia(pedidoData.miercoles, 'miercoles'),
            jueves: enrichDia(pedidoData.jueves, 'jueves'),
            viernes: enrichDia(pedidoData.viernes, 'viernes'),
          };

          await addDoc(historialRef, {
            ...pedidoEnriquecido,
            fechaPedido: new Date(),
            corteSemana: true,
            semana: menuActualData?.semana || '',
            menuDias: menuDias,
          });
        }

        // Eliminar los pedidos actuales
        for (const docSnapshot of querySnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
        }
      }

      // 4. Mover el menú de próxima semana a actual
      const menuProximaData = menuProximaSnap.data();
      await setDoc(menuActualRef, menuProximaData);

      // 5. Cambiar tipo de pedidos de próxima semana a actual
      const pedidosProximaRef = collection(db, "pedidos");
      const qProxima = query(pedidosProximaRef, where("tipo", "==", "proxima"));
      const pedidosProximaSnap = await getDocs(qProxima);

      for (const docSnapshot of pedidosProximaSnap.docs) {
        await setDoc(docSnapshot.ref, {
          ...docSnapshot.data(),
          tipo: "actual"
        });
      }

      // 6. Eliminar el menú de próxima semana
      await deleteDoc(menuProximaRef);

      // 7. Actualizar la fecha de última rotación
      const configRef = doc(db, 'config', 'ultimaRotacion');
      await setDoc(configRef, {
        fecha: Timestamp.fromDate(new Date())
      });

      setStatus(existeMenuActual
        ? 'Cierre semanal completado exitosamente. Los pedidos han sido guardados en el historial.'
        : 'Cierre semanal completado exitosamente. Primera semana configurada.');
    } catch (error) {
      console.error('Error en el cierre semanal:', error);
      setStatus('Error al realizar el cierre semanal: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmarCerrarSemana = () => {
    if (!puedeCerrar) {
      setModal({
        isOpen: true,
        title: 'No se puede cerrar la semana',
        message: 'El cierre semanal solo está disponible después de las 14:00 horas.',
        type: 'warning',
        actions: [
          {
            label: 'Entendido',
            type: 'secondary',
            onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
          }
        ]
      });
      return;
    }

    setModal({
      isOpen: true,
      title: 'Cerrar semana y guardar historial',
      message: '¿Está seguro que desea cerrar la semana? Todos los pedidos actuales se guardarán en el historial y se eliminarán de la lista principal. Esta acción no se puede deshacer.',
      type: 'warning',
      actions: [
        {
          label: 'Cancelar',
          type: 'secondary',
          onClick: () => setModal({ isOpen: false, title: '', message: '', type: 'info' })
        },
        {
          label: 'Cerrar semana',
          type: 'danger',
          onClick: cerrarSemanaYGuardarHistorial
        }
      ]
    });
  };

  return (
    <div className="cierre-semanal-container">
      <button
        className="cerrar-semana-btn"
        onClick={handleConfirmarCerrarSemana}
        disabled={isLoading || !puedeCerrar}
        title={!puedeCerrar ? "El cierre semanal solo está disponible después de las 14:00 horas" : ""}
      >
        {isLoading ? 'Procesando...' : 'Cerrar semana y guardar historial'}
      </button>

      {status && <div className="status-message">{status}</div>}

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      />
    </div>
  );
};

export default CierreSemanal; 
