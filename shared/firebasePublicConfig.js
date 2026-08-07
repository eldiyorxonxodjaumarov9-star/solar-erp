/** Brauzer (Vite) va server (Node) uchun bir xil Firebase loyiha sozlamalari. */
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: "AIzaSyBrQTbEFw-_yf1h1pBatVc7L1ZTMdImAIU",
  authDomain: "solar-erp-51870.firebaseapp.com",
  projectId: "solar-erp-51870",
  storageBucket: "solar-erp-51870.appspot.com",
  messagingSenderId: "742276498478",
  appId: "1:742276498478:web:9a57f90c9c997537d34bbf",
};

export function resolveFirebaseConfigFromEnv(env = process.env) {
  return {
    apiKey:
      String(env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY || "").trim() ||
      FIREBASE_PUBLIC_CONFIG.apiKey,
    authDomain:
      String(env.VITE_FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN || "").trim() ||
      FIREBASE_PUBLIC_CONFIG.authDomain,
    projectId:
      String(env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || "").trim() ||
      FIREBASE_PUBLIC_CONFIG.projectId,
    storageBucket:
      String(env.VITE_FIREBASE_STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET || "").trim() ||
      FIREBASE_PUBLIC_CONFIG.storageBucket,
    messagingSenderId:
      String(
        env.VITE_FIREBASE_MESSAGING_SENDER_ID || env.FIREBASE_MESSAGING_SENDER_ID || "",
      ).trim() || FIREBASE_PUBLIC_CONFIG.messagingSenderId,
    appId:
      String(env.VITE_FIREBASE_APP_ID || env.FIREBASE_APP_ID || "").trim() ||
      FIREBASE_PUBLIC_CONFIG.appId,
  };
}
