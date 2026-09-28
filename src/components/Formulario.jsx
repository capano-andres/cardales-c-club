// src/components/Formulario.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, where, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { catalogDb } from '../firebase';
import Modal from './Modal';
import Spinner from './Spinner';
import { DIAS_SEMANA, DIA_LABELS, ordenEnSemana } from '../constants/dias';
import "./Formulario.css";

// Normaliza texto para comparación flexible: sin tildes, sin puntuación, sin mayúsculas, sin espacios extra
const normalizarTexto = (t) =>
  (t ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes: á→a, é→e, etc.
    .replace(/[^a-z0-9\s]/gi, '')                       // quita puntuación y símbolos
    .replace(/\s+/g, ' ');                              // colapsa espacios múltiples

// Determina si un campo del menú de un día está vacío y no debe mostrarse
const esCampoVacio = (key, value) => {
  if (key === 'sandwichMiga') return !value?.tipo;
  if (key === 'ensaladas') return !value?.ensalada1;
  if (typeof value === 'string') return value.trim() === '';
  return !value;
};

const Formulario = ({ readOnly = false, tipo = 'actual' }) => {
  const [data, setData] = useState(
    Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, "no_pedir"]))
  );
  const [menuActual, setMenuActual] = useState(null);
  const [menuSemanal, setMenuSemanal] = useState(null);
  const [precioTotal, setPrecioTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userData, setUserData] = useState(null);
  const [error, setError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [menuData, setMenuData] = useState(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [diasModificados, setDiasModificados] = useState([]);
  const [ultimaModificacion, setUltimaModificacion] = useState(null);
  const [opcionesMenuConfig, setOpcionesMenuConfig] = useState(null);
  const [menuStructure, setMenuStructure] = useState(null);
  const auth = getAuth();
  const db = getFirestore();
  const navigate = useNavigate();
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [ahora, setAhora] = useState(new Date());
  const [necesitaRecargar, setNecesitaRecargar] = useState(false);
  const [precioPorDia, setPrecioPorDia] = useState(2000); // Precio por defecto
  const [precioMenu, setPrecioMenu] = useState(2000);
  const [porcentajeBonificacion, setPorcentajeBonificacion] = useState(70);

  const [opcionesCascada, setOpcionesCascada] = useState(null);
  const [textoImagenes, setTextoImagenes] = useState({});
  const [lightboxImg, setLightboxImg] = useState(null);
  const [seleccion, setSeleccion] = useState(
    Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, { menu: '', postre: '', bebida: '' }]))
  );

  const parseSeleccionFromString = (str) => {
    if (!str || str === '') return { menu: '', postre: '', bebida: '' };
    if (str === 'no_pedir') return { menu: 'NO PEDIR', postre: '', bebida: '' };
    // Formatos posibles segun que pasos esten configurados:
    // "MENU C/POSTRE Y BEBIDA", "MENU Y BEBIDA" (sin postre), "MENU C/POSTRE" (sin bebida), "MENU" (sin ninguno)
    const yIdx = str.lastIndexOf(' Y ');
    const bebida = yIdx === -1 ? '' : str.substring(yIdx + 3);
    const menuPostre = yIdx === -1 ? str : str.substring(0, yIdx);
    const cIdx = menuPostre.indexOf(' C/');
    if (cIdx === -1) return { menu: menuPostre, postre: '', bebida };
    const menu = menuPostre.substring(0, cIdx);
    const postre = 'C/' + menuPostre.substring(cIdx + 3);
    return { menu, postre, bebida };
  };

  // Calcular día de la semana y semana seleccionada dentro del componente
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0 = domingo, 6 = sÃbado

  // 1. Utilidad para calcular el lunes de la semana de una fecha
  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 2. Calcular semana actual y próxima
  const lunesActual = getMonday(hoy);
  const lunesProxima = new Date(lunesActual);
  lunesProxima.setDate(lunesActual.getDate() + 7);

  // 3. Determinar quÃ© semana mostrar segÃºn el corte de pedidos (domingo 18:00, hora Argentina)
  const horaArgentinaHoy = new Date(hoy.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const esDomingoTardeCorte = diaSemana === 0 && horaArgentinaHoy.getHours() >= 18;
  let semanaSeleccionadaDate = lunesActual;
  let esProximaSemana = false;
  if (esDomingoTardeCorte) {
    semanaSeleccionadaDate = lunesProxima;
    esProximaSemana = true;
  }
  const semanaSeleccionadaStr = semanaSeleccionadaDate.toISOString().slice(0, 10);

  // Utilidad para saber si un día es anterior al actual
  function isPastDay(dia, hoy) {
    const diaSemana = hoy.getDay();
    const diaActual = DIAS_SEMANA[ordenEnSemana(diaSemana)];
    // Si es lunes y es el día actual, no es un día pasado
    if (dia === 'lunes' && diaSemana === 1) {
      return false;
    }
    return DIAS_SEMANA.indexOf(dia) < DIAS_SEMANA.indexOf(diaActual);
  }

  // FunciÃ³n para verificar si un día estÃ disponible para pedir
  function isDiaDisponible(dia, ahora) {
    const diaSemana = ahora.getDay();
    const dias = DIAS_SEMANA;
    const diaActual = dias[ordenEnSemana(diaSemana)];

    // El día actual siempre está disponible, sin límite de horario
    if (dia === diaActual) {
      return true;
    }

    // Si es un día futuro
    const esFuturo = dias.indexOf(dia) > dias.indexOf(diaActual);
    /* console.log('Es día futuro:', {
      dia,
      diaActual,
      esFuturo
    }); */

    return esFuturo;
  }

  // Agrega esta funciÃ³n arriba de handleSubmit o cerca del inicio del archivo
  function getSemanaTexto(lunesStr) {
    const lunes = new Date(lunesStr);
    const domingo = new Date(lunesStr);
    domingo.setDate(lunes.getDate() + 6);
    const pad = n => n.toString().padStart(2, '0');
    return `Lunes ${pad(lunes.getDate())} al Domingo ${pad(domingo.getDate())}`;
  }

  // Event delegation para clicks en los tooltips de imagen + tecla Escape para cerrar lightbox
  useEffect(() => {
    const handleClick = (e) => {
      const tooltipEl = e.target.closest('[data-lightbox-url]');
      if (tooltipEl) {
        const url = tooltipEl.dataset.lightboxUrl;
        if (url) {
          tooltipEl.style.setProperty('display', 'none', 'important');
          setLightboxImg(url);
        }
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.menu-img-tooltip').forEach(el => {
          el.style.removeProperty('display');
        });
        setLightboxImg(null);
      }
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        // Cargar estructura del menÃº desde Firestore
        const structureRef = doc(db, 'config', 'menuStructure');
        const structureSnap = await getDoc(structureRef);
        let estructuraCargada = null;
        if (structureSnap.exists()) {
          const structure = structureSnap.data();
          // console.log('Estructura del menÃº cargada:', structure);
          estructuraCargada = structure;
          setMenuStructure(structure);
        }

        // Cargar opciones de menÃº (legacy flat)
        const opcionesRef = doc(db, 'config', 'opcionesMenu');
        const opcionesSnap = await getDoc(opcionesRef);
        if (opcionesSnap.exists()) {
          setOpcionesMenuConfig(opcionesSnap.data());
        }

        // Cargar imágenes de platos desde el catálogo central (compartido entre clientes)
        const imagenesRef = doc(catalogDb, 'config', 'textoImagenes');
        const imagenesSnap = await getDoc(imagenesRef);
        const imgsLocales = imagenesSnap.exists() ? imagenesSnap.data() : {};
        setTextoImagenes(imgsLocales); // para re-renders futuros

        // Cargar opciones en cascada (nuevo)
        const cascadaRef = doc(db, 'config', 'opcionesMenuCascada');
        const cascadaSnap = await getDoc(cascadaRef);
        if (cascadaSnap.exists()) {
          setOpcionesCascada(cascadaSnap.data());
        }

        // Si es modo solo lectura, no necesitamos cargar datos del usuario
        if (!readOnly) {
          const user = auth.currentUser;
          if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
              setUserData(userDoc.data());
            }
          }
        }

        // Cargar el menÃº semanal segÃºn el tipo
        const menuRef = doc(db, 'menus', tipo === 'actual' ? 'menuActual' : 'menuProxima');
        const menuDoc = await getDoc(menuRef);

        if (menuDoc.exists()) {
          const menuData = menuDoc.data();
          // console.log("MenÃº cargado:", menuData);

          // Mapa clave-de-Firestore -> etiqueta real configurada (ej. "menupbtx2" -> "Menu PBT X 2").
          // Las claves se generan sacando los espacios del nombre de la categoría, así que no se
          // pueden reconstruir con espacios a partir de la clave sola.
          const etiquetaPorClave = Object.fromEntries(
            (estructuraCargada?.opciones || []).map((op) => [op.toLowerCase().replace(/\s+/g, ''), op])
          );

          const renderDiaMenuItems = (diaData) => {
            if (!diaData || diaData.esFeriado) {
              return (
                <div className="menu-opcion-feriado">
                  FERIADO - No hay servicio de comida este día
                </div>
              );
            }
            return (
              <div className="menu-items">
                {Object.entries(diaData)
                  .filter(([key, value]) => key !== 'esFeriado' && !esCampoVacio(key, value))
                  .sort(([keyA], [keyB]) => {
                    // Convertir las claves a un formato comparable
                    const formatKey = (key) => {
                      if (key === 'sandwichMiga') return 'sandwich de miga';
                      if (key === 'ensaladas') return 'ensalada';
                      return key;
                    };
                    return formatKey(keyA).localeCompare(formatKey(keyB));
                  })
                  .map(([key, value]) => {
                    if (key === 'sandwichMiga' && value?.tipo) {
                      return (
                        <div key={key} className="sandwich-miga">
                          <h4>Sandwich de Miga</h4>
                          <p>{value.tipo} ({value.cantidad} triángulos)</p>
                        </div>
                      );
                    }
                    if (key === 'ensaladas' && value?.ensalada1) {
                      return (
                        <div key={key} className="ensalada">
                          <h4>Ensalada</h4>
                          <p>{value.ensalada1}</p>
                        </div>
                      );
                    }
                    if (key === 'postre') {
                      const items = value.split('/').map(s => s.replace(/\./g, '').trim()).filter(Boolean);
                      return (
                        <div key={key} className="postre">
                          <h4>Postre</h4>
                          <div className="postre-items">
                            {items.map((item, i) => {
                              const imgDataP = Object.entries(imgsLocales).find(([k]) => normalizarTexto(k) === normalizarTexto(item))?.[1];
                              const imgUrlP = imgDataP?.url;
                              return (
                                <React.Fragment key={i}>
                                  {i > 0 && <span className="postre-separador"> / </span>}
                                  <div className={`menu-item-desc-wrap postre-item${imgUrlP ? ' has-img-tooltip' : ''}`}>
                                    <p className="menu-item-desc">{item}</p>
                                    {imgUrlP && (
                                      <div className="menu-img-tooltip" data-lightbox-url={imgUrlP}>
                                        <img src={imgUrlP} alt={item} onError={e => { e.target.style.display = 'none'; }} />
                                      </div>
                                    )}
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    const imgData = Object.entries(imgsLocales).find(([k]) => normalizarTexto(k) === normalizarTexto(value))?.[1];
                    const imgUrl = imgData?.url;
                    const titulo = key === 'menuA' ? 'Menú A'
                      : key === 'menuB' ? 'Menú B'
                      : etiquetaPorClave[key] || (key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '));
                    return (
                      <div key={key} className="menu-item">
                        <h4>{titulo}</h4>
                        <div className={`menu-item-desc-wrap${imgUrl ? ' has-img-tooltip' : ''}`}>
                          <p className="menu-item-desc">{value}</p>
                          {imgUrl && (
                            <div
                              className="menu-img-tooltip"
                              data-lightbox-url={imgUrl}
                            >
                              <img
                                src={imgUrl}
                                alt={value}
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          };

          const menuFormateado = Object.fromEntries(
            DIAS_SEMANA.map((dia) => [dia.toUpperCase(), renderDiaMenuItems(menuData.dias[dia])])
          );

          // console.log("Menú formateado:", menuFormateado);
          setMenuSemanal(menuFormateado);
          setMenuData(menuData);
          setHayCambios(menuData.hayCambios || false);
          setDiasModificados(menuData.diasModificados || []);
          setUltimaModificacion(menuData.ultimaModificacion);
        } else {
          // console.log("No se encontrÃ³ ningÃºn menÃº");
          setMenuSemanal(null);
        }

        // Cargar el pedido del usuario si estÃ autenticado
        if (!readOnly && auth.currentUser) {
          let pedidos = [];
          try {
            // Buscar pedido por semana seleccionada
            const pedidosRef = collection(db, "pedidos");
            const qPedidos = query(
              pedidosRef,
              where('tipo', '==', tipo),
              where('uidUsuario', '==', auth.currentUser.uid)
            );
            const querySnapshot = await getDocs(qPedidos);
            const todosPedidos = querySnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

            pedidos = todosPedidos;

            if (pedidos.length > 0) {
              const pedidoMasReciente = pedidos.sort((a, b) => {
                const fechaA = a.fechaCreacion ? new Date(a.fechaCreacion) : new Date(0);
                const fechaB = b.fechaCreacion ? new Date(b.fechaCreacion) : new Date(0);
                return fechaB - fechaA;
              })[0];

              setMenuActual(pedidoMasReciente);
              const parsedData = Object.fromEntries(
                DIAS_SEMANA.map((dia) => [dia, pedidoMasReciente[dia]?.pedido || ""])
              );
              setData(parsedData);
              setSeleccion(
                Object.fromEntries(
                  DIAS_SEMANA.map((dia) => [dia, parseSeleccionFromString(parsedData[dia])])
                )
              );
            }
          } catch (error) {
            setError('Error al cargar los pedidos: ' + error.message);
          }
        }

        setDataLoaded(true);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError("Error al cargar los datos");
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [auth, db, readOnly, tipo]);

  useEffect(() => {
    // Calcular el precio total cuando cambian los datos
    const diasSeleccionados = Object.entries(data).filter(([dia, valor]) => {
      // Solo contar días que tengan un valor y no sean "no_pedir"
      return valor && valor !== "" && valor !== "no_pedir";
    }).length;

    setPrecioTotal(diasSeleccionados * precioPorDia);
  }, [data, precioPorDia]);

  useEffect(() => {
    // Cuando se carga el menÃº, establecer automÃticamente "no_pedir" para los días feriados
    if (menuData) {
      setData(prevData => {
        const newData = { ...prevData };
        DIAS_SEMANA.forEach((dia) => {
          if (menuData.dias[dia]?.esFeriado) {
            newData[dia] = "no_pedir";
          }
        });
        return newData;
      });
    }
  }, [menuData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSeleccionCascada = (dia, campo, valor, requierePostre = true, requiereBebida = true) => {
    setSeleccion(prev => {
      const nueva = { ...prev[dia], [campo]: valor };
      if (campo === 'menu') { nueva.postre = ''; nueva.bebida = ''; }
      let pedidoStr = '';
      const postreListo = !requierePostre || nueva.postre;
      const bebidaLista = !requiereBebida || nueva.bebida;
      if (nueva.menu === 'NO PEDIR') {
        pedidoStr = 'no_pedir';
      } else if (nueva.menu && postreListo && bebidaLista) {
        const menuConPostre = requierePostre ? `${nueva.menu} ${nueva.postre}` : nueva.menu;
        pedidoStr = requiereBebida ? `${menuConPostre} Y ${nueva.bebida}` : menuConPostre;
      }
      setData(prevData => ({ ...prevData, [dia]: pedidoStr }));
      return { ...prev, [dia]: nueva };
    });
  };

  const renderDiaFormulario = (diaKey, diaLabel, diaFirestore) => {
    const esFeriado = menuData?.dias[diaFirestore]?.esFeriado;
    const yaTienePedido = menuActual?.[diaKey]?.pedido && menuActual[diaKey].pedido !== 'no_pedir';
    const isDisabled = esFeriado ||
      (tipo === 'actual' && (yaTienePedido || !isDiaDisponible(diaKey, ahora)));
    // || (diaSemana === 0 || diaSemana === 6); // TEMP: deshabilitado para pruebas
    const sel = seleccion[diaKey] || { menu: '', postre: '', bebida: '' };
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const menusKey = opcionesCascada?.menus ? (Object.keys(opcionesCascada.menus).find(k => norm(k) === norm(diaLabel)) || diaLabel) : diaLabel;
    const menusList = opcionesCascada?.menus?.[menusKey] || [];
    // Obtener los postres según el modo configurado (por día)
    const postresBase = opcionesCascada?.postres || [];
    let postresList = postresBase;
    // postreDesdeMenu puede ser boolean (legacy) u objeto por día { Lunes: true, Viernes: false }
    const postreDesdeMenuConfig = opcionesCascada?.postreDesdeMenu;
    let esAutoDia;
    if (typeof postreDesdeMenuConfig === 'boolean') {
      esAutoDia = postreDesdeMenuConfig;
    } else if (typeof postreDesdeMenuConfig === 'object' && postreDesdeMenuConfig !== null) {
      const matchEntry = Object.entries(postreDesdeMenuConfig).find(([k]) => norm(k) === norm(diaLabel));
      esAutoDia = matchEntry ? matchEntry[1] : true;
    } else {
      esAutoDia = true;
    }

    if (esAutoDia) {
      // Modo automático: extraer el postre del día desde el menú
      const postreRaw = menuData?.dias?.[diaFirestore]?.postre;
      const postreDelDia = postreRaw
        ? postreRaw.split('/').map(p => p.trim()).filter(p => {
            const upper = p.toUpperCase();
            return !upper.includes('GELATINA') && !upper.includes('YOGURT');
          })[0] || null
        : null;
      // Construir la lista: tomar la base global, reemplazar C/POSTRE si existe,
      // o agregar el postre del día si C/POSTRE no está en la lista
      const base = postresBase.length > 0 ? [...postresBase] : ['C/GELATINA', 'C/POSTRE', 'C/YOGURT'];
      if (postreDelDia) {
        const postreLabel = `C/${postreDelDia.toUpperCase()}`;
        if (base.includes('C/POSTRE')) {
          // Reemplazar C/POSTRE con el nombre real
          postresList = base.map(p => p === 'C/POSTRE' ? postreLabel : p);
        } else {
          // C/POSTRE no está en la lista, agregar el postre del día
          postresList = [postreLabel, ...base].sort();
        }
      } else {
        postresList = base;
      }
    } else if (opcionesCascada?.postresPorDia) {
      // Modo manual: usar postres configurados por día
      const postresDiaKey = Object.keys(opcionesCascada.postresPorDia).find(k => norm(k) === norm(diaLabel)) || diaLabel;
      postresList = opcionesCascada.postresPorDia[postresDiaKey] || postresBase;
    }
    // Días sin postre configurado (ej. sábado/domingo): se salta el paso de postre.
    const hayPostres = postresList.length > 0;
    const bebidasList = opcionesCascada?.bebidas || [];
    // Este cliente no ofrece bebidas: si no hay ninguna configurada, se salta el paso.
    const hayBebidas = bebidasList.length > 0;
    return (
      <div key={diaKey} className="formulario-item">




        {esFeriado ? (
          <div className="formulario-feriado-mensaje">FERIADO - No hay servicio de comida este dia</div>
        ) : (
          <>
            {opcionesCascada ? (
              <div className="formulario-cascada">
                <select
                  className="formulario-select"
                  value={sel.menu}
                  onChange={e => handleSeleccionCascada(diaKey, 'menu', e.target.value, hayPostres, hayBebidas)}
                  disabled={isDisabled}
                >
                  <option value="">-- Menu --</option>
                  <option value="NO PEDIR">NO PEDIR COMIDA ESTE DIA</option>
                  {menusList.map((m, i) => <option key={i} value={m}>{m}</option>)}
                </select>
                {sel.menu && sel.menu !== 'NO PEDIR' && hayPostres && (
                  <select
                    className="formulario-select"
                    value={sel.postre}
                    onChange={e => handleSeleccionCascada(diaKey, 'postre', e.target.value, hayPostres, hayBebidas)}
                    disabled={isDisabled}
                  >
                    <option value="">-- Postre --</option>
                    {postresList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                  </select>
                )}
                {sel.menu && sel.menu !== 'NO PEDIR' && (hayPostres ? sel.postre : true) && hayBebidas && (
                  <select
                    className="formulario-select"
                    value={sel.bebida}
                    onChange={e => handleSeleccionCascada(diaKey, 'bebida', e.target.value, hayPostres, hayBebidas)}
                    disabled={isDisabled}
                  >
                    <option value="">-- Bebida --</option>
                    {bebidasList.map((b, i) => <option key={i} value={b}>{b}</option>)}
                  </select>
                )}
                {data[diaKey] && data[diaKey] !== 'no_pedir' && (
                  <div className="cascada-preview">{data[diaKey]}</div>
                )}
              </div>
            ) : (
              <select
                name={diaKey}
                className="formulario-select"
                value={data[diaKey]}
                onChange={handleChange}
                disabled={isDisabled}
              >
                <option value="">Selecciona una opción</option>
                {opcionesMenuConfig?.[diaLabel]
                  ?.sort((a, b) => { if (a === 'NO PEDIR') return -1; if (b === 'NO PEDIR') return 1; return a.localeCompare(b); })
                  .map((opcion, i) => (
                    <option key={i} value={opcion.toLowerCase().replace(/\s+/g, '_')}>{opcion}</option>
                  ))}
              </select>
            )}
          </>
        )}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Verificar que todos los días tengan una opción seleccionada, excepto los que no estÃn disponibles
    const diasSinSeleccion = Object.entries(data)
      .filter(([key, value]) => {
        const esFeriado = menuData?.dias[key]?.esFeriado;
        const esDiaPasado = isPastDay(key, ahora);
        const estaDisponible = !esDiaPasado;
        // Considerar "no_pedir" como una selecciÃ³n vÃlida
        return !esFeriado && estaDisponible && key !== 'precioTotal' && !value && value !== "no_pedir";
      })
      .map(([key]) => key);

    if (diasSinSeleccion.length > 0) {
      setModal({
        isOpen: true,
        title: 'Días sin selección',
        message: `Por favor selecciona una opción para los siguientes días: ${diasSinSeleccion.join(', ')}`,
        type: 'warning'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No hay usuario autenticado');
      }

      // Determinar el tipo correcto segÃºn el tipo del formulario
      const tipoPedido = tipo;

      // Crear la nueva estructura de datos para el pedido (los 7 días de la semana)
      const pedidoData = Object.fromEntries(
        DIAS_SEMANA.map((dia) => [dia, { pedido: data[dia] }])
      );
      pedidoData.uidUsuario = user.uid;
      pedidoData.tipo = tipoPedido;
      pedidoData.fechaCreacion = serverTimestamp();
      pedidoData.precioTotal = precioTotal;
      pedidoData.semana = menuData.semana;

      // Buscar si ya existe un pedido para este usuario y semana y tipo
      const pedidosRef = collection(db, "pedidos");
      const qPedidos = query(
        pedidosRef,
        where('tipo', '==', tipoPedido),
        where('uidUsuario', '==', user.uid)
      );
      const querySnapshot = await getDocs(qPedidos);

      let esPedidoNuevo = true;
      let pedidoId = null;

      // Si existe un pedido, actualizarlo
      if (!querySnapshot.empty) {
        const pedidoExistente = querySnapshot.docs[0];
        pedidoId = pedidoExistente.id;
        await setDoc(doc(db, "pedidos", pedidoId), pedidoData);
        esPedidoNuevo = false;
      } else {
        // Si no existe, crear uno nuevo
        const nuevoPedidoRef = await addDoc(pedidosRef, pedidoData);
        pedidoId = nuevoPedidoRef.id;
      }

      // Actualizar el estado menuActual con el nuevo pedido
      const pedidoActualizado = {
        id: pedidoId,
        ...pedidoData,
        fechaCreacion: new Date()
      };
      setMenuActual(pedidoActualizado);

      // Esperar a que el estado se actualice antes de mostrar el modal de Ã©xito
      await new Promise(resolve => setTimeout(resolve, 100));
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: esPedidoNuevo ? 'Pedido guardado correctamente' : 'Pedido actualizado correctamente',
        type: 'success',
        actions: [
          {
            label: 'Cerrar',
            type: 'primary',
            onClick: () => {
              setNecesitaRecargar(true);
              setModal({ isOpen: false, title: '', message: '', type: 'info' });
            }
          }
        ]
      });

      // Limpiar el formulario
      setData(Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, ""])));
      setPrecioTotal(0);
    } catch (e) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al guardar el pedido: ' + e.message,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVolver = () => {
    // console.log('Intentando volver a /menu');
    navigate('/menu');
  };

  const handleCerrarSesion = async () => {
    // console.log('Intentando cerrar sesión');
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      // console.error('Error al cerrar sesión:', error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Error al cerrar sesión: ' + error.message,
        type: 'error'
      });
    }
  };

  const formatearFecha = (timestamp) => {
    if (!timestamp) return '';
    try {
      // Si es un timestamp de Firestore
      if (timestamp?.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      // Si es una cadena ISO
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
      // Si ya es un objeto Date
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
      return '';
    } catch (error) {
      // console.error('Error al formatear fecha:', error, 'Timestamp:', timestamp);
      return '';
    }
  };

  const opcionesMenu = [
    { value: "no_pedir", label: "NO PEDIR COMIDA ESTE DÍA" },
    { value: "beti_jai_con_postre", label: "BETI JAI C/POSTRE" },
    { value: "beti_jai_con_gelatina", label: "BETI JAI C/GELATINA" },
    { value: "pastas_con_postre", label: "PASTAS C/POSTRE" },
    { value: "pastas_con_gelatina", label: "PASTAS C/GELATINA" },
    { value: "light_con_postre", label: "LIGHT C/POSTRE" },
    { value: "light_con_gelatina", label: "LIGHT C/GELATINA" },
    { value: "clasico_con_postre", label: "CLASICO C/POSTRE" },
    { value: "clasico_con_gelatina", label: "CLASICO C/GELATINA" },
    { value: "ensalada_con_postre", label: "ENSALADA C/POSTRE" },
    { value: "ensalada_con_gelatina", label: "ENSALADA C/GELATINA" },
    { value: "dieta_blanda_con_postre", label: "DIETA BLANDA C/POSTRE" },
    { value: "dieta_blanda_con_gelatina", label: "DIETA BLANDA C/GELATINA" },
    { value: "menu_pbt_2_con_postre", label: "MENU PBT X 2 C/POSTRE" },
    { value: "menu_pbt_2_con_gelatina", label: "MENU PBT X 2 C/GELATINA" },
    { value: "sand_miga_con_postre", label: "SAND DE MIGA C/POSTRE" },
    { value: "sand_miga_con_gelatina", label: "SAND DE MIGA C/GELATINA" },
  ];

  const opcionesMenuCompleto = [
    { value: "no_pedir", label: "NO PEDIR COMIDA ESTE DÍA" },
    { value: "beti_jai_gelatina", label: "BETI JAI C/GELATINA" },
    { value: "beti_jai_manzana", label: "BETI JAI C/MANZANA" },
    { value: "beti_jai_naranja", label: "BETI JAI C/NARANJA" },
    { value: "beti_jai_banana", label: "BETI JAI C/BANANA" },
    { value: "pastas_gelatina", label: "PASTAS C/GELATINA" },
    { value: "pastas_manzana", label: "PASTAS C/MANZANA" },
    { value: "pastas_naranja", label: "PASTAS C/NARANJA" },
    { value: "pastas_banana", label: "PASTAS C/BANANA" },
    { value: "light_gelatina", label: "LIGHT C/GELATINA" },
    { value: "light_manzana", label: "LIGHT C/MANZANA" },
    { value: "light_naranja", label: "LIGHT C/NARANJA" },
    { value: "light_banana", label: "LIGHT C/BANANA" },
    { value: "clasico_gelatina", label: "CLASICO C/GELATINA" },
    { value: "clasico_manzana", label: "CLASICO C/MANZANA" },
    { value: "clasico_naranja", label: "CLASICO C/NARANJA" },
    { value: "clasico_banana", label: "CLASICO C/BANANA" },
    { value: "ensalada_gelatina", label: "ENSALADA C/GELATINA" },
    { value: "ensalada_manzana", label: "ENSALADA C/MANZANA" },
    { value: "ensalada_naranja", label: "ENSALADA C/NARANJA" },
    { value: "ensalada_banana", label: "ENSALADA C/BANANA" },
    { value: "dieta_blanda_gelatina", label: "DIETA BLANDA C/GELATINA" },
    { value: "dieta_blanda_manzana", label: "DIETA BLANDA C/MANZANA" },
    { value: "dieta_blanda_naranja", label: "DIETA BLANDA C/NARANJA" },
    { value: "dieta_blanda_banana", label: "DIETA BLANDA C/BANANA" },
    { value: "menu_pbt_2_gelatina", label: "MENU PBT X 2 C/GELATINA" },
    { value: "menu_pbt_2_manzana", label: "MENU PBT X 2 C/MANZANA" },
    { value: "menu_pbt_2_naranja", label: "MENU PBT X 2 C/NARANJA" },
    { value: "menu_pbt_2_banana", label: "MENU PBT X 2 C/BANANA" },
    { value: "sand_miga_gelatina", label: "SAND DE MIGA C/GELATINA" },
    { value: "sand_miga_manzana", label: "SAND DE MIGA C/MANZANA" },
    { value: "sand_miga_naranja", label: "SAND DE MIGA C/NARANJA" },
    { value: "sand_miga_banana", label: "SAND DE MIGA C/BANANA" }
  ];

  // Actualizar la hora cada minuto
  useEffect(() => {
    const interval = setInterval(() => {
      setAhora(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // FunciÃ³n para recargar los datos
  const recargarDatos = async () => {
    setIsLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No hay usuario autenticado');
      }

      // Recargar el pedido del usuario
      const pedidosRef = collection(db, "pedidos");
      const qPedidos = query(
        pedidosRef,
        where('tipo', '==', tipo),
        where('uidUsuario', '==', user.uid)
      );
      const querySnapshot = await getDocs(qPedidos);
      const todosPedidos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (todosPedidos.length > 0) {
        const pedidoMasReciente = todosPedidos.sort((a, b) => {
          const fechaA = a.fechaCreacion ? new Date(a.fechaCreacion) : new Date(0);
          const fechaB = b.fechaCreacion ? new Date(b.fechaCreacion) : new Date(0);
          return fechaB - fechaA;
        })[0];

        setMenuActual(pedidoMasReciente);
        setData(Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, pedidoMasReciente[dia]?.pedido || ""])));
      } else {
        setMenuActual(null);
        setData(Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, "no_pedir"])));
      }
    } catch (error) {
      console.error('Error al recargar datos:', error);
      setError('Error al recargar los datos: ' + error.message);
    } finally {
      setIsLoading(false);
      setNecesitaRecargar(false);
    }
  };

  // Efecto para recargar datos cuando sea necesario
  useEffect(() => {
    if (necesitaRecargar) {
      recargarDatos();
    }
  }, [necesitaRecargar]);

  useEffect(() => {
    cargarPrecio();
  }, []);

  const cargarPrecio = async () => {
    try {
      const precioRef = doc(db, 'config', 'precioMenu');
      const precioSnap = await getDoc(precioRef);

      if (precioSnap.exists()) {
        const data = precioSnap.data();
        setPrecioMenu(data.precio || 6400);
        setPorcentajeBonificacion(data.porcentajeBonificacion || 70);

        // Calcular el precio por día segÃºn la bonificaciÃ³n del usuario
        if (userData?.bonificacion) {
          setPrecioPorDia(0); // Si estÃ bonificado, el precio es 0
        } else {
          // Si no estÃ bonificado, aplicar el porcentaje de bonificaciÃ³n
          const porcentaje = parseFloat(data.porcentajeBonificacion) || 70;
          const precioConBonificacion = Math.round(data.precio * (100 - porcentaje) / 100);
          setPrecioPorDia(precioConBonificacion);
        }
      }
    } catch (error) {
      console.error('Error al cargar el precio:', error);
    }
  };

  // Actualizar el precio cuando cambie el estado del usuario
  useEffect(() => {
    if (userData) {
      if (userData.bonificacion) {
        setPrecioPorDia(0);
      } else {
        const porcentaje = parseFloat(porcentajeBonificacion) || 70;
        const precioConBonificacion = Math.round(precioMenu * (100 - porcentaje) / 100);
        setPrecioPorDia(precioConBonificacion);
      }
    }
  }, [userData, precioMenu, porcentajeBonificacion]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <>
    <div className="formulario-container">
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        actions={modal.actions}
      />
      <div className="formulario-header">
        <div className="header-buttons">
          <button
            type="button"
            onClick={handleVolver}
            className="volver-button"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleCerrarSesion}
            className="cerrar-sesion-button"
          >
            Cerrar Sesion
          </button>
        </div>
        <h2 className="formulario-titulo">
          {`Menu de la ${tipo === 'actual' ? 'Semana Actual' : 'Proxima Semana'}`}
        </h2>
      </div>

      {!readOnly && userData && (
        <div className="bienvenida">
          Hola, {userData.nombre}!
        </div>
      )}

      { /*     {!readOnly && (
        <div className="advertencia-seleccion" style={{
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
          color: '#92400e'
        }}>
          <h3 style={{margin: '0 0 0.5rem 0'}}>âš ï¸ Importante</h3>
          <p style={{margin: '0'}}>
            Por favor, selecciona cuidadosamente tus opciones ya que:
          </p>
          <ul style={{textAlign: 'left', margin: '0.5rem 0', paddingLeft: '1rem'}}>
            <li>No se pueden realizar modificaciones una vez cerrada la lista</li>
            <li>Solo se puede agregar un pedido a un día que no se haya seleccionado previamente</li>
          </ul>
        </div>
      )}*/}

      {/* Mostrar el rango de la semana si estÃ disponible */}
      {menuData?.semana && (
        <div className="menu-semana-rango" style={{ textAlign: 'center', marginBottom: '1rem', color: '#FFA000', fontWeight: 'bold' }}>
          Semana: {menuData.semana}
        </div>
      )}

      {/* Cartel informativo de días disponibles */}
      {/* {!readOnly && tipo === 'actual' && !(diaSemana === 6 || diaSemana === 0) && (
        <div className="dias-disponibles-alert" style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
          color: '#0369a1'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>ðŸ“… DÃ­as disponibles para pedir</h3>
          <p style={{ margin: '0' }}>
            {(() => {
              const ahora = new Date();
              const diaSemana = ahora.getDay();
              // Obtener la hora actual en Argentina
              const horaArgentina = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
              const hora = horaArgentina.getHours();
              const minutos = horaArgentina.getMinutes();
              const antesDe830 = hora < 8 || (hora === 8 && minutos <= 30);

              if (diaSemana >= 1 && diaSemana <= 5) {
                const diasDisponibles = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
                  .filter(dia => {
                    const indiceDia = diasSemana.indexOf(dia);
                    if (dia === diasSemana[diaSemana]) {
                      return antesDe830;
                    }
                    return indiceDia > diaSemana;
                  })
                  .map(dia => dia.charAt(0).toUpperCase() + dia.slice(1));

                if (diasDisponibles.length === 0) {
                  return 'No hay días disponibles para pedir en este momento.';
                }

                return `Puedes pedir para: ${diasDisponibles.join(', ')}`;
              } else {
                return 'No hay días disponibles para pedir en este momento.';
              }
            })()}
          </p>
        </div>
      )}  */}

      {/* Mostrar el menu semanal global */}
      {menuSemanal ? (
        <>
          <div className="menu-img-hint-banner">
            Pasá el mouse por encima del texto de un plato para ver la foto o clickea en el icono 🖼️. Hacé click en la foto para verla en pantalla completa.
          </div>
          <div className="menu-semanal">
            <div className="menu-semanal-grid">
              {Object.entries(menuSemanal).map(([dia, opciones]) => {
                const diaLower = dia.toLowerCase();
                const diaKey = DIAS_SEMANA.includes(diaLower) ? diaLower : diaLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const esFeriado = menuData?.dias[diaKey]?.esFeriado;
                return (
                  <div key={dia} className="menu-semanal-dia">
                    <h3 className="menu-semanal-dia-titulo">
                      {dia}
                      {esFeriado && <span className="feriado-badge">FERIADO</span>}
                    </h3>
                    {esFeriado ? (
                      <div className="menu-opcion-feriado">
                        FERIADO - No hay servicio de comida este dia
                      </div>
                    ) : (
                      <div className="menu-semanal-opciones">
                        {opciones}
                      </div>
                    )}
                    {!readOnly && !esFeriado && renderDiaFormulario(diaKey, DIA_LABELS[diaKey] || dia, diaKey)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="no-menu-alert">
          <h3>Menu No Disponible</h3>
          <p>El menu semanal aun no ha sido cargado.</p>
          <p>Por favor, intenta mas tarde o contacta al administrador.</p>
        </div>
      )}

      {hayCambios && !readOnly && tipo !== 'actual' && (
        <div className="menu-changes-alert">
          <h3>Cambios en el Menu</h3>
          <p>El menu ha sido actualizado recientemente.</p>
          <p>Se modificaron los siguientes dias: {diasModificados.map(dia => dia.charAt(0).toUpperCase() + dia.slice(1)).join(', ')}</p>
          <p>Ultima actualizacion: {formatearFecha(ultimaModificacion)}</p>
          <p className="recommendation">Te recomendamos revisar las opciones actualizadas antes de realizar tu pedido.</p>
        </div>
      )}

      {/* Formulario - solo precio y boton (los selects estan dentro del grid arriba) */}
      {!readOnly && (
        <form onSubmit={handleSubmit} className="formulario">





          <div className="formulario-precio">
            <p className="formulario-precio-total">
              Precio total: ${precioTotal.toLocaleString()}
            </p>
            <p className="formulario-precio-detalle">
              {precioTotal > 0
                ? `(${precioTotal / precioPorDia} dia${precioTotal / precioPorDia > 1 ? 's' : ''} x $${precioPorDia.toLocaleString()})`
                : userData?.bonificacion
                  ? 'Menu bonificado (sin costo)'
                  : 'Selecciona al menos un menu para ver el precio'}
            </p>
          </div>

          {(() => {
            // Verificar si hay algún día sin pedido y que no sea feriado
            const algunDiaSinPedido = DIAS_SEMANA.some(dia => {
              const esFeriado = menuData?.dias[dia]?.esFeriado;
              const tienePedido = menuActual?.[dia]?.pedido && menuActual?.[dia]?.pedido !== "no_pedir";
              const esDiaPasado = isPastDay(dia, ahora);
              const estaDisponible = !esDiaPasado;

              // Considerar "no_pedir" como una selección válida
              return !esFeriado && estaDisponible && (!tienePedido || data[dia] === "no_pedir");
            });

            // Si es tipo 'proxima', mostrar el botón (bloqueado durante el corte semanal, domingo 18:00)
            if (tipo === 'proxima') {
              return (
                <button
                  type="submit"
                  className="formulario-boton"
                  disabled={isSubmitting || esDomingoTardeCorte}
                >
                  <div className="button-content">
                    <span>{esDomingoTardeCorte ? "No disponible por cierre semanal" : menuActual ? (isSubmitting ? "Actualizando..." : "Actualizar Pedido") : (isSubmitting ? "Guardando..." : "Guardar Pedido")}</span>
                    {isSubmitting && <div className="spinner" />}
                  </div>
                </button>
              );
            }

            // Para tipo 'actual', mostrar el botón solo si hay días disponibles (bloqueado durante el corte semanal)
            if (algunDiaSinPedido && !esDomingoTardeCorte) {
              return (
                <button
                  type="submit"
                  className="formulario-boton"
                  disabled={isSubmitting}
                >
                  <div className="button-content">
                    <span>{menuActual ? (isSubmitting ? "Actualizando..." : "Actualizar Pedido") : (isSubmitting ? "Guardando..." : "Guardar Pedido")}</span>
                    {isSubmitting && <div className="spinner" />}
                  </div>
                </button>
              );
            }

            return null;
          })()}
        </form>
      )}

      {/* VisualizaciÃ³n del pedido actual */}
      {!readOnly && menuSemanal && (
        <>
          {menuActual ? (
            <div className="menu-actual">
              <div className="menu-actual-header">
                <h2 className="menu-actual-titulo">
                  Mi pedido para la {tipo === 'actual' ? 'semana actual' : 'próxima semana'}
                </h2>
              </div>
              <div className="menu-actual-contenido">
                <div className="menu-actual-info">
                  <div>
                    <p className="menu-actual-fecha">
                      Pedido realizado el: {formatearFecha(menuActual.fechaCreacion)}
                    </p>
                    <p className="menu-actual-total">
                      Total: ${(() => {
                        // Contar los días que tienen un pedido vÃlido
                        const diasConPedido = Object.entries(menuActual)
                          .filter(([key, value]) =>
                            DIAS_SEMANA.includes(key) &&
                            value?.pedido &&
                            value.pedido !== "no_pedir"
                          ).length;
                        return (diasConPedido * precioPorDia).toLocaleString();
                      })()}
                    </p>
                  </div>
                </div>
                <div className="menu-actual-lista">
                  {DIAS_SEMANA.map((dia, index) => {
                    const diaData = menuActual[dia];
                    return (
                      <div key={dia} className="menu-actual-dia">
                        <div className="menu-actual-numero">{index + 1}</div>
                        <div className="menu-actual-nombre">
                          {dia.toUpperCase()}
                        </div>
                        <div className={`menu-actual-plato ${diaData?.pedido === "no_pedir" || !diaData?.pedido ? "menu-actual-no-pedir" : ""}`}>
                          {diaData?.pedido === "no_pedir"
                            ? "NO PEDIR"
                            : !diaData?.pedido
                              ? "NO SE SOLICITO MENU PARA ESTE DIA"
                              : (opcionesMenuCompleto.find(opcion => opcion.value === diaData?.pedido)?.label || diaData?.pedido).toUpperCase()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            tipo === 'actual' && (
              <div className="no-pedido-alert">
                <h3>No tienes pedidos para esta semana</h3>
              </div>
            )
          )}
        </>
      )}
    </div>

      {/* Lightbox - imagen completa al hacer click */}
      {lightboxImg && (() => {
        const closeLightbox = () => {
          // Restaurar tooltips que fueron ocultados manualmente
          document.querySelectorAll('.menu-img-tooltip').forEach(el => {
            el.style.removeProperty('display');
          });
          setLightboxImg(null);
        };
        return (
          <div className="lightbox-overlay" onClick={closeLightbox}>
            <button className="lightbox-close" onClick={closeLightbox}>✕</button>
            <img
              className="lightbox-img"
              src={lightboxImg}
              alt="Vista completa"
              onClick={e => e.stopPropagation()}
            />
          </div>
        );
      })()}
    </>
  );
};

export default Formulario;
