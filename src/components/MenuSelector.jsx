import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Modal from './Modal';
import Spinner from './Spinner';
import './MenuSelector.css';

const MenuSelector = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [fechaInicio, setFechaInicio] = useState(null);
  const [fechaLimite, setFechaLimite] = useState(null);
  const [loadingFechas, setLoadingFechas] = useState(true);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [menuActual, setMenuActual] = useState(null);
  const [menuProxima, setMenuProxima] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    cargarFechas();
    cargarMenus();
  }, []);

  const cargarFechas = async () => {
    try {
      const fechasRef = doc(db, 'config', 'fechasLimite');
      const fechasSnap = await getDoc(fechasRef);
      
      if (fechasSnap.exists()) {
        const data = fechasSnap.data();
        const fechaInicioData = data.inicioPedidos?.toDate();
        const fechaLimiteData = data.proximaSemana?.toDate();
        const hoy = new Date();
        
        setFechaInicio(fechaInicioData);
        setFechaLimite(fechaLimiteData);
      }
    } catch (error) {
      console.error('Error al cargar fechas:', error);
    } finally {
      setLoadingFechas(false);
    }
  };

  const cargarMenus = async () => {
    try {
      const menuActualRef = doc(db, 'menus', 'menuActual');
      const menuProximaRef = doc(db, 'menus', 'menuProxima');
      
      const [menuActualSnap, menuProximaSnap] = await Promise.all([
        getDoc(menuActualRef),
        getDoc(menuProximaRef)
      ]);

      setMenuActual(menuActualSnap.exists() ? menuActualSnap.data() : null);
      setMenuProxima(menuProximaSnap.exists() ? menuProximaSnap.data() : null);
    } catch (error) {
      console.error('Error al cargar menús:', error);
    } finally {
      setLoadingMenus(false);
    }
  };

  const handleSemanaActual = () => {
    navigate('/menu/actual');
  };

  const handleProximaSemana = () => {
    navigate('/menu/proxima');
  };

  const handleCerrarSesion = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const mostrarMenuActual = () => {
    const hoy = new Date();
    const diaSemana = hoy.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
    const hora = hoy.getHours();
    
    // Si es domingo después de las 18:00 (corte semanal), no mostrar ningún menú
    if (diaSemana === 0 && hora >= 18) {
      return false;
    }

    // Mostrar el menú actual si existe
    return menuActual !== null;
  };

  const mostrarMenuProxima = () => {
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const hora = hoy.getHours();
    
    // Si es domingo después de las 18:00 (corte semanal), no mostrar ningún menú
    if (diaSemana === 0 && hora >= 18) {
      return false;
    }

    // Verificar si estamos dentro del rango de fechas configurado
    if (fechaInicio && fechaLimite) {
      const estaDentroDelRango = hoy >= fechaInicio && hoy <= fechaLimite;
      return estaDentroDelRango && menuProxima !== null;
    }
    
    return menuProxima !== null;
  };

  if (loadingFechas || loadingMenus) {
    return <Spinner />;
  }

  const noHayMenus = !menuActual && !menuProxima;
  const sePuedeMostrarMenuActual = mostrarMenuActual() && menuActual;
  const sePuedeMostrarMenuProxima = mostrarMenuProxima() && menuProxima;
  const noHayMenusDisponibles = !sePuedeMostrarMenuActual && !sePuedeMostrarMenuProxima;

  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const hora = hoy.getHours();
  const esDomingoTarde = diaSemana === 0 && hora >= 18;

  const mostrarAlerta = noHayMenus || noHayMenusDisponibles;

  return (
    <div className="menu-selector-container">
      <h1>Selecciona el Menú</h1>
      {mostrarAlerta ? (
        <div className="no-menu-alert" style={{
          background: '#78350f',
          color: '#fff',
          padding: '1.5rem',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '1.5rem'
        }}>
          <h3>⚠️ {esDomingoTarde ? 'Cierre semanal en proceso' : 'No hay menús disponibles'}</h3>
          <p>{esDomingoTarde
            ? 'El sistema está en proceso de cierre semanal. Por favor, vuelva a intentarlo más tarde.'
            : 'En este momento no hay menús disponibles para pedir.'}</p>
          <p>Por favor, vuelve a intentarlo más tarde.</p>
        </div>
      ) : (
        <div className="menu-buttons">
          {sePuedeMostrarMenuActual && (
            <button 
              className="menu-button semana-actual"
              onClick={handleSemanaActual}
            >
              Menú de la Semana Actual
            </button>
          )}
          {sePuedeMostrarMenuProxima && (
            <button 
              className="menu-button semana-proxima"
              onClick={handleProximaSemana}
            >
              Menú de la Próxima Semana
            </button>
          )}
        </div>
      )}
      <div className="menu-buttons">
        <button
          className="menu-button cerrar-sesion"
          onClick={handleCerrarSesion}
        >
          Cerrar Sesión
        </button>
      </div>
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        canClose={modal.canClose}
        onClose={() => {
          if (modal.canClose) {
            setModal({ isOpen: false, title: '', message: '', type: 'info', canClose: true });
          }
        }}
      />
    </div>
  );
};

export default MenuSelector; 