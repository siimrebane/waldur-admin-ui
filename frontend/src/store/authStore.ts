import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserInfo } from "../types/api";

interface AuthState {
  user: UserInfo | null;
  setUser: (user: UserInfo) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    { name: "auth" }
  )
);
