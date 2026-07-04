import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG, arrayUnion } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqkhhz0f9/image/upload";
const UPLOAD_PRESET = "crm_document_uploads";

function formatCamelCase(text) {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

function renderDynamicSurveyData(data) {
    const container = document.getElementById('dynamicSurveyData');
    if (!container) return;
    
    // Safety Net: If no data, just show the empty state
    if (!data) { container.innerHTML = '<div class="text-xs text-gray-500 italic">No project data found.</div>'; return; }

    const categoriesToRender = {
        'Technical Survey': data.technicalSurvey,
        'Design Specification': data.designSpecification,
        'Logistics & Access': data.logistics,
        'Compliance': data.compliance
    };

    let hasData = false;
    Object.entries(categoriesToRender).forEach(([title, categoryData]) => {
        if (!categoryData || typeof categoryData !== 'object') return;

        let html = `<div class="mb-5"><h4 class="text-[11px] font-bold text-[#0dcaf0] uppercase tracking-widest mb-3 pb-1 border-b border-[#30363d]">${title}</h4><div class="grid grid-cols-2 gap-3">`;
        let categoryHasData = false;

        Object.entries(categoryData).forEach(([key, value]) => {
            if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                categoryHasData = true; hasData = true;
                html += `<div class="bg-[#090d13] p-2.5 rounded-lg border border-[#30363d]"><label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">${formatCamelCase(key)}</label><div class="font-bold text-xs text-white break-words">${value}</div></div>`;
            }
        });

        html += `</div></div>`;
        if (categoryHasData) container.innerHTML += html;
    });

    if (!hasData) container.innerHTML = '<div class="text-xs text-gray-500 italic">Technical specifications are currently pending.</div>';
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

        document.getElementById('loginGate').classList.add('hidden');
        document.getElementById('vaultContent').classList.remove('hidden');

        onSnapshot(docRef, (docSnap) => {
            const data = docSnap.data();
            if(!data) return;

            const brandId = data.brand || "YorkshireWindows";
            const brandData = BRAND_CONFIG[brandId] || BRAND_CONFIG["YorkshireWindows"];
            
            document.documentElement.style.setProperty('--accent-primary', brandData.theme);
            document.getElementById('customerGreeting').innerText = `Welcome, ${data.customerProfile?.leadName || 'Customer'}`;
            
            // Safe Renders
            renderDynamicSurveyData(data);
            
            // Handle Quote Container Safely
            const qc = document.getElementById('quoteContainer');
            if(qc) {
                if(data.uDesignBridge?.quotePdfUrl) {
                    qc.innerHTML = `<div class="mt-6"><a href="${data.uDesignBridge.quotePdfUrl}" target="_blank" class="w-full flex items-center justify-between p-4 rounded-xl text-black font-bold hover:scale-[1.02] transition shadow-[0_0_15px_rgba(13,202,240,0.3)]" style="background-color: ${brandData.theme}"><span>📄 View Official Proposal</span><span>⬇️</span></a></div>`;
                } else {
                    qc.innerHTML = '';
                }
            }

            // Pamphlet Section
            const pamphletSec = document.getElementById('vaultPamphletSection');
            const pamphletGrid = document.getElementById('vaultPamphletGrid');
            if (pamphletSec && pamphletGrid && data.pamphlets) {
                pamphletGrid.innerHTML = '';
                let hasPamphlets = false;
                // [Insert your injectBrochure logic here as before]
                if (data.pamphlets.piling) { hasPamphlets = true; pamphletGrid.innerHTML += `<div class="text-[10px]">Piling & Foundations</div>`; }
                // ... (add back your other pamphlet logic here)
                if (hasPamphlets) pamphletSec.classList.remove('hidden');
            }
        });

        // Initialize Chat Engine
        initChatEngine(projectId, "#0dcaf0");

    } catch (err) {
        console.error("Vault Init Error:", err);
        alert("A technical error occurred while loading the vault.");
    }
};

// --- REAL-TIME CHAT ENGINE ---
function initChatEngine(id, themeColor) {
    const chatWindow = document.getElementById('chat-window');
    if(!chatWindow) return;
    
    onSnapshot(query(collection(db, `surveys/${id}/messages`), orderBy("timestamp", "asc")), (msgSnap) => {
        chatWindow.innerHTML = '<div class="text-center text-xs text-gray-500 my-4">Secure Connection Established</div>';
        msgSnap.forEach(m => {
            const d = m.data();
            const isMe = d.sender === 'Customer';
            chatWindow.innerHTML += `
                <div class="mb-3 ${isMe ? 'text-right' : 'text-left'}">
                    <span class="text-[10px] text-gray-400 uppercase tracking-widest">${isMe ? 'You' : d.sender}</span>
                    <div class="inline-block p-3 mt-1 rounded-xl text-sm ${isMe ? 'text-black rounded-tr-sm' : 'bg-[#161b22] border border-[#30363d] text-white rounded-tl-sm'} shadow-md" style="${isMe ? 'background-color: var(--accent-primary, #0dcaf0);' : ''}">
                        ${d.text}
                    </div>
                </div>
            `;
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}
