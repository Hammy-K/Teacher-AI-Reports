import React, { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { apiRequest, getQueryFn } from "./queryClient";

interface Teacher {
  id: number;
  email: string;
  name: string;
  nameArabic?: string | null;
  role: "admin" | "teacher";
}

interface AuthContextType {
  teacher: Teacher | null;
  isLoading: boolean;
  loginWithGoogle: () => Promise<Teacher>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: teacher, isLoading } = useQuery<Teacher | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });

  const firebaseLoginMutation = useMutation({
    mutationFn: async () => {
      // Sign in with Google via Firebase popup
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Send the Firebase ID token to our backend
      const res = await apiRequest("POST", "/api/auth/firebase", { idToken });
      const data = await res.json();
      return data.teacher as Teacher;
    },
    onSuccess: (teacher) => {
      queryClient.setQueryData(["/api/auth/me"], teacher);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await signOut(auth);
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/my-sessions"] });
    },
  });

  const loginWithGoogle = async (): Promise<Teacher> => {
    return firebaseLoginMutation.mutateAsync();
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ teacher: teacher ?? null, isLoading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
