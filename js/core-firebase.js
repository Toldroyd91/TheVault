import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
        name: "Orion Windows", // Update this name
        assetPath: "assets/orion/", // Create this folder
        theme: "#10b981" 
    },
    "ClearView": { 
        name: "Clearview", // Update this name
        assetPath: "assets/clearview/", // Create this folder
        theme: "#8b5cf6" 
    },
    "Planet": { 
        name: "Planet", // Update this name
        assetPath: "assets/planet/", // Create this folder
        theme: "#ec4899" 
    }
};

// Export all modules for the rest of the application to use securely
export { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    httpsCallable 
};
