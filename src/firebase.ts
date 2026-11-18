import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
];

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

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
