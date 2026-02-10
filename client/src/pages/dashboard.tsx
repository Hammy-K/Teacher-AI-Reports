import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Clock, ThermometerSun, CheckCircle, BarChart3, Percent,
  ThumbsUp, AlertTriangle
} from "lucide-react";

interface ActivityCorrectness {
  answered: number;
  correct: number;
  percent: number;
}

interface FeedbackItem {
  category: string;
  activity: string;
  detail: string;
  recommended?: string;
  actual?: string;
}

interface DashboardData {
  session: {
    courseSessionId: number;
    courseSessionName: string;
    teachingTime: number;
    sessionTime: number;
    courseSessionStatus: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    sessionTemperature: number;
  };
  activities: {
    activityId: number;
    activityType: string;
    startTime: string;
    endTime: string;
    activityHappened: boolean;
    plannedDuration: number;
    duration: number;
    totalMcqs: number;
    correctness: ActivityCorrectness | null;
  }[];
  pollStats: {
    correctnessPercent: number;
  };
  studentMetrics: {
    totalStudents: number;
    sessionTemperature: number;
    sessionCompletedPercent: number;
    avgLearningTime: number;
    teachingTime: number;
  };
  feedback: {
    wentWell: FeedbackItem[];
    needsImprovement: FeedbackItem[];
  };
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/70712"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6" data-testid="dashboard-loading">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28" />)}
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

  const { session, activities, pollStats, studentMetrics, feedback } = data;

  const teachingMinutes = Math.round(session.teachingTime || 0);
  const sessionTemp = session.sessionTemperature ?? studentMetrics.sessionTemperature ?? 0;

  const totalPlanned = activities.length;
  const totalHappened = activities.filter(a => a.activityHappened).length;
  const totalNotHappened = totalPlanned - totalHappened;

  const groupedActivities = Object.values(
    activities.reduce<Record<string, {
      activityType: string;
      count: number;
      happenedCount: number;
      totalDuration: number;
      totalPlannedDuration: number;
      totalAnswered: number;
      totalCorrect: number;
    }>>((acc, act) => {
      const type = act.activityType || "UNKNOWN";
      if (!acc[type]) {
        acc[type] = { activityType: type, count: 0, happenedCount: 0, totalDuration: 0, totalPlannedDuration: 0, totalAnswered: 0, totalCorrect: 0 };
      }
      acc[type].count++;
      if (act.activityHappened) acc[type].happenedCount++;
      acc[type].totalDuration += act.duration || 0;
      acc[type].totalPlannedDuration += act.plannedDuration || 0;
      if (act.correctness) {
        acc[type].totalAnswered += act.correctness.answered;
        acc[type].totalCorrect += act.correctness.correct;
      }
      return acc;
    }, {})
  );

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <div className="max-w-5xl mx-auto p-6 space-y-8">

        <div className="space-y-1" data-testid="dashboard-header">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Session Analytics</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-session-name">
            {session.courseSessionName} — ID: {session.courseSessionId}
          </p>
        </div>

        <Card data-testid="card-overview-metrics">
          <CardHeader>
            <CardTitle className="text-lg">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">

              <div className="space-y-1" data-testid="metric-correctness">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                  <span>Session Correctness</span>
                </div>
                <p className="text-3xl font-bold" data-testid="text-correctness-value">{pollStats.correctnessPercent}%</p>
              </div>

              <div className="space-y-1" data-testid="metric-attendance">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Attendance</span>
                </div>
                <p className="text-3xl font-bold" data-testid="text-attendance-value">{studentMetrics.totalStudents}</p>
              </div>

              <div className="space-y-1" data-testid="metric-temperature">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ThermometerSun className="h-4 w-4" />
                  <span>Session Temperature</span>
                </div>
                <p className="text-3xl font-bold" data-testid="text-temperature-value">{sessionTemp}%</p>
              </div>

              <div className="space-y-1" data-testid="metric-teaching-time">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Teaching Time</span>
                </div>
                <p className="text-3xl font-bold" data-testid="text-teaching-time-value">{teachingMinutes} min</p>
              </div>

              <div className="space-y-1" data-testid="metric-session-completed">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  <span>Session Completed</span>
                </div>
                <p className="text-3xl font-bold" data-testid="text-session-completed-value">{studentMetrics.sessionCompletedPercent}%</p>
                <p className="text-xs text-muted-foreground">avg {studentMetrics.avgLearningTime} / {teachingMinutes} min</p>
              </div>

            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-activity-table">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Activities
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant="outline" data-testid="badge-total-planned">Planned: {totalPlanned}</Badge>
              <Badge variant="outline" data-testid="badge-total-happened">Happened: {totalHappened}</Badge>
              <Badge variant="outline" data-testid="badge-total-not-happened">Not Happened: {totalNotHappened}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-activities">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">#</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Activity Type</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Happened</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Duration (sec)</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Planned (sec)</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Correctness %</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedActivities.map((group, idx) => {
                    const correctnessPercent = group.totalAnswered > 0
                      ? Math.round((group.totalCorrect / group.totalAnswered) * 100)
                      : null;
                    return (
                      <tr key={group.activityType} className="border-b last:border-0" data-testid={`row-activity-${group.activityType}`}>
                        <td className="py-3 pr-4 text-muted-foreground">{idx + 1}</td>
                        <td className="py-3 pr-4 font-medium" data-testid={`text-activity-type-${group.activityType}`}>
                          {group.activityType}
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-happened-${group.activityType}`}>
                          <Badge variant={group.happenedCount === group.count ? "default" : group.happenedCount > 0 ? "secondary" : "secondary"}>
                            {group.happenedCount}/{group.count}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-duration-${group.activityType}`}>
                          {group.totalDuration > 0 ? group.totalDuration : "—"}
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-planned-${group.activityType}`}>
                          {group.totalPlannedDuration > 0 ? group.totalPlannedDuration : "—"}
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-correctness-${group.activityType}`}>
                          {correctnessPercent != null ? `${correctnessPercent}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {groupedActivities.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">No activities found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <Card data-testid="card-went-well">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                What Went Well
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedback.wentWell.length > 0 ? (
                <div className="space-y-4">
                  {feedback.wentWell.map((item, idx) => (
                    <div key={idx} className="space-y-1" data-testid={`feedback-well-${idx}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" data-testid={`badge-well-activity-${idx}`}>{item.activity}</Badge>
                        <Badge variant="secondary">{item.category === "time_management" ? "Time Management" : "Teaching Method"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-well-detail-${idx}`}>{item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No positive feedback items identified.</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-needs-improvement">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                What Needs Improvement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedback.needsImprovement.length > 0 ? (
                <div className="space-y-4">
                  {feedback.needsImprovement.map((item, idx) => (
                    <div key={idx} className="space-y-1" data-testid={`feedback-improve-${idx}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" data-testid={`badge-improve-activity-${idx}`}>{item.activity}</Badge>
                        <Badge variant="secondary">{item.category === "time_management" ? "Time Management" : "Teaching Method"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-improve-detail-${idx}`}>{item.detail}</p>
                      {item.recommended && (
                        <div className="flex items-center gap-4 text-xs mt-1">
                          <span className="text-muted-foreground">Recommended: <span className="font-medium text-foreground">{item.recommended}</span></span>
                          <span className="text-muted-foreground">Actual: <span className="font-medium text-foreground">{item.actual}</span></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No improvement areas identified.</p>
              )}
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}
