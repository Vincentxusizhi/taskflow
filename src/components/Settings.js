import React, { useState, useEffect, useRef } from 'react';
import { getAuth, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, updateEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTheme } from '../contexts/ThemeContext';
import { useNotification } from '../contexts/NotificationContext';
import Header from './Header';


const Settings = () => {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const { showSuccess, showError } = useNotification();
  
  // Theme context
  const { theme, setTheme } = useTheme();
  
  // Profile state
  const [profile, setProfile] = useState({
    displayName: '',
    email: '',
    phone: '',
    bio: ''
  });

  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Task default settings
  const [taskDefaults, setTaskDefaults] = useState({
    defaultTaskPriority: 'medium',
    defaultTaskDuration: 1
  });
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // Avatar handling
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  
  // Theme options
  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System Default' }
  ];
  
  // Priority options
  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' }
  ];
  
  // Load user data and settings
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      
      try {
        // Load user profile
        setProfile({
          displayName: currentUser.displayName || '',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          phone: '',
          bio: ''
        });
        
        // Load user settings from Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Load profile data if available
          if (userData.profile) {
            setProfile(prev => ({
              ...prev,
              ...userData.profile
            }));
          }
          
          // Load task default settings if available
          if (userData.taskDefaults) {
            setTaskDefaults(prev => ({
              ...prev,
              ...userData.taskDefaults
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        showError('Failed to load user settings');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [currentUser, showError]);
  
  // Handle profile input changes
  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle password input changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle task defaults changes
  const handleTaskDefaultChange = (name, value) => {
    setTaskDefaults(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle theme change
  const handleThemeChange = (value) => {
    setTheme(value);
  };
  
  // Save profile changes
  const handleSaveProfile = async () => {
    if (!currentUser) return;
    
    try {
      setSaving(true);
      
      // Update display name in Firebase Auth
      await updateProfile(currentUser, {
        displayName: profile.displayName
      });
      
      // Save profile to Firestore
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        profile: {
          displayName: profile.displayName,
          email: currentUser.email, // Always use the authenticated email
          phone: profile.phone,
          bio: profile.bio
        }
      });
      
      showSuccess('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      showError('Failed to update profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };
  
  // Save task defaults
  const handleSaveTaskDefaults = async () => {
    if (!currentUser) return;
    
    try {
      setSaving(true);
      
      // Save task defaults to Firestore
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        taskDefaults: taskDefaults
      });
      
      showSuccess('Task defaults updated successfully');
    } catch (error) {
      console.error('Error updating task defaults:', error);
      showError('Failed to update task defaults: ' + error.message);
    } finally {
      setSaving(false);
    }
  };
  
  // Change password
  const handleChangePassword = async () => {
    try {
      setPasswordError('');
      setPasswordSuccess('');
      
      // Validate new password
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }
      
      if (passwordData.newPassword.length < 6) {
        setPasswordError('Password must be at least 6 characters');
        return;
      }
      
      // Reauthenticate user
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordData.currentPassword
      );
      
      await reauthenticateWithCredential(currentUser, credential);
      
      // Update password
      await updatePassword(currentUser, passwordData.newPassword);
      
      // Reset form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      setPasswordSuccess('Password changed successfully');
      showSuccess('Password changed successfully');
    } catch (error) {
      console.error('Error changing password:', error);
      
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else {
        setPasswordError('Failed to change password: ' + error.message);
      }
    }
  };
  
  // Handle avatar selection
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match('image.*')) {
      showError('Please select an image file');
      return;
    }
    
    // Validate file size (limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showError('Image size should be less than 2MB');
      return;
    }
    
    setAvatarFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };
  
  // Upload avatar
  const uploadAvatar = async () => {
    if (!avatarFile || !currentUser) return;
    
    try {
      setUploadingAvatar(true);
      
      // Create storage reference
      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${currentUser.uid}/${Date.now()}_${avatarFile.name}`);
      
      // Upload file
      await uploadBytes(avatarRef, avatarFile);
      
      // Get download URL
      const downloadURL = await getDownloadURL(avatarRef);
      
      // Update user profile in Firebase Auth
      await updateProfile(currentUser, {
        photoURL: downloadURL
      });

      // Update photoURL in Firestore document as well
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, { 
          photoURL: downloadURL 
        });
      } catch (firestoreError) {
        console.error("Error updating Firestore photoURL:", firestoreError);
        // Optionally notify user, but Auth profile was updated.
      }
      
      // Update profile state
      setProfile(prev => ({
        ...prev,
        photoURL: downloadURL
      }));
      
      // Clear avatar file
      setAvatarFile(null);
      setAvatarPreview('');
      
      showSuccess('Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      showError('Failed to upload avatar: ' + error.message);
    } finally {
      setUploadingAvatar(false);
    }
  };
  
  // Trigger file input click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <div className="flex-1 pt-16">
          <Header />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      
      <div className="flex-1 pt-16">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>
            
            {/* Profile Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Profile Settings</h2>
                
                {/* Avatar */}
                <div className="flex items-center mb-6">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                      {avatarPreview ? (
                        <img 
                          src={avatarPreview} 
                          alt="Avatar Preview" 
                          className="w-full h-full object-cover"
                        />
                      ) : profile.photoURL ? (
                        <img 
                          src={profile.photoURL} 
                          alt="User Avatar" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                          <i className="fas fa-user text-3xl"></i>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={triggerFileInput}
                      className="absolute bottom-0 right-0 bg-emerald-500 text-white rounded-full p-2 shadow-md hover:bg-emerald-600"
                    >
                      <i className="fas fa-camera"></i>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarChange}
                      className="hidden"
                      accept="image/*"
                    />
                  </div>
                  <div className="ml-6">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Profile Picture</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">PNG, JPG, or GIF, max 2MB</p>
                    {avatarFile && (
                      <button
                        type="button"
                        onClick={uploadAvatar}
                        disabled={uploadingAvatar}
                        className="px-3 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {uploadingAvatar ? 'Uploading...' : 'Upload'}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Profile Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      name="displayName"
                      value={profile.displayName}
                      onChange={handleProfileChange}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={profile.email}
                      readOnly
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white bg-gray-100 dark:bg-gray-600 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Email cannot be changed for security reasons</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={profile.phone}
                      onChange={handleProfileChange}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                    <textarea
                      name="bio"
                      value={profile.bio}
                      onChange={handleProfileChange}
                      rows="3"
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Change Password */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Change Password</h2>
                
                {passwordError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                    {passwordError}
                  </div>
                )}
                
                {passwordSuccess && (
                  <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                    {passwordSuccess}
                  </div>
                )}
                
                <div className="space-y-4">
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
                  
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600"
                    >
                      Change Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Theme Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Theme Settings</h2>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Theme</label>
                  <select
                    value={theme}
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
              </div>
            </div>
            
            {/* Task Default Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Task Default Settings</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Task Priority</label>
                    <select
                      value={taskDefaults.defaultTaskPriority}
                      onChange={(e) => handleTaskDefaultChange('defaultTaskPriority', e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                    >
                      {priorityOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Task Duration (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={taskDefaults.defaultTaskDuration}
                      onChange={(e) => handleTaskDefaultChange('defaultTaskDuration', parseInt(e.target.value) || 1)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveTaskDefaults}
                      disabled={saving}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Task Defaults'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 