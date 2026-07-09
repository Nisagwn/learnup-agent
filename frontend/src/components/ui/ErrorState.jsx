import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Hata durumları için tutarlı blok. Tekrar dene düğmesi opsiyoneldir.
 * @param {string} [title]
 * @param {string} [description]
 * @param {() => void} [onRetry]
 */
export default function ErrorState({
  title = 'Bir şeyler ters gitti',
  description = 'İçerik yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.',
  onRetry,
  retryLabel = 'Tekrar Dene',
  className = '',
}) {
  return (
    <div className={`error-state ${className}`} role="alert">
      <div className="error-state__icon">
        <AlertCircle size={26} aria-hidden="true" />
      </div>
      {title && <h3 className="error-state__title">{title}</h3>}
      {description && <p className="error-state__desc">{description}</p>}
      {onRetry && (
        <button type="button" className="ds-btn-ghost mt-2" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> {retryLabel}
        </button>
      )}
    </div>
  );
}
