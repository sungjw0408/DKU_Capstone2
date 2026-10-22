// src/services/firebase.js
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDNMRRuLGytPqffIJ5U9K2CtBOtU8RpWJk",
    authDomain: "actiondoc-agent.firebaseapp.com",
    projectId: "actiondoc-agent",
    storageBucket: "actiondoc-agent.firebasestorage.app",
    messagingSenderId: "835397104507",
    appId: "1:835397104507:web:b3cdf582868fccfbb603de",
    measurementId: "G-SZPHZ7FLE4"
  };

// Firebase 초기화
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 다른 파일(화면)에서 쓸 수 있도록 db 내보내기
export const db = getFirestore(app);
