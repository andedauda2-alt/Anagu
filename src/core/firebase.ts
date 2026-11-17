import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const IS_ADMIN_PORTAL =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));

const app = IS_ADMIN_PORTAL
  ? initializeApp(firebaseConfig, 'anagu-admin')
  : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'andedauda2@gmail.com';
export const FIREBASE_CONSOLE_QUOTA_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isQuotaExceededError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('quota exceeded');
}

export function extractReadableError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const raw = error instanceof Error ? error.message : String(error);

  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked by your browser or embedded preview frame. Allow popups or click "Open in New Tab" below to sign in.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in window closed before completing authentication. If you are inside an embedded preview, try opening the app in a new tab.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'A sign-in popup request was superseded. Please click "Sign in with Google" once.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Domain "${host}" is not authorized in Firebase Auth. Open the deployed App URL or add this domain in Firebase Console -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In provider is not enabled in Firebase Console -> Authentication -> Sign-in method.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network request failed while contacting Google Authentication. Check your connection and try again.';
  }
  if (raw.toLowerCase().includes('quota exceeded')) {
    return `Firestore daily free-tier quota exceeded. Quota resets tomorrow, or upgrade your database plan in Firebase Console.`;
  }
  try {
    const parsed = JSON.parse(raw) as FirestoreErrorInfo;
    if (parsed && parsed.error) {
      return parsed.error;
    }
  } catch {
    // plain error string
  }
  return code ? `${raw} (${code})` : raw;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
