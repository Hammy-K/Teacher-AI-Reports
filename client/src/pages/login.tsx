import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { GoogleLogin } from "@react-oauth/google";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError("");
    setLoading(true);

    try {
      const teacher = await loginWithGoogle(credentialResponse.credential);
      if (teacher.role === "admin") {
        setLocation("/admin");
      } else {
        setLocation("/teacher");
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("403")) {
        setError("هذا الحساب غير مسجل. تواصل مع المسؤول.");
      } else {
        setError("حدث خطأ في تسجيل الدخول");
      }
    } finally {
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
          {loading ? (
            <div className="text-teal-600 text-sm animate-pulse">
              جاري تسجيل الدخول...
            </div>
          ) : (
            <div dir="ltr">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError("فشل تسجيل الدخول عبر Google")}
                size="large"
                width="320"
                text="signin_with"
                shape="rectangular"
                theme="outline"
              />
            </div>
          )}

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
