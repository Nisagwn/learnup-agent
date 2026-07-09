import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const Toast = ({ id, type = 'info', title, message, onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const typeConfig = {
    success: {
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      textColor: 'text-green-400',
      icon: CheckCircle
    },
    error: {
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      textColor: 'text-red-400',
      icon: AlertCircle
    },
    info: {
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      textColor: 'text-blue-400',
      icon: Info
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  const IconComponent = config.icon;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-xl p-4 flex items-start gap-3 backdrop-blur-md shadow-lg animate-fade-in max-w-md`}>
      <IconComponent size={20} className={`${config.textColor} mt-0.5 shrink-0`} />
      <div className="flex-1">
        {title && <p className={`${config.textColor} font-semibold text-sm`}>{title}</p>}
        {message && <p className="text-slate-300 text-sm mt-0.5">{message}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="text-slate-400 hover:text-slate-300 transition-colors shrink-0"
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default Toast;
