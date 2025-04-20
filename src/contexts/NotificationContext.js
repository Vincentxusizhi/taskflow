import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

// 创建通知上下文
const NotificationContext = createContext();

// 通知样式
const styles = {
  container: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    width: '350px',
    maxWidth: '95vw',
  },
  notification: {
    position: 'relative',
    padding: '16px',
    marginBottom: '10px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    animation: 'slideInRight 0.3s ease-out forwards',
    overflow: 'hidden',
  },
  icon: {
    marginRight: '12px',
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  title: {
    fontWeight: 600,
    fontSize: '16px',
    marginBottom: '4px',
  },
  message: {
    fontSize: '14px',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 0.2s',
    padding: '4px',
    marginLeft: '8px',
    borderRadius: '50%',
  },
  progress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  }
};

// 定义通知类型
const NOTIFICATION_TYPES = {
  INFO: {
    backgroundColor: 'rgb(59, 130, 246)',
    color: 'white',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  SUCCESS: {
    backgroundColor: 'rgb(34, 197, 94)',
    color: 'white',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  WARNING: {
    backgroundColor: 'rgb(234, 179, 8)',
    color: 'white',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  ERROR: {
    backgroundColor: 'rgb(239, 68, 68)',
    color: 'white',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

// 通知提供者组件
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  // 添加通知
  const addNotification = (type, message, title = '', duration = 5000) => {
    const id = Date.now();
    setNotifications(prevNotifications => [
      ...prevNotifications, 
      { id, type, message, title, duration }
    ]);

    // 自动关闭通知
    if (duration !== 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  };

  // 移除通知
  const removeNotification = id => {
    setNotifications(prevNotifications => 
      prevNotifications.filter(notification => notification.id !== id)
    );
  };

  // 便捷方法
  const showSuccess = (message, title, duration) => 
    addNotification('SUCCESS', message, title, duration);
  
  const showError = (message, title, duration) => 
    addNotification('ERROR', message, title, duration);
  
  const showWarning = (message, title, duration) => 
    addNotification('WARNING', message, title, duration);
  
  const showInfo = (message, title, duration) => 
    addNotification('INFO', message, title, duration);

  // 添加CSS动画样式
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @keyframes progress {
        from { width: 100%; }
        to { width: 0%; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // 渲染通知内容
  const renderNotifications = () => {
    if (notifications.length === 0) return null;

    const notificationsContent = (
      <div style={styles.container}>
        {notifications.map(({ id, type, message, title, duration }) => {
          const notificationType = NOTIFICATION_TYPES[type];
          return (
            <div 
              key={id}
              style={{
                ...styles.notification,
                backgroundColor: notificationType.backgroundColor,
                color: notificationType.color,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={styles.icon}>
                  {notificationType.icon}
                </div>
                <div style={styles.content}>
                  {title && <div style={styles.title}>{title}</div>}
                  <div style={styles.message}>{message}</div>
                </div>
                <button
                  style={styles.closeButton}
                  onClick={() => removeNotification(id)}
                  aria-label="关闭通知"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              {duration > 0 && (
                <div 
                  style={{
                    ...styles.progress,
                    width: '100%',
                    animation: `progress ${duration / 1000}s linear forwards`
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );

    // 使用 ReactDOM 的 Portal 功能，将通知内容渲染到 body 下
    return ReactDOM.createPortal(
      notificationsContent,
      document.body
    );
  };

  return (
    <NotificationContext.Provider value={{ 
      showSuccess, 
      showError, 
      showWarning, 
      showInfo,
      addNotification,
      removeNotification
    }}>
      {children}
      {renderNotifications()}
    </NotificationContext.Provider>
  );
};

// 创建自定义钩子来使用通知
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}; 