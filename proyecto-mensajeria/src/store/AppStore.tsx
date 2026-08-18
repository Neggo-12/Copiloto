import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  OnboardingStep,
  PermissionKey,
  PermissionStatus,
  UserProfile,
} from "@/lib/domain/types";
import { DEFAULT_COUNTRY_CODE } from "@/lib/domain/countries";

export type ThemeMode = "light" | "dark";

export interface OnboardingDraft {
  phoneCountryCode: string;
  phoneNationalNumber: string;
  phoneNumber: string; // E.164
  email: string;
  displayName: string;
  about: string;
  avatarUrl: string | null;
}

const EMPTY_DRAFT: OnboardingDraft = {
  phoneCountryCode: DEFAULT_COUNTRY_CODE,
  phoneNationalNumber: "",
  phoneNumber: "",
  email: "",
  displayName: "",
  about: "",
  avatarUrl: null,
};

const DEFAULT_PERMISSIONS: Record<PermissionKey, PermissionStatus> = {
  contacts: "unknown",
  notifications: "unknown",
  microphone: "unknown",
  camera: "unknown",
};

interface AppStoreValue {
  theme: ThemeMode;
  toggleTheme: () => void;

  onboardingStep: OnboardingStep;
  setOnboardingStep: (step: OnboardingStep) => void;
  onboardingDraft: OnboardingDraft;
  updateOnboardingDraft: (patch: Partial<OnboardingDraft>) => void;

  permissions: Record<PermissionKey, PermissionStatus>;
  setPermissionStatus: (key: PermissionKey, status: PermissionStatus) => void;

  currentUser: UserProfile | null;
  completeOnboarding: () => UserProfile;
  /** Aplica un cambio al perfil de la sesión actual (usado por Perfil/Ajustes). */
  updateCurrentUser: (updater: (user: UserProfile) => UserProfile) => void;
  signOut: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [permissions, setPermissions] =
    useState<Record<PermissionKey, PermissionStatus>>(DEFAULT_PERMISSIONS);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Tema del sistema como valor inicial (sin mismatch de hidratación).
  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const updateOnboardingDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    setOnboardingDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPermissionStatus = useCallback((key: PermissionKey, status: PermissionStatus) => {
    setPermissions((prev) => ({ ...prev, [key]: status }));
  }, []);

  const completeOnboarding = useCallback((): UserProfile => {
    const now = new Date().toISOString();
    const user: UserProfile = {
      id: "user_me",
      displayName: onboardingDraft.displayName.trim() || "Yo",
      about: onboardingDraft.about.trim(),
      avatarUrl: onboardingDraft.avatarUrl,
      phoneNumber: onboardingDraft.phoneNumber,
      phoneCountryCode: onboardingDraft.phoneCountryCode,
      email: onboardingDraft.email.trim() || null,
      isPhoneVerified: true,
      isEmailVerified: Boolean(onboardingDraft.email.trim()),
      lastSeenAt: now,
      isOnline: true,
      createdAt: now,
    };
    setCurrentUser(user);
    setOnboardingStep("done");
    return user;
  }, [onboardingDraft]);

  const updateCurrentUser = useCallback((updater: (user: UserProfile) => UserProfile) => {
    setCurrentUser((prev) => (prev ? updater(prev) : prev));
  }, []);

  const signOut = useCallback(() => {
    setCurrentUser(null);
    setOnboardingDraft(EMPTY_DRAFT);
    setPermissions(DEFAULT_PERMISSIONS);
    setOnboardingStep("welcome");
  }, []);

  const value = useMemo<AppStoreValue>(
    () => ({
      theme,
      toggleTheme,
      onboardingStep,
      setOnboardingStep,
      onboardingDraft,
      updateOnboardingDraft,
      permissions,
      setPermissionStatus,
      currentUser,
      completeOnboarding,
      updateCurrentUser,
      signOut,
    }),
    [
      theme,
      toggleTheme,
      onboardingStep,
      onboardingDraft,
      updateOnboardingDraft,
      permissions,
      setPermissionStatus,
      currentUser,
      completeOnboarding,
      updateCurrentUser,
      signOut,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore debe usarse dentro de <AppStoreProvider>");
  return ctx;
}
