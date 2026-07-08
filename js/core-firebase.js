import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// ADDED getDocs TO THIS IMPORT LIST
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const appConfig = {
    apiKey: "AIzaSyD-QrqKxjes9f1TgyJOffiQzSMRncf84L0",
    authDomain: "cohi-survey-engine.firebaseapp.com",
    projectId: "cohi-survey-engine",
    storageBucket: "cohi-survey-engine.appspot.com"
};

export const app = !getApps().length ? initializeApp(appConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// --- THE COHI GROUP MULTI-TENANT IDENTITY ENGINE ---
// Ensure you have exactly one folder in your /assets directory for each assetPath listed below.

export const BRAND_CONFIG = {
    "COHI": { 
        name: "CO Home Improvements", 
        assetPath: "assets/cohi/", 
        theme: "#ffffff" // Parent company theme
    },
    "YorkshireWindows": { 
        name: "Yorkshire Windows", 
        assetPath: "assets/yorkshirewindows/", 
        theme: "#0dcaf0" 
    },
    "TrentValley": { 
        name: "Trent Valley Windows", 
        assetPath: "assets/trentvalley/", 
        theme: "#e11d48" 
    },
    "WestYorkshire": { 
        name: "West Yorkshire Windows", 
        assetPath: "assets/westyorkshire/", 
        theme: "#f59e0b" 
    },
    "Orion": { 
        name: "Orion Windows", 
        assetPath: "assets/orion/", 
        theme: "#10b981" 
    },
    "ClearView": { 
        name: "Clearview", 
        assetPath: "assets/clearview/", 
        theme: "#8b5cf6" 
    },
    "Planet": { 
        name: "Planet", 
        assetPath: "assets/planet/", 
        theme: "#ec4899" 
    }
};

// Export all modules for the rest of the application to use securely
// ADDED getDocs TO THIS EXPORT LIST
export { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs,
    updateDoc, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    arrayUnion,
    httpsCallable 
};
