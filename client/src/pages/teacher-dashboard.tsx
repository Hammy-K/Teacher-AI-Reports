import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LogOut, ChevronRight, ChevronLeft, Upload, BookOpen,
  Clock, ThermometerSun, Users, FileUp, GraduationCap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SessionSummary {
  id: number;
  courseSessionId: number;
  courseSessionName: string | null;
  scheduledStartTime: string | null;
  teachingTime: number | null;
  sessionTime: number | null;
  sessionTemperature: number | null;
  courseSessionStatus: string | null;
}

function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    d.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
  return { start, end, label: `${fmt(start)} - ${fmt(end)}` };
}

function parseSessionName(name: string | null): { topic: string; level: string } {
  if (!name) return { topic: "—", level: "—" };
  const match = name.match(/^(.+?)\s+(L\d+|الدرس\s*\d+)/i);
  if (match) return { topic: match[1].trim(), level: match[2].trim() };
  return { topic: name, level: "—" };
}

export default function TeacherDashboard() {
  const { teacher, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [weekOffset, setWeekOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);
  const week = getWeekRange(now);

  const { data: sessions, isLoading } = useQuery<SessionSummary[]>({
    queryKey: ["/api/my-sessions"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-sessions"] });
    },
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  // Filter sessions for current week
  const weekSessions = (sessions || []).filter((s) => {
    if (!s.scheduledStartTime) return false;
    const d = new Date(s.scheduledStartTime);
    return d >= week.start && d <= week.end;
  });

  const totalSessions = sessions?.length || 0;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">
                {teacher?.nameArabic || teacher?.name}
              </h1>
              <p className="text-xs text-gray-500">{teacher?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {teacher?.role === "admin" && (
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")} className="text-purple-600">
                لوحة الإدارة
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500">
              <LogOut className="w-4 h-4 ml-1" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">إجمالي الحصص</p>
                <p className="text-xl font-bold text-gray-800">{totalSessions}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">هذا الأسبوع</p>
                <p className="text-xl font-bold text-gray-800">{weekSessions.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm col-span-2 md:col-span-1">
            <CardContent className="p-4">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadMutation.mutate(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <Button
                variant="outline"
                className="w-full border-dashed border-2 h-auto py-3"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                <div className="flex items-center gap-2">
                  {uploadMutation.isPending ? (
                    <span className="animate-spin">&#9696;</span>
                  ) : (
                    <Upload className="w-5 h-5 text-teal-600" />
                  )}
                  <span className="text-sm">
                    {uploadMutation.isPending ? "جاري الرفع..." : "رفع حصة جديدة"}
                  </span>
                </div>
              </Button>
              {uploadMutation.isError && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  {(uploadMutation.error as Error).message}
                </p>
              )}
              {uploadMutation.isSuccess && (
                <p className="text-xs text-green-600 mt-2 text-center">
                  تم رفع الحصة بنجاح
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Week Selector */}
        <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">حصص الأسبوع</p>
            <p className="text-xs text-gray-500">{week.label}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(weekOffset - 1)}
            disabled={weekOffset <= 0}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : weekSessions.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <FileUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">لا توجد حصص في هذا الأسبوع</p>
              <p className="text-gray-400 text-xs mt-1">
                يمكنك رفع ملفات CSV لحصة جديدة من الزر أعلاه
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {weekSessions.map((session) => {
              const { topic, level } = parseSessionName(session.courseSessionName);
              const date = session.scheduledStartTime
                ? new Date(session.scheduledStartTime).toLocaleDateString("ar-SA", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : "—";

              return (
                <Card
                  key={session.id}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setLocation(`/teacher/session/${session.courseSessionId}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-800">{topic}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {level}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{date}</p>
                        <div className="flex gap-4">
                          {session.teachingTime != null && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{Math.round(session.teachingTime)} د</span>
                            </div>
                          )}
                          {session.sessionTemperature != null && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <ThermometerSun className="w-3.5 h-3.5" />
                              <span>{Math.round(session.sessionTemperature)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-gray-400 mt-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* All Sessions (if none in current week, show all) */}
        {!isLoading && weekSessions.length === 0 && totalSessions > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-600 px-1">جميع الحصص</h2>
            {(sessions || []).map((session) => {
              const { topic, level } = parseSessionName(session.courseSessionName);
              return (
                <Card
                  key={session.id}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setLocation(`/teacher/session/${session.courseSessionId}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-800">{topic}</h3>
                          <Badge variant="secondary" className="text-xs">{level}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {session.scheduledStartTime
                            ? new Date(session.scheduledStartTime).toLocaleDateString("ar-SA", {
                                weekday: "long",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </p>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-gray-400 mt-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
