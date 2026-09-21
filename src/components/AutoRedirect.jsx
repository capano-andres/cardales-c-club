import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Spinner from './Spinner';

const AutoRedirect = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Si estamos creando un usuario, no procesar cambios de autenticación
      if (window.isCreatingUser) {
        return;
      }

      if (user) {
        setUser(user);

        // Verificar rol del usuario en Firestore
        try {
          const emailQuery = query(
            collection(db, "users"),
            where("email", "==", user.email)
          );
          const emailSnapshot = await getDocs(emailQuery);

          if (!emailSnapshot.empty) {
            const userData = emailSnapshot.docs[0].data();
            setUserRole(userData.rol);
          } else {
            setUserRole('usuario');
          }
        } catch (error) {
          console.error('Error al obtener rol del usuario:', error);
          setUserRole('usuario');
        }
      } else {
        setUser(null);
        setUserRole(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#222220',
        color: '#ffffff'
      }}>
        <Spinner />
      </div>
    );
  }

  // Si no hay usuario autenticado, mostrar el login
  if (!user) {
    return null; // No redirigir, mostrar el login
  }

  // Si hay usuario autenticado, redirigir según su rol
  if (userRole === 'admin' || userRole === 'visor') {
    return <Navigate to="/admin" replace />;
  } else {
    return <Navigate to="/menu" replace />;
  }
};

export default AutoRedirect; 