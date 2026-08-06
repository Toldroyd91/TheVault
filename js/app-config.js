/*
==========================================================
CO HOME IMPROVEMENTS
Enterprise Platform
Global Configuration
==========================================================
*/

window.COHI = {

    version: "2.0.0",

    company: {

        groupName: "CO Home Improvements",

        brands: [

            {
                id: "clearview",
                name: "Clearview",
                colour: "#0A74DA",
                logo: "assets/clearview/logo.png",
                brochures: "assets/clearview/"
            },

            {
                id: "orion",
                name: "Orion Windows",
                colour: "#00AEEF",
                logo: "assets/orion/logo.png",
                brochures: "assets/orion/"
            },

            {
                id: "planet",
                name: "Planet",
                colour: "#5C2D91",
                logo: "assets/planet/logo.png",
                brochures: "assets/planet/"
            },

            {
                id: "trent",
                name: "Trent Valley Windows",
                colour: "#006747",
                logo: "assets/trent/logo.png",
                brochures: "assets/trent/"
            },

            {
                id: "yorkshire",
                name: "Yorkshire Windows",
                colour: "#005A9C",
                logo: "assets/yorkshire/logo.png",
                brochures: "assets/yorkshire/"
            },

            {
                id: "westyorkshire",
                name: "West Yorkshire Windows",
                colour: "#D71920",
                logo: "assets/westyorkshire/logo.png",
                brochures: "assets/westyorkshire/"
            }

        ]

    },

    vault: {

        autoWatermark: true,

        analytics: true,

        photoCompression: 0.88,

        quoteLocked: true,

        allowMessaging: true,

        allowBrochures: true

    },

    survey: {

        autoSaveSeconds: 15,

        allowDrafts: true,

        allowOffline: true

    },

    uploads: {

        maxPhotos: 200,

        maxPdfMb: 40,

        acceptedImages: [

            "image/jpeg",

            "image/png",

            "image/webp"

        ],

        acceptedDocuments: [

            "application/pdf"

        ]

    },

    analytics: {

        enabled: true,

        collect:

        [

            "firstVisit",

            "lastVisit",

            "timeOnVault",

            "downloads",

            "brochureViews",

            "quoteViews",

            "imageZoom",

            "device",

            "browser",

            "pageHistory"

        ]

    }

};


/*
==========================================================
Utility Functions
==========================================================
*/

COHI.getBrand = function(id){

    return COHI.company.brands.find(b=>b.id===id);

};

COHI.getBrandColour=function(id){

    const b=this.getBrand(id);

    return b ? b.colour : "#005A9C";

};

COHI.getBrandLogo=function(id){

    const b=this.getBrand(id);

    return b ? b.logo : "assets/co-logo.png";

};

COHI.getBrandBrochureFolder=function(id){

    const b=this.getBrand(id);

    return b ? b.brochures : "";

};