import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Clock, ThermometerSun, Activity, CheckCircle,
  MessageCircle, Hand, BookOpen, ChevronDown, ChevronUp, Search
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { useState } from "react";

interface DashboardData {
  session: {
    courseSessionId: number;
    courseSessionName: string;
    teachingTime: number;
    sessionTime: number;
    avgActiveTimePerStudent: number;
    courseSessionStatus: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    teacherStartTime: string;
    teacherEndTime: string;
  };
  transcripts: { startTime: string; endTime: string; text: string; lineOrder: number }[];
  chats: { messageText: string; creatorName: string; userType: string; createdAtTs: string }[];
  activities: {
    activityId: number; activityType: string; startTime: string; endTime: string;
    activityHappened: boolean; plannedDuration: number; duration: number; totalMcqs: number;
  }[];
  pollStats: {
    correctnessPercent: number; totalAnswered: number; totalCorrect: number;
    totalPolls: number; totalSeen: number;
    byQuestion: { questionId: string; questionText: string; correct: number; total: number; percent: number }[];
  };
  reactionData: {
    breakdown: Record<string, number>;
    total: number;
    timeline: any[];
  };
  engagementTimeline: { time: string; chats: number; reactions: number }[];
  studentMetrics: {
    totalStudents: number; avgActiveTime: number; sessionTemperature: number;
    sentimentCounts: Record<string, number>; totalMessages: number;
    totalHandRaises: number; avgPollsResponded: number;
  };
  students: {
    userId: number; userName: string; sentiment: string; activeTime: number;
    learningTime: number; pollsSeen: number; pollsResponded: number;
    messages: number; handRaises: number;
  }[];
}

function CircularGauge({ percent, size = 120, strokeWidth = 10 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} data-testid="gauge-correctness">
      <circle
        cx={center} cy={center} r={radius}
        fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
      />
      <circle
        cx={center} cy={center} r={radius}
        fill="none" stroke="hsl(var(--chart-1))" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
      />
      <text x={center} y={center} textAnchor="middle" dominantBaseline="central"
        className="fill-foreground text-2xl font-bold">
        {percent}%
      </text>
    </svg>
  );
}

function getTemperatureColor(temp: number) {
  if (temp >= 60) return "text-green-500";
  if (temp >= 30) return "text-yellow-500";
  return "text-blue-500";
}

function getTemperatureLabel(temp: number) {
  if (temp >= 60) return "Hot";
  if (temp >= 30) return "Warm";
  return "Cold";
}

const reactionColors: Record<string, string> = {
  loved: "hsl(0, 80%, 60%)",
  skip: "hsl(200, 70%, 55%)",
  confused: "hsl(40, 90%, 55%)",
  stronger: "hsl(140, 60%, 45%)",
  sad: "hsl(260, 60%, 55%)",
};

function getSentimentVariant(sentiment: string): "default" | "secondary" | "destructive" | "outline" {
  if (sentiment === "positive") return "default";
  if (sentiment === "negative") return "destructive";
  return "secondary";
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/70712"],
  });

  const [studentSearch, setStudentSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6" data-testid="dashboard-loading">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="dashboard-error">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-lg">Failed to load dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { session, transcripts, chats, activities, pollStats, reactionData, engagementTimeline, studentMetrics, students } = data;

  const teachingMinutes = Math.round(session.teachingTime || 0);
  const sessionMinutes = Math.round(session.sessionTime || 0);
  const teachingPercent = sessionMinutes > 0 ? Math.round((teachingMinutes / sessionMinutes) * 100) : 0;

  const filteredStudents = students.filter(s =>
    s.userName?.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const sortedStudents = [...filteredStudents].sort((a, b) =>
    sortDir === "desc" ? (b.activeTime || 0) - (a.activeTime || 0) : (a.activeTime || 0) - (b.activeTime || 0)
  );

  const reactionEntries = Object.entries(reactionData.breakdown || {});
  const totalReactions = reactionData.total || 1;

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4" data-testid="dashboard-header">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Session Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-session-time-range">
              {session.scheduledStartTime || "N/A"} - {session.scheduledEndTime || "N/A"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="badge-session-id">ID: {session.courseSessionId}</Badge>
            <Badge data-testid="badge-session-status">{session.courseSessionStatus || "Unknown"}</Badge>
          </div>
        </div>

        {/* OVERVIEW METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="overview-metrics">

          <Card data-testid="card-correctness">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Session Correctness</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <CircularGauge percent={pollStats.correctnessPercent} />
            </CardContent>
          </Card>

          <Card data-testid="card-attendance">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Attendance</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-total-students">{studentMetrics.totalStudents}</div>
              <p className="text-xs text-muted-foreground mt-1">Students joined</p>
              <div className="w-full bg-muted rounded-md h-2 mt-3">
                <div
                  className="bg-chart-1 h-2 rounded-md"
                  style={{ width: `${Math.min(studentMetrics.totalStudents * 2, 100)}%`, transition: "width 1s" }}
                  data-testid="bar-attendance"
                />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-temperature">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Session Temperature</CardTitle>
              <ThermometerSun className={`h-4 w-4 ${getTemperatureColor(studentMetrics.sessionTemperature)}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getTemperatureColor(studentMetrics.sessionTemperature)}`} data-testid="text-temperature">
                {studentMetrics.sessionTemperature}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">{getTemperatureLabel(studentMetrics.sessionTemperature)} - based on positive sentiment</p>
            </CardContent>
          </Card>

          <Card data-testid="card-teaching-time">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Teaching Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-teaching-time">{teachingMinutes}m</div>
              <p className="text-xs text-muted-foreground mt-1">of {sessionMinutes}m session</p>
              <div className="w-full bg-muted rounded-md h-2 mt-3">
                <div
                  className="bg-chart-2 h-2 rounded-md"
                  style={{ width: `${teachingPercent}%`, transition: "width 1s" }}
                  data-testid="bar-teaching-progress"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ENGAGEMENT TIMELINE */}
        <Card data-testid="card-engagement-timeline">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Engagement Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={engagementTimeline} data-testid="chart-engagement">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    color: "hsl(var(--foreground))"
                  }}
                />
                <Area type="monotone" dataKey="chats" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.4} name="Chats" />
                <Area type="monotone" dataKey="reactions" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.4} name="Reactions" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* REACTIONS + POLL PERFORMANCE */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <Card data-testid="card-reactions">
            <CardHeader>
              <CardTitle className="text-lg">Reactions Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reactionEntries.map(([emotion, count]) => {
                const pct = Math.round((count / totalReactions) * 100);
                return (
                  <div key={emotion} className="space-y-1" data-testid={`reaction-row-${emotion}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: reactionColors[emotion] || "hsl(var(--muted))" }} />
                        <span className="text-sm font-medium capitalize">{emotion}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-md h-2">
                      <div
                        className="h-2 rounded-md"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: reactionColors[emotion] || "hsl(var(--muted-foreground))",
                          transition: "width 0.8s"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {reactionEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">No reactions recorded</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-poll-performance">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-lg">Poll Performance</CardTitle>
              <Badge variant="outline" data-testid="badge-poll-overall">{pollStats.correctnessPercent}% Overall</Badge>
            </CardHeader>
            <CardContent>
              {pollStats.byQuestion.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pollStats.byQuestion} data-testid="chart-polls">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="questionId" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: "Question", position: "insideBottom", offset: -5, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        color: "hsl(var(--foreground))"
                      }}
                      formatter={(value: number) => [`${value}%`, "Correctness"]}
                    />
                    <Bar dataKey="percent" name="Correctness %" radius={[4, 4, 0, 0]}>
                      {pollStats.byQuestion.map((q, i) => (
                        <Cell key={i} fill={q.percent >= 50 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No poll data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ACTIVITY TRACKER */}
        <Card data-testid="card-activity-tracker">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Activity Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activities.map((act) => {
              const durationMin = act.duration ? Math.round(act.duration / 60) : 0;
              const plannedMin = act.plannedDuration ? Math.round(act.plannedDuration / 60) : 0;
              const durationPct = plannedMin > 0 ? Math.min(Math.round((durationMin / plannedMin) * 100), 100) : 0;

              return (
                <div key={act.activityId} className="flex flex-wrap items-center gap-4 p-3 rounded-md bg-muted/30" data-testid={`activity-row-${act.activityId}`}>
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <div className={`w-2.5 h-2.5 rounded-sm ${act.activityHappened ? "bg-green-500" : "bg-muted-foreground"}`} />
                    <Badge variant="outline" data-testid={`badge-activity-type-${act.activityId}`}>{act.activityType}</Badge>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                      <span>{durationMin}m / {plannedMin}m planned</span>
                      <span>{act.activityHappened ? "Completed" : "Not Started"}</span>
                    </div>
                    <div className="w-full bg-muted rounded-md h-2">
                      <div
                        className={`h-2 rounded-md ${act.activityHappened ? "bg-chart-2" : "bg-muted-foreground/30"}`}
                        style={{ width: `${durationPct}%`, transition: "width 0.8s" }}
                      />
                    </div>
                  </div>
                  {act.totalMcqs > 0 && (
                    <span className="text-xs text-muted-foreground">{act.totalMcqs} MCQs</span>
                  )}
                </div>
              );
            })}
            {activities.length === 0 && (
              <p className="text-sm text-muted-foreground">No activities recorded</p>
            )}
          </CardContent>
        </Card>

        {/* CHAT FEED + TRANSCRIPT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <Card data-testid="card-chat-feed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Chat Feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1" data-testid="chat-list">
                {chats.map((chat, i) => (
                  <div key={i} className="p-2 rounded-md bg-muted/30 space-y-1" dir="rtl" data-testid={`chat-message-${i}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2" dir="ltr">
                      <span className="text-sm font-medium" data-testid={`text-chat-name-${i}`}>{chat.creatorName || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-chat-time-${i}`}>
                        {chat.createdAtTs ? new Date(chat.createdAtTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <p className="text-sm" data-testid={`text-chat-message-${i}`}>{chat.messageText}</p>
                  </div>
                ))}
                {chats.length === 0 && (
                  <p className="text-sm text-muted-foreground">No chat messages</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-transcript">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Session Transcript
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1" dir="rtl" data-testid="transcript-list">
                {transcripts.map((t, i) => (
                  <div key={i} className="p-2 rounded-md bg-muted/30" data-testid={`transcript-line-${i}`}>
                    <div className="flex items-center gap-2 mb-1" dir="ltr">
                      <span className="text-xs text-muted-foreground font-mono">{t.startTime} → {t.endTime}</span>
                    </div>
                    <p className="text-sm" data-testid={`text-transcript-${i}`}>{t.text}</p>
                  </div>
                ))}
                {transcripts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No transcript available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* STUDENT LEADERBOARD */}
        <Card data-testid="card-student-leaderboard">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Student Leaderboard
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="h-9 w-48 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-student-search"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                data-testid="button-sort-toggle"
              >
                {sortDir === "desc" ? <ChevronDown /> : <ChevronUp />}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-students">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Active Time (min)</th>
                    <th className="pb-2 font-medium text-muted-foreground">Polls Responded</th>
                    <th className="pb-2 font-medium text-muted-foreground">Messages</th>
                    <th className="pb-2 font-medium text-muted-foreground">Hand Raises</th>
                    <th className="pb-2 font-medium text-muted-foreground">Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((s, idx) => (
                    <tr key={s.userId} className="border-b last:border-0" data-testid={`row-student-${s.userId}`}>
                      <td className="py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 font-medium" data-testid={`text-student-name-${s.userId}`}>{s.userName}</td>
                      <td className="py-2" data-testid={`text-student-active-${s.userId}`}>{s.activeTime ? Math.round(s.activeTime * 10) / 10 : 0}</td>
                      <td className="py-2" data-testid={`text-student-polls-${s.userId}`}>{s.pollsResponded || 0}</td>
                      <td className="py-2" data-testid={`text-student-messages-${s.userId}`}>{s.messages || 0}</td>
                      <td className="py-2" data-testid={`text-student-handraises-${s.userId}`}>{s.handRaises || 0}</td>
                      <td className="py-2">
                        <Badge variant={getSentimentVariant(s.sentiment)} className="text-xs" data-testid={`badge-sentiment-${s.userId}`}>
                          {s.sentiment || "N/A"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {sortedStudents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-muted-foreground">No students found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
