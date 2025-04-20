import React, { createContext, useState, useEffect, useContext } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// 创建主题上下文
const ThemeContext = createContext();

// 主题提供者组件
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  
  const auth = getAuth();
  
  // 从 localStorage 或用户设置中加载主题
  useEffect(() => {
    const loadTheme = async () => {
      try {
        // 首先尝试从 localStorage 获取主题
        const savedTheme = localStorage.getItem('theme');
        
        // 如果用户已登录，尝试从 Firestore 获取主题设置
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists() && userDoc.data().settings && userDoc.data().settings.theme) {
            // 使用用户在 Firestore 中保存的主题设置
            const userTheme = userDoc.data().settings.theme;
            setTheme(userTheme);
            localStorage.setItem('theme', userTheme);
          } else if (savedTheme) {
            // 如果 Firestore 中没有主题设置但 localStorage 有，使用 localStorage 中的主题
            setTheme(savedTheme);
          }
        } else if (savedTheme) {
          // 未登录用户使用 localStorage 中的主题
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
  
  // 当主题变化时应用到 HTML 元素
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // 保存到 localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  // 切换主题
  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // 如果用户已登录，更新 Firestore 中的主题设置
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // 更新用户设置中的主题
          await updateDoc(userRef, {
            'settings.theme': newTheme
          });
        }
      } catch (error) {
        console.error('Error saving theme to Firestore:', error);
      }
    }
  };
  
  // 设置特定主题
  const setSpecificTheme = async (newTheme) => {
    if (newTheme !== 'light' && newTheme !== 'dark') {
      newTheme = 'light'; // 默认为亮色主题
    }
    
    setTheme(newTheme);
    
    // 如果用户已登录，更新 Firestore 中的主题设置
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

// 自定义钩子，方便组件使用主题上下文
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 