import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import TopNav from './TopNav';
import FloatingAI from './FloatingAI';
import { pageTransition } from '../utils/motion';
import './Layout.css';

export default function Layout({ userData }) {
  const location = useLocation();

  return (
    <div className="app-layout">
      <TopNav userData={userData} />
      <main className="content-area">
        <AnimatePresence mode="wait" initial={false}>
          <Motion.div
            key={location.pathname}
            variants={pageTransition}
            initial="initial"
            animate="animate"
            exit="exit"
            className="page-scrollable"
          >
            <div className="app-container">
              <Outlet />
            </div>
          </Motion.div>
        </AnimatePresence>
      </main>
      <FloatingAI />
    </div>
  );
}
