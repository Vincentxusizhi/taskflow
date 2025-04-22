import React, { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const Notification = ({ isOpen, onClose, onNotificationsRead }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const notificationRef = useRef(null);
  const navigate = useNavigate();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // Refresh notifications every 30 seconds when panel is open
  useEffect(() => {
    let intervalId;
    if (isOpen) {
      intervalId = setInterval(() => {
        setLastRefresh(Date.now());
      }, 30000); // 30 seconds
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen]);

  // get notification data
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log("Fetching notifications for user:", currentUser.uid);

        // query user's notifications
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', currentUser.uid),
          orderBy('createdAt', 'desc'), 
          limit(10)
        );

        try {
          const querySnapshot = await getDocs(notificationsQuery);
          const notificationsData = [];

          console.log("Query returned", querySnapshot.size, "notifications");
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log("Notification type:", data.type, "title:", data.title, "message:", data.message);
            
            notificationsData.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date()
            });
          });

          setNotifications(notificationsData);
        } catch (err) {
          console.error('Error fetching notifications with orderBy:', err);
          
          
          if (err.code === 'failed-precondition' || err.message.includes('index')) {
            try {
              console.log("Trying fallback query without orderBy");
              
              const basicQuery = query(
                collection(db, 'notifications'),
                where('userId', '==', currentUser.uid),
                limit(20)
              );
              
              const fallbackSnapshot = await getDocs(basicQuery);
              const fallbackData = [];
              
              console.log("Fallback query returned", fallbackSnapshot.size, "notifications");
              
              fallbackSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log("Fallback notification type:", data.type, "title:", data.title);
                
                fallbackData.push({
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt?.toDate() || new Date()
                });
              });
              
                
              fallbackData.sort((a, b) => b.createdAt - a.createdAt);
              
              setNotifications(fallbackData);
              
              // show index error prompt
              const indexUrl = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
              setError(
                <div>
                  <p>This query requires an index. Please create it by clicking the link below:</p>
                  <a 
                    href={indexUrl ? indexUrl[0] : "https://console.firebase.google.com"} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-emerald-500 hover:underline"
                  >
                    Create Index
                  </a>
                </div>
              );
            } catch (fallbackErr) {
              console.error('Fallback query also failed:', fallbackErr);
              setError('Failed to load notifications');
            }
          } else {
            setError('Failed to load notifications');
          }
        }
      } catch (outerErr) {
        console.error('Error in notification component:', outerErr);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchNotifications();
    }
  }, [currentUser, isOpen, lastRefresh]);

  // handle click outside to close notification panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target) && 
          !event.target.closest('[data-notification-toggle]')) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: Timestamp.now()
      });

      // update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true, readAt: new Date() } 
            : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(notification => !notification.read);
      
      if (unreadNotifications.length === 0) return;
      
      // batch update Firestore
      const updatePromises = unreadNotifications.map(notification => 
        updateDoc(doc(db, 'notifications', notification.id), {
          read: true,
          readAt: Timestamp.now()
        })
      );
      
      await Promise.all(updatePromises);
      
      // update local state
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, read: true, readAt: new Date() }))
      );
      
      // call callback function to notify Header component
      if (onNotificationsRead) {
        onNotificationsRead();
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  
  const handleNotificationClick = async (notification) => {
    
    if (!notification.read) {
      try {
        await markAsRead(notification.id);
        
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    
  };

  // format time
  const formatTime = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) {
      return 'just now';
    } else if (minutes < 60) {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (hours < 24) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else if (days < 7) {
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // get notification icon
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_assigned':
      case 'task_assignment':
        return <i className="fas fa-tasks text-emerald-500 dark:text-emerald-400"></i>;
      case 'task_updated':
        return <i className="fas fa-edit text-blue-500 dark:text-blue-400"></i>;
      case 'team_invitation':
        return <i className="fas fa-user-plus text-purple-500 dark:text-purple-400"></i>;
      case 'comment_mention':
        return <i className="fas fa-comment text-yellow-500 dark:text-yellow-400"></i>;
      case 'task_comment':
        return <i className="fas fa-comment-dots text-green-500 dark:text-green-400"></i>;
      case 'comment_reply':
        return <i className="fas fa-reply text-orange-500 dark:text-orange-400"></i>;
      default:
        return <i className="fas fa-bell text-gray-500 dark:text-gray-400"></i>;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={notificationRef}
      className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden z-50"
      style={{ top: '100%' }}
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Notifications</h3>
        <div className="flex gap-2">
          {notifications.some(notification => !notification.read) && (
            <button 
              onClick={markAllAsRead}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              Mark all as read
            </button>
          )}
          <button 
            onClick={() => setLastRefresh(Date.now())}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-2"
            title="Refresh notifications"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500 dark:text-red-400">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No notifications yet
          </div>
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li 
                key={notification.id}
                className={`border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer transition-colors duration-300 ${
                  notification.read 
                    ? 'bg-white dark:bg-gray-800' 
                    : 'bg-emerald-50 dark:bg-emerald-900/20'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex p-4">
                  <div className="flex-shrink-0 mr-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className={`text-sm ${notification.read ? 'text-gray-800 dark:text-gray-200' : 'font-medium text-gray-900 dark:text-white'}`}>
                        {notification.title}
                      </p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      {notification.message}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
        <button 
          onClick={() => navigate('/settings')}
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          Notification Settings
        </button>
      </div> */}
    </div>
  );
};

export default Notification; 