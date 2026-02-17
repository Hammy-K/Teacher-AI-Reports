import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import TeacherDashboard from "@/pages/teacher-dashboard";
import TeacherSessionReport from "@/pages/teacher-session-report";
import AdminDashboard from "@/pages/admin-dashboard";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function ProtectedRoute({ component: Component, role, ...rest }: { component: React.ComponentType<any>; role?: "admin" | "teacher"; [key: string]: any }) {
  const { teacher, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!teacher) {
    return <Redirect to="/login" />;
  }

  if (role && teacher.role !== role) {
    // Wrong role — redirect to their correct dashboard
    return <Redirect to={teacher.role === "admin" ? "/admin" : "/teacher"} />;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      {/* Public: legacy dashboard */}
      <Route path="/" component={Dashboard} />

      {/* Auth */}
      <Route path="/login" component={LoginPage} />

      {/* Protected teacher routes */}
      <Route path="/teacher">
        {() => <ProtectedRoute component={TeacherDashboard} role="teacher" />}
      </Route>
      <Route path="/teacher/session/:sessionId">
        {(params: any) => <ProtectedRoute component={TeacherSessionReport} params={params} />}
      </Route>

      {/* Admin routes */}
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
