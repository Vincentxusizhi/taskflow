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
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(true); 

  // listen to user login status
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user); // update user status
      setLoading(false); // loading completed
    });
    return () => unsubscribe(); // clean up listener
  }, []);

  // if loading, show loading prompt
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <NotificationProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            {/* if user is logged in, redirect to /dashboard; otherwise show login page */}
            <Route
              path="/"
              element={user ? <Navigate to="/dashboard" /> : <LoginForm />}
            />

            {/* if user is not logged in, redirect to /; otherwise show calendar page */}
            <Route
              path="/calendar"
              element={user ? <Calendar /> : <Navigate to="/" />}
            />

            {/* if user is not logged in, redirect to /; otherwise show teams page */}
            <Route
              path="/Teams"
              element={user ? <Teams /> : <Navigate to="/" />}
            />
            
            {/* if user is not logged in, redirect to /; otherwise show main page */}
            <Route
              path="/team/:teamId/tasks"
              element={user ? <MainPage /> : <Navigate to="/" />}
            />

            {/* if user is not logged in, redirect to /; otherwise show user profile page */}
            <Route
              path="/profile/:userId"
              element={user ? <UserProfile /> : <Navigate to="/" />}
            />

            {/* if user is not logged in, redirect to /; otherwise show dashboard page */}
            <Route
              path="/dashboard"
              element={user ? <Dashboard /> : <Navigate to="/" />}
            />

            {/* if user is not logged in, redirect to /; otherwise show reports page */}
            <Route
              path="/reports"
              element={user ? <Reports /> : <Navigate to="/" />}
            />

            {/* if user is not logged in, redirect to /; otherwise show settings page */}
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </NotificationProvider>
  );
}

export default App;