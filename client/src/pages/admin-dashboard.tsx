import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LogOut, Users, BookOpen, Eye, MessageSquare, Star,
  Plus, ShieldCheck, UserX, UserCheck, ChevronLeft, BarChart3,
} from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

interface TeacherRow {
  id: number;
  email: string;
  name: string;
  nameArabic: string | null;
  isActive: boolean;
  role: "admin" | "teacher";
  createdAt: string;
  sessionCount: number;
}

interface Analytics {
  totalSessions: number;
  totalTeachers: number;
  totalViews: number;
  totalFeedback: number;
  avgRating: number | null;
  viewedSessionCount: number;
  recentViews: { id: number; teacherId: number; courseSessionId: string; viewedAt: string; durationSeconds: number | null }[];
  recentFeedback: { id: number; teacherId: number; courseSessionId: string; rating: number; comment: string | null; createdAt: string }[];
}

export default function AdminDashboard() {
  const { teacher, logout } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ email: "", name: "", nameArabic: "", role: "teacher" as "admin" | "teacher" });
  const [createError, setCreateError] = useState("");

  const { data: teachersList, isLoading: loadingTeachers } = useQuery<TeacherRow[]>({
    queryKey: ["/api/admin/teachers"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<Analytics>({
    queryKey: ["/api/admin/analytics"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/teachers", newTeacher);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
      setShowCreateForm(false);
      setNewTeacher({ email: "", name: "", nameArabic: "", role: "teacher" });
      setCreateError("");
    },
    onError: (err: Error) => {
      setCreateError(err.message.includes("409") ? "البريد مسجل مسبقاً" : "فشل في إنشاء الحساب");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!isActive) {
        await apiRequest("DELETE", `/api/admin/teachers/${id}`);
      } else {
        await apiRequest("PUT", `/api/admin/teachers/${id}`, { isActive: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
  });

  if (!teacher) {
    setLocation("/login");
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  // Build teacher name lookup
  const teacherMap = new Map((teachersList || []).map(t => [t.id, t.nameArabic || t.name]));

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">لوحة الإدارة</h1>
              <p className="text-xs text-gray-500">{teacher.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/teacher")} className="text-gray-500">
              <ChevronLeft className="w-4 h-4 ml-1" />
              لوحة المعلم
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500">
              <LogOut className="w-4 h-4 ml-1" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Analytics Cards */}
        {loadingAnalytics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : analytics && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">المعلمون</p>
                    <p className="text-xl font-bold text-gray-800">{analytics.totalTeachers}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">الحصص</p>
                    <p className="text-xl font-bold text-gray-800">{analytics.totalSessions}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Eye className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">المشاهدات</p>
                    <p className="text-xl font-bold text-gray-800">{analytics.totalViews}</p>
                    <p className="text-[10px] text-gray-400">{analytics.viewedSessionCount} حصة مشاهدة</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Star className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">متوسط التقييم</p>
                    <p className="text-xl font-bold text-gray-800">
                      {analytics.avgRating ? analytics.avgRating.toFixed(1) : "—"}<span className="text-sm text-gray-400">/5</span>
                    </p>
                    <p className="text-[10px] text-gray-400">{analytics.totalFeedback} تقييم</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recent Views */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    آخر المشاهدات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analytics.recentViews.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">لا توجد مشاهدات بعد</p>
                  ) : (
                    analytics.recentViews.map(v => (
                      <div key={v.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                        <span className="text-gray-600">{teacherMap.get(v.teacherId) || `#${v.teacherId}`}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">حصة {v.courseSessionId}</Badge>
                          {v.durationSeconds && (
                            <span className="text-gray-400">{Math.round(v.durationSeconds / 60)}د</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Recent Feedback */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    آخر التقييمات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analytics.recentFeedback.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">لا توجد تقييمات بعد</p>
                  ) : (
                    analytics.recentFeedback.map(f => (
                      <div key={f.id} className="py-1.5 border-b last:border-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{teacherMap.get(f.teacherId) || `#${f.teacherId}`}</span>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < f.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                              />
                            ))}
                          </div>
                        </div>
                        {f.comment && (
                          <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{f.comment}</p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Teachers Management */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4" />
              إدارة المعلمين
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <Plus className="w-4 h-4 ml-1" />
              إضافة معلم
            </Button>
          </CardHeader>
          <CardContent>
            {/* Create Form */}
            {showCreateForm && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">البريد الإلكتروني</Label>
                    <Input
                      type="email"
                      dir="ltr"
                      className="text-left text-sm"
                      value={newTeacher.email}
                      onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                      placeholder="teacher@noon.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الاسم (إنجليزي)</Label>
                    <Input
                      dir="ltr"
                      className="text-left text-sm"
                      value={newTeacher.name}
                      onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                      placeholder="Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الاسم (عربي)</Label>
                    <Input
                      className="text-sm"
                      value={newTeacher.nameArabic}
                      onChange={e => setNewTeacher({ ...newTeacher, nameArabic: e.target.value })}
                      placeholder="الاسم بالعربي"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <select
                      value={newTeacher.role}
                      onChange={e => setNewTeacher({ ...newTeacher, role: e.target.value as "admin" | "teacher" })}
                      className="rounded border border-gray-300 text-xs px-2 py-1"
                    >
                      <option value="teacher">معلم</option>
                      <option value="admin">مدير</option>
                    </select>
                    الدور
                  </label>
                  <div className="flex-1" />
                  {createError && <p className="text-xs text-red-500">{createError}</p>}
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    disabled={!newTeacher.email || !newTeacher.name || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
                  </Button>
                </div>
              </div>
            )}

            {/* Teachers Table */}
            {loadingTeachers ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded" />)}
              </div>
            ) : (
              <div className="divide-y">
                {(teachersList || []).map(t => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          t.isActive ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {(t.nameArabic || t.name).charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${t.isActive ? "text-gray-800" : "text-gray-400"}`}>
                            {t.nameArabic || t.name}
                          </span>
                          {t.role === "admin" && (
                            <Badge className="text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-100">مدير</Badge>
                          )}
                          {!t.isActive && (
                            <Badge variant="secondary" className="text-[10px]">معطل</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400" dir="ltr">{t.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{t.sessionCount} حصة</span>
                      {t.id !== teacher.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`text-xs ${t.isActive ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}
                          onClick={() => toggleActiveMutation.mutate({ id: t.id, isActive: !t.isActive })}
                          disabled={toggleActiveMutation.isPending}
                        >
                          {t.isActive ? (
                            <>
                              <UserX className="w-3.5 h-3.5 ml-1" />
                              تعطيل
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5 ml-1" />
                              تفعيل
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
