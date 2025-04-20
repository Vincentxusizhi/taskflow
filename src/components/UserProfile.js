import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getAuth, updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { db } from '../firebase';
import Header from './Header';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp } from 'firebase/app';


const UserProfile = () => {
  const firebaseConfig = {
    apiKey: "AIzaSyA4UMD7SDH5_t7s_6cBtbyoYkiH0RR7Rqw",
    authDomain: "sample-a9153.firebaseapp.com",
    projectId: "sample-a9153",
    storageBucket: "sample-a9153.firebasestorage.app",
    messagingSenderId: "407474357230",
    appId: "1:407474357230:web:410d0460ddf4f74751c4ff"
  };
  const { userId } = useParams();
  const navigate = useNavigate();
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app);
  const currentUser = auth.currentUser;
  
  
  
  const [user, setUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [userTasks, setUserTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 添加弹窗状态
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success' // 'success', 'error', 'info'
  });
  
  // 显示通知弹窗的函数
  const showNotification = (message, type = 'success') => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // 3秒后自动关闭
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };
  
  // 编辑模式状态
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState({
    displayName: '',
    email: '',
    bio: '',
    role: '',
    phoneNumber: ''
  });
  
  // 密码更改状态
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // 添加头像相关状态
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // 添加文件输入引用
  const fileInputRef = useRef(null);
  
  // 获取用户数据
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);
        const user = auth.currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }
    
    console.log('Current user UID:', user.uid);
        // Call the cloud function to get user profile data
        const getUserProfile = httpsCallable(functions, 'getUserProfile');
        const result = await getUserProfile({ userId });
        const { user: userData, teams, tasks } = result.data;
        
        setUser(userData);
        setUserTeams(teams);
        setUserTasks(tasks);
        
        // 初始化编辑表单
        setEditedUser({
          displayName: userData.displayName || '',
          email: userData.email || '',
          bio: userData.bio || '',
          role: userData.role || '',
          phoneNumber: userData.phoneNumber || ''
        });
        
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError(err.message || 'Failed to load user data');
      } finally {
        setLoading(false);
      }
    };
    
    if (userId) {
      fetchUserData();
    }
  }, [userId, functions]);
  
  // 处理表单输入变化
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedUser(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // 处理密码输入变化
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // 保存个人资料更改
  const handleSaveProfile = async () => {
    try {
      if (!currentUser || currentUser.uid !== userId) {
        setError('You can only edit your own profile');
        showNotification('You can only edit your own profile', 'error');
        return;
      }
      
      // 更新 Firebase Auth 显示名称
      await updateProfile(currentUser, {
        displayName: editedUser.displayName
      });
      
      // 如果邮箱已更改，更新邮箱
      if (editedUser.email !== user.email) {
        await updateEmail(currentUser, editedUser.email);
      }
      
      // Call the cloud function to update user profile
      const updateUserProfile = httpsCallable(functions, 'updateUserProfile');
      await updateUserProfile({
        userId,
        profileData: editedUser
      });
      
      // 更新本地状态
      setUser(prev => ({
        ...prev,
        ...editedUser
      }));
      
      setIsEditing(false);
      showNotification('Profile updated successfully', 'success');
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile: ' + (err.message || err));
      showNotification('Failed to update profile: ' + (err.message || err), 'error');
    }
  };
  
  // 更改密码
  const handleChangePassword = async () => {
    try {
      setPasswordError('');
      setPasswordSuccess('');
      
      if (!currentUser || currentUser.uid !== userId) {
        setPasswordError('You can only change your own password');
        showNotification('You can only change your own password', 'error');
        return;
      }
      
      // 验证新密码
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setPasswordError('New passwords do not match');
        showNotification('New passwords do not match', 'error');
        return;
      }
      
      if (passwordData.newPassword.length < 6) {
        setPasswordError('Password must be at least 6 characters');
        showNotification('Password must be at least 6 characters', 'error');
        return;
      }
      
      // 重新认证用户
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordData.currentPassword
      );
      
      await reauthenticateWithCredential(currentUser, credential);
      
      // 更新密码
      await updatePassword(currentUser, passwordData.newPassword);
      
      // 重置表单
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      setPasswordSuccess('Password updated successfully');
      showNotification('Password updated successfully', 'success');
    } catch (err) {
      console.error('Error changing password:', err);
      
      if (err.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
        showNotification('Current password is incorrect', 'error');
      } else {
        setPasswordError('Current password is incorrect');
        showNotification('Failed to change password: ' + (err.message || err), 'error');
      }
    }
  };
  
  // 格式化日期
  const timestampToDate = (timestampInput) => {
    if (!timestampInput) {
      return null; // Return null for invalid input
    }
  
    // 1. Check if it's already a JS Date object
    if (timestampInput instanceof Date) {
      return timestampInput;
    }
  
    // 2. Check if it has a .toDate method (Firestore Timestamp)
    if (typeof timestampInput.toDate === 'function') {
      return timestampInput.toDate();
    }
  
    // 3. Check if it's the serialized object { _seconds, _nanoseconds }
    if (typeof timestampInput === 'object' && timestampInput !== null &&
        typeof timestampInput._seconds === 'number' && typeof timestampInput._nanoseconds === 'number') {
      // Convert seconds and nanoseconds to milliseconds
      return new Date(timestampInput._seconds * 1000 + timestampInput._nanoseconds / 1000000);
    }
  
    // 4. Try parsing directly (handles ISO strings, milliseconds numbers)
    // This might still result in an Invalid Date if the format is weird
    const date = new Date(timestampInput);
    if (!isNaN(date.getTime())) { // Check if the date is valid
        return date;
    }
  
    // 5. If none of the above worked, return null
    console.warn("Could not convert timestamp to Date:", timestampInput);
    return null;
  }

  // Format a date object to a readable string
  const formatDate = (dateObj) => {
    if (!dateObj) return 'N/A';
    if (!(dateObj instanceof Date)) return 'Invalid Date';
    
    return dateObj.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  // 计算截止日期
  const calculateDueDate = (startDate, duration) => {
    const start = timestampToDate(startDate); // Use the helper here too

    if (!start) return null; // Handle invalid start date

    const dueDate = new Date(start);
    dueDate.setDate(dueDate.getDate() + (parseInt(duration) || 0));
    return dueDate;
  };
  
  // 处理头像选择
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 验证文件类型
    if (!file.type.match('image.*')) {
      showNotification('Please select an image file', 'error');
      return;
    }
    
    // 验证文件大小 (限制为 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showNotification('Image size should be less than 2MB', 'error');
      return;
    }
    
    setAvatarFile(file);
    
    // 创建预览
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };
  
  // 上传头像
  const uploadAvatar = async () => {
    if (!avatarFile || !currentUser) return;
    
    try {
      setUploadingAvatar(true);
      
      // 创建存储引用
      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${currentUser.uid}/${Date.now()}_${avatarFile.name}`);
      
      // 上传文件
      await uploadBytes(avatarRef, avatarFile);
      
      // 获取下载 URL
      const downloadURL = await getDownloadURL(avatarRef);
      
      // 更新用户资料
      await updateProfile(currentUser, {
        photoURL: downloadURL
      });
      
      // Call the cloud function to update user avatar
      const updateUserAvatar = httpsCallable(functions, 'updateUserAvatar');
      await updateUserAvatar({
        userId: currentUser.uid,
        photoURL: downloadURL
      });
      
      // 更新本地状态
      setUser(prev => ({
        ...prev,
        photoURL: downloadURL
      }));
      
      // 重置文件状态
      setAvatarFile(null);
      setAvatarPreview(null);
      
      // 替换alert为自定义通知
      showNotification('Avatar updated successfully');
    } catch (err) {
      console.error('Error uploading avatar:', err);
      // 替换alert为自定义通知
      showNotification(`Failed to update avatar: ${err.message || err}`, 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };
  
  // 触发文件选择对话框
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Header />
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
        <Header />
        <div className="flex items-center justify-center h-screen">
          <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg text-center">
            <div className="text-red-600 dark:text-red-400 text-xl mb-4">{error}</div>
            <button
              onClick={() => navigate('/Teams')}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              Back to Teams
            </button>
          </div>
        </div>
      </div>
    );
    }
    
    if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
        <Header />
        <div className="flex items-center justify-center h-screen">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg text-center">
            <div className="text-yellow-600 dark:text-yellow-400 text-xl mb-4">User not found</div>
            <button
              onClick={() => navigate('/Teams')}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              Back to Teams
            </button>
          </div>
        </div>
      </div>
    );
    }
    
    return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <Header />
      
      {/* 通知弹窗组件 */}
      {notification.show && (
        <div className={`fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md transition-all duration-300 transform translate-y-0 
          ${notification.type === 'success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100' : 
            notification.type === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' : 
            'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'}`}>
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-3">
              {notification.type === 'success' ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              ) : notification.type === 'error' ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div>
              <p className="font-medium">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(prev => ({ ...prev, show: false }))}
              className="ml-auto flex-shrink-0 -mt-1 -mr-1 p-1 rounded-full hover:bg-opacity-20 hover:bg-gray-900 focus:outline-none"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* 个人资料卡 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6 dark:shadow-gray-700/50">
            <div className="p-6 relative">
              {/* 添加编辑按钮 */}
              {currentUser && currentUser.uid === userId && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="absolute top-4 right-4 bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full shadow-md"
                  title="Edit Profile"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
    
              <div className="flex flex-col md:flex-row items-start md:items-center">
                {/* 头像部分 */}
                <div className="mb-4 md:mb-0 md:mr-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-emerald-100 dark:border-emerald-900/30">
                      <img 
                        src={avatarPreview || user.photoURL || 'https://via.placeholder.com/100'} 
                        alt={user.displayName || 'User'} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    {isEditing && (
                      <div 
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        onClick={triggerFileInput}
                      >
                        <span className="text-white text-xs">Change Photo</span>
                      </div>
                    )}
                    
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      accept="image/*"
                      onChange={handleAvatarChange}
                    />
                  </div>
                  
                  {avatarFile && isEditing && (
                    <div className="mt-2 flex items-center">
                      <button
                        onClick={uploadAvatar}
                        disabled={uploadingAvatar}
                        className="text-xs bg-emerald-500 dark:bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-600 dark:hover:bg-emerald-700 mr-2"
                      >
                        {uploadingAvatar ? 'Uploading...' : 'Save Photo'}
                      </button>
                      <button
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                        }}
                        className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                
                {/* 用户信息部分 */}
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                        <input
                          type="text"
                          name="displayName"
                          value={editedUser.displayName}
                          onChange={handleInputChange}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={editedUser.email}
                          onChange={handleInputChange}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                        <textarea
                          name="bio"
                          value={editedUser.bio}
                          onChange={handleInputChange}
                          rows="3"
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        ></textarea>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                        <input 
                          type="text"
                          name="role"
                          value={editedUser.role}
                          onChange={handleInputChange}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                          placeholder="e.g. Developer, Designer, Project Manager"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                        <input
                          type="text"
                          name="phoneNumber"
                          value={editedUser.phoneNumber}
                          onChange={handleInputChange}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      
                      <div className="flex justify-end space-x-3 pt-4">
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditedUser({
                              displayName: user.displayName || '',
                              email: user.email || '',
                              bio: user.bio || '',
                              role: user.role || '',
                              phoneNumber: user.phoneNumber || ''
                            });
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{user?.displayName}</h1>
                      <p className="text-gray-500 dark:text-gray-400 mb-4">{user?.email}</p>
                      
                      {user?.bio && (
                        <div className="mb-4">
                          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</h2>
                          <p className="text-gray-800 dark:text-gray-200">{user.bio}</p>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        {user?.role && (
                          <div>
                            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</h2>
                            <p className="text-gray-800 dark:text-gray-200">{user.role}</p>
                          </div>
                        )}
                        
                        {user?.phoneNumber && (
                          <div>
                            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</h2>
                            <p className="text-gray-800 dark:text-gray-200">{user.phoneNumber}</p>
                          </div>
                        )}
                        
                        <div>
                          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Member Since</h2>
                          <p className="text-gray-800 dark:text-gray-200">{formatDate(timestampToDate(user?.createdAt))}</p>
                        </div>
                        
                        <div>
                          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teams</h2>
                          <p className="text-gray-800 dark:text-gray-200">{userTeams.length}</p>
                        </div>
                      </div>
                      
                      {currentUser && currentUser.uid === userId && (
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => setShowPasswordChange(!showPasswordChange)}
                            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-500 font-medium"
                          >
                            {showPasswordChange ? 'Cancel Password Change' : 'Change Password'}
                          </button>
                          
                          {showPasswordChange && (
                            <div className="mt-4 space-y-4">
                              {passwordError && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                                  {passwordError}
                                </div>
                              )}
                              
                              {passwordSuccess && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                                  {passwordSuccess}
                                </div>
                              )}
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                                <input
                                  type="password"
                                  name="currentPassword"
                                  value={passwordData.currentPassword}
                                  onChange={handlePasswordChange}
                                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                                <input
                                  type="password"
                                  name="newPassword"
                                  value={passwordData.newPassword}
                                  onChange={handlePasswordChange}
                                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                                <input
                                  type="password"
                                  name="confirmPassword"
                                  value={passwordData.confirmPassword}
                                  onChange={handlePasswordChange}
                                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                                />
                              </div>
                              
                              <button
                                onClick={handleChangePassword}
                                className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors"
                              >
                                Update Password
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* 用户团队 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6 dark:shadow-gray-700/50">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Teams</h2>
            </div>
            
            <div className="p-6">
              {userTeams.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Not a member of any teams yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userTeams.map(team => (
                    <div key={team.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-gray-700/30 transition-shadow">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{team.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{team.description}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {team.membersData?.length || 0} members
                        </span>
                        <button
                          onClick={() => navigate(`/team/${team.id}/tasks`)}
                          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-500"
                        >
                          View Team
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* 用户任务 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden dark:shadow-gray-700/50">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Assigned Tasks</h2>
            </div>
            
            <div className="p-6">
              {userTasks.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No tasks assigned yet.</p>
              ) : (
                <div className="space-y-4">
                  {userTasks.map(task => (
                    <div key={task.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-gray-700/30 transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">{task.text}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          task.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                          task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' :
                          'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400'
                        }`}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        {task.description || 'No description provided.'}
                      </p>
                      
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div>
                          <span className="font-medium">Team:</span> {task.teamName}
                        </div>
                        <div>
                          <span className="font-medium">Status:</span> {
                            task.status 
                              ? task.status.charAt(0).toUpperCase() + task.status.slice(1)
                              : 'Not Started'
                          }
                        </div>
                        <div>
                          <span className="font-medium">Due:</span> {formatDate(timestampToDate(calculateDueDate(task.start_date, task.duration)))}
                        </div>
                        <div>
                          <span className="font-medium">Progress:</span> {task.progress}%
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button
                          onClick={() => navigate(`/team/${task.teamId}/tasks`)}
                          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-500"
                        >
                          View Task
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    );
};

export default UserProfile; 