import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Modal from './Modal';
import Spinner from './Spinner';
import './MenuStructureManager.css';

const MenuStructureManager = ({ readOnly = false }) => {
  const [menuStructure, setMenuStructure] = useState({
    opciones: []
  });
  const [newOption, setNewOption] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    cargarEstructuraMenu();
  }, []);

  const cargarEstructuraMenu = async () => {
    try {
      setLoading(true);
      const structureRef = doc(db, 'config', 'menuStructure');
      const structureSnap = await getDoc(structureRef);

      if (structureSnap.exists()) {
        setMenuStructure(structureSnap.data());
      } else {
        const defaultStructure = {
          opciones: ['Beti Jai', 'Pastas', 'Light', 'Clásico']
        };
        await setDoc(structureRef, defaultStructure);
        setMenuStructure(defaultStructure);
      }
    } catch (error) {
      console.error('Error al cargar la estructura:', error);
      setMessage({ type: 'error', text: 'Error al cargar la estructura del menú' });
    } finally {
      setLoading(false);
    }
  };

  const guardarEstructura = async () => {
    try {
      setLoading(true);
      const structureRef = doc(db, 'config', 'menuStructure');

      const estructuraActualizada = JSON.parse(JSON.stringify({
        opciones: menuStructure.opciones
      }));

      await setDoc(structureRef, estructuraActualizada);

      const docSnap = await getDoc(structureRef);
      if (!docSnap.exists()) {
        throw new Error('No se pudo verificar el guardado');
      }

      const datosGuardados = docSnap.data();
      setMenuStructure(datosGuardados);

      setMessage({ type: 'success', text: 'Estructura del menú actualizada correctamente' });
    } catch (error) {
      console.error('Error al guardar la estructura:', error);
      setMessage({ type: 'error', text: 'Error al guardar los cambios: ' + error.message });
      await cargarEstructuraMenu();
    } finally {
      setLoading(false);
    }
  };

  const agregarOpcion = async () => {
    if (!newOption.trim()) return;
    if (menuStructure.opciones.includes(newOption.trim())) {
      setMessage({ type: 'error', text: 'Esta opción ya existe' });
      return;
    }

    try {
      setLoading(true);
      const nuevasOpciones = [...menuStructure.opciones, newOption.trim()];

      const nuevoEstado = {
        ...menuStructure,
        opciones: nuevasOpciones
      };

      setMenuStructure(nuevoEstado);

      const structureRef = doc(db, 'config', 'menuStructure');
      await setDoc(structureRef, nuevoEstado);

      const docSnap = await getDoc(structureRef);
      if (!docSnap.exists()) {
        throw new Error('No se pudo verificar el guardado');
      }

      setNewOption('');
      setMessage({ type: 'success', text: 'Opción agregada' });
    } catch (error) {
      console.error('Error al agregar opción:', error);
      setMessage({ type: 'error', text: 'Error al agregar la opción' });
      await cargarEstructuraMenu();
    } finally {
      setLoading(false);
    }
  };

  const eliminarOpcion = async (opcion) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la opción "${opcion}"?`)) return;

    try {
      setLoading(true);
      const nuevasOpciones = menuStructure.opciones.filter(o => o !== opcion);

      const nuevoEstado = {
        ...menuStructure,
        opciones: nuevasOpciones
      };

      setMenuStructure(nuevoEstado);

      const structureRef = doc(db, 'config', 'menuStructure');
      await setDoc(structureRef, nuevoEstado);

      const docSnap = await getDoc(structureRef);
      if (!docSnap.exists()) {
        throw new Error('No se pudo verificar el guardado');
      }

      setMessage({ type: 'success', text: 'Opción eliminada' });
    } catch (error) {
      console.error('Error al eliminar opción:', error);
      setMessage({ type: 'error', text: 'Error al eliminar la opción' });
      await cargarEstructuraMenu();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="menu-structure-manager">
      <h2>Gestionar Estructura del Menú</h2>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="section">
        <h3>Opciones Principales del Menú</h3>
        <div className="options-list">
          {menuStructure.opciones.map((opcion, index) => (
            <div key={index} className="option-item">
              <span>{opcion}</span>
              {!readOnly && (
                <button
                  className="delete-option"
                  onClick={() => eliminarOpcion(opcion)}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <div className="add-option">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              placeholder="Nueva opción..."
            />
            <button onClick={agregarOpcion}>Agregar</button>
          </div>
        )}
      </div>

      {!readOnly && (
        <button
          className="save-button"
          onClick={guardarEstructura}
          disabled={loading}
        >
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      )}
    </div>
  );
};

export default MenuStructureManager; 