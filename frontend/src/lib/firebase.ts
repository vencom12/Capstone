import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

/**
 * authDomain MUST be the same origin the app is served from.
 *
 * Full-window Google sign-in (signInWithRedirect) reads its result through a
 * hidden iframe hosted on authDomain. If authDomain is a different site
 * (e.g. ryven-4cbd5.firebaseapp.com), Chrome/Safari/Firefox partition that
 * iframe's storage and the login result silently comes back null.
 *
 * The app's own origin proxies /__/auth/* to Firebase:
 *   - Production / Express (port 5001): middleware/firebaseAuthProxy.js
 *   - Next dev server (port 3000):      rewrites in next.config.ts
 *
 * Every origin used here must also be listed in Google Cloud Console >
 * Credentials > OAuth 2.0 Client > Authorized redirect URIs as
 *   <origin>/__/auth/handler
 */
const FALLBACK_AUTH_DOMAIN = 'ryven-4cbd5.firebaseapp.com';

function resolveAuthDomain(): string {
  if (typeof window !== 'undefined') {
    // Local development (localhost / 127.0.0.1) runs on plain HTTP.
    // Firebase authDomain strictly requires an SSL context (HTTPS); pointing authDomain
    // to an HTTP localhost causes the browser to throw ERR_SSL_PROTOCOL_ERROR.
    // Therefore, localhost routes through the official Firebase HTTPS authDomain.
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local');

    if (!isLocalhost && window.location.protocol === 'https:' && window.location.host) {
      // In deployed production (HTTPS, e.g. capstone-btr7.onrender.com), using the
      // app's own domain proxies /__/auth/* on the same origin, bypassing modern browser
      // third-party cookie restrictions.
      return window.location.host;
    }
  }
  return FALLBACK_AUTH_DOMAIN;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAa-8VSKaCtHpW3LTjfBlUm_9jBlIyTjrs",
  authDomain: resolveAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ryven-4cbd5",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "ryven-4cbd5.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "576470911091",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:576470911091:web:83eaaee619b51308c34206",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-3C82FW29M1"
};

// Singleton pattern prevents multiple initializations during Next.js Hot Reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
export default app;
