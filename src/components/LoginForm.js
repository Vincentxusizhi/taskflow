import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithGoogle,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  saveUserToFirestore,
  sendEmailVerification
} from '../firebase';

const LoginForm = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle Google login
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await signInWithGoogle();
      console.log('Login user:', result.user);
      
      // Save/update user in Firestore regardless of whether they're new
      await saveUserToFirestore(
        result.user.uid, 
        result.user.email, 
        result.user.displayName || 'Google User'
      );
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Google login error:', error);
      setError('Google login failed. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle email login
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Email login
      const result = await signInWithEmailAndPassword(email, password);
      console.log('Login user:', result.user);
      
      // Check if email is verified
      if (!result.user.emailVerified) {
        // Email not verified, show error
        setError('Please verify your email before logging in. Check your inbox for a verification link.');
        
        // Offer to resend verification email
        try {
          await sendEmailVerification(result.user);
          setSuccessMessage('A new verification email has been sent.');
          
          // Navigate to verification page instead of dashboard
          navigate('/verify-email', { state: { email: email } });
        } catch (verificationError) {
          console.error('Error resending verification:', verificationError);
        }
        
        setLoading(false);
        return;
      }
      
      // Email is verified, proceed with login
      navigate('/dashboard');
    } catch (error) {
      console.error('Email login error:', error);
      
      // Provide detailed error messages based on error code
      switch (error.code) {
        case 'auth/user-not-found':
          setError('Email not registered. Please sign up first.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;
        case 'auth/invalid-email':
          setError('Invalid email format. Please check and try again.');
          break;
        case 'auth/too-many-requests':
          setError('Access temporarily disabled due to too many failed login attempts. Please try again later.');
          break;
        case 'auth/invalid-credential':
          // This code might appear in newer Firebase SDK versions for general bad email/password combo
          setError('Incorrect email or password. Please try again.'); 
          break;
        default:
          setError('Login failed. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle registration
  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    // Basic validation
    if (!displayName.trim()) {
      setError('Please enter a username.');
      setLoading(false);
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      // Check if email is already registered
      const methods = await fetchSignInMethodsForEmail(email);
      
      if (methods.length > 0) {
        setError('Email already registered. Please login instead.');
        setLoading(false);
        return;
      }
      
      // Register new user
      const userCredential = await createUserWithEmailAndPassword(email, password, displayName);
      console.log('Registered user:', userCredential.user);
      
      // Save user data to Firestore - User record exists now, emailVerified is false
      await saveUserToFirestore(
        userCredential.user.uid, 
        email, 
        displayName
      );
      
      // Send verification email
      try {
        await sendEmailVerification(userCredential.user);
        console.log('Verification email sent to:', email);
        // Navigate to verification page, passing email as state
        navigate('/verify-email', { state: { email: email } }); 
      } catch (verificationError) {
        console.error("Error sending verification email:", verificationError);
        setError('Registration successful, but failed to send verification email. Please try logging in or contact support.');
        // Optionally navigate to login or show error prominently
      }
    } catch (error) {
      console.error('Registration error:', error);
      
      // Provide detailed error messages
      if (error.code === 'auth/email-already-in-use') {
        setError('Email already registered. Please login instead.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email format. Please check and try again.');
      } else {
        setError('Registration failed. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-1/3 h-1/3 bg-blue-100 rounded-full blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-indigo-100 rounded-full blur-3xl opacity-20 translate-x-1/2 translate-y-1/2"></div>
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
      </div>
      
      <div className="w-full max-w-6xl flex rounded-xl shadow-2xl overflow-hidden relative z-10">
        {/* Left side - Logo and company info */}
        <div className="hidden md:block w-1/2 bg-gradient-to-r from-blue-500 to-indigo-600 p-12 text-white flex flex-col justify-center items-center relative overflow-hidden">
          {/* Abstract shapes and patterns for the left panel */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full opacity-10 -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full opacity-10 translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute inset-0">
            <svg className="absolute top-0 left-0 w-full h-full opacity-10" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,0 L100,0 L100,100 L0,100 Z" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"></path>
              <path d="M0,0 L100,100 M100,0 L0,100" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"></path>
              <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"></circle>
            </svg>
          </div>
          
          <div className="text-center relative z-10">
            {/* Original Logo */}
            <img
              src="/Logo.png"
              alt="Company Logo"
              className="h-24 mx-auto mb-4 rounded-full bg-white p-2 shadow-lg"
            />
            {/* Added Image */}
            <img 
              src="/image.png"
              alt="Additional Image"
              className="h-16 mx-auto mb-8"
            />
            <h1 className="text-4xl font-bold mb-4">TaskFlow</h1>
            <p className="text-xl opacity-90 mb-6">Organize your teams and tasks with ease</p>
            <div className="space-y-3 text-left">
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-3 text-green-300"></i>
                <span>Collaborate with your team in real-time</span>
              </div>
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-3 text-green-300"></i>
                <span>Track project progress with visual dashboards</span>
              </div>
              <div className="flex items-center">
                <i className="fas fa-check-circle mr-3 text-green-300"></i>
                <span>Organize tasks with customizable workflows</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Login/Registration form */}
        <div className="w-full md:w-1/2 bg-white p-8 md:p-12 relative">
          {/* Subtle pattern for right panel */}
          <div className="absolute inset-0 opacity-5 z-0 bg-pattern-dots"></div>
          
          <div className="mb-8 relative z-10">
            {/* Visible only on mobile */}
            <div className="md:hidden text-center mb-6">
              <img
                src="/Logo.png"
                alt="Company Logo"
                className="h-16 mx-auto mb-2 shadow"
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-gray-600 mt-2">
              {isSignUp
                ? 'Sign up to get started with your account'
                : 'Sign in to access your account'}
            </p>
          </div>

          <form onSubmit={isSignUp ? handleSignUp : handleEmailLogin} className="space-y-5 relative z-10">
            {/* Email input */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-2"
                htmlFor="email"
              >
                Email Address
              </label>
              <div className="relative">
                <i className="fas fa-envelope absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  id="email"
                  type="email"
                  className={`w-full pl-10 pr-3 py-3 border ${
                    error.includes('mail') ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white bg-opacity-80 backdrop-blur-sm`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            {/* Username input - only shown during registration */}
            {isSignUp && (
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-2"
                  htmlFor="displayName"
                >
                  Username
                </label>
                <div className="relative">
                  <i className="fas fa-user absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    id="displayName"
                    type="text"
                    className={`w-full pl-10 pr-3 py-3 border ${
                      error.includes('username') ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white bg-opacity-80 backdrop-blur-sm`}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your username"
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            {/* Password input */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-2"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <i className="fas fa-lock absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  id="password"
                  type="password"
                  className={`w-full pl-10 pr-10 py-3 border ${
                    error.includes('assword') ? 'border-red-500' : 'border-gray-300'
                  } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white bg-opacity-80 backdrop-blur-sm`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {/* Success message (useful for resend in login) */}
            {successMessage && (
              <p className="text-sm text-green-500">{successMessage}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200 flex items-center justify-center font-medium cursor-pointer shadow-md"
            >
              {loading ? (
                <i className="fas fa-spinner fa-spin mr-2"></i>
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>

            {/* Toggle between login and registration */}
            <p className="text-center text-gray-600 py-2">
              {isSignUp ? 'Already have an account? ' : 'Need an account? '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                  setSuccessMessage('');
                  setEmail('');
                  setPassword('');
                  setDisplayName('');
                }}
                className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google login button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition duration-200 flex items-center justify-center cursor-pointer shadow-sm"
            >
              <i className="fab fa-google text-red-500 mr-2"></i>
              Sign in with Google
            </button>
          </form>
        </div>
      </div>
      
      {/* Add CSS for patterns */}
      <style jsx>{`
        .bg-grid-pattern {
          background-image: linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        
        .bg-pattern-dots {
          background-image: radial-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
};

export default LoginForm;