import React from 'react';
import { useNavigate } from 'react-router-dom';
import CierreSemanal from './CierreSemanal';
import './CierreSemanalPage.css';

const CierreSemanalPage = () => {
  const navigate = useNavigate();

  return (
    <div className="cierre-semanal-page">
      <div className="cierre-semanal-header">
        <h1>Cierre Semanal</h1>

        <p>Realiza el cierre semanal y guarda el historial de pedidos.</p>
      </div>
      
      <div className="cierre-semanal-content">
        <div className="cierre-semanal-card">
        <button 
          className="back-button" 
          onClick={() => navigate('/admin')}
          style={{ 
            position: 'absolute', 
            left: '2rem', 
            top: '2rem',
            background: '#FFA000',
            border: 'none',
            color: '#FFFFFF',
            fontSize: '1.5rem',
            cursor: 'pointer',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          ←
        </button>
          <CierreSemanal />
        </div>
      </div>
    </div>
  );
};

export default CierreSemanalPage; 