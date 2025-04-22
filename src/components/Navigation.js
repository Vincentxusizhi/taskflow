// src/components/Navigation.js
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';  
import { signOut } from 'firebase/auth'; 

const Navigation = () => {
  const navigate = useNavigate(); 
  const location = useLocation(); 
  const currentPath = location.pathname;

  // handle logout
  const handleLogout = async () => {
    try {
      await signOut(auth); 
      console.log('user logged out');
      navigate('/'); // go to login page
    } catch (error) {
      console.error('logout failed:', error);
    }
  };

  // Navigation items with their icons, text, and links
  const navItems = [
    { icon: 'fa-chart-line', text: 'Dashboard', link: '/dashboard' },
    { icon: 'fa-users', text: 'Teams', link: '/Teams' },
    { icon: 'fa-calendar', text: 'Calendar', link: '/calendar' },
    { icon: 'fa-chart-bar', text: 'Reports', link: '/reports' },
    { icon: 'fa-cog', text: 'Settings', link: '/settings' },
    { icon: 'fa-sign-out-alt', text: 'Log Out', link: null }, 
  ];

  return (
    <nav className="mt-5 px-2 space-y-1">
      {navItems.map((item) => (
        item.text === 'Log Out' ? (
          <button
            key={item.text}
            onClick={handleLogout} 
            className="group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white w-full text-left"
          >
            <i className={`fas ${item.icon} w-6 h-6 mr-4 text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300`}></i>
            {item.text}
          </button>
        ) : (
          <Link
            key={item.text}
            to={item.link}
            className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${
              currentPath === item.link 
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            }`}
          >
            <i className={`fas ${item.icon} w-6 h-6 mr-4 ${
              currentPath === item.link 
                ? 'text-emerald-500 dark:text-emerald-400' 
                : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300'
            }`}></i>
            {item.text}
          </Link>
        )
      ))}
    </nav>
  );
};

export default Navigation;