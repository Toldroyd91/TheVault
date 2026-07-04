import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG, arrayUnion } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqkhhz0f9/image/upload"; // Verify your cloud name here
const UPLOAD_PRESET = "crm_document_uploads";

// Helper Function: Convert camelCase to Beautiful Text (e.g. "roofSystemType" -> "Roof System Type")
function formatCamelCase(text) {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

// THE DYNAMIC RENDER ENGINE
function renderDynamicSurveyData(data) {
    const container = document.getElementById('dynamicSurveyData');
    if (!container) return;
    container.innerHTML = '';

    // The categories from your SurveyState we want the client to see
    const categoriesToRender = {
        'Technical Survey': data.technicalSurvey,
        'Design Specification': data.designSpecification,
        'Logistics & Access': data.logistics,
        'Compliance': data.compliance
    };

    let hasData = false;

    Object.entries(categoriesToRender).forEach(([title, categoryData]) => {
        if (!categoryData || Object.keys(categoryData).length === 0) return;

        // Create a header for the category
        let html = `
            <div class="mb-5">
                <h4 class="text-[11px] font-bold text-[#0dcaf0] uppercase tracking-widest mb-3 pb-1 border-b border-[#30363d]">${title}</h4>
                <div class="grid grid-cols-2 gap-3">
        `;

        let categoryHasData = false;

        // Loop through every single data point in this category
        Object.entries(categoryData).forEach(([key, value]) => {
            // Ignore empty strings, nulls, or generic defaults like "Select"
            if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                categoryHasData = true;
                hasData = true;
                html += `
                    <div class="bg-[#090d13] p-2.5 rounded-lg border border-[#30363d]">
                        <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">${formatCamelCase(key)}</label>
                        <div class="font-bold text-xs text-white break-words">${value}</div>
                    </div>
                `;
            }
        });

        html += `</div></div>`;
        if (categoryHasData) container.innerHTML += html;
    });

    if (!hasData) {
        container.innerHTML = '<div class="text-xs text-gray-500 italic">No technical specifications have been finalized for this project yet.</div>';
    }
}

window.unlockVault = async () => {
    const pin = document.getElementById('vaultPinInput')?.value;
    const btnAccess = document.getElementById('btnAccess');
    
    if(!projectId) projectId = prompt("Please enter your Project ID:");
    if(!projectId) return;

    btnAccess.innerText = "Decrypting...";
    
    try {
        const docRef = doc(db, "surveys", projectId.trim());
        const snap = await getDoc(docRef);
        
        if(!snap.exists() || String(snap.data().customerProfile?.vaultPIN) !== String(pin).trim()) {
            btnAccess.innerText = "DECRYPT VAULT";
            return alert("Invalid PIN or Project ID.");
        }

        // Ping telemetry for the Dashboard RAG system
        await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() });

        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('vaultContent').style.display = 'block';

        // --- 1. UI DATA BINDING & DYNAMIC RENDERING ---
        onSnapshot(docRef, (docSnap) => {
            const data = docSnap.data();
            
            // Dynamic Brand Theme Mapping
            const brandId = data.brand || "YorkshireWindows";
            const brandData = BRAND_CONFIG[brandId] || BRAND_CONFIG["YorkshireWindows"];
            
            document.documentElement.style.setProperty('--accent-primary', brandData.theme);
            document.title = `${brandData.name} | Project Vault`;
            
            const mainLogo = document.getElementById('brandLogo');
            if(mainLogo && brandData.assetPath) { 
                mainLogo.src = `${brandData.assetPath}logo.png`; 
                mainLogo.classList.remove('hidden'); 
            }

            document.getElementById('customerGreeting').innerText = `Welcome, ${data.customerProfile?.leadName || 'Customer'}`;
            
            // Fire the dynamic engine!
            renderDynamicSurveyData(data);
            
            // Quote Binding
            const qc = document.getElementById('quoteContainer');
            if(qc && data.uDesignBridge?.quotePdfUrl) {
                qc.innerHTML = `
                    <div class="mt-6 animate-[fadeIn_0.5s_ease-out]">
                        <a href="${data.uDesignBridge.quotePdfUrl}" target="_blank" download class="w-full flex items-center justify-between p-4 rounded-xl text-black font-bold hover:scale-[1.02] transition shadow-[0_0_15px_rgba(13,202,240,0.3)]" style="background-color: ${brandData.theme}">
                            <span>📄 View Official Proposal</span>
                            <span>⬇️</span>
                        </a>
                    </div>
                `;
            }

            // Full Suite Curated Pamphlets
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
                    <div class="mb-3 ${isMe ? 'text-right' : 'text-left'} animate-[fadeIn_0.3s_ease-out]">
                        <span class="text-[10px] text-gray-400 uppercase tracking-widest">${isMe ? 'You' : d.sender}</span>
                        <div class="inline-block p-3 mt-1 rounded-xl text-sm ${isMe ? 'text-black rounded-tr-sm' : 'bg-[#161b22] border border-[#30363d] text-white rounded-tl-sm'} shadow-md" style="${isMe ? 'background-color: var(--accent-primary, #0dcaf0);' : ''}">
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
                await updateDoc(doc(db, "surveys", projectId), { "vaultTelemetry.lastActive": Date.now() }); 
            }
        });
        
        document.getElementById('btnSendChat')?.addEventListener('click', async () => {
            const input = document.getElementById('chat-input');
            if(input && input.value.trim()) {
                const val = input.value.trim();
                input.value = '';
                await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() });
                await updateDoc(doc(db, "surveys", projectId), { "vaultTelemetry.lastActive": Date.now() });
            }
        });

        // --- 3. CLIENT UPLOAD ENGINE ---
        initUploadEngine(projectId);

    } catch (err) {
        console.error(err);
        btnAccess.innerText = "DECRYPT VAULT";
        alert("An error occurred loading the vault.");
    }
};

function initUploadEngine(id) {
    const uploadInput = document.getElementById('clientUploadInput');
    const btnUpload = document.getElementById('btnClientUpload');
    const statusText = document.getElementById('uploadStatus');

    btnUpload?.addEventListener('click', async () => {
        const file = uploadInput.files[0];
        if(!file) return alert("Please select a file first.");

        btnUpload.disabled = true;
        btnUpload.innerText = "Encrypting...";
        statusText.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);
            
            statusText.innerText = "Uploading to secure server...";
            const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const data = await res.json();

            if(data.secure_url) {
                statusText.innerText = "Linking to project file...";
                await updateDoc(doc(db, "surveys", id), {
                    "clientUploads": arrayUnion({
                        url: data.secure_url,
                        name: file.name,
                        date: new Date().toISOString()
                    })
                });
                
                await addDoc(collection(db, `surveys/${id}/messages`), {
                    sender: 'System', role: 'Notification',
                    text: `Client uploaded a new file: ${file.name}`,
                    timestamp: serverTimestamp()
                });

                uploadInput.value = '';
                btnUpload.innerText = "Upload to Vault";
                btnUpload.disabled = false;
                statusText.innerText = "File successfully secured!";
                setTimeout(() => statusText.classList.add('hidden'), 3000);
            } else {
                throw new Error("Cloudinary rejected upload.");
            }
        } catch (err) {
            console.error("Upload Error:", err);
            alert("Upload failed. Please ensure the file is an image or valid PDF under 10MB.");
            btnUpload.innerText = "Upload to Vault";
            btnUpload.disabled = false;
            statusText.classList.add('hidden');
        }
    });
}
