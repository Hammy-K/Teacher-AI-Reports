import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

export default function LoginPage() {
  const { teacher, loginWithGoogle } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect once auth context has the teacher (after React re-renders)
  useEffect(() => {
    if (teacher) {
      setLocation(teacher.role === "admin" ? "/admin" : "/teacher");
    }
  }, [teacher, setLocation]);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

    try {
      await loginWithGoogle();
      // Don't navigate here — the useEffect above handles it
      // after the auth context re-renders with the new teacher
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("403")) {
        setError("هذا الحساب غير مسجل. تواصل مع المسؤول.");
      } else if (msg.includes("popup-closed-by-user")) {
        setError("");
      } else {
        setError("حدث خطأ في تسجيل الدخول");
      }
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 px-4"
    >
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-teal-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">
            تسجيل الدخول
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            سجّل دخولك باستخدام حساب Google للوصول إلى تقارير الحصص
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            variant="outline"
            className="w-full max-w-xs h-12 text-sm font-medium gap-3 border-gray-300 hover:bg-gray-50"
          >
            {loading ? (
              <span className="animate-spin text-lg">&#9696;</span>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول بحساب Google"}
          </Button>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-3 text-center w-full">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
