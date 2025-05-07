import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, sendEmailVerification } from '../firebase';

const VerifyEmail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [linkStatus, setLinkStatus] = useState('pending'); // 'pending', 'expired', 'verified'
  
  const emailFromState = location.state?.email;
  const [currentUserEmail, setCurrentUserEmail] = useState(auth.currentUser?.email || '');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUserEmail(user.email);
        // Check verification status if user is available
        user.reload().then(() => {
          if (user.emailVerified) {
            setLinkStatus('verified');
            setSuccess('Your email has been successfully verified!');
          }
        }).catch(err => {
          console.error("Error reloading user for verification check:", err);
          // Potentially set an error if reload fails critically
        });
      } else {
        setCurrentUserEmail('');
      }
    });
    return unsubscribe;
  }, []);

  // Check for URL parameters on initial load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode'); // Firebase action code
    const verifiedParam = urlParams.get('verified'); // Our custom param from actionCodeSettings

    if (verifiedParam === 'true' && auth.currentUser) {
      // This means Firebase redirected back after we initiated sendEmailVerification with actionCodeSettings
      // And the user is logged in, which is expected.
      auth.currentUser.reload().then(() => {
        if (auth.currentUser.emailVerified) {
          setLinkStatus('verified');
          setSuccess('Your email has been successfully verified!');
        } else {
          // This case is unusual if verifiedParam=true, means something went wrong post-redirect
           setLinkStatus('expired'); // Or some other appropriate status
           setError('Verification may not have completed. Please try logging in or resend verification.');
        }
      });
    } else if (mode === 'verifyEmail' && oobCode && !auth.currentUser) {
      // User clicked link from email, not logged in, Firebase will handle code
      // We expect Firebase to sign them in or show its own page.
      // If they land here and are NOT logged in, it's likely an expired/used link if Firebase didn't handle it.
      setLinkStatus('expired');
      setError('Your verification link has expired, already been used, or you might need to sign in first.');
    } else if (mode === 'verifyEmail' && oobCode && auth.currentUser && !auth.currentUser.emailVerified) {
      // User clicked link, is logged in, but not yet verified by our standards
      // This could happen if our custom 'verified=true' param was lost.
      // Firebase's oobCode itself should trigger verification. Let's rely on the auth.currentUser.reload()
      // in the onAuthStateChanged listener, or trigger it if still not verified.
      auth.currentUser.reload().then(() => {
        if (auth.currentUser.emailVerified) {
          setLinkStatus('verified');
          setSuccess('Your email has been successfully verified!');
        } else {
          setLinkStatus('expired');
          setError('Verification link is invalid or has expired. Please try resending.');
        }
      });
    }
    // Clear the OOB code from URL to prevent re-processing if user refreshes
    if (oobCode && window.history.replaceState) {
        const cleanURL = window.location.pathname;
        window.history.replaceState({}, document.title, cleanURL);
    }
  }, [location.search]); // Rerun if query params change

  // Auto-navigation on successful verification
  useEffect(() => {
    if (linkStatus === 'verified') {
      const timer = setTimeout(() => {
        navigate('/dashboard');
      }, 2500); // 2.5-second delay
      return () => clearTimeout(timer);
    }
  }, [linkStatus, navigate]);

  const handleResendVerification = async () => {
    if (!auth.currentUser) {
      setError('You must be logged in to resend a verification email. Please log in and try again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    setLinkStatus('pending'); 
    try {
      await sendEmailVerification(auth.currentUser);
      setSuccess('A new verification email has been sent! Please check your inbox (and spam folder).');
    } catch (error) {
      console.error('Error resending verification email:', error);
      setError(error.message || 'Failed to send verification email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  const handleBackToLogin = () => {
    // If user is somehow still logged in and verified, this could go to dashboard
    // But the intent of "Back to Login" is to go to the login form.
    // If they are logged in, App.js routes might redirect them from '/' to '/dashboard' anyway.
    navigate('/'); 
  };
  
  const displayEmail = emailFromState || currentUserEmail || 'your email address';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl max-w-md w-full text-center">
        
        {linkStatus === 'verified' && (
          <>
            <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Email Verified!</h2>
            <p className="text-gray-600 mb-6">{success || 'Your email address has been successfully verified.'}</p>
            <button
              onClick={handleGoToDashboard}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition mb-3"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {linkStatus === 'pending' && (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Verify Your Email</h2>
            <p className="text-gray-600 mb-1">
              A verification email has been sent to:
            </p>
            <p className="font-medium text-blue-600 mb-4 break-all">{displayEmail}</p>
            <p className="text-gray-600 text-sm mb-6">
              Please check your inbox (and spam folder) and click the link to activate your account.
            </p>
          </>
        )}

        {linkStatus === 'expired' && (
          <>
            <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Verification Link Issue</h2>
            <p className="text-gray-600 text-sm mb-6">
              {error || 'Your verification link may have expired or already been used. Please request a new one if needed.'}
            </p>
          </>
        )}

        {error && linkStatus !== 'expired' && (
          <div className="bg-red-50 text-red-700 p-3 rounded text-sm mb-4">
            {error}
          </div>
        )}
        
        {success && linkStatus !== 'verified' && (
          <div className="bg-green-50 text-green-700 p-3 rounded text-sm mb-4">
            {success}
          </div>
        )}
        
        {(linkStatus === 'pending' || linkStatus === 'expired') && (
          <button
            onClick={handleResendVerification}
            disabled={loading || !auth.currentUser}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 mb-3"
          >
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>
        )}
        
        <button
          onClick={handleBackToLogin}
          className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
};

export default VerifyEmail; 