import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * İçeriğin boş olduğu durumlar için tutarlı boş durum bloğu.
 * @param {React.ElementType} [icon] - Lucide ikon bileşeni
 * @param {string} title
 * @param {string} [description]
 * @param {React.ReactNode} [action] - opsiyonel buton/link
 */
export default function EmptyState({
  icon = Inbox,
  title,
  description,
  action,
  className = '',
}) {
  const Icon = icon;
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state__icon">
        <Icon size={26} aria-hidden="true" />
      </div>
      {title && <h3 className="empty-state__title">{title}</h3>}
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
