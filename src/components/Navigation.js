// src/components/Navigation.js
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase'; // 导入 Firebase 的 auth 模块
import { signOut } from 'firebase/auth'; // 导入 signOut 方法

const Navigation = () => {
  const navigate = useNavigate(); // 获取 navigate 函数
  const location = useLocation(); // Get current location
  const currentPath = location.pathname;

  // 处理退出登录逻辑
  const handleLogout = async () => {
    try {
      await signOut(auth); // 调用 Firebase 的 signOut 方法
      console.log('用户已退出登录');
      navigate('/'); // 跳转到登录界面
    } catch (error) {
      console.error('退出登录失败:', error);
    }
  };

  // Navigation items with their icons, text, and links
  const navItems = [
    { icon: 'fa-chart-line', text: 'Dashboard', link: '/dashboard' },
    { icon: 'fa-users', text: 'Teams', link: '/Teams' },
    { icon: 'fa-calendar', text: 'Calendar', link: '/calendar' },
    { icon: 'fa-chart-bar', text: 'Reports', link: '/reports' },
    { icon: 'fa-cog', text: 'Settings', link: '/settings' },
    { icon: 'fa-sign-out-alt', text: 'Log Out', link: null }, // Log Out 不需要链接
  ];

  return (
    <nav className="mt-5 px-2 space-y-1">
      {navItems.map((item) => (
        item.text === 'Log Out' ? (
          <button
            key={item.text}
            onClick={handleLogout} // 绑定点击事件
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