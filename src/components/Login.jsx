import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Login.css';

const Login = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Buscar usuario por email o username
      let userData = null;

      // Primero intentar buscar por email
      const emailQuery = query(
        collection(db, "users"),
        where("email", "==", emailOrUsername)
      );
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        userData = emailSnapshot.docs[0].data();
      } else {
        // Si no se encuentra por email, buscar por username
        const usernameQuery = query(
          collection(db, "users"),
          where("usuario", "==", emailOrUsername)
        );
        const usernameSnapshot = await getDocs(usernameQuery);

        if (!usernameSnapshot.empty) {
          userData = usernameSnapshot.docs[0].data();
        } else {
          setError("Usuario no encontrado");
          setIsLoading(false);
          return;
        }
      }

      // Autenticar con Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        userData.email,
        password
      );

      // Verificar rol y redirigir
      if (userData.rol === "admin" || userData.rol === "visor") {
        navigate("/admin");
      } else {
        navigate("/menu");
      }
    } catch (error) {
      console.error("Error en login:", error);
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        setError("Contraseña incorrecta");
      } else if (error.code === "auth/user-not-found") {
        setError("Usuario no encontrado");
      } else {
        setError("Error al iniciar sesión: " + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <img
        src="/logo-beti-jai.png"
        alt="Logo Beti Jai"
        className="login-logo"
      />
      <div className="login-box">
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="emailOrUsername">Email o Usuario</label>
            <input
              type="text"
              id="emailOrUsername"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  paddingRight: '50px' // Solo espacio para el botón
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: '#666',
                  padding: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? '🔒' : '👁️'}
              </button>
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? (
              <div className="button-spinner"></div>
            ) : (
              "Iniciar Sesión"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;