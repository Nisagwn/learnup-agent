import React, { useId } from 'react';

/**
 * Etiket + kontrol + hata mesajı sarmalı.
 * Çocuk olarak Input/TextArea/Select bileşenlerini alır ve onlara
 * id/aria bağlantısını otomatik geçirir.
 */
export function FormField({ label, required, error, hint, children, className = '' }) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': errorId || children.props['aria-describedby'],
      })
    : children;

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={id} className="form-field__label">
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {control}
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && (
        <span id={errorId} className="form-field__error">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`form-control ${className}`} {...props} />;
}

export function TextArea({ className = '', rows = 3, ...props }) {
  return <textarea className={`form-control ${className}`} rows={rows} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`form-control ${className}`} {...props}>
      {children}
    </select>
  );
}

export default FormField;
