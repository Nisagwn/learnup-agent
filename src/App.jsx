import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ToastProvider } from './components/ToastProvider';
import { UserStatsProvider } from './contexts/UserStatsContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import StudentDashboard from './pages/StudentDashboard';
import Statistics from './pages/Statistics';
import TeacherDashboard from './pages/TeacherDashboard';
import Chatbot from './pages/Chatbot';
import Auth from './pages/Auth';
import Quiz from './pages/Quiz';
import SettingsPage from './pages/SettingsPage';
import LessonsPage from './pages/LessonsPage';
import AssignmentsList from './pages/AssignmentsList';
import AssignmentSolve from './pages/AssignmentSolve';
import WrongAnswers from './pages/WrongAnswers';
import BadgesPage from './pages/BadgesPage';
import DailyQuestsPage from './pages/DailyQuestsPage';
import TargetedAssignments from './pages/TargetedAssignments';
import TargetedSolve from './pages/TargetedSolve';
import LeaguePage from './pages/LeaguePage';
import BookmarksList from './pages/BookmarksList';
import NotesPage from './pages/NotesPage';
import GardenScreen from './features/garden/GardenScreen';
import Loading from './components/Loading';
import 'katex/dist/katex.min.css';
import './index.css';

const ProtectedRoute = ({ user, userData, allowedRoles, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
    return <Navigate to={userData.role === 'teacher' ? '/teacher' : '/student'} replace />;
  }
  return children;
};

const DashboardRouter = ({ user, userData }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (!userData) return <Loading />;
  if (userData.role === 'teacher') return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
};

function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser && currentUser.uid) {
        const authBaseline = {
          uid: currentUser.uid,
          email: currentUser.email,
          name: currentUser.displayName || null,
        };

        try {
          const uid = currentUser.uid;
          const docRef = doc(db, 'users', uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setUserData({ ...authBaseline, ...docSnap.data() });
          } else {
            setUserData({ ...authBaseline, role: 'student', isFallback: true });
          }
        } catch (err) {
          console.error('Failed fetching user doc for uid:', currentUser?.uid, err);
          setUserData({ ...authBaseline, role: 'student', isFallback: true });
        }
      } else if (currentUser && !currentUser.uid) {
        console.warn('onAuthStateChanged returned user without uid:', currentUser);
        setUserData({ role: 'student', isFallback: true });
      } else {
        setUserData(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <Loading />;
  }

  return (
    <ToastProvider>
      <UserStatsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage user={user} />} />

            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Auth />} />

            <Route path="/student/quiz" element={
              <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                <Quiz />
              </ProtectedRoute>
            } />

            <Route element={<Layout userData={userData} />}>
              <Route path="dashboard" element={<DashboardRouter user={user} userData={userData} />} />

              <Route path="student" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              } />

              <Route path="student/lessons" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <LessonsPage />
                </ProtectedRoute>
              } />

              <Route path="student/statistics" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <Statistics />
                </ProtectedRoute>
              } />

              <Route path="student/assignments" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <AssignmentsList />
                </ProtectedRoute>
              } />

              <Route path="student/assignments/:id" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <AssignmentSolve />
                </ProtectedRoute>
              } />

              <Route path="student/targeted" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <TargetedAssignments />
                </ProtectedRoute>
              } />

              <Route path="student/targeted/:id" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <TargetedSolve />
                </ProtectedRoute>
              } />

              <Route path="student/wrong-answers" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <WrongAnswers />
                </ProtectedRoute>
              } />

              <Route path="student/badges" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <BadgesPage />
                </ProtectedRoute>
              } />

              <Route path="student/daily-quests" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <DailyQuestsPage />
                </ProtectedRoute>
              } />

              <Route path="student/league" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <LeaguePage />
                </ProtectedRoute>
              } />

              <Route path="student/bookmarks" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <BookmarksList />
                </ProtectedRoute>
              } />

              <Route path="student/notes" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <NotesPage />
                </ProtectedRoute>
              } />

              <Route path="student/garden" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <GardenScreen />
                </ProtectedRoute>
              } />

              <Route path="chatbot" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['student']}>
                  <Chatbot />
                </ProtectedRoute>
              } />

              <Route path="teacher/*" element={
                <ProtectedRoute user={user} userData={userData} allowedRoles={['teacher']}>
                  <TeacherDashboard />
                </ProtectedRoute>
              } />

              <Route path="settings" element={
                <ProtectedRoute user={user} userData={userData}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </UserStatsProvider>
    </ToastProvider>
  );
}

export default App;