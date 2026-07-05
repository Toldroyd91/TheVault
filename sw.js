const CACHE_NAME = 'cohi-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/vault.html',
    '/js/ui-dashboard.js',
    '/js/ui-vault.js',
    '/js/core-firebase.js',
    'https://cdn.tailwindcss.com'
];

// Install and cache essential files
self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Serve from cache if offline
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
