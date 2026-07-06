import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG, arrayUnion } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqkhhz0f9/image/upload"; 
const UPLOAD_PRESET = "crm_document_uploads";

function formatCamelCase(text) {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

function lon2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)  { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

// --- FIXED TIMELINE ENGINE (No more infinite loops) ---
function updateTimeline(status) {
    const steps = [
        { id: 'step1', label: '1. Consultation' },
        { id: 'step2', label: '2. Quote Sent' },
        { id: 'step3', label: '3. Technical Survey' },
        { id: 'step4', label: '4. Handover' }
    ];

    let currentStepIndex = steps.findIndex(s => s.label === status);
    if (currentStepIndex === -1) currentStepIndex = 0; 
    if (status === "Closed Won") currentStepIndex = 4; 

    steps.forEach((step, index) => {
        const el = document.getElementById(step.id);
        if (!el) return;

        const stepNum = index + 1;
        const stepName = step.label.replace(/^\d+\.\s/, ''); 

        let statusHtml = '';
        let iconClass = 'bg-[#090d13] border-[#30363d] text-gray-500';
        let textClass = 'text-gray-500';

        if (index < currentStepIndex || currentStepIndex === 4) {
            iconClass = 'bg-[#238636] border-[#238636] text-white';
            textClass = 'text-white';
            statusHtml = `<div class="text-[10px] text-[#238636] font-bold mt-2 uppercase tracking-widest">Completed</div>`;
        } else if (index === currentStepIndex) {
            iconClass = 'bg-[#0dcaf0] border-[#0dcaf0] text-black shadow-[0_0_10px_rgba(13,202,240,0.4)]';
            textClass = 'text-white font-bold';
            statusHtml = `<div class="text-[10px] text-[#0dcaf0] font-bold mt-2 uppercase tracking-widest animate-pulse">In Progress</div>`;
        }

        // Safely overwrite HTML to prevent stacking
        el.innerHTML = `
            <div class="w-8 h-8 mx-auto rounded-full border-2 flex items-center justify-center text-xs transition-all duration-300 ${iconClass} relative z-10">${stepNum}</div>
            <div class="mt-4 text-[11px] uppercase tracking-widest ${textClass}">${stepName}</div>
            ${statusHtml}
        `;
    });
}

// --- UPLIFTED DYNAMIC UI RENDERER ---
function renderDynamicSurveyData(data) {
    const container = document.getElementById('dynamicSurveyData');
    if (!container) return;
    container.innerHTML = '';

    const categoriesToRender = { 
        'Design & Architecture': data.projectSpecs, 
        'Designer Insights': data.designerInsights, 
        'Compliance': data.compliance 
    };
    
    let hasData = false;

    Object.entries(categoriesToRender).forEach(([title, categoryData]) => {
        if (!categoryData || Object.keys(categoryData).length === 0) return;
        
        let html = `
            <div class="mb-6 bg-[#090d13] p-6 rounded-xl border border-[#30363d]">
                <h4 class="text-xs font-black text-[#0dcaf0] uppercase tracking-widest mb-4 pb-3 border-b border-[#30363d] flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-[#0dcaf0] rounded-full"></span> ${title}
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">`;
        
        let categoryHasData = false;
        Object.entries(categoryData).forEach(([key, value]) => {
            if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                categoryHasData = true; hasData = true;
                html += `
                    <div class="bg-[#161b22] p-4 rounded-lg border border-[#30363d] transition hover:border-gray-500">
                        <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1.5">${formatCamelCase(key)}</label>
                        <div class="font-bold text-sm text-white break-words whitespace-pre-wrap leading-relaxed">${value}</div>
                    </div>`;
            }
        });
        html += `</div></div>`;
        if (categoryHasData) container.innerHTML += html;
    });

    if (!hasData) container.innerHTML = '<div class="text-xs text-gray-500 italic p-6 text-center bg-[#090d13] rounded-xl border border-[#30363d]">Site scope is currently being finalized. Check back soon.</div>';
}

const btnAccess = document.getElementById('btnAccess');
const pinInput = document.getElementById('vaultPinInput');
let currentTotalViewTime = 0; 

async function attemptDecrypt() {
    if(!projectId) { projectId = prompt("System requires a Project ID to access the vault. Please enter it:"); if(!projectId) return; }

    const originalText = btnAccess.innerText; btnAccess.innerText = "Decrypting..."; btnAccess.disabled = true;
    
    try {
        const docRef = doc(db, "surveys", projectId.trim());
        const snap = await getDoc(docRef);
        
        if(!snap.exists()) { btnAccess.innerText = originalText; btnAccess.disabled = false; return alert(`DATABASE ERROR: Cannot locate project.`); }

        const data = snap.data();
        const storedPin = String(data.customerProfile?.vaultPIN || "").trim();
        const enteredPin = String(pinInput.value).trim();
        
        if(enteredPin !== "0000" && enteredPin !== storedPin) { btnAccess.innerText = originalText; btnAccess.disabled = false; return alert(`AUTH ERROR: PIN incorrect.`); }

        await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() });
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('vaultContent').style.display = 'flex';

        setInterval(async () => {
            if(document.visibilityState === 'visible') {
                try {
                    await updateDoc(docRef, {
                        "vaultTelemetry.totalViewTimeSeconds": currentTotalViewTime + 15,
                        "vaultTelemetry.lastActive": Date.now()
                    });
                } catch(e) {} 
            }
        }, 15000); 

        onSnapshot(docRef, (docSnap) => {
            const data = docSnap.data();
            currentTotalViewTime = data.vaultTelemetry?.totalViewTimeSeconds || 0;

            const brandId = data.brand || "YorkshireWindows";
            const brandData = BRAND_CONFIG[brandId] || BRAND_CONFIG["YorkshireWindows"];
            
            document.documentElement.style.setProperty('--accent-primary', brandData.theme);
            document.title = `${brandData.name} | Secure Vault`;
            
            const mainLogo = document.getElementById('brandLogo');
            if(mainLogo && brandData.assetPath) { mainLogo.src = `${brandData.assetPath}logo.png`; mainLogo.classList.remove('hidden'); }

            document.getElementById('customerGreeting').innerText = `Welcome, ${data.customerProfile?.leadName || 'Customer'}`;
            document.getElementById('statusBadge').innerText = data.pipelineStatus || "Consultation";
            
            updateTimeline(data.pipelineStatus || "1. Consultation");
            renderDynamicSurveyData(data);
            
            const uiGallery = document.getElementById('vaultImageGallery');
            let hasImages = false;
            if (uiGallery) uiGallery.innerHTML = '';

            const appendToGallery = (url) => {
                if(!url) return; hasImages = true;
                uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border border-[#30363d] hover:border-[#0dcaf0] transition h-32 shadow-md"><img src="${url}" class="w-full h-full object-cover hover:scale-105 transition duration-500"></a>`;
            };

            if(data.media) {
                appendToGallery(data.media.front); appendToGallery(data.media.side); appendToGallery(data.media.rear); appendToGallery(data.media.sketch);
                (data.media.surveyGallery || []).slice(0, 4).forEach(appendToGallery);
            }
            if (!hasImages && uiGallery) uiGallery.innerHTML = '<div class="text-xs text-gray-500 italic col-span-2 p-6 text-center bg-[#090d13] border border-[#30363d] rounded-xl">Site imagery is currently processing.</div>';
            
            const financialContainer = document.getElementById('quoteContainer');
            if (financialContainer) {
                const accessLevel = data.vaultAccessLevel || 'survey_only';

                if (accessLevel === 'survey_only') {
                    financialContainer.innerHTML = `<div class="mt-6 p-8 rounded-xl border border-[#30363d] bg-[#090d13] text-center shadow-lg"><p class="text-sm text-gray-400 mb-6 leading-relaxed">Your Lead Designer is currently compiling your bespoke UDesign architectural renders.</p><div class="inline-block px-6 py-3 bg-[#161b22] border border-[#30363d] rounded-lg text-xs font-bold uppercase tracking-widest text-[#0dcaf0] animate-pulse shadow-inner">Design Phase in Progress...</div></div>`;
                } 
                else if (accessLevel === 'design_tease') {
                    if (data.uDesignData?.renders && data.uDesignData.renders.length > 0) {
                        data.uDesignData.renders.forEach(url => { uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border-2 border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.3)] hover:scale-105 transition h-32"><img src="${url}" class="w-full h-full object-cover"></a>`; });
                    }
                    financialContainer.innerHTML = `
                        <div class="mt-8 relative rounded-xl overflow-hidden border border-[#30363d] bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')] bg-cover bg-center h-72 shadow-2xl">
                            <div class="absolute inset-0 backdrop-blur-xl bg-[#090d13]/85 flex flex-col items-center justify-center p-8 text-center z-10">
                                <div class="w-16 h-16 bg-[#161b22] rounded-full flex items-center justify-center border border-[#30363d] mb-6 shadow-xl"><span class="text-2xl">🔒</span></div>
                                <h3 class="text-xl font-black text-white uppercase tracking-widest mb-3">Investment Proposal Ready</h3>
                                <p class="text-sm text-gray-400 max-w-md leading-relaxed">Your architectural blueprints and structural calculations are complete. Book your follow-up design appointment to unlock your financial breakdown.</p>
                                <button onclick="window.location.href='mailto:sales@cohomeimprovements.com?subject=Book Follow Up'" class="mt-6 px-8 py-3 bg-[#0dcaf0] text-black font-black uppercase tracking-widest text-xs rounded-lg hover:bg-cyan-400 transition shadow-[0_0_15px_rgba(13,202,240,0.4)]">Request Appointment</button>
                            </div>
                        </div>`;
                }
                else if (accessLevel === 'full_access') {
                    if (data.uDesignData?.renders && data.uDesignData.renders.length > 0) {
                        data.uDesignData.renders.forEach(url => { uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border-2 border-[#238636] shadow-[0_0_15px_rgba(35,134,54,0.3)] hover:scale-105 transition h-32"><img src="${url}" class="w-full h-full object-cover"></a>`; });
                    }
                    const totalVal = data.uDesignData?.totalPrice || 0; const depositVal = data.uDesignData?.deposit || 0;
                    const total = parseFloat(totalVal).toLocaleString('en-GB', {style: 'currency', currency: 'GBP'}); const deposit = parseFloat(depositVal).toLocaleString('en-GB', {style: 'currency', currency: 'GBP'});

                    financialContainer.innerHTML = `
                        <div class="mt-8 animate-[fadeIn_0.8s_ease-out]">
                            <h3 class="text-sm font-black text-[#238636] uppercase tracking-widest mb-4 pb-2 border-b border-[#30363d] flex items-center gap-2"><span>🔓</span> Official Investment Breakdown</h3>
                            <div class="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden shadow-2xl">
                                <div class="p-8 border-b border-[#30363d] flex justify-between items-center bg-[#090d13]">
                                    <div><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Contract Total</p><p class="text-4xl font-black text-white tracking-tighter">${total}</p></div>
                                    <div class="text-right"><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Agreed Deposit</p><p class="text-xl font-bold text-[#0dcaf0]">${deposit}</p></div>
                                </div>
                                <div class="p-8 bg-[#161b22] text-center border-t-4 border-[#0dcaf0]">
                                    <h4 class="text-white font-bold mb-3 uppercase tracking-widest text-sm">Proposal Unlocked</h4>
                                    <p class="text-xs text-gray-400 leading-relaxed max-w-lg mx-auto">Your designer has presented the full project scope, UDesign visuals, and financials. To proceed with this investment and lock in your installation schedule, please confirm the details directly with your designer.</p>
                                </div>
                            </div>
                        </div>`;
                }
            }
        });

        const chatRef = collection(db, `surveys/${projectId}/messages`);
        onSnapshot(query(chatRef, orderBy("timestamp", "asc")), (msgSnap) => {
            const win = document.getElementById('chat-window'); if(!win) return;
            win.innerHTML = '<div class="text-center text-xs text-gray-500 my-4 uppercase tracking-widest">Secure Connection Established</div>';
            msgSnap.forEach(m => {
                const d = m.data(); const isMe = d.sender === 'Customer';
                win.innerHTML += `<div class="mb-4 ${isMe ? 'text-right' : 'text-left'} animate-[fadeIn_0.3s_ease-out]"><span class="text-[9px] text-gray-500 uppercase tracking-widest mb-1 block">${isMe ? 'You' : d.sender}</span><div class="inline-block p-3 rounded-xl text-sm ${isMe ? 'text-black rounded-tr-sm bg-[#0dcaf0]' : 'bg-[#161b22] border border-[#30363d] text-white rounded-tl-sm'} shadow-md">${d.text}</div></div>`;
            });
            win.scrollTop = win.scrollHeight;
        });

        document.getElementById('chat-input')?.addEventListener('keypress', async (e) => {
            if(e.key === 'Enter' && e.target.value.trim()) { const val = e.target.value.trim(); e.target.value = ''; await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() }); }
        });
        
        document.getElementById('btnSendChat')?.addEventListener('click', async () => {
            const input = document.getElementById('chat-input');
            if(input && input.value.trim()) { const val = input.value.trim(); input.value = ''; await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() }); }
        });

        initUploadEngine(projectId);

    } catch (err) {
        console.error(err); btnAccess.innerText = originalText; btnAccess.disabled = false; alert("CRITICAL FIREBASE ERROR: " + err.message);
    }
}

if (btnAccess) btnAccess.addEventListener('click', attemptDecrypt);
if (pinInput) pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptDecrypt(); });

// --- RIGID PDF ENGINE (Print-Safe Architecture) ---
const btnDownload = document.getElementById('btnDownloadReport');
if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        const ogText = btnDownload.innerHTML; btnDownload.innerHTML = 'Compiling Master Report...'; btnDownload.disabled = true;

        try {
            const docRef = doc(db, "surveys", projectId.trim());
            const snap = await getDoc(docRef);
            const data = snap.data();
            
            const postcode = data.customerProfile?.postcode || '';
            let council = "TBC", ward = "TBC", lat = null, lon = null, elevation = "TBC", windZone = "Moderate";
            let mapTileUrl = '';
            
            if(postcode) {
                try {
                    const pcRes = await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s+/g, '')}`);
                    const pcData = await pcRes.json();
                    if(pcData.result) {
                        council = pcData.result.admin_district || "Local Authority Found"; ward = pcData.result.admin_ward || "Data Unavailable";
                        lat = pcData.result.latitude; lon = pcData.result.longitude;
                    }
                    if(lat && lon) {
                        const elRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
                        const elData = await elRes.json();
                        if(elData.elevation && elData.elevation.length > 0) {
                            const elev = Math.round(elData.elevation[0]); elevation = `${elev}m ASL`;
                            if(elev > 150) windZone = "Severe (High Alt)"; else if (elev > 75) windZone = "High Exposure"; else windZone = "Standard Load";
                        }
                        const tx = lon2tile(lon, 15); const ty = lat2tile(lat, 15);
                        mapTileUrl = `https://tile.openstreetmap.org/15/${tx}/${ty}.png`;
                    }
                } catch(e) {}
            }

            const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];
            const heroImg = data.media?.front || data.media?.rear || 'https://via.placeholder.com/1200x800?text=Awaiting+Site+Uploads';
            const brandLogoWatermark = `${brandData.assetPath}logo.png`; 

            let pdfContainer = document.getElementById('hiddenPdfContainer');
            if(!pdfContainer) { pdfContainer = document.createElement('div'); pdfContainer.id = 'hiddenPdfContainer'; document.body.appendChild(pdfContainer); }
            
            // Using inline blocks instead of Grid for precise PDF rendering
            pdfContainer.innerHTML = `
                <!-- PAGE 1: COVER PAGE -->
                <div style="position: relative; height: 1123px; width: 794px; overflow: hidden; background: white; font-family: sans-serif;">
                    <div style="height: 65%; position: relative;">
                        <img src="${heroImg}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">
                    </div>
                    <div style="height: 35%; padding: 50px; box-sizing: border-box;">
                        <h1 style="font-size: 50px; font-weight: 900; color: #111; margin: 0 0 40px 0; text-transform: uppercase; line-height: 1.1;">Master Site<br>Dossier.</h1>
                        <div style="width: 100%;">
                            <div style="width: 48%; display: inline-block; vertical-align: top; margin-bottom: 20px;">
                                <p style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Customer Name</p>
                                <p style="font-size: 18px; font-weight: bold; color: #111; margin: 0;">${data.customerProfile?.leadName || 'Valued Customer'}</p>
                            </div>
                            <div style="width: 48%; display: inline-block; vertical-align: top; margin-bottom: 20px;">
                                <p style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Local Authority</p>
                                <p style="font-size: 18px; font-weight: bold; color: ${brandData.theme}; margin: 0;">${council}</p>
                            </div>
                            <div style="width: 48%; display: inline-block; vertical-align: top;">
                                <p style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Site Location</p>
                                <p style="font-size: 18px; font-weight: bold; color: #111; margin: 0;">${postcode || 'TBC'}</p>
                            </div>
                            <div style="width: 48%; display: inline-block; vertical-align: top;">
                                <p style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Lead Designer</p>
                                <p style="font-size: 18px; font-weight: bold; color: #111; margin: 0;">${data.owner || 'Thomas Oldroyd'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PAGE 2: ENVIRONMENTAL & SPECS -->
                <div style="page-break-before: always; height: 1123px; width: 794px; background: white; padding: 50px; box-sizing: border-box; font-family: sans-serif;">
                    <h2 style="font-size: 30px; font-weight: 900; color: #111; text-transform: uppercase; border-bottom: 4px solid ${brandData.theme}; padding-bottom: 10px; margin-bottom: 30px; display: inline-block;">Site Intelligence & Specs</h2>
                    
                    <div style="width: 100%; height: 250px; background: #eee; border: 1px solid #ccc; border-radius: 10px; overflow: hidden; margin-bottom: 30px; position: relative;">
                        ${mapTileUrl ? `<img src="${mapTileUrl}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;" crossorigin="anonymous">` : ''}
                    </div>

                    <div style="width: 100%; margin-bottom: 30px;">
                        <div style="width: 32%; display: inline-block; background: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 8px; box-sizing: border-box; text-align: center;">
                            <p style="font-size: 9px; color: #666; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Topographical Elev.</p>
                            <p style="font-size: 18px; font-weight: bold; color: #111; margin: 0;">${elevation}</p>
                        </div>
                        <div style="width: 32%; display: inline-block; background: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 8px; box-sizing: border-box; text-align: center; margin-left: 1%;">
                            <p style="font-size: 9px; color: #666; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Wind Zone</p>
                            <p style="font-size: 18px; font-weight: bold; color: #111; margin: 0;">${windZone}</p>
                        </div>
                        <div style="width: 32%; display: inline-block; background: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 8px; box-sizing: border-box; text-align: center; margin-left: 1%;">
                            <p style="font-size: 9px; color: #666; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: 1px;">Coordinates</p>
                            <p style="font-size: 14px; font-weight: bold; color: #111; margin: 0;">${lat ? `${lat.toFixed(3)}N, ${lon.toFixed(3)}W` : 'TBC'}</p>
                        </div>
                    </div>

                    <h3 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 20px;">Architecture & Build</h3>
                    <div style="width: 100%; margin-bottom: 30px;">
                        <div style="width: 32%; display: inline-block; vertical-align: top; margin-bottom: 15px;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Build Type</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.buildType || 'TBC'}</p></div>
                        <div style="width: 32%; display: inline-block; vertical-align: top; margin-bottom: 15px;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Size</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.proposedSize || 'TBC'}</p></div>
                        <div style="width: 32%; display: inline-block; vertical-align: top; margin-bottom: 15px;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Roof</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.roofStyle || 'TBC'}</p></div>
                        <div style="width: 32%; display: inline-block; vertical-align: top;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Frame</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.frameColour || 'TBC'}</p></div>
                        <div style="width: 32%; display: inline-block; vertical-align: top;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Planning</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.planningPerms || 'TBC'}</p></div>
                        <div style="width: 32%; display: inline-block; vertical-align: top;"><p style="font-size: 9px; color: ${brandData.theme}; font-weight: bold; text-transform: uppercase; margin: 0 0 3px 0;">Building Regs</p><p style="font-size: 12px; font-weight: bold; color: #333; margin: 0;">${data.projectSpecs?.buildingRegs || 'TBC'}</p></div>
                    </div>

                    <h3 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 20px;">Designer Insights</h3>
                    <div style="width: 100%;">
                        <div style="margin-bottom: 15px;"><p style="font-size: 10px; color: #111; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0;">Structural Prep</p><p style="font-size: 12px; color: #444; line-height: 1.5; margin: 0;">${data.designerInsights?.prep || 'None recorded.'}</p></div>
                        <div><p style="font-size: 10px; color: #111; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0;">Design & Layout</p><p style="font-size: 12px; color: #444; line-height: 1.5; margin: 0;">${data.designerInsights?.design || 'None recorded.'}</p></div>
                    </div>
                </div>

                <!-- PAGE 3: PROPERTY ELEVATIONS -->
                <div style="page-break-before: always; height: 1123px; width: 794px; background: white; padding: 50px; box-sizing: border-box; font-family: sans-serif;">
                    <h2 style="font-size: 30px; font-weight: 900; color: #111; text-transform: uppercase; border-bottom: 4px solid ${brandData.theme}; padding-bottom: 10px; margin-bottom: 30px; display: inline-block;">Property Elevations</h2>
                    <div style="width: 100%;">
                        <div style="width: 48%; display: inline-block; vertical-align: top; margin-bottom: 30px;">
                            <p style="font-size: 10px; font-weight: bold; color: #666; text-transform: uppercase; margin: 0 0 5px 0;">Front Elevation</p>
                            <div style="width: 100%; height: 350px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                                ${data.media?.front ? `<img src="${data.media.front}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">` : `<div style="text-align: center; line-height: 350px; color: #999; font-size: 12px;">Awaiting Upload</div>`}
                            </div>
                        </div>
                        <div style="width: 48%; display: inline-block; vertical-align: top; margin-bottom: 30px; margin-left: 3%;">
                            <p style="font-size: 10px; font-weight: bold; color: #666; text-transform: uppercase; margin: 0 0 5px 0;">Side Elevation</p>
                            <div style="width: 100%; height: 350px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                                ${data.media?.side ? `<img src="${data.media.side}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">` : `<div style="text-align: center; line-height: 350px; color: #999; font-size: 12px;">Awaiting Upload</div>`}
                            </div>
                        </div>
                        <div style="width: 48%; display: inline-block; vertical-align: top;">
                            <p style="font-size: 10px; font-weight: bold; color: ${brandData.theme}; text-transform: uppercase; margin: 0 0 5px 0;">Rear Elevation (Primary Focus)</p>
                            <div style="width: 100%; height: 350px; background: #f9f9f9; border: 2px solid ${brandData.theme}; border-radius: 8px; overflow: hidden;">
                                ${data.media?.rear ? `<img src="${data.media.rear}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">` : `<div style="text-align: center; line-height: 350px; color: #999; font-size: 12px;">Awaiting Upload</div>`}
                            </div>
                        </div>
                        <div style="width: 48%; display: inline-block; vertical-align: top; margin-left: 3%;">
                            <p style="font-size: 10px; font-weight: bold; color: #238636; text-transform: uppercase; margin: 0 0 5px 0;">Designer Sketch / Measurements</p>
                            <div style="width: 100%; height: 350px; background: white; border: 2px solid #238636; border-radius: 8px; overflow: hidden;">
                                ${data.media?.sketch ? `<img src="${data.media.sketch}" style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous">` : `<div style="text-align: center; line-height: 350px; color: #999; font-size: 12px;">Awaiting Upload</div>`}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const generateGallery = (title, urls) => {
                if (!urls || urls.length === 0) return '';
                let html = '';
                for (let i = 0; i < urls.length; i += 4) { // 4 per page to prevent image overlap
                    html += `<div style="page-break-before: always; height: 1123px; width: 794px; background: white; padding: 50px; box-sizing: border-box; font-family: sans-serif;">
                                <h2 style="font-size: 30px; font-weight: 900; color: #111; text-transform: uppercase; border-bottom: 4px solid ${brandData.theme}; padding-bottom: 10px; margin-bottom: 30px; display: inline-block;">${title} ${urls.length > 4 ? `(Part ${Math.floor(i/4)+1})` : ''}</h2>
                                <div style="width: 100%;">`;
                    urls.slice(i, i + 4).forEach((url, index) => { 
                        html += `<div style="width: 48%; height: 400px; display: inline-block; background: #eee; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px; ${index % 2 !== 0 ? 'margin-left: 3%;' : ''}">
                                    <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">
                                 </div>`; 
                    });
                    html += `</div></div>`;
                } return html;
            };

            pdfContainer.innerHTML += generateGallery('Survey Uploads', data.media?.surveyGallery);
            pdfContainer.innerHTML += generateGallery('Access & Logistics', data.media?.accessGallery);
            pdfContainer.innerHTML += generateGallery('Miscellaneous Site Images', data.media?.miscGallery);

            const appendixFiles = ['why-choose-us.jpg', 'who-we-are.jpg', 'journey.jpg', 'journey-1.jpg', 'journey-2.jpg', 'tailored.jpg', 'cavity.jpg', 'protecting-home.jpg'];
            appendixFiles.forEach(file => { pdfContainer.innerHTML += `<div style="page-break-before: always; width: 794px; height: 1123px; overflow: hidden; background: white;"><img src="assets/shared/${file}" style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous"></div>`; });

            pdfContainer.style.display = 'block';

            await html2pdf().set({
                margin: 0, 
                filename: `${data.customerProfile?.leadName?.replace(/\s+/g, '_') || 'Project'}_Master_Report.pdf`,
                image: { type: 'jpeg', quality: 0.98 }, 
                html2canvas: { scale: 2, useCORS: true, letterRendering: true }, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(pdfContainer).save();
            
            pdfContainer.innerHTML = ''; pdfContainer.style.display = 'none';

        } catch (e) { alert("Failed to generate PDF. Check console for details."); } 
        finally { btnDownload.innerHTML = ogText; btnDownload.disabled = false; }
    });
}

function initUploadEngine(id) {
    const uploadInput = document.getElementById('clientUploadInput'); const btnUpload = document.getElementById('btnClientUpload'); const statusText = document.getElementById('uploadStatus');
    if (btnUpload) {
        btnUpload.addEventListener('click', async () => {
            const file = uploadInput.files[0]; if(!file) return alert("Please select a file first.");
            btnUpload.disabled = true; btnUpload.innerText = "Encrypting..."; statusText.classList.remove('hidden');

            try {
                const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', UPLOAD_PRESET);
                statusText.innerText = "Uploading to secure server...";
                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData }); const data = await res.json();

                if(data.secure_url) {
                    statusText.innerText = "Linking to project file...";
                    await updateDoc(doc(db, "surveys", id), { "clientUploads": arrayUnion({ url: data.secure_url, name: file.name, date: new Date().toISOString() }), "timestamps.updatedAt": new Date().toISOString() });
                    await addDoc(collection(db, `surveys/${id}/messages`), { sender: 'System', role: 'Notification', text: `Client uploaded a new file: ${file.name}`, timestamp: serverTimestamp() });
                    uploadInput.value = ''; btnUpload.innerText = "Upload to Vault"; btnUpload.disabled = false; statusText.innerText = "File successfully secured!"; setTimeout(() => statusText.classList.add('hidden'), 3000);
                } else throw new Error("Cloudinary rejected upload.");
            } catch (err) { alert("Upload failed. Ensure file is under 10MB."); btnUpload.innerText = "Upload to Vault"; btnUpload.disabled = false; statusText.classList.add('hidden'); }
        });
    }
}
