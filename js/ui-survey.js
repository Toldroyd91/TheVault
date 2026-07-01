import { auth, db, doc, setDoc, getDoc, collection, serverTimestamp, onAuthStateChanged, BRAND_CONFIG } from './core-firebase.js';

console.log("🟢 ui-survey.js loaded (Standalone Appointment Mode)");

// --- 1. BUILT-IN SURVEY STATE ---
// We define the state here so it doesn't crash looking for core-state.js
const SurveyState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    brand: "YorkshireWindows",
    customerProfile: {},
    technicalSurvey: {},
    pamphlets: {},
    rawAssets: {}
};

// --- 2. INITIALIZE SYSTEM ---
const brandSelect = document.getElementById('brandSelect');
if (brandSelect && BRAND_CONFIG) {
    brandSelect.innerHTML = Object.entries(BRAND_CONFIG)
        .map(([key, data]) => `<option value="${key}">${data.name}</option>`).join('');
}

onAuthStateChanged(auth, async (user) => {
    if(!user) {
        console.warn("🔴 No user logged in - database saves will be rejected.");
        return; 
    }
    console.log("🟢 User Authenticated:", user.email);
    
    // If we opened an existing survey, load its data
    if(SurveyState.id) {
        console.log("Fetching existing survey:", SurveyState.id);
        const snap = await getDoc(doc(db, "surveys", SurveyState.id));
        if(snap.exists()) {
            Object.assign(SurveyState, snap.data());
            bindStateToUI();
        }
    }
});

// --- 3. UI DATA BINDING ---
const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value || "";

function bindStateToUI() {
    if (el('brandSelect')) el('brandSelect').value = SurveyState.brand || "YorkshireWindows";
    if (el('clientName')) el('clientName').value = SurveyState.customerProfile?.leadName || "";
    if (el('postCode')) el('postCode').value = SurveyState.customerProfile?.postcode || "";
    if (el('roofType')) el('roofType').value = SurveyState.technicalSurvey?.roofSystem || "";
    if (el('designerNotes')) el('designerNotes').value = SurveyState.technicalSurvey?.designerNotes || "";
}

function updateStateFromUI() {
    console.log("Gathering data from form...");
    SurveyState.brand = val('brandSelect') || "YorkshireWindows";
    
    SurveyState.customerProfile = {
        leadName: val('clientName'),
        postcode: val('postCode'),
        customerNum: val('clientNum')
    };
    
    SurveyState.technicalSurvey = {
        buildType: val('buildType'),
        proposedSize: val('proposedSize'),
        roofSystem: val('roofType'),
        designerNotes: val('designerNotes'),
        drainage: val('drainage')
    };
}

// --- 4. BUTTON WIRING (Failsafe Mode) ---

// SAVE & SYNC BUTTON
el('btn-sync')?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log("▶️ Sync Button Clicked");
    const btn = e.target;
    btn.innerText = "Syncing..."; btn.disabled = true;

    try {
        updateStateFromUI();
        
        // Attach the user ID to prevent database leakage
        SurveyState.userId = auth.currentUser.uid; 
        SurveyState.timestamps = { updatedAt: serverTimestamp() };
        if(!SurveyState.id) SurveyState.timestamps.createdAt = serverTimestamp();

        console.log("Attempting to save to Firebase...", SurveyState);
        
        // Save to Database
        const docRef = SurveyState.id ? doc(db, "surveys", SurveyState.id) : doc(collection(db, "surveys"));
        await setDoc(docRef, SurveyState, { merge: true });
        
        SurveyState.id = docRef.
