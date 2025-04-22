import React, { useEffect, useState } from 'react';
import { auth } from './firebase';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import MainPage from './components/Tasks';
import Calendar from './components/Calendar'; 
import Teams from './components/Teams';
import UserProfile from './components/UserProfile'; 
import Settings from './components/Settings';
import Dashboard from './components/Dashboard'; 
import Reports from './components/Reports'; 
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext'; 


function App() {
  const [user, setUser] = useState(null); // 用户状态
  const [loading, setLoading] = useState(true); // 加载状态

  // 监听用户登录状态
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user); // 更新用户状态
      setLoading(false); // 加载完成
    });
    return () => unsubscribe(); // 清理监听器
  }, []);

  // 如果正在加载，显示加载提示
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <NotificationProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            {/* 如果用户已登录，跳转到 /dashboard；否则显示登录页面 */}
            <Route
              path="/"
              element={user ? <Navigate to="/dashboard" /> : <LoginForm />}
            />

            {/* 如果用户未登录，跳转到 /；否则显示日历页面 */}
            <Route
              path="/calendar"
              element={user ? <Calendar /> : <Navigate to="/" />}
            />

            {/* 如果用户未登录，跳转到 /；否则显示团队页面 */}
            <Route
              path="/Teams"
              element={user ? <Teams /> : <Navigate to="/" />}
            />
            
            {/* 团队任务页面 */}
            <Route
              path="/team/:teamId/tasks"
              element={user ? <MainPage /> : <Navigate to="/" />}
            />

            {/* 用户个人资料页面 */}
            <Route
              path="/profile/:userId"
              element={user ? <UserProfile /> : <Navigate to="/" />}
            />

            {/* Dashboard page */}
            <Route
              path="/dashboard"
              element={user ? <Dashboard /> : <Navigate to="/" />}
            />

            {/* Reports page */}
            <Route
              path="/reports"
              element={user ? <Reports /> : <Navigate to="/" />}
            />

            {/* 设置页面 */}
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </NotificationProvider>
  );
}

export default App;