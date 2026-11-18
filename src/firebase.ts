import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying the firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
];

// Primary Login Provider: Standard Google Sign-In ONLY (email & profile).
// MUST NOT attach restricted Drive scopes here so ANY Gmail account can sign in
// without Google blocking them with "Error 403: access_denied (Aplikasi sedang diuji)".
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Separate provider used when refreshing or explicitly consenting to Google Drive upload access
export function createDriveConsentProvider(
  loginHintEmail?: string | null,
  forceConsent = false
): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  const params: Record<string, string> = {
    include_granted_scopes: 'true',
  };
  if (forceConsent) {
    params.prompt = 'consent';
  }
  if (loginHintEmail) {
    params.login_hint = loginHintEmail;
  }
  provider.setCustomParameters(params);
  return provider;
}

// In-memory cache for Google OAuth access token (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const getGoogleAccessToken = (): string | null => cachedAccessToken;
export const setGoogleAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};
export const getIsSigningIn = (): boolean => isSigningIn;
export const setIsSigningIn = (val: boolean) => {
  isSigningIn = val;
};

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test as required by firebase-integration skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration or internet connection.');
    }
  }
}

testConnection();
