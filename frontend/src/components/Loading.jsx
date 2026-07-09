import React from 'react';
import Spinner from './ui/Spinner';

const Loading = ({ size = 'md', fullscreen = false }) => {
  const spinner = <Spinner size={size} />;

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm"
        style={{ background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)' }}
      >
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default Loading;
