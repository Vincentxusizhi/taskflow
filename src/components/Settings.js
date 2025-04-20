import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Header from './Header';
import { useTheme } from '../contexts/ThemeContext';

const Settings = () => {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  // 获取主题上下文
  const { theme, setTheme } = useTheme();
  
  // 设置状态
  const [settings, setSettings] = useState({
    // 界面设置
    theme: 'light',
    sidebarCollapsed: false,
    compactView: false,
    
    // 通知设置
    emailNotifications: true,
    taskReminders: true,
    teamUpdates: true,
    
    // 隐私设置
    showOnlineStatus: true,
    shareActivityHistory: true,
    
    // 语言和时区
    language: 'en',
    timeZone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    
    // 任务默认设置
    defaultTaskPriority: 'medium',
    defaultTaskDuration: 1,
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // 主题选项
  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System Default' }
  ];
  
  // 语言选项
  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'zh', label: 'Chinese (中文)' },
    { value: 'ja', label: 'Japanese (日本語)' }
  ];
  
  // 时区选项
  const timeZoneOptions = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London' },
    { value: 'Europe/Paris', label: 'Paris' },
    { value: 'Asia/Tokyo', label: 'Tokyo' },
    { value: 'Asia/Shanghai', label: 'Shanghai' }
  ];
  
  // 日期格式选项
  const dateFormatOptions = [
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
  ];
  
  // 加载用户设置
  useEffect(() => {
    const fetchSettings = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists() && userDoc.data().settings) {
          setSettings(prev => ({
            ...prev,
            ...userDoc.data().settings
          }));
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSettings();
  }, [currentUser]);
  
  // 处理设置变更
  const handleSettingChange = (category, setting, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [setting]: value
      }
    }));
  };
  
  // 处理切换设置
  const handleToggle = (setting) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
  };
  
  // 处理选择设置
  const handleSelect = (setting, value) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };
  
  // 修改主题选择处理函数
  const handleThemeChange = (value) => {
    setTheme(value);
    setSettings(prev => ({
      ...prev,
      theme: value
    }));
  };
  
  // 保存设置
  const saveSettings = async () => {
    if (!currentUser) return;
    
    try {
      setSaving(true);
      
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        settings: settings
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // 重置设置
  const resetSettings = () => {
    if (window.confirm('Are you sure you want to reset all settings to default?')) {
      setSettings({
        theme: 'light',
        sidebarCollapsed: false,
        compactView: false,
        emailNotifications: true,
        taskReminders: true,
        teamUpdates: true,
        showOnlineStatus: true,
        shareActivityHistory: true,
        language: 'en',
        timeZone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        defaultTaskPriority: 'medium',
        defaultTaskDuration: 1,
      });
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>
          
          {saveSuccess && (
            <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
              Settings saved successfully!
            </div>
          )}
          
          {/* 界面设置 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-700/50 overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Interface Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Theme</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => handleThemeChange(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  >
                    {themeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Compact View</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Show more content with less spacing</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="compactView"
                      checked={settings.compactView}
                      onChange={() => handleToggle('compactView')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="compactView"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.compactView ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Collapse Sidebar by Default</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Start with a minimized sidebar</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="sidebarCollapsed"
                      checked={settings.sidebarCollapsed}
                      onChange={() => handleToggle('sidebarCollapsed')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="sidebarCollapsed"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.sidebarCollapsed ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 通知设置 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-700/50 overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Notification Settings</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Notifications</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Receive updates via email</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="emailNotifications"
                      checked={settings.emailNotifications}
                      onChange={() => handleToggle('emailNotifications')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="emailNotifications"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.emailNotifications ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Task Reminders</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Get notified about upcoming deadlines</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="taskReminders"
                      checked={settings.taskReminders}
                      onChange={() => handleToggle('taskReminders')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="taskReminders"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.taskReminders ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Team Updates</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Receive notifications about team activities</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="teamUpdates"
                      checked={settings.teamUpdates}
                      onChange={() => handleToggle('teamUpdates')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="teamUpdates"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.teamUpdates ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 语言和时区设置 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-700/50 overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Language & Regional Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language</label>
                  <select
                    value={settings.language}
                    onChange={(e) => handleSelect('language', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  >
                    {languageOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Zone</label>
                  <select
                    value={settings.timeZone}
                    onChange={(e) => handleSelect('timeZone', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  >
                    {timeZoneOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Format</label>
                  <select
                    value={settings.dateFormat}
                    onChange={(e) => handleSelect('dateFormat', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  >
                    {dateFormatOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          {/* 隐私设置 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-700/50 overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Privacy Settings</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Online Status</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Let others see when you're active</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="showOnlineStatus"
                      checked={settings.showOnlineStatus}
                      onChange={() => handleToggle('showOnlineStatus')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="showOnlineStatus"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.showOnlineStatus ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Share Activity History</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Allow team members to see your recent activities</p>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input
                      type="checkbox"
                      id="shareActivityHistory"
                      checked={settings.shareActivityHistory}
                      onChange={() => handleToggle('shareActivityHistory')}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-gray-200 border-4 appearance-none cursor-pointer"
                    />
                    <label
                      htmlFor="shareActivityHistory"
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                        settings.shareActivityHistory ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    ></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 任务默认设置 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-700/50 overflow-hidden mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Task Default Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Priority</label>
                  <select
                    value={settings.defaultTaskPriority}
                    onChange={(e) => handleSelect('defaultTaskPriority', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Duration (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.defaultTaskDuration}
                    onChange={(e) => handleSelect('defaultTaskDuration', parseInt(e.target.value) || 1)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex justify-end space-x-4 mb-8">
            <button
              onClick={resetSettings}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Reset to Default
            </button>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 