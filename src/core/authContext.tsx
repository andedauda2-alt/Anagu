import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  extractReadableError,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { UserPrivateContact, UserProfileRecord, UserRole } from '../types';

interface AuthContextValue {
  authReady: boolean;
  firebaseUser: User | null;
  userProfile: UserProfileRecord | null;
  userPii: UserPrivateContact | null;
  allUsers: UserProfileRecord[];
  adminUids: string[];
  isAdmin: boolean;
  activeRole: UserRole;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  requestRoleUpgrade: (requestedRole: UserRole) => Promise<void>;
  updateOwnContactPii: (fields: Partial<Pick<UserPrivateContact, 'phone' | 'address' | 'nin'>> & { displayName?: string; walletAddress?: string }) => Promise<void>;
  assignUserRole: (targetUid: string, newRole: UserRole) => Promise<void>;
  setAdminAccess: (targetUid: string, grant: boolean) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function tsToMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return Date.now();
}

function clampStr(val: string | undefined, max: number): string {
  if (!val) return '';
  return val.trim().slice(0, max);
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [userPii, setUserPii] = useState<UserPrivateContact | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfileRecord[]>([]);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isBootstrappedAdmin =
    !!firebaseUser &&
    firebaseUser.emailVerified === true &&
    firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const isAdmin = isBootstrappedAdmin || isAdminDoc;
  const activeRole: UserRole = userProfile?.role || (isAdmin ? 'REGISTRAR' : 'CITIZEN');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setUserProfile(null);
        setUserPii(null);
        setAllUsers([]);
        setAdminUids([]);
        setIsAdminDoc(false);
      }
    });
    return () => unsub();
  }, []);

  // Ensure profile exists and subscribe ONLY when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    let cancelled = false;
    let unsubProfile = () => {};
    let unsubPii = () => {};
    const uid = firebaseUser.uid;
    const userRef = doc(db, 'users', uid);
    const piiRef = doc(db, 'users', uid, 'private', 'contact');
    const adminRef = doc(db, 'admins', uid);

    const bootstrapAndSubscribe = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initialRole: UserRole = isBootstrappedAdmin ? 'REGISTRAR' : 'CITIZEN';
          const displayName = clampStr(
            firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Registry User',
            100
          );
          const batch = writeBatch(db);
          const profilePayload: Record<string, unknown> = {
            uid,
            displayName,
            role: initialRole,
            requestedRole: 'NONE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (firebaseUser.photoURL) {
            profilePayload.photoURL = clampStr(firebaseUser.photoURL, 500);
          }
          batch.set(userRef, profilePayload);

          batch.set(piiRef, {
            uid,
            email: clampStr(firebaseUser.email || 'unknown@anagu.gov', 160),
            updatedAt: serverTimestamp(),
          });

          try {
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
          }
        }

        if (cancelled) return;

        // Check admins collection
        try {
          const adminSnap = await getDoc(adminRef);
          if (!cancelled) {
            setIsAdminDoc(adminSnap.exists());
          }
        } catch {
          if (!cancelled) setIsAdminDoc(false);
        }

        if (cancelled) return;

        unsubProfile = onSnapshot(
          userRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const d = docSnap.data();
            setUserProfile({
              uid: d.uid,
              displayName: d.displayName,
              photoURL: d.photoURL,
              role: d.role as UserRole,
              requestedRole: (d.requestedRole || 'NONE') as 'NONE' | UserRole,
              walletAddress: d.walletAddress,
              createdAt: tsToMs(d.createdAt),
              updatedAt: tsToMs(d.updatedAt),
            });
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${uid}`);
          }
        );

        unsubPii = onSnapshot(
          piiRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const d = docSnap.data();
            setUserPii({
              uid: d.uid,
              email: d.email,
              phone: d.phone,
              address: d.address,
              nin: d.nin,
              updatedAt: tsToMs(d.updatedAt),
            });
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${uid}/private/contact`);
          }
        );
      } catch (err) {
        if (!cancelled) {
          setAuthError(extractReadableError(err));
        }
      }
    };

    void bootstrapAndSubscribe();

    return () => {
      cancelled = true;
      unsubProfile();
      unsubPii();
    };
  }, [authReady, firebaseUser, isBootstrappedAdmin]);

  // Admin-only live list of all registered users for role governance
  useEffect(() => {
    if (!authReady || !firebaseUser || !isBootstrappedAdmin) {
      setAllUsers([]);
      return;
    }

    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: UserProfileRecord[] = snapshot.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              uid: d.uid,
              displayName: d.displayName,
              photoURL: d.photoURL,
              role: d.role as UserRole,
              requestedRole: (d.requestedRole || 'NONE') as 'NONE' | UserRole,
              walletAddress: d.walletAddress,
              createdAt: tsToMs(d.createdAt),
              updatedAt: tsToMs(d.updatedAt),
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt);
        setAllUsers(list);
      },
      (error) => {
        setAuthError(extractReadableError(error));
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    return () => unsub();
  }, [authReady, firebaseUser, isBootstrappedAdmin]);

  // Bootstrapped admin listener for appointed /admins/{uid} accounts
  useEffect(() => {
    if (!authReady || !firebaseUser || !isBootstrappedAdmin) {
      setAdminUids([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'admins'),
      (snapshot) => {
        setAdminUids(snapshot.docs.map((d) => d.id));
      },
      (error) => {
        setAuthError(extractReadableError(error));
        handleFirestoreError(error, OperationType.LIST, 'admins');
      }
    );

    return () => unsub();
  }, [authReady, firebaseUser, isBootstrappedAdmin]);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(extractReadableError(err));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthBusy(true);
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      setAuthError(extractReadableError(err));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const requestRoleUpgrade = useCallback(
    async (requestedRole: UserRole) => {
      if (!firebaseUser) return;
      const path = `users/${firebaseUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          requestedRole,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [firebaseUser]
  );

  const updateOwnContactPii = useCallback(
    async (
      fields: Partial<Pick<UserPrivateContact, 'phone' | 'address' | 'nin'>> & {
        displayName?: string;
        walletAddress?: string;
      }
    ) => {
      if (!firebaseUser) return;
      const uid = firebaseUser.uid;
      const batch = writeBatch(db);

      const publicUpdate: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (fields.displayName && fields.displayName.trim().length > 0) {
        publicUpdate.displayName = clampStr(fields.displayName, 100);
      }
      if (fields.walletAddress !== undefined && fields.walletAddress.trim().length > 0) {
        publicUpdate.walletAddress = clampStr(fields.walletAddress, 64);
      }
      batch.update(doc(db, 'users', uid), publicUpdate);

      const piiUpdate: Record<string, unknown> = {
        uid,
        email: clampStr(firebaseUser.email || 'unknown@anagu.gov', 160),
        updatedAt: serverTimestamp(),
      };
      if (fields.phone !== undefined) piiUpdate.phone = clampStr(fields.phone, 40);
      if (fields.address !== undefined) piiUpdate.address = clampStr(fields.address, 240);
      if (fields.nin !== undefined) piiUpdate.nin = clampStr(fields.nin, 40);

      batch.set(doc(db, 'users', uid, 'private', 'contact'), piiUpdate, { merge: true });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    },
    [firebaseUser]
  );

  const assignUserRole = useCallback(
    async (targetUid: string, newRole: UserRole) => {
      if (!firebaseUser || !isAdmin) return;
      const path = `users/${targetUid}`;
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          role: newRole,
          requestedRole: 'NONE',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, isAdmin]
  );

  const setAdminAccess = useCallback(
    async (targetUid: string, grant: boolean) => {
      if (!firebaseUser || !isBootstrappedAdmin) return;
      const path = `admins/${targetUid}`;
      try {
        if (grant) {
          await setDoc(doc(db, 'admins', targetUid), {
            uid: targetUid,
            grantedBy: firebaseUser.uid,
            grantedAt: serverTimestamp(),
          });
        } else {
          await deleteDoc(doc(db, 'admins', targetUid));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [firebaseUser, isBootstrappedAdmin]
  );

  return (
    <AuthContext.Provider
      value={{
        authReady,
        firebaseUser,
        userProfile,
        userPii,
        allUsers,
        adminUids,
        isAdmin,
        activeRole,
        authBusy,
        authError,
        signInWithGoogle,
        signOutUser,
        requestRoleUpgrade,
        updateOwnContactPii,
        assignUserRole,
        setAdminAccess,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside FirebaseProvider');
  }
  return ctx;
}
