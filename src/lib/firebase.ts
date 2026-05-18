/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  setPersistence, 
  browserLocalPersistence,
  getRedirectResult
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use experimentalForceLongPolling on server to avoid gRPC stream issues in Node.js
export const db = typeof window === 'undefined' 
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Explicitly set persistence to Local to be more robust across sessions.
// We catch errors to avoid crashing if storage is blocked entirely.
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.error("Firebase persistence error:", err);
  });
}

export const googleProvider = new GoogleAuthProvider();

// Validation connection as per critical constraint
async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

// Consume any pending redirect result to avoid "missing initial state" errors
if (typeof window !== 'undefined') {
  getRedirectResult(auth).catch(err => {
    // If it's the specific nonce/state error, we log it but don't crash
    if (err.message?.includes('missing initial state') || err.code === 'auth/missing-or-invalid-nonce') {
      console.warn("Caught stray redirect state error:", err.message);
      // Clean URL if needed
      if (window.location.search.includes('apiKey') || window.location.hash.includes('apiKey')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } else {
      console.error("Redirect result error:", err);
    }
  });
}

export const signInWithGoogle = async () => {
  try {
    // Clear any leftover state in URL if it persists from a failed redirect
    if (typeof window !== 'undefined' && window.location.search.includes('apiKey')) {
       window.history.replaceState(null, '', window.location.pathname);
    }
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Sign in error:", error);
    // If we specifically see the 'missing initial state' error, it's often a storage issue
    if (error.code === 'auth/missing-or-invalid-nonce' || error.message?.includes('missing initial state')) {
      alert("There was a problem with your browser's session storage. Please ensure cookies are enabled and you are not in a private window that blocks third-party storage.");
    }
    throw error;
  }
};
