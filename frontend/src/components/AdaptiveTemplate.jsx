import React, { useState } from 'react';
import { Search, Menu, Home, BookOpen, User, Settings, X } from 'lucide-react';
import './AdaptiveTemplate.css';

export default function AdaptiveTemplate() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Ortak İçerikler İçin Sahte Ders Verileri
  const courses = [
    { id: 1, title: 'Matematik 101', instructor: 'Ahmet Hoca', color: '#FFE4E6' },
    { id: 2, title: 'Fizik: İleri Seviye', instructor: 'Ayşe Hoca', color: '#E0E7FF' },
    { id: 3, title: 'Yazılıma Giriş', instructor: 'Antigravity', color: '#DCFCE7' },
    { id: 4, title: 'Tarih 202', instructor: 'Mehmet Hoca', color: '#FEF3C7' }
  ];

  return (
    <div className="adaptive-container">
      {/* ==========================================
          1. MASAÜSTÜ SOL MENÜ (MOBİLDE GİZLENECEK)
          ========================================== */}
      <aside className="desktop-sidebar">
        <div className="logo-container">
          <div className="logo-circle">LU</div>
          <span className="logo-text">LearnUp Web</span>
        </div>
        
        <nav className="sidebar-nav">
          <a href="#home" className="nav-item active"><Home size={20}/> <span>Ana Sayfa</span></a>
          <a href="#courses" className="nav-item"><BookOpen size={20}/> <span>Derslerim</span></a>
          <a href="#profile" className="nav-item"><User size={20}/> <span>Profil</span></a>
          <a href="#settings" className="nav-item"><Settings size={20}/> <span>Ayarlar</span></a>
        </nav>
      </aside>

      {/* ==========================================
          2. MOBİL ÜST BAR & HAMBURGER MENÜ (MASAÜSTÜNDE GİZLENECEK)
          ========================================== */}
      <header className="mobile-header">
        <button className="icon-btn" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="mobile-logo">LearnUp App</div>
        <button className="icon-btn">
          <User size={24} />
        </button>
      </header>

      {/* MOBİL İÇİN YAN MENÜ (OVERLAY) */}
      <div className={`mobile-overlay-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="overlay-header">
          <span className="logo-text">Menü</span>
          <button className="icon-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>
        <nav className="overlay-nav">
          <a href="#settings"><Settings size={20}/> Ayarlar</a>
          <a href="#help"><BookOpen size={20}/> Yardım Merkezi</a>
        </nav>
      </div>

      {/* ==========================================
          3. ORTAK ANA İÇERİK ALANI (HEM MOBİL HEM WEB İÇİN)
          ========================================== */}
      <main className="main-content">
        <div className="search-container">
          <Search className="search-icon" size={20} />
          <input type="text" placeholder="Ders, konu veya öğretmen ara..." className="search-bar" />
        </div>

        <section className="course-list-section">
          <h2 className="section-title">Devam Eden Dersleriniz</h2>
          <div className="course-grid">
            {courses.map(course => (
              <div key={course.id} className="course-card" style={{ borderTop: `4px solid ${course.color}` }}>
                <h3>{course.title}</h3>
                <p>{course.instructor}</p>
                <button className="continue-btn">Derse Devam Et</button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ==========================================
          4. MOBİL ALT TAB BAR (MASAÜSTÜNDE GİZLENECEK)
          ========================================== */}
      <nav className="mobile-bottom-bar">
        <a href="#home" className="tab-item active">
          <Home size={24}/>
          <span>Ana Sayfa</span>
        </a>
        <a href="#courses" className="tab-item">
          <BookOpen size={24}/>
          <span>Dersler</span>
        </a>
        <a href="#profile" className="tab-item">
          <User size={24}/>
          <span>Profil</span>
        </a>
      </nav>
    </div>
  );
}
