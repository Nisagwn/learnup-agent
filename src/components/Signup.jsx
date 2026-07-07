import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { UserPlus, Sparkles, GraduationCap, Briefcase } from 'lucide-react';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); // Varsayılan: Öğrenci
  const [grade, setGrade] = useState('9');    // Varsayılan: 9. Sınıf
  const [studentClass, setStudentClass] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Firebase Auth ile kullanıcıyı oluştur
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Firestore'da kullanıcı profilini oluştur
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email,
        role: role,
        // Sadece öğrenciyse sınıf bilgisini ve boş öğretmen ID'sini ekle
        ...(role === 'student' && {
          grade: grade,
          studentClass: studentClass.trim() || '',
          teacherId: null,
          stats: { totalSolved: 0, correctAnswers: 0, totalChatMessages: 0 }
        }),
        // Öğretmen ise boş bir öğrenci listesi veya sınıf kodu alanı aç
        ...(role === 'teacher' && {
          classCode: Math.random().toString(36).substring(2, 8).toUpperCase(), // Rastgele 6 haneli kod
          students: []
        }),
        createdAt: new Date()
      });

      alert("Kayıt başarılı! Öğrenme serüvenine hoş geldin. 🚀");
      navigate('/dashboard');
    } catch (error) {
      console.error("Kayıt hatası:", error.message);
      alert("Kayıt sırasında bir hata oluştu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center text-slate-100 p-4 relative overflow-hidden">

      {/* İsteğe bağlı arkaplan parlamaları */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] -top-20 -left-20"></div>
        <div className="absolute w-[300px] h-[300px] bg-violet-600/10 rounded-full blur-[120px] bottom-10 right-0"></div>
      </div>

      <div className="relative z-10 w-full max-w-md backdrop-blur-xl bg-black/40 p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-4 shadow-lg shadow-indigo-500/30">
            <UserPlus size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            LearnUp'a Katıl
          </h2>
          <p className="text-slate-400 mt-2 text-sm">Geleceğin eğitim platformuna ilk adımını at.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">E-POSTA</label>
            <input
              type="email"
              placeholder="ornek@ogrenci.com"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">ŞİFRE</label>
            <input
              type="password"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">SEN BİR...</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300 ${role === 'student' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 transform scale-[1.02]' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
              >
                <GraduationCap size={20} />
                <span className="font-medium text-sm">Öğrenci</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300 ${role === 'teacher' ? 'bg-violet-500/20 border-violet-500 text-violet-300 transform scale-[1.02]' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
              >
                <Briefcase size={20} />
                <span className="font-medium text-sm">Öğretmen</span>
              </button>
            </div>
          </div>

          {role === 'student' && (
            <>
              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs font-medium text-slate-300 ml-1">KAÇINCI SINIFSIN?</label>
                <div className="relative">
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="9" className="bg-[#1a1030]">9. Sınıf</option>
                    <option value="10" className="bg-[#1a1030]">10. Sınıf</option>
                    <option value="11" className="bg-[#1a1030]">11. Sınıf</option>
                    <option value="12" className="bg-[#1a1030]">12. Sınıf</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs font-medium text-slate-300 ml-1">SINIF / ŞUBE (Örn: 9-A)</label>
                <input
                  type="text"
                  placeholder="Örn: 9-A, 11-B"
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  required={role === 'student'}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold p-4 rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? 'Kayıt Olunuyor...' : (
              <>
                Kayıt Ol ve Başla
                <Sparkles size={18} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Signup;
