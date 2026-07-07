// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD6tEe_NdbNIuvUD9hh5eTjtw1pGdAfVFs",
  authDomain: "learnup-3cdb7.firebaseapp.com",
  projectId: "learnup-3cdb7",
  storageBucket: "learnup-3cdb7.firebasestorage.app",
  messagingSenderId: "596521797129",
  appId: "1:596521797129:web:802005a59ecf309f3e9ad8",
  measurementId: "G-ZXFTN6MP5E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Emülatöre SADECE açıkça istendiğinde bağlan (.env'de VITE_USE_EMULATOR=true olmalı).
// Yoksa DEV modunda bile production Firestore kullanılır — böylece gerçek veriler gelir.
// connectFirestoreEmulator has been completely disabled to always connect directly to Cloud Firestore.
/*
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USE_EMULATOR === 'true') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8088);
    console.info('Connected to Firestore emulator at 127.0.0.1:8088');
  } catch (e) {
    console.warn('Could not connect to Firestore emulator:', e);
  }
}
*/
