import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCHXQR-bxsJzUPV3rv5qsJxtsx4OZfqHBk',
  authDomain: 'party-6e846.firebaseapp.com',
  databaseURL: 'https://party-6e846-default-rtdb.firebaseio.com',
  projectId: 'party-6e846',
  storageBucket: 'party-6e846.firebasestorage.app',
  messagingSenderId: '73498570577',
  appId: '1:73498570577:web:e38adb014978a4d13b2d70',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseDb = getDatabase(app);
const auth = getAuth(app);
let authPromise: Promise<User> | null = null;

export function ensureFirebaseUser(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authPromise) return authPromise;
  authPromise = new Promise<User>((resolve, reject) => {
    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !settled) { settled = true; unsubscribe(); resolve(user); }
    }, (error) => { if (!settled) { settled = true; unsubscribe(); reject(error); } });
    void signInAnonymously(auth).catch((error) => {
      if (!settled) { settled = true; unsubscribe(); reject(error); }
    });
  }).finally(() => { authPromise = null; });
  return authPromise;
}