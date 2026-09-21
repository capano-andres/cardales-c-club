import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import Modal from './Modal';
import Spinner from './Spinner';
import './VerMenu.css';

const VerMenu = () => {
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarMenuActual();
  }, []);

  const cargarMenuActual = async () => {
    try {
      setLoading(true);
      const menuRef = doc(db, 'menus', 'menuActual');
      const menuSnap = await getDoc(menuRef);

      if (menuSnap.exists()) {
        const data = menuSnap.data();
        setMenuData(data);
      } else {
        setError('No hay menú disponible en este momento');
      }
    } catch (error) {
      console.error('Error al cargar el menú:', error);
      setError('Error al cargar el menú');
    } finally {
      setLoading(false);
    }
  };

  const renderDiaMenu = (dia, titulo) => {
    if (!menuData?.dias[dia]) return null;
    const diaData = menuData.dias[dia];

    if (diaData.esFeriado) {
      return (
        <div className="dia-menu feriado">
          <h3>{titulo}</h3>
          <div className="feriado-message">FERIADO - No hay servicio de comida este día</div>
        </div>
      );
    }

    return (
      <div className="dia-menu">
        <h3>{titulo}</h3>
        <div className="menu-items">
          {diaData.betiJai && (
            <div className="menu-item">
              <h4>Beti Jai</h4>
              <p>{diaData.betiJai}</p>
            </div>
          )}
          {diaData.pastas && (
            <div className="menu-item">
              <h4>Pastas</h4>
              <p>{diaData.pastas}</p>
            </div>
          )}
          {diaData.light && (
            <div className="menu-item">
              <h4>Light</h4>
              <p>{diaData.light}</p>
            </div>
          )}
          {diaData.clasico && (
            <div className="menu-item">
              <h4>Clásico</h4>
              <p>{diaData.clasico}</p>
            </div>
          )}
        </div>

        {(diaData.opciones?.dietaBlanda || diaData.opciones?.pebete) && (
          <div className="opciones-adicionales">
            <h4>Opciones Adicionales:</h4>
            <ul>
              {diaData.opciones.dietaBlanda && <li>Dieta Blanda disponible</li>}
              {diaData.opciones.pebete && <li>Opción Pebete disponible</li>}
            </ul>
          </div>
        )}

        {diaData.sandwichMiga?.tipo && (
          <div className="sandwich-miga">
            <h4>Sandwich de Miga</h4>
            <p>{diaData.sandwichMiga.tipo} ({diaData.sandwichMiga.cantidad} triángulos)</p>
          </div>
        )}

        {diaData.ensaladas?.ensalada1 && (
          <div className="ensalada">
            <h4>Ensalada</h4>
            <p>{diaData.ensaladas.ensalada1}</p>
          </div>
        )}

        {diaData.postre && (
          <div className="postre">
            <h4>Postre</h4>
            <p>{diaData.postre}</p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!menuData) {
    return <div className="no-menu">No hay menú disponible</div>;
  }

  return (
    <div className="ver-menu-container">
      <div className="menu-header">
        {menuData.temporada && <h3>{menuData.temporada}</h3>}
        {menuData.semana && <h4>{menuData.semana}</h4>}
      </div>

      <div className="menu-dias">
        {['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map(dia => (
          <div key={dia}>
            {renderDiaMenu(dia, dia.charAt(0).toUpperCase() + dia.slice(1))}
          </div>
        ))}
      </div>

      {menuData.ultimaModificacion && (
        <div className="ultima-actualizacion">
          Última actualización: {new Date(menuData.ultimaModificacion.toDate()).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default VerMenu; 