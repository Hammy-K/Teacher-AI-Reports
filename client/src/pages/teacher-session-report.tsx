import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Dashboard from "./dashboard";
import ReportFeedback from "@/components/ReportFeedback";

export default function TeacherSessionReport() {
  const params = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { teacher } = useAuth();
  const sessionId = params.sessionId;

  // Track view duration
  useEffect(() => {
    if (!teacher || !sessionId) return;

    // Log initial view
    fetch("/api/report-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ courseSessionId: sessionId }),
    }).catch(() => {});

    // Log duration on unmount
    const startTime = Date.now();
    return () => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const body = JSON.stringify({ courseSessionId: sessionId, durationSeconds });
      // Use sendBeacon for reliable unload tracking
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/report-views", blob);
      }
    };
  }, [teacher, sessionId]);

  if (!teacher) {
    setLocation("/login");
    return null;
  }

  return (
    <div dir="rtl">
      {/* Back navigation bar */}
      <div className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/teacher")}
            className="text-gray-600"
          >
            <ArrowRight className="w-4 h-4 ml-1" />
            العودة للوحة التحكم
          </Button>
        </div>
      </div>

      {/* Reuse existing Dashboard component */}
      <Dashboard overrideSessionId={sessionId ? parseInt(sessionId) : undefined} />

      {/* Feedback section */}
      {sessionId && (
        <div className="max-w-5xl mx-auto px-4 pb-8">
          <ReportFeedback sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
