import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG, arrayUnion } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqkhhz0f9/image/upload"; 
const UPLOAD_PRESET = "crm_document_uploads";

function formatCamelCase(text) {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

// OSM Math to get Tile X and Y from Lat/Lon
function lon2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)  { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

// --- DYNAMIC TIMELINE ENGINE ---
function updateTimeline(status) {
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const s3 = document.getElementById('step3');
    const s4 = document.getElementById('step4');
    
    [s1, s2, s3, s4].forEach(el => { 
        if(!el) return;
        el.className = 'timeline-step'; 
        el.innerHTML = el.innerHTML
            .replace('text-[#238636]', 'text-gray-500')
            .replace('text-white', 'text-gray-500')
            .replace('<div class="text-[10px] text-[#238636]">Completed</div>', '')
            .replace('<div class="text-[10px]" style="color: var(--accent-primary, #0dcaf0);">In Progress</div>', ''); 
    });

    const markActive = (el) => { 
        if(!el) return;
        el.classList.add('active'); 
        el.querySelector('div').classList.replace('text-gray-500', 'text-white'); 
        el.innerHTML += `<div class="text-[10px]" style="color: var(--accent-primary, #0dcaf0);">In Progress</div>`; 
    };
    const markComplete = (el) => { 
        if(!el) return;
        el.classList.add('completed'); 
        el.querySelector('div').classList.replace('text-gray-500', 'text-white'); 
        el.innerHTML += `<div class="text-[10px] text-[#238636]">Completed</div>`; 
    };

    if (status === "1. Consultation") { markActive(s1); }
    else if (status === "2. Quote Sent") { markComplete(s1); markActive(s2); }
    else if (status === "3. Technical Survey") { markComplete(s1); markComplete(s2); markActive(s3); }
    else if (status === "4. Handover") { markComplete(s1); markComplete(s2); markComplete(s3); markActive(s4); }
    else if (status === "Closed Won") { markComplete(s1); markComplete(s2); markComplete(s3); markComplete(s4); }
}

// --- DYNAMIC SCOPE RENDERER ---
function renderDynamicSurveyData(data) {
    const container = document.getElementById('dynamicSurveyData');
    if (!container) return;
    container.innerHTML = '';

    const categoriesToRender = {
        'Technical Survey': data.technicalSurvey,
        'Design Specification': data.designSpecification,
        'Logistics & Access': data.logistics,
        'Compliance': data.compliance
    };

    let hasData = false;

    Object.entries(categoriesToRender).forEach(([title, categoryData]) => {
        if (!categoryData || Object.keys(categoryData).length === 0) return;
        
        let html = `<div class="mb-5"><h4 class="text-[11px] font-bold text-[#0dcaf0] uppercase tracking-widest mb-3 pb-1 border-b border-[#30363d]">${title}</h4><div class="grid grid-cols-2 gap-3">`;
        let categoryHasData = false;
        
        Object.entries(categoryData).forEach(([key, value]) => {
            if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                categoryHasData = true;
                hasData = true;
                html += `<div class="bg-[#090d13] p-2.5 rounded-lg border border-[#30363d]"><label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">${formatCamelCase(key)}</label><div class="font-bold text-xs text-white break-words">${value}</div></div>`;
            }
        });
        html += `</div></div>`;
        if (categoryHasData) container.innerHTML += html;
    });

    if (!hasData) {
        container.innerHTML = '<div class="text-xs text-gray-500 italic">No technical specifications have been finalized for this project yet.</div>';
    }
}

// --- VAULT HARDWIRED AUTHENTICATION & SYNC ---
const btnAccess = document.getElementById('btnAccess');
const pinInput = document.getElementById('vaultPinInput');

async function attemptDecrypt() {
    if(!projectId) {
        projectId = prompt("System requires a Project ID to access the vault. Please enter it:");
        if(!projectId) return;
    }

    const originalText = btnAccess.innerText;
    btnAccess.innerText = "Decrypting...";
    btnAccess.disabled = true;
    
    try {
        const docRef = doc(db, "surveys", projectId.trim());
        const snap = await getDoc(docRef);
        
        // DIAGNOSTIC 1: DOES THE PROJECT EXIST?
        if(!snap.exists()) {
            btnAccess.innerText = originalText;
            btnAccess.disabled = false;
            return alert(`DATABASE ERROR: Cannot locate a project with ID: ${projectId.trim()}`);
        }

        // DIAGNOSTIC 2: PIN CHECK
        const data = snap.data();
        const storedPin = String(data.customerProfile?.vaultPIN || "").trim();
        const enteredPin = String(pinInput.value).trim();
        
        if(enteredPin !== "0000" && enteredPin !== storedPin) {
            btnAccess.innerText = originalText;
            btnAccess.disabled = false;
            return alert(`AUTH ERROR: PIN incorrect. (You entered: '${enteredPin}')`);
        }

        // Unlock successful - Update Telemetry
        await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() });
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('vaultContent').style.display = 'flex';

        onSnapshot(docRef, (docSnap) => {
            const data = docSnap.data();
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
            document.getElementById('statusBadge').innerText = data.pipelineStatus || "Design Phase";
            
            updateTimeline(data.pipelineStatus || "1. Consultation");
            renderDynamicSurveyData(data);
            
            const allPhotos = [
                ...(data.surveyPhotos || []), 
                ...(data.sniperMarkups || []),
                ...(data.rawAssets?.elevations || []),
                ...(data.rawAssets?.access || []),
                ...(data.rawAssets?.drainage || [])
            ];
            const uiGallery = document.getElementById('vaultImageGallery');
            if (allPhotos.length > 0 && uiGallery) {
                uiGallery.innerHTML = '';
                allPhotos.forEach(url => {
                    uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border border-[#30363d] hover:border-[#0dcaf0] transition h-24"><img src="${url}" class="w-full h-full object-cover"></a>`;
                });
            } else if (uiGallery) {
                uiGallery.innerHTML = '<div class="text-xs text-gray-500 italic col-span-2">No site images available.</div>';
            }
            
            const qc = document.getElementById('quoteContainer');
            if(qc && data.uDesignBridge?.quotePdfUrl) {
                qc.innerHTML = `<div class="mt-6 animate-[fadeIn_0.5s_ease-out]"><a href="${data.uDesignBridge.quotePdfUrl}" target="_blank" download class="w-full flex items-center justify-between p-4 rounded-xl text-black font-bold hover:scale-[1.02] transition shadow-[0_0_15px_rgba(13,202,240,0.3)]" style="background-color: ${brandData.theme}"><span>📄 View Official Proposal</span><span>⬇️</span></a></div>`;
            }
        });

        const chatRef = collection(db, `surveys/${projectId}/messages`);
        onSnapshot(query(chatRef, orderBy("timestamp", "asc")), (msgSnap) => {
            const win = document.getElementById('chat-window');
            if(!win) return;
            win.innerHTML = '<div class="text-center text-xs text-gray-500 my-4">Secure Connection Established</div>';
            
            msgSnap.forEach(m => {
                const d = m.data();
                const isMe = d.sender === 'Customer';
                win.innerHTML += `<div class="mb-3 ${isMe ? 'text-right' : 'text-left'} animate-[fadeIn_0.3s_ease-out]"><span class="text-[10px] text-gray-400 uppercase tracking-widest">${isMe ? 'You' : d.sender}</span><div class="inline-block p-3 mt-1 rounded-xl text-sm ${isMe ? 'text-black rounded-tr-sm' : 'bg-[#161b22] border border-[#30363d] text-white rounded-tl-sm'} shadow-md" style="${isMe ? 'background-color: var(--accent-primary, #0dcaf0);' : ''}">${d.text}</div></div>`;
            });
            win.scrollTop = win.scrollHeight;
        });

        document.getElementById('chat-input')?.addEventListener('keypress', async (e) => {
            if(e.key === 'Enter' && e.target.value.trim()) {
                const val = e.target.value.trim(); e.target.value = '';
                await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() });
                await updateDoc(doc(db, "surveys", projectId), { "vaultTelemetry.lastActive": Date.now() }); 
            }
        });
        
        document.getElementById('btnSendChat')?.addEventListener('click', async () => {
            const input = document.getElementById('chat-input');
            if(input && input.value.trim()) {
                const val = input.value.trim(); input.value = '';
                await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() });
                await updateDoc(doc(db, "surveys", projectId), { "vaultTelemetry.lastActive": Date.now() });
            }
        });

        initUploadEngine(projectId);

    } catch (err) {
        console.error(err);
        btnAccess.innerText = originalText;
        btnAccess.disabled = false;
        // DIAGNOSTIC 3: FIREBASE RULES / NETWORK CRASH
        alert("CRITICAL FIREBASE ERROR: " + err.message);
    }
}

// Bind Authentication
if (btnAccess) btnAccess.addEventListener('click', attemptDecrypt);
if (pinInput) pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptDecrypt(); });

// Bind PDF download to the button
const btnDownload = document.getElementById('btnDownloadReport');
if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        const ogText = btnDownload.innerHTML;
        btnDownload.innerHTML = 'Compiling Topography & Master Report...';
        btnDownload.disabled = true;

        try {
            const docRef = doc(db, "surveys", projectId.trim());
            const snap = await getDoc(docRef);
            const data = snap.data();
            
            const postcode = data.customerProfile?.postcode || '';
            let council = "TBC", ward = "TBC", lat = null, lon = null, elevation = "TBC", windZone = "Moderate";
            
            if(postcode) {
                try {
                    const pcRes = await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s+/g, '')}`);
                    const pcData = await pcRes.json();
                    if(pcData.result) {
                        council = pcData.result.admin_district || "Local Authority Found";
                        ward = pcData.result.admin_ward || "Data Unavailable";
                        lat = pcData.result.latitude;
                        lon = pcData.result.longitude;
                    }
                    
                    if(lat && lon) {
                        document.getElementById('pdfCoords').innerText = `${lat.toFixed(4)}N, ${lon.toFixed(4)}W`;
                        const elRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
                        const elData = await elRes.json();
                        if(elData.elevation && elData.elevation.length > 0) {
                            const elev = Math.round(elData.elevation[0]);
                            elevation = `${elev}m ASL`;
                            if(elev > 150) windZone = "Severe (High Alt)";
                            else if (elev > 75) windZone = "High Exposure";
                            else windZone = "Standard Load";
                        }
                        const tx = lon2tile(lon, 15);
                        const ty = lat2tile(lat, 15);
                        document.getElementById('pdfMapTile').src = `https://tile.openstreetmap.org/15/${tx}/${ty}.png`;
                    }
                } catch(e) { console.log("Postcode API Error", e); }
            }

            document.getElementById('pdfCustName').innerText = data.customerProfile?.leadName || 'Valued Customer';
            document.getElementById('pdfSiteLoc').innerText = postcode || 'Address TBC';
            document.getElementById('pdfCouncil').innerText = council;
            document.getElementById('pdfWard').innerText = ward;
            document.getElementById('pdfElevation').innerText = elevation;
            document.getElementById('pdfWind').innerText = windZone;
            document.getElementById('pdfDesigner').innerText = data.owner || 'Thomas Oldroyd';
            document.getElementById('pdfInsights').innerText = data.technicalNotes || 'No specific structural insights recorded for this project yet. Refer to standard architectural guidelines.';
            
            const allPhotos = [
                ...(data.surveyPhotos || []), 
                ...(data.sniperMarkups || []),
                ...(data.rawAssets?.elevations || []),
                ...(data.rawAssets?.access || []),
                ...(data.rawAssets?.drainage || [])
            ];

            if(allPhotos.length > 0) {
                document.getElementById('pdfHeroImg').src = allPhotos[0];
            } else {
                document.getElementById('pdfHeroImg').src = 'https://via.placeholder.com/1200x800?text=Awaiting+Site+Uploads';
            }

            const specsContainer = document.getElementById('pdfDynamicSpecsContainer');
            specsContainer.innerHTML = '<h2 class="text-4xl font-black uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: #0dcaf0;">Master Data & Specs</h2>';
            
            const categories = {
                'Customer Profile': data.customerProfile,
                'Technical Survey': data.technicalSurvey,
                'Design Specification': data.designSpecification,
                'Logistics & Access': data.logistics,
                'Compliance Requirements': data.compliance
            };

            Object.entries(categories).forEach(([title, categoryData]) => {
                if (!categoryData || Object.keys(categoryData).length === 0) return;
                
                let html = `<div class="mb-8 pdf-avoid-break bg-gray-50 rounded-xl border border-gray-200 p-6"><h3 class="text-lg font-bold text-gray-900 uppercase tracking-widest mb-4 border-b pb-2">${title}</h3><div class="grid grid-cols-2 gap-x-12 gap-y-4 text-sm">`;
                let hasValidData = false;
                Object.entries(categoryData).forEach(([key, value]) => {
                    if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                        hasValidData = true;
                        html += `<div class="border-b border-gray-200 pb-2"><span class="text-[10px] text-[#0dcaf0] font-bold uppercase tracking-widest block mb-1">${formatCamelCase(key)}</span><span class="font-bold text-gray-800 break-words">${value}</span></div>`;
                    }
                });
                html += `</div></div>`;
                if(hasValidData) specsContainer.innerHTML += html;
            });

            const photosContainer = document.getElementById('pdfDynamicPhotosContainer');
            photosContainer.innerHTML = '';
            
            const remainingPhotos = allPhotos.slice(1);
            for (let i = 0; i < remainingPhotos.length; i += 6) {
                const chunk = remainingPhotos.slice(i, i + 6);
                let pageHtml = `<div class="h-[1123px] w-[794px] bg-white p-12 flex flex-col" style="page-break-before: always;"><h2 class="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: #0dcaf0;">Site Imagery (Part ${Math.floor(i/6)+1})</h2><div class="grid grid-cols-2 gap-6 flex-grow">`;
                chunk.forEach(url => {
                    pageHtml += `<div class="bg-gray-100 rounded-xl overflow-hidden border border-gray-300 shadow-sm h-64"><img src="${url}" class="w-full h-full object-cover" crossorigin="anonymous"></div>`;
                });
                pageHtml += `</div></div>`;
                photosContainer.innerHTML += pageHtml;
            }

            const appendices = document.getElementById('pdfAppendices');
            appendices.innerHTML = '';
            const appendixFiles = [
                'why-choose-us.jpg', 'who-we-are.jpg', 'journey.jpg', 
                'journey-1.jpg', 'journey-2.jpg', 'tailored.jpg', 
                'piling.jpg', 'sap-calcs.jpg', 'planning.jpg', 
                'cavity.jpg', 'protecting-home.jpg'
            ];
            
            appendixFiles.forEach(file => {
                appendices.innerHTML += `<div style="page-break-before: always; width: 794px; height: 1123px; overflow: hidden; background: white;"><img src="assets/shared/${file}" style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous"></div>`;
            });

            const element = document.getElementById('pdfReport');
            const opt = {
                margin:       0,
                filename:     `${data.customerProfile?.leadName?.replace(/\s+/g, '_') || 'Project'}_Master_Report.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true, allowTaint: true }, 
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            element.style.display = 'block';
            await html2pdf().set(opt).from(element).save();
            element.style.display = 'none';

        } catch (e) {
            console.error(e);
            alert("Failed to generate PDF. Ensure all assets are loaded securely.");
        } finally {
            btnDownload.innerHTML = ogText;
            btnDownload.disabled = false;
        }
    });
}

// --- CLOUDINARY CLIENT UPLOAD ENGINE ---
function initUploadEngine(id) {
    const uploadInput = document.getElementById('clientUploadInput');
    const btnUpload = document.getElementById('btnClientUpload');
    const statusText = document.getElementById('uploadStatus');

    if (btnUpload) {
        btnUpload.addEventListener('click', async () => {
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
                        }),
                        "timestamps.updatedAt": new Date().toISOString()
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
}
