import React from 'react';
import './Modal.css';

const Modal = ({ isOpen, onClose, title, message, type = 'info', actions = [], children, canClose = true }) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className={`modal-header ${type}`}>
          <span className="modal-icon">{getIcon()}</span>
          <h3>{title}</h3>
          {canClose && <button className="modal-close" onClick={onClose}>×</button>}
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {children}
        </div>
        <div className="modal-footer">
          {actions.length > 0 ? (
            actions.map((action, index) => (
              <button
                key={index}
                className={`modal-button ${action.type || 'primary'}`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))
          ) : (
            canClose && <button className="modal-button" onClick={onClose}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal; 