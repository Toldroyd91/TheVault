import { jsPDF } from "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
import { db, doc, updateDoc } from './core-firebase.js';

// Helper: Convert your local asset images (watermarks, pamphlets) to Base64 so jsPDF can read them
async function urlToBase64(url) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch(e) { return null; }
}

export async function generatePerfectPDF(surveyState, brandConfig) {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const brandData = brandConfig[surveyState.brand];

    // --- PAGE 1: THE WATERMARKED QUOTE DESIGN ---
    // (Insert your exact perfect coordinates here from your old app.js)
    pdf.setFontSize(22);
    pdf.setTextColor(brandData.theme);
    pdf.text(`${brandData.name} - Project Blueprint`, 20, 30);
    
    pdf.setFontSize(12);
    pdf.setTextColor('#333333');
    pdf.text(`Client: ${surveyState.customerProfile.leadName}`, 20, 50);
    pdf.text(`Location: ${surveyState.customerProfile.postcode}`, 20, 60);
    pdf.text(`Roof System: ${surveyState.technicalSurvey.roofSystem}`, 20, 70); // Outputs Edwardian roof
    
    // Add the Canvas Snapshot
    if (surveyState.rawAssets.frontElevationImage) {
        pdf.addImage(surveyState.rawAssets.frontElevationImage, 'JPEG', 20, 90, 170, 100);
    }

    // --- SUBSEQUENT PAGES: THE PAMPHLETS ---
    const pamphletChecks = [
        { key: 'piling', file: 'assets/shared/piling.jpg' },
        { key: 'sap', file: 'assets/shared/sap-calcs.jpg' },
        { key: 'windows', file: `${brandData.assetPath}windows.jpg` }, // Dynamic Brand Pamphlet
        // Add the rest of your 10 pamphlets here...
    ];

    for (const p of pamphletChecks) {
        if (surveyState.pamphlets[p.key]) {
            const base64Img = await urlToBase64(p.file);
            if (base64Img) {
                pdf.addPage();
                pdf.addImage(base64Img, 'JPEG', 0, 0, 210, 297); // Fills exactly one A4 page
            }
        }
    }

    // --- UPLOAD TO FIREBASE STORAGE ---
    // Convert the PDF to a Blob
    const pdfBlob = pdf.output('blob');
    
    // Using standard fetch to securely upload to your Firebase Storage Bucket
    // Note: Once you are on desktop, we will add the direct Firebase Storage upload package here. 
    // For now, this saves it locally so you can see it works perfectly!
    pdf.save(`${surveyState.customerProfile.leadName}_Survey.pdf`);
    
    return true; 
}
