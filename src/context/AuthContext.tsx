import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  auth,
  SCOPES,
  createDriveConsentProvider,
  db,
  getGoogleAccessToken,
  setGoogleAccessToken,
  getIsSigningIn,
  setIsSigningIn,
} from '../firebase';
import { UserRole } from '../types';

async function verifyTokenHasDriveScope(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return false;
    const info = await res.json();
    const scopes: string = info.scope || '';
    return scopes.includes('https://www.googleapis.com/auth/drive');
  } catch {
    return true;
  }
}

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  isBootstrapAdmin: boolean;
  driveAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  requestDriveAccessToken: (forceConsent?: boolean) => Promise<string | null>;
  clearDriveAccessToken: () => void;
  signOutUser: () => Promise<void>;
  updateUserRole: (newRole: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = ['manickdsrocket@gmail.com', 'mdspanjang@gmail.com'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('staff');
  const [loading, setLoading] = useState<boolean>(true);
  const [isBootstrapAdmin, setIsBootstrapAdmin] = useState<boolean>(false);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(
    getGoogleAccessToken()
  );
  const [authErrorModal, setAuthErrorModal] = useState<{
    code: string;
    message: string;
    hostname: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthErrorModal(null);
        const token = getGoogleAccessToken();
        if (token) {
          setDriveAccessToken(token);
        } else if (!getIsSigningIn()) {
          setGoogleAccessToken(null);
          setDriveAccessToken(null);
        }

        const emailLower = (currentUser.email || '').toLowerCase().trim();
        const isMaster = ADMIN_EMAILS.includes(emailLower);
        setIsBootstrapAdmin(isMaster);

        if (isMaster) {
          setRole('admin');
        } else {
          try {
            const adminDocRef = doc(db, 'admins', currentUser.uid);
            const adminSnap = await getDoc(adminDocRef);
            if (adminSnap.exists()) {
              setRole('admin');
              setIsBootstrapAdmin(true);
            } else {
              setRole('staff');
            }
          } catch {
            setRole('staff');
          }
        }
      } else {
        setGoogleAccessToken(null);
        setDriveAccessToken(null);
        setRole('viewer');
        setIsBootstrapAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearDriveAccessToken = () => {
    setGoogleAccessToken(null);
    setDriveAccessToken(null);
  };

  const signInWithGoogle = async () => {
    if (getIsSigningIn()) return;
    try {
      setIsSigningIn(true);
      setAuthErrorModal(null);
      const freshProvider = new GoogleAuthProvider();
      freshProvider.setCustomParameters({
        prompt: 'select_account',
      });
      const result = await signInWithPopup(auth, freshProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setGoogleAccessToken(token);
      }
    } catch (error: any) {
      const code = error?.code || 'auth/unknown';
      const message = error?.message || String(error);
      console.warn('Google sign-in warning:', code, message);
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthErrorModal({
          code,
          message,
          hostname: typeof window !== 'undefined' ? window.location.hostname : '',
        });
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const requestDriveAccessToken = async (forceConsent = false): Promise<string | null> => {
    const existing = getGoogleAccessToken();
    if (existing && !forceConsent) {
      const valid = await verifyTokenHasDriveScope(existing);
      if (valid) {
        setDriveAccessToken(existing);
        return existing;
      }
      setGoogleAccessToken(null);
      setDriveAccessToken(null);
    }

    try {
      setIsSigningIn(true);
      const provider = createDriveConsentProvider(auth.currentUser?.email, forceConsent);
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      let token = credential?.accessToken || null;
      if (!token) {
        return null;
      }

      let hasDrive = await verifyTokenHasDriveScope(token);
      if (!hasDrive && !forceConsent) {
        // Retry once with explicit consent prompt if the user hasn't ticked the Drive checkbox yet
        const consentProvider = createDriveConsentProvider(auth.currentUser?.email, true);
        const retryResult = await signInWithPopup(auth, consentProvider);
        const retryCred = GoogleAuthProvider.credentialFromResult(retryResult);
        token = retryCred?.accessToken || null;
        if (token) {
          hasDrive = await verifyTokenHasDriveScope(token);
        }
      }

      if (!token || !hasDrive) {
        setGoogleAccessToken(null);
        setDriveAccessToken(null);
        throw new Error(
          'Izin akses Google Drive belum dicentang saat login. Silakan klik tombol lagi dan centang kotak izin Google Drive pada jendela Google.'
        );
      }

      setGoogleAccessToken(token);
      setDriveAccessToken(token);
      return token;
    } catch (error: any) {
      console.warn('Google Drive token authorization warning:', error);
      if (error?.message?.includes('belum dicentang')) {
        throw error;
      }
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      setDriveAccessToken(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const updateUserRole = (newRole: UserRole) => {
    setRole(newRole);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isBootstrapAdmin,
        driveAccessToken,
        signInWithGoogle,
        requestDriveAccessToken,
        clearDriveAccessToken,
        signOutUser,
        updateUserRole,
      }}
    >
      {children}

      {authErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Popup Login Google Tertutup ({authErrorModal.code})
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Domain saat ini: <span className="font-mono font-semibold text-slate-800">{authErrorModal.hostname}</span>
                </p>
              </div>
              <button
                onClick={() => setAuthErrorModal(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2 leading-relaxed">
              <p className="font-bold">
                Penyebab utama jika popup tertutup:
              </p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  Pastikan domain{' '}
                  <span className="font-mono font-bold">{authErrorModal.hostname}</span> sudah terdaftar di{' '}
                  <strong>Authorized domains</strong> pada project Firebase{' '}
                  <span className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">
                    ordertracking-223b6
                  </span>.
                </li>
                <li>
                  Agar semua akun Gmail lain bisa login, pastikan status <strong>OAuth Consent Screen</strong> di Google Cloud project{' '}
                  <span className="font-mono font-bold">ordertracking-223b6</span> sudah diklik{' '}
                  <strong>&quot;PUBLISH APP&quot; (In Production)</strong>, bukan <em>Testing</em>.
                </li>
              </ol>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <a
                href="https://console.firebase.google.com/project/ordertracking-223b6/authentication/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors"
              >
                1. Buka Authorized Domains (Project ordertracking-223b6) ↗
              </a>
              <a
                href="https://console.cloud.google.com/apis/credentials/consent?project=ordertracking-223b6"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors"
              >
                2. Buka OAuth Consent Screen & Klik &quot;PUBLISH APP&quot; ↗
              </a>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setAuthErrorModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  setAuthErrorModal(null);
                  signInWithGoogle();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                Coba Login Lagi
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
