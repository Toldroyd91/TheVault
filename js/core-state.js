import { BRAND_CONFIG } from './core-firebase.js';

export const SurveyState = {
    id: new URLSearchParams(window.location.search).get('id') || null,
    brand: "YorkshireWindows", // Defaulting to the primary brand
    customerProfile: { 
        leadName: "", 
        postcode: "", 
        vaultPIN: Math.floor(1000 + Math.random() * 9000).toString() 
    },
    technicalSurvey: { 
        buildCategory: "Existing Build", 
        roofSystem: "Edwardian roof", 
        proposedSizeSQM: "", 
        designerNotes: "" 
    },
    pamphlets: { 
        piling: false, sap: false, journey: false, journey1: false, journey2: false, 
        planning: false, protecting: false, tailored: false, whoweare: false, whychooseus: false 
    },
    rawAssets: { 
        frontElevationImage: null,
        sniperVectors: [] 
    },
    pipelineStatus: "1. Pre-Quote"
};

export const validateState = () => {
    // Structural Terminology Enforcement
    if (SurveyState.technicalSurvey.roofSystem.toLowerCase().includes('room')) {
        SurveyState.technicalSurvey.roofSystem = "Edwardian roof";
    }
    return SurveyState;
};
