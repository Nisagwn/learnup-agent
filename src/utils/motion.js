// Paylaşılan framer-motion varyantları — kart ızgaraları ve sıralı (stagger) girişler için.
// Kullanım:
//   <motion.div variants={containerStagger} initial="hidden" animate="show"> ...
//     <motion.div variants={itemRise}> ... </motion.div>
//   </motion.div>

export const containerStagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export const itemRise = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
};

export const popIn = {
  hidden: { opacity: 0, scale: 0.85 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 22 },
  },
};

// Sayfa geçişi — hafif yukarı kayış + fade (Layout'ta kullanılır)
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};
