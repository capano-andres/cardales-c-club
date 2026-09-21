import React, { useState, useEffect } from 'react';
import { doc, getDoc, deleteDoc, collection, query, where, getDocs, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './MenuRotator.css';
import { FaTrash } from 'react-icons/fa';
import Modal from './Modal';

const MenuRotator = () => {
  const [menuActual, setMenuActual] = useState(null);
  const [menuProxima, setMenuProxima] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [ultimaRotacion, setUltimaRotacion] = useState(null);

  useEffect(() => {
    cargarMenus();
    verificarRotacion();
  }, []);

  const cargarMenus = async () => {
    try {
      setLoading(true);
      setError(null);

      // console.log('Cargando menús...');
      
      // Cargar menú actual
      const menuActualRef = doc(db, 'menus', 'menuActual');
      const menuActualSnap = await getDoc(menuActualRef);
      
      // Cargar menú próxima semana
      const menuProximaRef = doc(db, 'menus', 'menuProxima');
      const menuProximaSnap = await getDoc(menuProximaRef);

      // console.log('Menú actual existe:', menuActualSnap.exists());
      // console.log('Menú próxima existe:', menuProximaSnap.exists());

      if (menuActualSnap.exists()) {
        const menuActualData = { id: 'menuActual', ...menuActualSnap.data() };
        // console.log('Datos menú actual:', menuActualData);
        setMenuActual(menuActualData);
      }

      if (menuProximaSnap.exists()) {
        const menuProximaData = { id: 'menuProxima', ...menuProximaSnap.data() };
        // console.log('Datos menú próxima:', menuProximaData);
        setMenuProxima(menuProximaData);
      } else {
        // console.log('No se encontró menú próxima semana');
      }
    } catch (error) {
      console.error('Error al cargar los menús:', error);
      setError('Error al cargar los menús. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const eliminarPedidosAsociados = async (tipo) => {
    try {
      // Buscar todos los pedidos del tipo especificado
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('tipo', '==', tipo));
      const querySnapshot = await getDocs(q);

      // Eliminar cada pedido encontrado
      const promesasEliminacion = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(promesasEliminacion);

      // console.log(`Pedidos de tipo ${tipo} eliminados correctamente`);
    } catch (error) {
      console.error(`Error al eliminar pedidos de tipo ${tipo}:`, error);
      throw error;
    }
  };

  const eliminarMenuActual = async () => {
    if (!window.confirm('¿Está seguro que desea eliminar el menú actual y todos los pedidos asociados?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (!menuActual?.id) {
        throw new Error('No se encontró el ID del menú actual');
      }

      // Primero eliminamos los pedidos asociados
      await eliminarPedidosAsociados('actual');

      // Luego eliminamos el menú
      await deleteDoc(doc(db, 'menus', menuActual.id));
      setMenuActual(null);
      setSuccess('Menú actual y pedidos asociados eliminados correctamente');
      
      // Recargar los menús después de eliminar
      await cargarMenus();
    } catch (error) {
      console.error('Error al eliminar el menú actual:', error);
      setError('Error al eliminar el menú actual. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const eliminarMenuProxima = async () => {
    if (!window.confirm('¿Está seguro que desea eliminar el menú de la próxima semana y todos los pedidos asociados?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (!menuProxima?.id) {
        throw new Error('No se encontró el ID del menú de la próxima semana');
      }

      // Primero eliminamos los pedidos asociados
      await eliminarPedidosAsociados('proxima');

      // Luego eliminamos el menú
      await deleteDoc(doc(db, 'menus', menuProxima.id));
      setMenuProxima(null);
      setSuccess('Menú de la próxima semana y pedidos asociados eliminados correctamente');
      
      // Recargar los menús después de eliminar
      await cargarMenus();
    } catch (error) {
      console.error('Error al eliminar el menú de la próxima semana:', error);
      setError('Error al eliminar el menú de la próxima semana. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const verificarRotacion = async () => {
    try {
      setLoading(true);
      const hoy = new Date();
      const diaSemana = hoy.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
      const esSabado = diaSemana === 6;

      // console.log('Verificando rotación automática...', {
      //   diaSemana,
      //   esSabado,
      //   hora: hoy.getHours(),
      //   minutos: hoy.getMinutes()
      // });

      // Obtener la última fecha de rotación
      const configRef = doc(db, 'config', 'rotacion');
      const configSnap = await getDoc(configRef);
      const ultimaRotacion = configSnap.exists() ? configSnap.data().ultimaRotacion?.toDate() : null;

      // Verificar si ya se rotó hoy
      let yaRotadoHoy = false;
      if (ultimaRotacion) {
        const ultimaRotacionDate = new Date(ultimaRotacion);
        yaRotadoHoy = ultimaRotacionDate.toDateString() === hoy.toDateString();
        // console.log('Última rotación:', ultimaRotacionDate, 'Ya rotado hoy:', yaRotadoHoy);
      }

      // Verificar si existe menú de próxima semana
      const menuProximaRef = doc(db, 'menus', 'menuProxima');
      const menuProximaSnap = await getDoc(menuProximaRef);
      const existeMenuProxima = menuProximaSnap.exists();
      // console.log('Existe menú próxima semana:', existeMenuProxima);

      // Si es sábado, no se rotó hoy y existe menú de próxima semana, rotar automáticamente
      if (esSabado && !yaRotadoHoy && existeMenuProxima) {
        // console.log('Iniciando rotación automática...');
        await realizarRotacion();
        setModal({
          isOpen: true,
          title: 'Rotación automática',
          message: 'La rotación de menús se realizó automáticamente.',
          type: 'success'
        });
        setLoading(false);
        return;
      }

      // Si ya se rotó hoy, mostrar info
      if (yaRotadoHoy) {
        setModal({
          isOpen: true,
          title: 'Rotación ya realizada',
          message: 'La rotación de menús ya se realizó hoy.',
          type: 'info'
        });
        setLoading(false);
        return;
      }

      // Si no es sábado, mostrar info
      if (!esSabado) {
        setModal({
          isOpen: true,
          title: 'No es momento de rotar',
          message: 'La rotación de menús solo se realiza automáticamente los sábados.',
          type: 'info'
        });
        setLoading(false);
        return;
      }

      // Si es sábado pero no hay menú de próxima semana
      if (esSabado && !existeMenuProxima) {
        setModal({
          isOpen: true,
          title: 'No se puede rotar',
          message: 'No hay menú configurado para la próxima semana.',
          type: 'warning'
        });
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error('Error al verificar rotación:', error);
      setError('Error al verificar la rotación de menús');
    } finally {
      setLoading(false);
    }
  };

  const realizarRotacion = async () => {
    try {
      setLoading(true);
      setModal({ isOpen: false, title: '', message: '', type: 'info' });

      // Obtener menú de próxima semana
      const menuProximaRef = doc(db, 'menus', 'menuProxima');
      const menuProximaSnap = await getDoc(menuProximaRef);

      if (!menuProximaSnap.exists()) {
        throw new Error('No hay menú de próxima semana para rotar');
      }

      const menuProxima = menuProximaSnap.data();

      // Obtener todos los pedidos de la semana actual
      const pedidosRef = collection(db, 'pedidos');
      const q = query(pedidosRef, where('tipo', 'in', ['actual', 'tardio']));
      const pedidosSnap = await getDocs(q);

      // console.log(`Encontrados ${pedidosSnap.size} pedidos para mover al historial`);

      // Guardar pedidos en el historial con datos del menú actual
      const historialRef = collection(db, 'historial_pedidos');
      const menuActualRef2 = doc(db, 'menus', 'menuActual');
      const menuActualSnap2 = await getDoc(menuActualRef2);
      const menuActualData = menuActualSnap2.exists() ? menuActualSnap2.data() : null;
      const batch = [];
      
      pedidosSnap.docs.forEach(doc => {
        const pedido = doc.data();
        // Crear un nuevo documento en el historial con los datos del pedido y del menú
        const historialDoc = {
          ...pedido,
          fechaPedido: pedido.fechaCreacion,
          fechaSemana: new Date(), // Fecha de la semana a la que corresponde
          tipo: pedido.tipo,
          esTardio: pedido.esTardio,
          diasTardios: pedido.diasTardios,
          uidUsuario: pedido.uidUsuario,
          semana: menuActualData?.semana || '',
          menuDias: menuActualData?.dias || null,
        };
        batch.push(addDoc(historialRef, historialDoc));
      });

      // Ejecutar todas las inserciones en el historial
      await Promise.all(batch);
      // console.log('Pedidos guardados en el historial');

      // Mover pedidos de próxima semana a actual
      const qProxima = query(pedidosRef, where('tipo', '==', 'proxima'));
      const pedidosProximaSnap = await getDocs(qProxima);

      // console.log(`Encontrados ${pedidosProximaSnap.size} pedidos para mover a actual`);

      // Actualizar cada pedido
      const batchActual = [];
      pedidosProximaSnap.docs.forEach(doc => {
        // console.log(`Moviendo pedido ${doc.id} de próxima a actual`);
        batchActual.push(setDoc(doc.ref, { ...doc.data(), tipo: 'actual' }, { merge: true }));
      });

      // Ejecutar todas las actualizaciones de pedidos
      await Promise.all(batchActual);
      // console.log('Pedidos movidos correctamente');

      // Guardar menú de próxima semana como actual
      await setDoc(doc(db, 'menus', 'menuActual'), menuProxima);
      // console.log('Menú actual actualizado');

      // Eliminar el menú de próxima semana
      await deleteDoc(menuProximaRef);
      // console.log('Menú próxima semana eliminado');

      // Actualizar fecha de última rotación
      await setDoc(doc(db, 'config', 'rotacion'), {
        ultimaRotacion: new Date()
      });
      // console.log('Fecha de rotación actualizada');

      // Actualizar el estado de los menús inmediatamente
      setMenuActual(menuProxima);
      setMenuProxima(null);

      // Forzar recarga de pedidos en VerPedidos
      window.dispatchEvent(new CustomEvent('pedidosActualizados'));

      setModal({
        isOpen: true,
        title: 'Rotación exitosa',
        message: 'Los menús y pedidos han sido rotados correctamente. Los pedidos de la semana anterior han sido guardados en el historial.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error al rotar menús:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: `Error al rotar menús: ${error.message}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Verificando estado de rotación...</div>;
  }

  return (
    <div className="menu-rotator-container">
      {error && <div className="message error">{error}</div>}
      {success && <div className="message success">{success}</div>}

      <div className="menus-info">
        <div className="menu-card">
          <h3>Menú Actual</h3>
          {menuActual ? (
            <>
              <p><strong>Temporada:</strong> {menuActual.temporada}</p>
              <p><strong>Semana:</strong> {menuActual.semana}</p>
              <button 
                className="delete-button"
                onClick={eliminarMenuActual}
                disabled={loading}
              >
                <FaTrash /> Eliminar Menú Actual
              </button>
            </>
          ) : (
            <p>No hay menú actual configurado</p>
          )}
        </div>

        <div className="menu-card">
          <h3>Menú Próxima Semana</h3>
          {menuProxima ? (
            <>
              <p><strong>Temporada:</strong> {menuProxima.temporada}</p>
              <p><strong>Semana:</strong> {menuProxima.semana}</p>
              <button 
                className="delete-button"
                onClick={eliminarMenuProxima}
                disabled={loading}
              >
                <FaTrash /> Eliminar Menú Próxima Semana
              </button>
            </>
          ) : (
            <p>No hay menú configurado para la próxima semana</p>
          )}
        </div>
      </div>

      {menuProxima && (
        <div className="rotacion-manual">
          <button 
            className="rotar-button"
            onClick={realizarRotacion}
            disabled={loading}
          >
            Forzar Rotación Manual
          </button>
          <p className="info-text">
            Este botón forzará la rotación de menús independientemente de la última fecha de rotación.
          </p>
        </div>
      )}

      <p className="info-text">
        Los menús se actualizan automáticamente cada semana. Asegúrese de tener configurado el menú de la próxima semana antes de la actualización.
      </p>

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

export default MenuRotator;