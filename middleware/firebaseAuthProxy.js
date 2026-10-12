/**
 * MODULE: Firebase Auth Same-Origin Proxy
 * ----------------------------------------
 * OWNS:   /__/auth/*  and  /__/firebase/*
 * WHY:    Full-window Google sign-in (signInWithRedirect) only works in modern
 *         browsers when Firebase's auth helper is served from the SAME domain as
 *         the app. Chrome 115+, Safari 16.1+ and Firefox 109+ partition storage
 *         for cross-site iframes, so a cross-domain authDomain silently returns
 *         a null redirect result (user lands on the storefront logged out).
 *         See: https://firebase.google.com/docs/auth/web/redirect-best-practices
 *
 * PAIRED WITH: frontend/src/lib/firebase.ts (authDomain = window.location.host)
 *
 * Mount this BEFORE body parsers and static file serving.
 */
const https = require('https');

const FIREBASE_HOST = process.env.FIREBASE_AUTH_HOST || 'ryven-4cbd5.firebaseapp.com';

function firebaseAuthProxy(req, res, next) {
    if (!req.path.startsWith('/__/auth') && !req.path.startsWith('/__/firebase')) {
        return next();
    }

    const headers = { ...req.headers, host: FIREBASE_HOST };

    const proxyReq = https.request(
        {
            hostname: FIREBASE_HOST,
            port: 443,
            path: req.originalUrl,
            method: req.method,
            headers,
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', (err) => {
        console.error('[FirebaseAuthProxy] Upstream error:', err.message);
        if (!res.headersSent) res.status(502).send('Firebase auth proxy error');
    });

    req.pipe(proxyReq);
}

module.exports = firebaseAuthProxy;
