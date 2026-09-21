import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import Modal from './Modal';
import Spinner from './Spinner';
import './MenuForm.css';

const MenuForm = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: '',
    categoria: 'almuerzo',
    disponible: true
  });

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const menuRef = collection(db, "menu");
      const q = query(menuRef, orderBy("categoria"), orderBy("nombre"));
      const querySnapshot = await getDocs(q);
      const items = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMenuItems(items);
    } catch (error) {
      console.error("Error al cargar el menú:", error);
      setError("Error al cargar el menú");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const menuRef = collection(db, "menu");
      await addDoc(menuRef, {
        ...formData,
        precio: parseFloat(formData.precio),
        fechaCreacion: new Date()
      });

      setSuccess('Plato agregado exitosamente');
      setFormData({
        nombre: '',
        descripcion: '',
        precio: '',
        categoria: 'almuerzo',
        disponible: true
      });
      fetchMenuItems();
    } catch (error) {
      console.error("Error al agregar plato:", error);
      setError("Error al agregar plato");
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="menu-form-container">
      <h2>Gestión del Menú Semanal</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="menu-form">
        <div className="form-group">
          <label htmlFor="nombre">Nombre del Plato:</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="descripcion">Descripción:</label>
          <textarea
            id="descripcion"
            name="descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="precio">Precio:</label>
          <input
            type="number"
            id="precio"
            name="precio"
            value={formData.precio}
            onChange={handleChange}
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="categoria">Categoría:</label>
          <select
            id="categoria"
            name="categoria"
            value={formData.categoria}
            onChange={handleChange}
            required
          >
            <option value="almuerzo">Almuerzo</option>
            <option value="cena">Cena</option>
            <option value="postre">Postre</option>
            <option value="bebida">Bebida</option>
          </select>
        </div>

        <div className="form-group checkbox">
          <label>
            <input
              type="checkbox"
              name="disponible"
              checked={formData.disponible}
              onChange={handleChange}
            />
            Disponible
          </label>
        </div>

        <button type="submit" className="submit-button">
          Agregar Plato
        </button>
      </form>

      <div className="menu-list">
        <h3>Platos Actuales</h3>
        <div className="menu-items">
          {menuItems.map(item => (
            <div key={item.id} className="menu-item">
              <h4>{item.nombre}</h4>
              <p>{item.descripcion}</p>
              <p className="price">${item.precio.toFixed(2)}</p>
              <p className="category">{item.categoria}</p>
              <p className="status">
                {item.disponible ? 'Disponible' : 'No disponible'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MenuForm; 