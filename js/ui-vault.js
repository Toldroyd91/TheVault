import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');

window.unlockVault = async () => {
    const pin = document.getElementById('vaultPinInput')?.value;
    if(!projectId) projectId = prompt("Please enter your Project ID:");
    
    const docRef = doc(db, "surveys", projectId.trim());
    const snap = await getDoc(docRef);
    
    if(!snap.exists() || String(snap.data().customerProfile?.vaultPIN) !== String(pin).trim()) {
        return alert("Invalid PIN or Project ID.");
    }

    // Ping telemetry for the Dashboard RAG system
    await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() });

    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('vaultContent').style.display = 'block';

    // --- 1. UI DATA & SHOWROOM BINDING ---
    onSnapshot(docRef, (docSnap) => {
        const data = docSnap.data();
        
        // Dynamic Brand Theme Mapping
        const brandId = data.brand || "YorkshireWindows";
        const brandData = BRAND_CONFIG[brandId] || BRAND_CONFIG["YorkshireWindows"];
        
        document.getElementById('customerGreeting').innerText = `Welcome, ${data.customerProfile?.leadName || 'Customer'}`;
        document.getElementById('vBuild').innerText = data.technicalSurvey?.buildCategory || 'TBC';
        document.getElementById('vRoof').innerText = data.technicalSurvey?.roofSystem || 'TBC';
        document.getElementById('vSize').innerText = data.technicalSurvey?.proposedSizeSQM || 'TBC';
        
        const qc = document.getElementById('quoteContainer');
        if(qc && data.uDesignBridge?.quotePdfUrl) {
            qc.innerHTML = `<a href="${data.uDesignBridge.quotePdfUrl}" download class="hover:opacity-80 transition text-white p-4 rounded block text-center font-bold shadow-lg" style="background-color: ${brandData.theme}">⬇️ Download Official Quote</a>`;
        }

        // Full Suite Curated Pamphlets (Dynamically Routed by Brand)
        const pamphletSec = document.getElementById('vaultPamphletSection');
        const pamphletGrid = document.getElementById('vaultPamphletGrid');

        if (pamphletSec && pamphletGrid && data.pamphlets) {
            pamphletGrid.innerHTML = '';
            let hasPamphlets = false;

            const injectBrochure = (title, imgFile) => {
                hasPamphlets = true;
                pamphletGrid.innerHTML += `
                    <div class="relative rounded-xl overflow-hidden border shadow-xl group cursor-pointer aspect-[3/4]" style="border-color: ${brandData.theme}">
                        <img src="${imgFile}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                        <div class="absolute bottom-0 w-full bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-12">
                            <h4 class="text-white font-bold text-sm leading-tight">${title}</h4>
                        </div>
                    </div>
                `;
            };

            // It prepends the correct folder path (e.g., assets/trentvalley/piling.jpg)
            if (data.pamphlets.piling) injectBrochure("Piling & Foundations", `${brandData.assetPath}piling.jpg`);
            if (data.pamphlets.sap) injectBrochure("SAP Calculations", `${brandData.assetPath}sap-calcs.jpg`);
            if (data.pamphlets.journey) injectBrochure("Your COHI Journey", `${brandData.assetPath}journey.jpg`);
            if (data.pamphlets.journey1) injectBrochure("The Journey Part 1", `${brandData.assetPath}journey-1.jpg`);
            if (data.pamphlets.journey2) injectBrochure("The Journey Part 2", `${brandData.assetPath}journey-2.jpg`);
            if (data.pamphlets.planning) injectBrochure("Planning Permission", `${brandData.assetPath}planning.jpg`);
            if (data.pamphlets.protecting) injectBrochure("Protecting Your Home", `${brandData.assetPath}protecting-home.jpg`);
            if (data.pamphlets.tailored) injectBrochure("Tailored Design", `${brandData.assetPath}tailored.jpg`);
            if (data.pamphlets.whoweare) injectBrochure("Who We Are", `${brandData.assetPath}who-we-are.jpg`);
            if (data.pamphlets.whychooseus) injectBrochure("Why Choose Us", `${brandData.assetPath}why-choose-us.jpg`);

            if (hasPamphlets) pamphletSec.classList.remove('hidden');
        }
    });

    // --- 2. SECURE CHAT ENGINE ---
    const chatRef = collection(db, `surveys/${projectId}/messages`);
    onSnapshot(query(chatRef, orderBy("timestamp", "asc")), (msgSnap) => {
        const win = document.getElementById('chat-window');
        if(!win) return;
        win.innerHTML = '<div class="text-center text-xs text-gray-500 my-4">Secure Connection Established</div>';
        
        msgSnap.forEach(m => {
            const d = m.data();
            const isMe = d.sender === 'Customer';
            win.innerHTML += `
                <div class="mb-3 ${isMe ? 'text-right' : 'text-left'}">
                    <span class="text-xs text-gray-400">${isMe ? 'You' : 'Designer'}</span>
                    <div class="inline-block p-3 rounded-xl text-sm ${isMe ? 'bg-[#0dcaf0] text-black rounded-tr-sm' : 'bg-slate-700 text-white rounded-tl-sm'} shadow-md">
                        ${d.text}
                    </div>
                </div>
            `;
        });
        win.scrollTop = win.scrollHeight;
    });

    document.getElementById('chat-input')?.addEventListener('keypress', async (e) => {
        if(e.key === 'Enter' && e.target.value.trim()) {
            const val = e.target.value.trim();
            e.target.value = '';
            await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() });
            await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() }); 
        }
    });
};
