import React, { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  loginWithGoogle: (credential: string) => Promise<Teacher>;
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

  const googleLoginMutation = useMutation({
    mutationFn: async (credential: string) => {
      const res = await apiRequest("POST", "/api/auth/google", { credential });
      const data = await res.json();
      return data.teacher as Teacher;
    },
    onSuccess: (teacher) => {
      queryClient.setQueryData(["/api/auth/me"], teacher);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/my-sessions"] });
    },
  });

  const loginWithGoogle = async (credential: string): Promise<Teacher> => {
    return googleLoginMutation.mutateAsync(credential);
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
