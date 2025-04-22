import React, { createContext, useState, useEffect, useContext } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// create theme context
const ThemeContext = createContext();

// theme provider component
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  
  const auth = getAuth();
  
  // load theme from localStorage or user settings
  useEffect(() => {
    const loadTheme = async () => {
      try {
        // first try to get theme from localStorage
        const savedTheme = localStorage.getItem('theme');
        
        // if user is logged in, try to get theme from Firestore
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists() && userDoc.data().settings && userDoc.data().settings.theme) {
            // use user's theme setting saved in Firestore
            const userTheme = userDoc.data().settings.theme;
            setTheme(userTheme);
            localStorage.setItem('theme', userTheme);
          } else if (savedTheme) {
            // if there is no theme setting in Firestore but there is in localStorage, use localStorage theme
            setTheme(savedTheme);
          }
        } else if (savedTheme) {
          // if user is not logged in, use localStorage theme
          setTheme(savedTheme);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadTheme();
  }, [auth]);
  
  // when theme changes, apply to HTML element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // save to localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  // toggle theme
  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // if user is logged in, update theme setting in Firestore
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // update theme setting in user's settings
          await updateDoc(userRef, {
            'settings.theme': newTheme
          });
        }
      } catch (error) {
        console.error('Error saving theme to Firestore:', error);
      }
    }
  };
  
  // set specific theme
  const setSpecificTheme = async (newTheme) => {
    if (newTheme !== 'light' && newTheme !== 'dark') {
      newTheme = 'light'; // default to light theme
    }
    
    setTheme(newTheme);
    
    // if user is logged in, update theme setting in Firestore
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          'settings.theme': newTheme
        });
      } catch (error) {
        console.error('Error saving theme to Firestore:', error);
      }
    }
  };
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setSpecificTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
};

// custom hook to use theme context
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 