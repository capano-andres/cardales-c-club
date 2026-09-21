import React, { useState, useEffect, useRef } from 'react';
import { db, storage, catalogDb, catalogStorage } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Spinner from './Spinner';
import Modal from './Modal';
import './ImagenesMenu.css';

const DOC_IMAGENES = 'textoImagenes';

/**
 * Extrae todos los textos únicos de platos del menú (menuActual y menuProxima).
 * Filtra campos no relevantes (esFeriado, campos _img, postre, etc.)
 * Devuelve un Set de strings (los textos de los platos).
 */
const extraerTextos = (menuData) => {
  if (!menuData?.dias) return [];
  const textos = new Set();
  const IGNORAR = new Set(['esFeriado', 'hayCambios', 'diasModificados', 'ultimaModificacion', 'semana', 'temporada']);

  Object.values(menuData.dias).forEach(diaData => {
    if (!diaData || diaData.esFeriado) return;
    Object.entries(diaData).forEach(([key, value]) => {
      if (IGNORAR.has(key)) return;
      if (key.endsWith('_img')) return;
      if (typeof value === 'string' && value.trim()) {
        if (key === 'postre') {
          // Separar múltiples postres: "Helado / Yogurt / Gelatina" → 3 entradas
          value.split('/').forEach(item => {
            const t = item.replace(/[.]/g, '').trim();
            if (t) textos.add(t);
          });
        } else {
          textos.add(value.trim());
        }
      } else if (typeof value === 'object' && value !== null) {
        // Casos como sandwichMiga, ensaladas
        Object.values(value).forEach(v => {
          if (typeof v === 'string' && v.trim()) textos.add(v.trim());
        });
      }
    });
  });

  return Array.from(textos).sort((a, b) => a.localeCompare(b));
};

const ImagenesMenu = ({ readOnly = false }) => {
  const [textosActuales, setTextosActuales] = useState([]);  // textos del menú activo
  const [imagenes, setImagenes] = useState({});              // config/textoImagenes
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});            // { texto: progress }
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [busqueda, setBusqueda] = useState('');
  const [nuevoTexto, setNuevoTexto] = useState('');
  const fileInputRefs = useRef({});

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const textos = new Set();

      // Cargar menú actual y próximo del proyecto cliente (para extraer textos)
      try {
        for (const docId of ['menuActual', 'menuProxima']) {
          const snap = await getDoc(doc(db, 'menus', docId));
          if (snap.exists()) {
            extraerTextos(snap.data()).forEach(t => textos.add(t));
          }
        }
      } catch (clientErr) {
        console.warn('No se pudieron leer los menús del cliente:', clientErr.message);
        // No es un error fatal — puede no haber menú aún
      }

      // Cargar imágenes existentes del catálogo central
      const imgSnap = await getDoc(doc(catalogDb, 'config', DOC_IMAGENES));
      const imgData = imgSnap.exists() ? imgSnap.data() : {};
      setImagenes(imgData);

      // Incluir también textos que ya tienen imagen (aunque no estén en menú actual)
      Object.keys(imgData).forEach(t => textos.add(t));

      setTextosActuales(Array.from(textos).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      console.error('Error al cargar catálogo:', e);
      setModal({
        isOpen: true,
        title: 'Error',
        message: `No se pudieron cargar los datos. Detalle: ${e.message || e.code || JSON.stringify(e)}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const agregarTextoManual = () => {
    const texto = nuevoTexto.trim();
    if (!texto) return;
    if (textosActuales.includes(texto)) {
      setModal({ isOpen: true, title: 'Ya existe', message: `"${texto}" ya está en la lista.`, type: 'info' });
      return;
    }
    setTextosActuales(prev => [...prev, texto].sort((a, b) => a.localeCompare(b)));
    setNuevoTexto('');
  };

  const comprimirImagen = (file, maxWidth = 800, quality = 0.8) =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob ?? file), 'image/webp', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });

  const handleFileChange = async (texto, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setModal({ isOpen: true, title: 'Error', message: 'Solo se permiten imágenes.', type: 'error' });
      return;
    }
    e.target.value = '';
    const compressed = await comprimirImagen(file);
    subirImagen(texto, compressed, 'webp');
  };

  const subirImagen = (texto, file, ext = file.name.split('.').pop()) => {
    const safeKey = texto.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 80);
    const path = `platos/${safeKey}_${Date.now()}.${ext}`;
    const storageRef = ref(catalogStorage, path);
    const task = uploadBytesResumable(storageRef, file);

    setUploading(prev => ({ ...prev, [texto]: 0 }));

    task.on(
      'state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploading(prev => ({ ...prev, [texto]: pct }));
      },
      err => {
        setUploading(prev => { const n = { ...prev }; delete n[texto]; return n; });
        setModal({ isOpen: true, title: 'Error', message: 'Error al subir: ' + err.message, type: 'error' });
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          // Borrar imagen anterior si existe
          const prev = imagenes[texto];
          if (prev?.path) {
            try { await deleteObject(ref(catalogStorage, prev.path)); } catch (_) {}
          }
          const nuevas = { ...imagenes, [texto]: { url, path } };
          await setDoc(doc(catalogDb, 'config', DOC_IMAGENES), nuevas);
          setImagenes(nuevas);
        } catch (e) {
          setModal({ isOpen: true, title: 'Error', message: 'Error al guardar imagen.', type: 'error' });
        } finally {
          setUploading(prev => { const n = { ...prev }; delete n[texto]; return n; });
        }
      }
    );
  };

  const confirmarEliminar = (texto) => {
    setModal({
      isOpen: true,
      title: 'Eliminar imagen',
      message: `¿Eliminar la imagen de "${texto.slice(0, 60)}..."?`,
      type: 'warning',
      actions: [
        { label: 'Cancelar', type: 'secondary', onClick: () => setModal({ isOpen: false }) },
        {
          label: 'Eliminar', type: 'danger', onClick: async () => {
            setModal({ isOpen: false });
            const img = imagenes[texto];
            if (img?.path) {
              try { await deleteObject(ref(catalogStorage, img.path)); } catch (_) {}
            }
            const nuevas = { ...imagenes };
            delete nuevas[texto];
            await setDoc(doc(catalogDb, 'config', DOC_IMAGENES), nuevas);
            setImagenes(nuevas);
          }
        }
      ]
    });
  };

  // Filtro por búsqueda
  const textosFiltrados = busqueda.trim()
    ? textosActuales.filter(t => t.toLowerCase().includes(busqueda.toLowerCase()))
    : textosActuales;

  const conImg = textosActuales.filter(t => imagenes[t]).length;
  const sinImg = textosActuales.length - conImg;

  if (loading) return <Spinner />;

  return (
    <div className="imagenes-menu-container">
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      />

      <div className="imagenes-menu-header">
        <h2>🖼️ Imágenes de Platos</h2>
        <p className="imagenes-menu-desc">
          Asociá una imagen a cada texto de plato. La imagen se buscará por el texto exacto,
          independientemente de la opción o el día en que aparezca.
        </p>
        <div className="imagenes-stats">
          <span className="stat-badge stat-ok">✅ {conImg} con imagen</span>
          <span className="stat-badge stat-warn">⚠️ {sinImg} sin imagen</span>
        </div>
      </div>

      <div className="imagenes-busqueda">
        <input
          type="text"
          placeholder="🔍 Buscar plato..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="busqueda-input"
        />
      </div>

      {!readOnly && (
        <div className="imagenes-agregar-manual">
          <input
            type="text"
            placeholder="✏️ Agregar plato manualmente..."
            value={nuevoTexto}
            onChange={e => setNuevoTexto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarTextoManual()}
            className="busqueda-input"
          />
          <button
            className="btn-agregar-manual"
            onClick={agregarTextoManual}
            disabled={!nuevoTexto.trim()}
          >
            + Agregar
          </button>
        </div>
      )}

      <div className="imagenes-grid">
        {textosFiltrados.map((texto) => {
          const img = imagenes[texto];
          const isUploading = texto in uploading;
          const progress = uploading[texto] ?? 0;
          const refKey = texto.slice(0, 50);

          return (
            <div key={texto} className={`imagen-card ${img ? 'has-image' : 'no-image'}`}>
              <div className="imagen-card-texto" title={texto}>
                {texto.length > 80 ? texto.slice(0, 80) + '…' : texto}
              </div>

              <div className="imagen-preview-area">
                {isUploading ? (
                  <div className="upload-progress-wrapper">
                    <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
                    <span className="upload-progress-text">{progress}%</span>
                  </div>
                ) : img ? (
                  <img
                    src={img.url}
                    alt={texto}
                    className="imagen-preview"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="imagen-placeholder">
                    <span>📷</span>
                    <small>Sin imagen</small>
                  </div>
                )}
              </div>

              {!readOnly && (
                <div className="imagen-card-actions">
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={el => fileInputRefs.current[refKey] = el}
                    onChange={e => handleFileChange(texto, e)}
                  />
                  <button
                    className="btn-upload"
                    onClick={() => fileInputRefs.current[refKey]?.click()}
                    disabled={isUploading}
                  >
                    {img ? '📷 Cambiar' : '📷 Subir imagen'}
                  </button>
                  {img && (
                    <button
                      className="btn-delete"
                      onClick={() => confirmarEliminar(texto)}
                      disabled={isUploading}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {textosFiltrados.length === 0 && (
        <div className="imagenes-empty">
          {busqueda ? (
            <p>No se encontraron platos con "<strong>{busqueda}</strong>"</p>
          ) : (
            <>
              <p>No hay textos de platos disponibles.</p>
              <p>Cargá un menú primero para ver los platos aquí.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ImagenesMenu;
