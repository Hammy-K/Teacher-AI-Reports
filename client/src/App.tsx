import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import TeacherDashboard from "@/pages/teacher-dashboard";
import TeacherSessionReport from "@/pages/teacher-session-report";
import AdminDashboard from "@/pages/admin-dashboard";

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

  // Admins can access everything; teachers can only access teacher routes
  if (role === "admin" && teacher.role !== "admin") {
    return <Redirect to="/teacher" />;
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
