import { auth, db, doc, setDoc, getDoc, collection, serverTimestamp, functions, httpsCallable, onAuthStateChanged, BRAND_CONFIG } from './core-firebase.js';
import { SurveyState, validateState } from './core-state.js';
import { SniperEngine } from './engine-sniper.js';

let sniper;

// --- 1. DYNAMIC BRAND UI INITIALIZATION ---
const brandSelect = document.getElementById('brandSelect');
if (brandSelect) {
    brandSelect.innerHTML = '';
    Object.entries(BRAND_CONFIG).forEach(([key, data]) => {
        brandSelect.innerHTML += `<option value="${key}">${data.name}</option>`;
    });
}

// Initialize System
onAuthStateChanged(auth, async (user) => {
    if(!user) return; 
    
    sniper = new SniperEngine('sniperCanvas');
    
    if(SurveyState.id) {
        const snap = await getDoc(doc(db, "surveys", SurveyState.id));
        if(snap.exists()) {
            Object.assign(SurveyState, snap.data());
            bindStateToUI();
        }
    } else {
        bindStateToUI(); 
    }
});

// --- 2. UI TO STATE BINDING (Two-way mapping) ---
function bindStateToUI() {
    if (document.getElementById('brandSelect')) document.getElementById('brandSelect').value = SurveyState.brand;
    if (document.getElementById('clientName')) document.getElementById('clientName').value = SurveyState.customerProfile.leadName;
    if (document.getElementById('postCode')) document.getElementById('postCode').value = SurveyState.customerProfile.postcode;
    if (document.getElementById('roofSystem')) document.getElementById('roofSystem').value = SurveyState.technicalSurvey.roofSystem;
    if (document.getElementById('designerNotes')) document.getElementById('designerNotes').value = SurveyState.technicalSurvey.designerNotes;
    
    Object.keys(SurveyState.pamphlets).forEach(key => {
        const cb = document.getElementById(`check-${key}`);
        if(cb) cb.checked = SurveyState.pamphlets[key];
    });

    if(SurveyState.rawAssets.frontElevationImage) {
        sniper.setBackground(SurveyState.rawAssets.frontElevationImage);
    }
}

function updateStateFromUI() {
    SurveyState.brand = document.getElementById('brandSelect')?.value || SurveyState.brand;
    SurveyState.customerProfile.leadName = document.getElementById('clientName')?.value || "";
    SurveyState.customerProfile.postcode = document.getElementById('postCode')?.value || "";
    SurveyState.technicalSurvey.roofSystem = document.getElementById('roofSystem')?.value || "";
    SurveyState.technicalSurvey.designerNotes = document.getElementById('designerNotes')?.value || "";
    
    Object.keys(SurveyState.pamphlets).forEach(key => {
        const cb = document.getElementById(`check-${key}`);
        if(cb) SurveyState.pamphlets[key] = cb.checked;
    });
}

// --- 3. CORE ENGINES ---
document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync');
    btn.innerText = "Syncing to Cloud..."; btn.disabled = true;

    try {
        updateStateFromUI();
        SurveyState.rawAssets.frontElevationImage = sniper.exportCompressedBase64();
        
        const cleanState = validateState();
        cleanState.timestamps = { updatedAt: serverTimestamp() };
        if(!cleanState.id) cleanState.timestamps.createdAt = serverTimestamp();

        const docRef = cleanState.id ? doc(db, "surveys", cleanState.id) : doc(collection(db, "surveys"));
        await setDoc(docRef, cleanState, { merge: true });
        
        SurveyState.id = docRef.id;
        alert("Deployed to Command Center");
    } catch(e) {
        console.error(e); alert("Sync Failed");
    } finally {
        btn.innerText = "Save & Sync"; btn.disabled = false;
    }
});

document.getElementById('btn-ai-polish')?.addEventListener('click', async () => {
    const rawText = document.getElementById('designerNotes').value.trim();
    if (!rawText) return;
    
    const btn = document.getElementById('btn-ai-polish');
    btn.innerText = "Polishing..."; btn.disabled = true;

    try {
        const rewriteNotes = httpsCallable(functions, 'rewriteNotes');
        const result = await rewriteNotes({ rawText: rawText });
        if (result.data?.polishedText) {
            document.getElementById('designerNotes').value = result.data.polishedText;
            updateStateFromUI();
        }
    } catch (e) {
        alert("AI Engine Error");
    } finally {
        btn.innerText = "✨ AI Polish"; btn.disabled = false;
    }
});

document.getElementById('btn-generate-pdf')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-pdf');
    btn.innerText = "Server Compiling PDF..."; btn.disabled = true;

    try {
        document.getElementById('btn-sync').click(); 
        
        const compilePDF = httpsCallable(functions, 'compilePDF');
         const result = await compilePDF({ 
    surveyId: SurveyState.id, 
    pin: SurveyState.customerProfile.vaultPIN  // <--- THIS IS THE NEW PIECE
});
       
        if (result.data?.pdfUrl) {
            alert("PDF Compiled & Vault Updated Successfully!");
        }
    } catch (e) {
        console.error(e); alert("PDF Generation Failed");
    } finally {
        btn.innerText = "Generate PDF Pack"; btn.disabled = false;
    }
});
