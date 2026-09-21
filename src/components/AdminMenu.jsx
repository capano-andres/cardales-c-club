import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import Modal from './Modal';
import Spinner from './Spinner';
import jsPDF from 'jspdf';
import './AdminMenu.css';

const AdminMenu = ({ onMenuDeleted, tipo = 'actual', readOnly = false }) => {
  const [menuData, setMenuData] = useState(null);
  const [menuStructure, setMenuStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    cargarMenu();
  }, [tipo]);

  const cargarMenu = async () => {
    try {
      setLoading(true);
      // Cargar la estructura del menú
      const structureRef = doc(db, 'config', 'menuStructure');
      const structureSnap = await getDoc(structureRef);
      if (structureSnap.exists()) {
        setMenuStructure(structureSnap.data());
      }

      // Cargar el menú actual
      const menuRef = doc(db, 'menus', tipo === 'actual' ? 'menuActual' : 'menuProxima');
      const menuSnap = await getDoc(menuRef);

      if (menuSnap.exists()) {
        const data = menuSnap.data();
        setMenuData(data);
      } else {
        setError(`No hay menú ${tipo === 'actual' ? 'actual' : 'de próxima semana'} disponible`);
      }
    } catch (error) {
      console.error('Error al cargar el menú:', error);
      setError('Error al cargar el menú');
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarMenu = async () => {
    setModal({
      isOpen: true,
      title: 'Confirmar eliminación',
      message: `¿Estás seguro de que deseas eliminar el menú ${tipo === 'actual' ? 'actual' : 'de próxima semana'}?`,
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
      await deleteDoc(doc(db, 'menus', tipo === 'actual' ? 'menuActual' : 'menuProxima'));
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'Menú eliminado exitosamente',
        type: 'success'
      });
      if (onMenuDeleted) {
        onMenuDeleted();
      }
    } catch (error) {
      console.error('Error al eliminar el menú:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al eliminar el menú. Por favor, intenta nuevamente.',
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = (dia, campo, currentValue, subCampo = null) => {
    if (readOnly) return;
    setEditingField({ dia, campo, subCampo });
    setEditValue(currentValue || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveField = async () => {
    if (!editingField || isSaving) return;
    const { dia, campo, subCampo } = editingField;

    const updatedDias = { ...menuData.dias };
    const updatedDia = { ...updatedDias[dia] };

    if (subCampo) {
      updatedDia[campo] = { ...updatedDia[campo], [subCampo]: editValue };
    } else {
      updatedDia[campo] = editValue;
    }
    updatedDias[dia] = updatedDia;

    setIsSaving(true);
    try {
      const menuDocId = tipo === 'actual' ? 'menuActual' : 'menuProxima';
      await setDoc(doc(db, 'menus', menuDocId), { dias: updatedDias }, { merge: true });
      setMenuData(prev => ({ ...prev, dias: updatedDias }));
      setEditingField(null);
      setEditValue('');
    } catch (error) {
      console.error('Error al guardar el campo:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al guardar el cambio. Por favor, intenta nuevamente.',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveField();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const isEditing = (dia, campo, subCampo = null) => {
    if (!editingField) return false;
    return editingField.dia === dia && editingField.campo === campo && editingField.subCampo === subCampo;
  };

  const renderEditableField = (dia, campo, value, subCampo = null) => {
    if (isEditing(dia, campo, subCampo)) {
      return (
        <div className="menu-edit-wrapper">
          <input
            ref={inputRef}
            className="menu-edit-input"
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            disabled={isSaving}
          />
          <div className="menu-edit-actions">
            <button
              className="menu-edit-btn save"
              onClick={handleSaveField}
              disabled={isSaving}
              title="Guardar (Enter)"
            >
              ✓
            </button>
            <button
              className="menu-edit-btn cancel"
              onClick={cancelEditing}
              disabled={isSaving}
              title="Cancelar (Escape)"
            >
              ✗
            </button>
          </div>
        </div>
      );
    }

    if (readOnly) {
      return <p>{value}</p>;
    }

    return (
      <p
        className="menu-item-editable"
        onClick={() => startEditing(dia, campo, value, subCampo)}
        title="Click para editar"
      >
        {value}
        <span className="edit-hint">✏️</span>
      </p>
    );
  };

  const generarPDF = () => {
    if (!menuData) return;

    setIsGeneratingPDF(true);
    try {
      const pdf = new jsPDF();
      let yPosition = 20;
      const lineHeight = 7;
      const margin = 20;
      const pageWidth = pdf.internal.pageSize.width;
      const textWidth = pageWidth - (margin * 2);

      // Título principal
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('MENÚ SEMANAL', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += lineHeight * 2;

      // Información adicional
      if (menuData.temporada) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(menuData.temporada, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += lineHeight * 1.5;
      }

      if (menuData.semana) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(menuData.semana, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += lineHeight * 2;
      }

      // Días del menú
      const dias = [
        { key: 'lunes', nombre: 'LUNES' },
        { key: 'martes', nombre: 'MARTES' },
        { key: 'miercoles', nombre: 'MIÉRCOLES' },
        { key: 'jueves', nombre: 'JUEVES' },
        { key: 'viernes', nombre: 'VIERNES' }
      ];

      dias.forEach(dia => {
        const diaData = menuData.dias[dia.key];
        if (!diaData) return;

        // Verificar si hay espacio suficiente en la página
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }

        // Título del día
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(dia.nombre, margin, yPosition);
        yPosition += lineHeight * 1.2;

        if (diaData.esFeriado) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'normal');
          pdf.text('FERIADO - No hay servicio de comida este día', margin, yPosition);
          yPosition += lineHeight * 2;
          return;
        }

        // Opciones del menú
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');

        if (menuStructure?.opciones) {
          menuStructure.opciones.forEach(opcion => {
            const opcionKey = opcion.toLowerCase().replace(/ /g, '');
            if (diaData[opcionKey] && opcionKey !== 'postre') {
              const text = `${opcion}: ${diaData[opcionKey]}`;
              const lines = pdf.splitTextToSize(text, textWidth);
              lines.forEach(line => {
                if (yPosition > 250) {
                  pdf.addPage();
                  yPosition = 20;
                }
                pdf.text(line, margin, yPosition);
                yPosition += lineHeight;
              });
              yPosition += lineHeight * 0.5;
            }
          });
        }

        // Sandwich de miga
        if (diaData.sandwichMiga?.tipo) {
          const text = `Sandwich de Miga: ${diaData.sandwichMiga.tipo} (${diaData.sandwichMiga.cantidad} triángulos)`;
          const lines = pdf.splitTextToSize(text, textWidth);
          lines.forEach(line => {
            if (yPosition > 250) {
              pdf.addPage();
              yPosition = 20;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
          });
          yPosition += lineHeight * 0.5;
        }

        // Ensalada
        if (diaData.ensaladas?.ensalada1) {
          const text = `Ensalada: ${diaData.ensaladas.ensalada1}`;
          const lines = pdf.splitTextToSize(text, textWidth);
          lines.forEach(line => {
            if (yPosition > 250) {
              pdf.addPage();
              yPosition = 20;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
          });
          yPosition += lineHeight * 0.5;
        }

        // Postre
        if (diaData.postre) {
          const text = `Postre: ${diaData.postre}`;
          const lines = pdf.splitTextToSize(text, textWidth);
          lines.forEach(line => {
            if (yPosition > 250) {
              pdf.addPage();
              yPosition = 20;
            }
            pdf.text(line, margin, yPosition);
            yPosition += lineHeight;
          });
          yPosition += lineHeight * 0.5;
        }

        yPosition += lineHeight; // Espacio entre días
      });

      // Información de última modificación
      if (menuData.ultimaModificacion) {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        const fecha = new Date(menuData.ultimaModificacion.toDate()).toLocaleString();
        pdf.text(`Última actualización: ${fecha}`, margin, yPosition);
      }

      // Guardar el PDF
      const nombreArchivo = `menu_${tipo === 'actual' ? 'actual' : 'proxima_semana'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(nombreArchivo);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al generar el PDF. Por favor, intenta nuevamente.',
        type: 'error'
      });
    } finally {
      setIsGeneratingPDF(false);
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
          {menuStructure?.opciones?.map((opcion) => {
            const opcionKey = opcion.toLowerCase().replace(/ /g, '');
            if (diaData[opcionKey] && opcionKey !== 'postre') {
              return (
                <div key={opcion} className="menu-item">
                  <h4>{opcion}</h4>
                  {renderEditableField(dia, opcionKey, diaData[opcionKey])}
                </div>
              );
            }
            return null;
          })}
        </div>

        {diaData.sandwichMiga?.tipo && (
          <div className="sandwich-miga">
            <h4>Sandwich de Miga</h4>
            {renderEditableField(dia, 'sandwichMiga', diaData.sandwichMiga.tipo, 'tipo')}
          </div>
        )}

        {diaData.ensaladas?.ensalada1 && (
          <div className="ensalada">
            <h4>Ensalada</h4>
            {renderEditableField(dia, 'ensaladas', diaData.ensaladas.ensalada1, 'ensalada1')}
          </div>
        )}

        {diaData.postre && (
          <div className="postre">
            <h4>Postre</h4>
            {renderEditableField(dia, 'postre', diaData.postre)}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="admin-menu-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!menuData) {
    return (
      <div className="admin-menu-container">
        <div className="no-menu">No hay menú disponible</div>
      </div>
    );
  }

  return (
    <div className="admin-menu-container">
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      />

      <div className="admin-header">
        <div className="menu-header">
          <h2>Menú Próxima Semana</h2>
          {menuData.temporada && <h3>{menuData.temporada}</h3>}
          {menuData.semana && <h4>{menuData.semana}</h4>}
        </div>
        <div className="admin-buttons">
          <button
            className="download-button"
            onClick={generarPDF}
            disabled={isGeneratingPDF}
            style={{ width: readOnly ? '100%' : '50%' }}
          >
            {isGeneratingPDF ? 'Generando...' : '📄 Descargar PDF'}
          </button>
          {!readOnly && (
            <button
              className="delete-button"
              onClick={handleEliminarMenu}
              disabled={isDeleting}
              style={{ width: '50%' }}
            >
              {isDeleting ? 'Eliminando...' : '🗑️ Eliminar Menú'}
            </button>
          )}
        </div>
      </div>

      {menuData && (
        <div className="menu-dias">
          {['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map(dia => (
            <div key={dia}>
              {renderDiaMenu(dia, dia.charAt(0).toUpperCase() + dia.slice(1))}
            </div>
          ))}
        </div>
      )}

      {menuData?.ultimaModificacion && (
        <div className="ultima-actualizacion">
          Última actualización: {new Date(menuData.ultimaModificacion.toDate()).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default AdminMenu; 