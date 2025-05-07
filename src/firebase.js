import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  fetchSignInMethodsForEmail as firebaseFetchSignInMethodsForEmail,
  updateProfile,
  sendEmailVerification as firebaseSendEmailVerification
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA4UMD7SDH5_t7s_6cBtbyoYkiH0RR7Rqw",
  authDomain: "sample-a9153.firebaseapp.com",
  projectId: "sample-a9153",
  storageBucket: "sample-a9153.firebasestorage.app",
  messagingSenderId: "407474357230",
  appId: "1:407474357230:web:410d0460ddf4f74751c4ff"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore
const auth = getAuth(app);
const db = getFirestore(app);

// 初始化 Firebase Storage
const storage = getStorage(app);

// Google login
export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return {
      user: result.user,
      additionalUserInfo: {
        isNewUser: result._tokenResponse?.isNewUser || false
      }
    };
  } catch (error) {
    console.error('Google login failed:', error);
    throw error;
  }
};

// Email login
export const signInWithEmailAndPassword = async (email, password) => {
  try {
    const result = await firebaseSignInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error('Email login failed:', error);
    throw error;
  }
};

// Register new user
export const createUserWithEmailAndPassword = async (email, password, displayName) => {
  try {
    const userCredential = await firebaseCreateUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with display name
    await updateProfile(userCredential.user, {
      displayName: displayName
    });
    
    return userCredential;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
};

// Check if email is registered
export const fetchSignInMethodsForEmail = async (email) => {
  try {
    const methods = await firebaseFetchSignInMethodsForEmail(auth, email);
    return methods;
  } catch (error) {
    console.error('Email check failed:', error);
    throw error;
  }
};

// Save user data to Firestore
export const saveUserToFirestore = async (userId, email, displayName) => {
  try {
    const userRef = doc(db, "users", userId);
    const timestamp = serverTimestamp();
    
    await setDoc(userRef, {
      email: email,
      displayName: displayName,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return true;
  } catch (error) {
    console.error("Error saving user data to Firestore:", error);
    throw error;
  }
};

// Send email verification
export const sendEmailVerification = async (user) => {
  try {
    await firebaseSendEmailVerification(user);
    return true;
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
};

export { 
  auth, 
  db, 
  storage
};