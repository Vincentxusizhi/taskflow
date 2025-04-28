import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, reload } from 'firebase/auth';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resentMessage, setResentMessage] = useState('');

  // Extract email passed from registration if available
  const email = location.state?.email;

  useEffect(() => {
    // Listen for auth state changes to get the user
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        // Optional: If already verified when landing here, redirect immediately
        if (user.emailVerified) {
          navigate('/dashboard'); // Or your main app route
        }
      } else {
        // No user logged in, redirect to login
        navigate('/login'); 
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [auth, navigate]);

  const handleCheckVerification = async () => {
    setError('');
    setResentMessage('');
    if (!currentUser) {
      setError('Not logged in.');
      return;
    }

    setLoading(true);
    try {
      // Reload user data from Firebase servers
      await reload(currentUser);
      
      // Re-check the verification status on the *current* auth object
      // as the currentUser state might not update immediately after reload
      if (auth.currentUser?.emailVerified) {
        console.log('Email verified successfully!');
        navigate('/dashboard'); // Or your main app route
      } else {
        setError('Email not verified yet. Please check your email and click the link first.');
      }
    } catch (err) {
      console.error('Error checking verification:', err);
      setError('An error occurred while checking verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Optional: Add a function to resend verification email
  const handleResendVerification = async () => {
      setError('');
      setResentMessage('');
      if (!currentUser) {
          setError('Not logged in.');
          return;
      }
      setLoading(true);
      try {
          await sendEmailVerification(currentUser);
          setResentMessage('Verification email sent again.');
      } catch (err) {
          console.error('Error resending verification email:', err);
          setError('Failed to resend verification email. Please try again later.');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Verify Your Email</h1>
        <p className="text-gray-600 mb-6">
          A verification link has been sent to 
          {email ? <strong className="mx-1">{email}</strong> : 'your email address'}.
          Please check your inbox (and spam folder) and click the link to activate your account.
        </p>
        
        {error && (
          <p className="text-sm text-red-500 mb-4 p-2 bg-red-100 rounded">{error}</p>
        )}
        {resentMessage && (
          <p className="text-sm text-green-500 mb-4 p-2 bg-green-100 rounded">{resentMessage}</p>
        )}
        
        <button
          onClick={handleCheckVerification}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200 font-medium mb-3 disabled:opacity-50"
        >
          {loading ? (
            <i className="fas fa-spinner fa-spin mr-2"></i>
          ) : (
            'Check Verification Status / Continue'
          )}
        </button>

        {/* Optional Resend Button */}
        <button 
          onClick={handleResendVerification}
          disabled={loading}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          Didn't receive the email? Resend
        </button>

        <button
            onClick={() => navigate('/login')}
            className="mt-4 text-sm text-gray-500 hover:underline"
        >
            Back to Login
        </button>
      </div>
    </div>
  );
};

export default VerifyEmail; 