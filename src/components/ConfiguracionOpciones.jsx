import React, { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import Modal from './Modal';
import './ConfiguracionOpciones.css';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const MENUS_DEFAULT = [
  'BETI JAI', 'CLASICO', 'DIETA BLANDA', 'ENSALADA',
  'LIGHT', 'MENU PBT X 2', 'PASTAS', 'SAND DE MIGA'
];
const POSTRES_DEFAULT = ['C/GELATINA', 'C/POSTRE', 'C/YOGURT'];
const BEBIDAS_DEFAULT = [
  'AGUA CON GAS', 'AGUA SIN GAS', 'AQUARIOS MANZANA',
  'COCA', 'COCA ZERO', 'SPRITE'
];

const buildDefault = () => ({
  menus: Object.fromEntries(DIAS_SEMANA.map(d => [d, [...MENUS_DEFAULT]])),
  postres: [...POSTRES_DEFAULT],
  postresPorDia: Object.fromEntries(DIAS_SEMANA.map(d => [d, [...POSTRES_DEFAULT]])),
  bebidas: [...BEBIDAS_DEFAULT],
  postreDesdeMenu: Object.fromEntries(DIAS_SEMANA.map(d => [d, true])),
});

const DOC_ID = 'opcionesMenuCascada';

const ConfiguracionOpciones = ({ readOnly = false }) => {
  const [config, setConfig] = useState(buildDefault());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [activeDia, setActiveDia] = useState('Lunes');
  const [inputs, setInputs] = useState({ menu: '', postres: '', bebidas: '', postreDia: '' });
  const [editing, setEditing] = useState(null); // { tipo: 'menus'|'postres'|'bebidas'|'postresPorDia', dia?: string, index: number, value: string }
  const [activePostreDia, setActivePostreDia] = useState('Lunes');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    try {
      const db = getFirestore();
      const ref = doc(db, 'config', DOC_ID);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        // Migrar: si no tiene postresPorDia, crearlo a partir de postres globales
        if (!data.postresPorDia) {
          data.postresPorDia = Object.fromEntries(
            DIAS_SEMANA.map(d => [d, [...(data.postres || POSTRES_DEFAULT)]])
          );
        }
        // Migrar: si postreDesdeMenu es boolean (viejo), convertir a objeto por día
        if (typeof data.postreDesdeMenu === 'boolean') {
          const val = data.postreDesdeMenu;
          data.postreDesdeMenu = Object.fromEntries(DIAS_SEMANA.map(d => [d, val]));
        } else if (!data.postreDesdeMenu) {
          data.postreDesdeMenu = Object.fromEntries(DIAS_SEMANA.map(d => [d, true]));
        }
        setConfig(data);
      } else {
        const defaults = buildDefault();
        await setDoc(ref, defaults);
        setConfig(defaults);
      }
    } catch (e) {
      setModal({ isOpen: true, title: 'Error', message: e.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const guardar = async () => {
    try {
      setIsSaving(true);
      const db = getFirestore();
      await setDoc(doc(db, 'config', DOC_ID), config);
      setModal({ isOpen: true, title: 'Exito', message: 'Configuracion guardada correctamente.', type: 'success' });
    } catch (e) {
      setModal({ isOpen: true, title: 'Error', message: e.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const agregarMenu = () => {
    const val = inputs.menu.trim().toUpperCase();
    if (!val) return;
    if (config.menus?.[activeDia]?.includes(val)) {
      setModal({ isOpen: true, title: 'Aviso', message: 'Este menu ya existe para este dia.', type: 'info' });
      return;
    }
    setConfig(prev => ({
      ...prev,
      menus: { ...prev.menus, [activeDia]: [...(prev.menus[activeDia] || []), val].sort() }
    }));
    setInputs(prev => ({ ...prev, menu: '' }));
  };

  const eliminarMenu = (dia, item) => {
    setConfig(prev => ({
      ...prev,
      menus: { ...prev.menus, [dia]: prev.menus[dia].filter(x => x !== item) }
    }));
  };

  const agregarGlobal = (campo) => {
    const val = (inputs[campo] || '').trim().toUpperCase();
    if (!val) return;
    if (config[campo]?.includes(val)) {
      setModal({ isOpen: true, title: 'Aviso', message: 'Esta opcion ya existe.', type: 'info' });
      return;
    }
    setConfig(prev => ({ ...prev, [campo]: [...(prev[campo] || []), val].sort() }));
    setInputs(prev => ({ ...prev, [campo]: '' }));
  };

  const eliminarGlobal = (campo, item) => {
    setConfig(prev => ({ ...prev, [campo]: prev[campo].filter(x => x !== item) }));
  };

  // --- Postres por día ---
  const agregarPostreDia = () => {
    const val = (inputs.postreDia || '').trim().toUpperCase();
    if (!val) return;
    if (config.postresPorDia?.[activePostreDia]?.includes(val)) {
      setModal({ isOpen: true, title: 'Aviso', message: 'Este postre ya existe para este día.', type: 'info' });
      return;
    }
    setConfig(prev => ({
      ...prev,
      postresPorDia: {
        ...prev.postresPorDia,
        [activePostreDia]: [...(prev.postresPorDia?.[activePostreDia] || []), val].sort()
      }
    }));
    setInputs(prev => ({ ...prev, postreDia: '' }));
  };

  const eliminarPostreDia = (dia, item) => {
    setConfig(prev => ({
      ...prev,
      postresPorDia: {
        ...prev.postresPorDia,
        [dia]: (prev.postresPorDia?.[dia] || []).filter(x => x !== item)
      }
    }));
  };

  const copyPostresToAllDays = () => {
    const source = config.postresPorDia?.[activePostreDia] || [];
    setConfig(prev => ({
      ...prev,
      postresPorDia: Object.fromEntries(DIAS_SEMANA.map(d => [d, [...source]]))
    }));
    setModal({ isOpen: true, title: 'Copiado', message: `Postres de ${activePostreDia} copiados a todos los días.`, type: 'success' });
  };

  // --- Edicion inline ---
  const startEdit = (tipo, index, value, dia) => {
    setEditing({ tipo, index, value, dia });
  };

  const saveEdit = () => {
    if (!editing) return;
    const newVal = editing.value.trim().toUpperCase();
    if (!newVal) { setEditing(null); return; }

    if (editing.tipo === 'menus') {
      const dia = editing.dia;
      setConfig(prev => {
        const arr = [...(prev.menus[dia] || [])];
        arr[editing.index] = newVal;
        return { ...prev, menus: { ...prev.menus, [dia]: arr.sort() } };
      });
    } else if (editing.tipo === 'postresPorDia') {
      const dia = editing.dia;
      setConfig(prev => {
        const arr = [...(prev.postresPorDia?.[dia] || [])];
        arr[editing.index] = newVal;
        return { ...prev, postresPorDia: { ...prev.postresPorDia, [dia]: arr.sort() } };
      });
    } else {
      setConfig(prev => {
        const arr = [...(prev[editing.tipo] || [])];
        arr[editing.index] = newVal;
        return { ...prev, [editing.tipo]: arr.sort() };
      });
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const copyMenuToAllDays = () => {
    const source = config.menus?.[activeDia] || [];
    setConfig(prev => ({
      ...prev,
      menus: Object.fromEntries(DIAS_SEMANA.map(d => [d, [...source]]))
    }));
    setModal({ isOpen: true, title: 'Copiado', message: `Menús de ${activeDia} copiados a todos los días.`, type: 'success' });
  };

  if (isLoading) return <div className="configuracion-loading">Cargando...</div>;

  return (
    <div className="configuracion-opciones">
      <h2>Configuración de Opciones del Menú</h2>
      <p className="instrucciones">
        Definí los menús disponibles por día, los postres y las bebidas.
        En el formulario de pedidos, el usuario elegirá primero el menú, luego el postre y la bebida.
      </p>

      {!readOnly && (
        <button className="guardar-btn" onClick={guardar} disabled={isSaving} style={{ marginBottom: '2rem' }}>
          {isSaving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      )}

      {/* === MENÚS POR DÍA === */}
      <div className="config-section">
        <div className="config-section-header">
          <h3 className="config-section-title">🍽 Menús disponibles</h3>
          {!readOnly && (
            <button className="copy-days-btn" onClick={copyMenuToAllDays} title={`Copiar menús de ${activeDia} a todos los días`}>
              📋 Copiar a todos los días
            </button>
          )}
        </div>

        <div className="dia-tabs">
          {DIAS_SEMANA.map(d => (
            <button
              key={d}
              className={`dia-tab${activeDia === d ? ' active' : ''}`}
              onClick={() => setActiveDia(d)}
            >
              {d}
              <span className="dia-tab-count">{config.menus?.[d]?.length || 0}</span>
            </button>
          ))}
        </div>

        <div className="config-section-body">
          {(!config.menus?.[activeDia]?.length) && (
            <p className="no-items-msg">No hay menús configurados para este día.</p>
          )}
          <div className="chips-container">
            {(config.menus?.[activeDia] || []).map((item, i) => (
              <div key={i} className="chip">
                {editing && editing.tipo === 'menus' && editing.dia === activeDia && editing.index === i ? (
                  <input
                    className="chip-edit-input"
                    value={editing.value}
                    onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    onBlur={saveEdit}
                    autoFocus
                  />
                ) : (
                  <span onDoubleClick={() => !readOnly && startEdit('menus', i, item, activeDia)} title="Doble click para editar">{item}</span>
                )}
                {!readOnly && !editing && (
                  <button onClick={() => eliminarMenu(activeDia, item)} className="chip-delete">x</button>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="chip-input-group">
              <input
                type="text"
                value={inputs.menu}
                onChange={e => setInputs(prev => ({ ...prev, menu: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && agregarMenu()}
                placeholder="Nuevo menú (ej: VEGANO)..."
                className="chip-input"
              />
              <button onClick={agregarMenu} className="chip-add-btn">+ Agregar</button>
            </div>
          )}
        </div>
      </div>

      {/* === POSTRES === */}
      <div className="config-section">
        <div className="config-section-header">
          <h3 className="config-section-title">🍮 Postres</h3>
          {!readOnly && !config.postreDesdeMenu?.[activePostreDia] && (
            <button className="copy-days-btn" onClick={copyPostresToAllDays} title={`Copiar postres de ${activePostreDia} a todos los días`}>
              📋 Copiar a todos los días
            </button>
          )}
        </div>

        <div className="dia-tabs dia-tabs-postre">
          {DIAS_SEMANA.map(d => {
            const esAuto = config.postreDesdeMenu?.[d];
            return (
              <button
                key={d}
                className={`dia-tab${activePostreDia === d ? ' active' : ''}`}
                onClick={() => setActivePostreDia(d)}
              >
                {d}
                <span className="dia-tab-count">{esAuto ? '🔄' : (config.postresPorDia?.[d]?.length || 0)}</span>
              </button>
            );
          })}
        </div>

        <div className="config-section-body">
          {/* Toggle auto/manual POR DÍA */}
          <div className="postre-toggle-container">
            <label className="postre-toggle-label">
              <span className="postre-toggle-text">
                {config.postreDesdeMenu?.[activePostreDia]
                  ? `📋 ${activePostreDia}: postre automático desde el menú`
                  : `✏️ ${activePostreDia}: postre configurado manualmente`}
              </span>
              {!readOnly && (
                <div
                  className={`postre-toggle-switch ${config.postreDesdeMenu?.[activePostreDia] ? 'active' : ''}`}
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    postreDesdeMenu: {
                      ...prev.postreDesdeMenu,
                      [activePostreDia]: !prev.postreDesdeMenu?.[activePostreDia]
                    }
                  }))}
                >
                  <div className="postre-toggle-knob" />
                </div>
              )}
            </label>
            {config.postreDesdeMenu?.[activePostreDia] ? (
              <p className="postre-toggle-hint">
                El postre del {activePostreDia.toLowerCase()} se toma automáticamente del menú. Los demás postres (Gelatina, Yogurt) se mantienen fijos.
              </p>
            ) : (
              <p className="postre-toggle-hint" style={{ color: '#FFA000' }}>
                Configurá manualmente los postres disponibles para {activePostreDia.toLowerCase()}.
              </p>
            )}
          </div>

          {config.postreDesdeMenu?.[activePostreDia] ? (
            /* Modo auto: mostrar lista global (solo lectura visual) */
            <>
              <div className="chips-container">
                {(config.postres || []).map((item, i) => (
                  <div key={i} className={`chip chip-postre${item === 'C/POSTRE' ? ' chip-auto' : ''}`}>
                    {editing && editing.tipo === 'postres' && editing.index === i ? (
                      <input
                        className="chip-edit-input"
                        value={editing.value}
                        onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        onBlur={saveEdit}
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={() => !readOnly && startEdit('postres', i, item)} title="Doble click para editar">
                        {item}{item === 'C/POSTRE' ? ' 🔄' : ''}
                      </span>
                    )}
                    {!readOnly && !editing && (
                      <button onClick={() => eliminarGlobal('postres', item)} className="chip-delete">x</button>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <div className="chip-input-group">
                  <input
                    type="text"
                    value={inputs.postres}
                    onChange={e => setInputs(prev => ({ ...prev, postres: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && agregarGlobal('postres')}
                    placeholder="Nuevo postre (ej: C/FLAN)..."
                    className="chip-input"
                  />
                  <button onClick={() => agregarGlobal('postres')} className="chip-add-btn">+ Agregar</button>
                </div>
              )}
            </>
          ) : (
            /* Modo manual: postres editables por día */
            <>
              {(!config.postresPorDia?.[activePostreDia]?.length) && (
                <p className="no-items-msg">No hay postres configurados para este día.</p>
              )}
              <div className="chips-container">
                {(config.postresPorDia?.[activePostreDia] || []).map((item, i) => (
                  <div key={i} className="chip chip-postre">
                    {editing && editing.tipo === 'postresPorDia' && editing.dia === activePostreDia && editing.index === i ? (
                      <input
                        className="chip-edit-input"
                        value={editing.value}
                        onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        onBlur={saveEdit}
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={() => !readOnly && startEdit('postresPorDia', i, item, activePostreDia)} title="Doble click para editar">{item}</span>
                    )}
                    {!readOnly && !editing && (
                      <button onClick={() => eliminarPostreDia(activePostreDia, item)} className="chip-delete">x</button>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <div className="chip-input-group">
                  <input
                    type="text"
                    value={inputs.postreDia}
                    onChange={e => setInputs(prev => ({ ...prev, postreDia: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && agregarPostreDia()}
                    placeholder="Nuevo postre (ej: C/FLAN)..."
                    className="chip-input"
                  />
                  <button onClick={agregarPostreDia} className="chip-add-btn">+ Agregar</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* === BEBIDAS === */}
      <div className="config-section">
        <div className="config-section-header">
          <h3 className="config-section-title">🥤 Bebidas <span className="global-badge">Global · todos los días</span></h3>
        </div>
        <div className="config-section-body">
          {(!config.bebidas?.length) && <p className="no-items-msg">No hay bebidas configuradas.</p>}
          <div className="chips-container">
            {(config.bebidas || []).map((item, i) => (
              <div key={i} className="chip chip-bebida">
                {editing && editing.tipo === 'bebidas' && editing.index === i ? (
                  <input
                    className="chip-edit-input"
                    value={editing.value}
                    onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    onBlur={saveEdit}
                    autoFocus
                  />
                ) : (
                  <span onDoubleClick={() => !readOnly && startEdit('bebidas', i, item)} title="Doble click para editar">{item}</span>
                )}
                {!readOnly && !editing && (
                  <button onClick={() => eliminarGlobal('bebidas', item)} className="chip-delete">x</button>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="chip-input-group">
              <input
                type="text"
                value={inputs.bebidas}
                onChange={e => setInputs(prev => ({ ...prev, bebidas: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && agregarGlobal('bebidas')}
                placeholder="Nueva bebida (ej: JUGO NARANJA)..."
                className="chip-input"
              />
              <button onClick={() => agregarGlobal('bebidas')} className="chip-add-btn">+ Agregar</button>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => setModal({ ...modal, isOpen: false })}
      />
    </div>
  );
};

export default ConfiguracionOpciones;