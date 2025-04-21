import React, { useState, useEffect, useRef } from 'react';
import Navigation from './Navigation';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import Notification from './Notification';

const Header = () => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const sidebarRef = useRef(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Fetch user data from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user document from Firestore
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            // Combine auth user data with Firestore data
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: userSnap.data().displayName || user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100',
              ...userSnap.data()
            });
          } else {
            // Use auth data if Firestore document doesn't exist
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100'
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Get unread notifications
  useEffect(() => {
    const fetchUnreadNotifications = async () => {
      if (!auth.currentUser) return;
      
      try {
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', auth.currentUser.uid),
          where('read', '==', false)
        );
        
        const querySnapshot = await getDocs(notificationsQuery);
        setUnreadNotifications(querySnapshot.size);
      } catch (error) {
        console.error('Error fetching unread notifications:', error);
      }
    };
    
    fetchUnreadNotifications();
    
    // Set interval to check for unread notifications
    const intervalId = setInterval(fetchUnreadNotifications, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, [auth.currentUser]);

  // When notifications panel is closed, refresh unread notifications
  useEffect(() => {
    if (!showNotifications) {
      const fetchUnreadNotifications = async () => {
        if (!auth.currentUser) return;
        
        try {
          const notificationsQuery = query(
            collection(db, 'notifications'),
            where('userId', '==', auth.currentUser.uid),
            where('read', '==', false)
          );
          
          const querySnapshot = await getDocs(notificationsQuery);
          setUnreadNotifications(querySnapshot.size);
        } catch (error) {
          console.error('Error fetching unread notifications:', error);
        }
      };
      
      fetchUnreadNotifications();
    }
  }, [showNotifications, auth.currentUser]);

  // Handle clicks outside the sidebar to close it
  const handleOutsideClick = (e) => {
    if (sidebarRef.current && !sidebarRef.current.contains(e.target) && 
        e.target.classList.contains('sidebar-overlay')) {
      setShowSidebar(false);
    }
  };

  // Add ESC key listener to close sidebar
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape' && showSidebar) {
        setShowSidebar(false);
      }
    };

    if (showSidebar) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showSidebar]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-green-200 dark:bg-gray-800 shadow-sm dark:shadow-gray-700">
      <div className="border-b border-green-300 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <button
                className="p-2 rounded-md bg-emerald-500 hover:bg-emerald-600 cursor-pointer dark:bg-emerald-600 dark:hover:bg-emerald-700"
                onClick={() => setShowSidebar(true)}
                aria-label="Open sidebar menu"
              >
                <div className="w-5 h-0.5 bg-white mb-1"></div>
                <div className="w-5 h-0.5 bg-white mb-1"></div>
                <div className="w-5 h-0.5 bg-white"></div>
              </button>

              {/* Sidebar with slide-in animation */}
              <div className={`fixed inset-y-0 left-0 z-50 flex transition-all duration-300 ease-in-out ${showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {/* Semi-transparent overlay */}
                <div 
                  className={`fixed inset-0 bg-gray-500 transition-opacity duration-300 ${showSidebar ? 'bg-opacity-75' : 'bg-opacity-0'} sidebar-overlay dark:bg-gray-900 dark:bg-opacity-75`}
                  onClick={handleOutsideClick}
                ></div>

                {/* Sidebar panel */}
                <div 
                  ref={sidebarRef}
                  className={`relative flex flex-col w-80 max-w-xs bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${showSidebar ? 'translate-x-0' : '-translate-x-full'} dark:bg-gray-800`}
                >
                  <div className="absolute top-4 right-4">
                    <button
                      className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:hover:bg-gray-600"
                      onClick={() => setShowSidebar(false)}
                      aria-label="Close sidebar"
                    >
                      <i className="fas fa-times text-gray-600 text-lg dark:text-gray-300"></i>
                    </button>
                  </div>

                  <div className="flex-1 h-0 pt-6 pb-4 overflow-y-auto">
                    <div className="flex-shrink-0 flex items-center px-6 mb-6">
                      <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm dark:bg-emerald-600">
                        <span className="text-white text-base font-semibold">CP</span>
                      </div>
                      <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">Creative Pro</span>
                    </div>

                    {/* Navigation component */}
                    <Navigation />
                  </div>

                  {/* User profile in sidebar - using Firestore data */}
                  <div className="flex-shrink-0 flex border-t border-gray-200 p-6 bg-gray-50 dark:border-gray-700 dark:bg-gray-700">
                    {loading ? (
                      <div className="w-full flex justify-center">
                        <div className="animate-pulse h-10 w-10 bg-gray-200 rounded-full dark:bg-gray-600"></div>
                        <div className="ml-3 flex-1">
                          <div className="animate-pulse h-4 w-24 bg-gray-200 rounded dark:bg-gray-600"></div>
                          <div className="animate-pulse mt-2 h-3 w-16 bg-gray-200 rounded dark:bg-gray-600"></div>
                        </div>
                      </div>
                    ) : userData ? (
                      <div className="flex items-center w-full">
                        <div className="flex-shrink-0">
                          {userData?.photoURL ? (
                            <img
                              className="h-10 w-10 rounded-lg shadow-sm object-cover"
                              src={userData.photoURL}
                              alt={userData.displayName}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-emerald-200 flex items-center justify-center text-emerald-700 shadow-sm dark:bg-emerald-700 dark:text-emerald-100">
                              {userData?.displayName?.charAt(0) || userData?.email?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-base font-semibold text-gray-900 dark:text-white">{userData.displayName}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">{userData.email}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center w-full">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center dark:bg-gray-600">
                            <i className="fas fa-user text-gray-400 dark:text-gray-300"></i>
                          </div>
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-base font-semibold text-gray-900 dark:text-white">Guest User</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">Not signed in</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="ml-4 flex items-center">
                <img
                  className="h-8"
                  src="/image.png" 
                  alt="Logo"
                />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative ml-3">
                <div 
                  className="flex items-center cursor-pointer"
                  onClick={() => navigate(`/profile/${userData?.uid}`)}
                >
                  {userData?.photoURL ? (
                    <img 
                      src={userData.photoURL} 
                      alt={userData.displayName || userData.email}
                      className="w-8 h-8 rounded-full object-cover mr-2"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 mr-2 dark:bg-emerald-700 dark:text-emerald-100">
                      {userData?.displayName?.charAt(0) || userData?.email?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 hidden md:block">
                    {userData?.displayName || userData?.email}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 ml-1 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              
              <div className="relative">
                <button 
                  className="relative hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full" 
                  aria-label="Notifications"
                  data-notification-toggle
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <i className="fas fa-bell text-gray-500 dark:text-gray-300"></i>
                  {unreadNotifications > 0 && (
                    <span className="absolute top-0 right-0 inline-block w-2 h-2 bg-red-500 rounded-full"></span>
                  )}
                </button>
                
                <Notification 
                  isOpen={showNotifications} 
                  onClose={() => setShowNotifications(false)}
                  onNotificationsRead={() => setUnreadNotifications(0)}
                />
              </div>
              
              <button 
                onClick={() => navigate('/settings')} 
                className="hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full" 
                aria-label="Settings"
              >
                <i className="fas fa-cog text-gray-500 dark:text-gray-300"></i>
              </button>
              
              <button 
                onClick={toggleTheme} 
                className="hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <i className="fas fa-moon text-gray-500 dark:text-gray-400"></i>
                ) : (
                  <i className="fas fa-sun text-yellow-500"></i>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;