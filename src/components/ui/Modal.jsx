import React, { useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Erişilebilir modal: portal, role="dialog", aria-modal, focus trap,
 * Esc ile kapatma, overlay tıklamasıyla kapatma ve body scroll kilidi.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {string} [title]
 * @param {'sm'|'md'|'lg'} [size]
 * @param {React.ReactNode} [footer]
 * @param {boolean} [closeOnOverlay] - varsayılan true
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const previouslyFocused = useRef(null);

  // Esc + focus trap
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  // Açılışta: odağı sakla, body scroll kilitle, ilk elemana odaklan
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      (nodes && nodes.length ? nodes[0] : panelRef.current)?.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      // Kapanışta odağı tetikleyiciye geri ver
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className={`ds-card modal-panel modal-panel--${size} animate-fade-scale`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {title && (
          <div className="modal-header">
            <h2 id={titleId} className="section-title">
              {title}
            </h2>
            <button
              type="button"
              className="ui-icon-btn"
              onClick={onClose}
              aria-label="Kapat"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
