import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Modal from './Modal';
import './PrecioMenu.css';

const PrecioMenu = ({ readOnly = false }) => {
  const [precios, setPrecios] = useState({
    precio: '',
    porcentajeBonificacion: '',
    montoBonificacion: ''
  });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    cargarPrecios();
  }, []);

  const cargarPrecios = async () => {
    try {
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);

      if (precioSnap.exists()) {
        const data = precioSnap.data();
        const precio = data.precio ?? 6400;
        const porcentaje = data.porcentajeBonificacion ?? 70;
        const monto = data.montoBonificacion ?? Math.round(precio * porcentaje / 100);

        setPrecios({
          precio: precio.toString(),
          porcentajeBonificacion: porcentaje.toString(),
          montoBonificacion: monto.toString()
        });
      } else {
        setPrecios({
          precio: '6400',
          porcentajeBonificacion: '70',
          montoBonificacion: '4480'
        });
      }
    } catch (error) {
      console.error('Error al cargar los precios:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudieron cargar los precios actuales.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const precio = parseFloat(name === 'precio' ? value : precios.precio) || 0;

    let newPrecios = { ...precios, [name]: value };

    // Calcular automáticamente según el campo que cambió
    if (name === 'porcentajeBonificacion') {
      const porcentaje = parseFloat(value) || 0;
      const monto = Math.round(precio * porcentaje / 100);
      newPrecios.montoBonificacion = monto.toString();
    } else if (name === 'montoBonificacion') {
      const monto = parseFloat(value) || 0;
      const porcentaje = precio > 0 ? (monto * 100 / precio).toFixed(2) : '0';
      newPrecios.porcentajeBonificacion = porcentaje.toString();
    } else if (name === 'precio') {
      // Si cambia el precio, recalcular el monto basado en el porcentaje actual
      const porcentaje = parseFloat(precios.porcentajeBonificacion) || 0;
      const monto = Math.round(precio * porcentaje / 100);
      newPrecios.montoBonificacion = monto.toString();
    }

    setPrecios(newPrecios);
  };

  const calcularPrecioBonificado = () => {
    const precio = parseFloat(precios.precio) || 0;
    const monto = parseFloat(precios.montoBonificacion) || 0;
    return precio - monto;
  };

  const handleGuardarPrecios = async () => {
    try {
      const precio = parseFloat(precios.precio);
      const porcentaje = parseFloat(precios.porcentajeBonificacion);
      const monto = parseFloat(precios.montoBonificacion);

      // Validar que el precio sea válido y mayor a 0
      if (isNaN(precio) || precio <= 0) {
        setModal({
          isOpen: true,
          title: 'Error',
          message: 'Por favor, ingrese un precio válido mayor a 0.',
          type: 'error'
        });
        return;
      }

      // Validar que el porcentaje esté entre 0 y 100
      if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        setModal({
          isOpen: true,
          title: 'Error',
          message: 'Por favor, ingrese un porcentaje de bonificación válido entre 0 y 100.',
          type: 'error'
        });
        return;
      }

      // Validar que el monto no sea mayor al precio
      if (isNaN(monto) || monto < 0 || monto > precio) {
        setModal({
          isOpen: true,
          title: 'Error',
          message: 'Por favor, ingrese un monto de bonificación válido que no sea mayor al precio del menú.',
          type: 'error'
        });
        return;
      }

      const nuevosPrecios = {
        precio: precio,
        porcentajeBonificacion: porcentaje,
        montoBonificacion: monto
      };

      const precioRef = doc(db, 'config', 'precioMenu');
      await setDoc(precioRef, nuevosPrecios);

      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'Precios actualizados correctamente.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error al guardar los precios:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudieron guardar los precios.',
        type: 'error'
      });
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="precio-menu-container">
      <h2>Configuración de Precios</h2>
      <div className="precio-form">
        <div className="precio-input-group">
          <label htmlFor="precio">Costo Menu ($):</label>
          <input
            type="number"
            id="precio"
            name="precio"
            value={precios.precio}
            onChange={handleChange}
            min="0"
            step="100"
            disabled={readOnly}
          />
        </div>

        <div className="precio-input-group">
          <label htmlFor="porcentajeBonificacion">Porcentaje de Bonificación (%):</label>
          <input
            type="number"
            id="porcentajeBonificacion"
            name="porcentajeBonificacion"
            value={precios.porcentajeBonificacion}
            onChange={handleChange}
            min="0"
            max="100"
            step="0.1"
            disabled={readOnly}
          />
        </div>

        <div className="precio-input-group">
          <label htmlFor="montoBonificacion">Monto de Bonificación ($):</label>
          <input
            type="number"
            id="montoBonificacion"
            name="montoBonificacion"
            value={precios.montoBonificacion}
            onChange={handleChange}
            min="0"
            step="100"
            disabled={readOnly}
          />
        </div>

        {/* Mostrar el precio calculado */}
        <div className="precio-preview" style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#e8f5e8',
          borderRadius: '4px',
          color: '#000',
          border: '1px solid #28a745'
        }}>
          <p><strong>Vista previa:</strong></p>
          <p>• Precio normal: ${precios.precio || '0'}</p>
          <p>• Bonificación: ${precios.montoBonificacion || '0'} ({precios.porcentajeBonificacion || '0'}%)</p>
          <p>• Precio final bonificado: ${calcularPrecioBonificado()}</p>
        </div>

        {!readOnly && (
          <button
            className="guardar-precio-btn"
            onClick={handleGuardarPrecios}
          >
            Guardar Precios
          </button>
        )}
      </div>
      <div className="precio-info" style={{
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        border: '1px solid #dee2e6',
        color: '#666'
      }}>
        <p><strong>Importante:</strong> La actualización de los precios del menú debe realizarse luego del cierre semanal (viernes) para asegurar la correcta aplicación en los pedidos de la próxima semana.</p>
        <div style={{ marginTop: '10px' }}>
          <p><strong>Tipos de precios:</strong></p>
          <ul style={{ marginTop: '5px' }}>
            <li><strong>Costo Menu:</strong> Para usuarios sin bonificación</li>
            <li><strong>Porcentaje de Bonificación:</strong> Descuento aplicado a empleados bonificados</li>
            <li><strong>Monto de Bonificación:</strong> Cantidad fija de descuento en pesos</li>
          </ul>
        </div>
        <div style={{ marginTop: '10px' }}>
          <p><strong>Funcionamiento:</strong> Puedes modificar el porcentaje y automáticamente se calculará el monto, o viceversa. Ambos valores se mantienen sincronizados.</p>
        </div>
      </div>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
};

export default PrecioMenu; 