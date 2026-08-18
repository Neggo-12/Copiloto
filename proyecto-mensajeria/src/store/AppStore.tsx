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
import { supabase } from "@/lib/supabase/client";

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
  completeOnboarding: () => Promise<UserProfile>;
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

  const completeOnboarding = useCallback(async (): Promise<UserProfile> => {
    const now = new Date().toISOString();

    // La sesión real ya existe en este punto: se crea en verifyPhoneOtp()
    // (src/lib/actions/auth.ts) cuando el usuario confirma el OTP en OtpStep.
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      throw new Error(
        "No hay sesión de Supabase activa. Verifica el celular antes de completar el registro.",
      );
    }

    const displayName = onboardingDraft.displayName.trim() || "Yo";
    const about = onboardingDraft.about.trim();
    const email = onboardingDraft.email.trim() || null;

    const { error } = await supabase.from("profiles").upsert({
      id: authUser.id,
      phone: onboardingDraft.phoneNumber,
      phone_country_code: onboardingDraft.phoneCountryCode,
      email,
      display_name: displayName,
      avatar_url: onboardingDraft.avatarUrl,
      about,
    });
    if (error) {
      throw new Error(`No se pudo guardar el perfil: ${error.message}`);
    }

    const user: UserProfile = {
      id: authUser.id,
      displayName,
      about,
      avatarUrl: onboardingDraft.avatarUrl,
      phoneNumber: onboardingDraft.phoneNumber,
      phoneCountryCode: onboardingDraft.phoneCountryCode,
      email,
      isPhoneVerified: true,
      isEmailVerified: Boolean(email),
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
