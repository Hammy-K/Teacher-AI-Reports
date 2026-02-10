import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Users, Clock, ThermometerSun, CheckCircle, BarChart3, Percent,
  ThumbsUp, AlertTriangle, BookOpen, ClipboardCheck, ChevronDown, ChevronRight, MessageSquare
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
  segments?: string[];
}

interface ExitTicketQuestion {
  questionId: string;
  questionText: string;
  seen: number;
  answered: number;
  correct: number;
  percent: number;
  insights: string[];
}

interface ExitTicketAnalysis {
  activityId: number;
  startTime: string;
  endTime: string;
  duration: number;
  plannedDuration: number;
  totalMcqs: number;
  totalStudents: number;
  studentsWhoSaw: number;
  studentsWhoAnswered: number;
  overallCorrectness: ActivityCorrectness | null;
  questions: ExitTicketQuestion[];
  teacherTalkDuring: boolean;
  teacherTalkOverlapMin: number;
  teacherTalkTopics: string;
  overallInsights: string[];
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
  exitTicketAnalysis: ExitTicketAnalysis | null;
}

function FeedbackCard({
  items,
  icon,
  title,
  testIdPrefix,
}: {
  items: FeedbackItem[];
  icon: "positive" | "negative";
  title: string;
  testIdPrefix: string;
}) {
  return (
    <Card data-testid={`card-${testIdPrefix}`}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {icon === "positive" ? (
            <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-4">
            {items.map((item, idx) => (
              <li key={idx} className="space-y-1" data-testid={`${testIdPrefix}-${idx}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{item.activity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                {item.recommended && (
                  <div className="flex items-center gap-4 text-xs mt-1 flex-wrap">
                    <span className="text-muted-foreground">Recommended: <span className="font-medium text-foreground">{item.recommended}</span></span>
                    <span className="text-muted-foreground">Actual: <span className="font-medium text-foreground">{item.actual}</span></span>
                  </div>
                )}
                {item.segments && item.segments.length > 0 && (
                  <SegmentBreakdown segments={item.segments} parentIdx={idx} prefix={testIdPrefix} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to report.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SegmentBreakdown({ segments, parentIdx, prefix }: { segments: string[]; parentIdx: number; prefix: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground mt-2 hover-elevate rounded-md px-1.5 py-0.5"
        data-testid={`toggle-segments-${prefix}-${parentIdx}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Segment breakdown ({segments.length} stretches)
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1.5 space-y-1" data-testid={`segments-${prefix}-${parentIdx}`}>
          {segments.map((seg, sIdx) => (
            <li key={sIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border">
              {seg}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/70712"],
  });
  const [questionsOpen, setQuestionsOpen] = useState(false);

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

  const { session, activities, pollStats, studentMetrics, feedback, exitTicketAnalysis } = data;

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

  const tmCategories = new Set(["time_management", "student_stage"]);
  const pedCategories = new Set(["pedagogy"]);

  const tmWentWell = feedback.wentWell.filter(i => tmCategories.has(i.category));
  const tmNeedsImprovement = feedback.needsImprovement.filter(i => tmCategories.has(i.category));

  const pedWentWell = feedback.wentWell.filter(i => pedCategories.has(i.category));
  const pedNeedsImprovement = feedback.needsImprovement.filter(i => pedCategories.has(i.category));

  const otherWentWell = feedback.wentWell.filter(i => !tmCategories.has(i.category) && !pedCategories.has(i.category));
  const otherNeedsImprovement = feedback.needsImprovement.filter(i => !tmCategories.has(i.category) && !pedCategories.has(i.category));

  const et = exitTicketAnalysis;

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <div className="max-w-5xl mx-auto p-6 space-y-8">

        <div className="space-y-1" data-testid="dashboard-header">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Session Analytics</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-session-name">
            {session.courseSessionName} — ID: {session.courseSessionId}
          </p>
        </div>

        {/* ── 1. OVERVIEW ── */}
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

        {/* ── 2. ACTIVITIES ── */}
        <Card data-testid="card-activity-table">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Activities
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
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
                          <Badge variant={group.happenedCount === group.count ? "default" : "secondary"}>
                            {group.happenedCount}/{group.count}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-duration-${group.activityType}`}>
                          {group.totalDuration > 0 ? group.totalDuration : "\u2014"}
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-planned-${group.activityType}`}>
                          {group.totalPlannedDuration > 0 ? group.totalPlannedDuration : "\u2014"}
                        </td>
                        <td className="py-3 pr-4" data-testid={`text-activity-correctness-${group.activityType}`}>
                          {correctnessPercent != null ? `${correctnessPercent}%` : "\u2014"}
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

        {/* ── 3. EXIT TICKET ── */}
        {et && (
          <div className="space-y-4" data-testid="section-exit-ticket">
            <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="heading-exit-ticket">
              <ClipboardCheck className="h-5 w-5" />
              Exit Ticket
            </h2>

            <Card data-testid="card-exit-ticket">
              <CardContent className="pt-6 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-0.5" data-testid="et-metric-questions">
                    <p className="text-xs text-muted-foreground">Questions</p>
                    <p className="text-2xl font-bold">{et.totalMcqs}</p>
                  </div>
                  <div className="space-y-0.5" data-testid="et-metric-students-answered">
                    <p className="text-xs text-muted-foreground">Students Answered</p>
                    <p className="text-2xl font-bold">{et.studentsWhoAnswered}<span className="text-sm font-normal text-muted-foreground"> / {et.totalStudents}</span></p>
                  </div>
                  <div className="space-y-0.5" data-testid="et-metric-correctness">
                    <p className="text-xs text-muted-foreground">Overall Correctness</p>
                    <p className="text-2xl font-bold">{et.overallCorrectness?.percent ?? 0}%</p>
                  </div>
                  <div className="space-y-0.5" data-testid="et-metric-duration">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-2xl font-bold">{Math.round(et.duration / 60 * 10) / 10}<span className="text-sm font-normal text-muted-foreground"> min</span></p>
                    <p className="text-xs text-muted-foreground">Planned: {Math.round(et.plannedDuration / 60 * 10) / 10} min</p>
                  </div>
                </div>

                {et.teacherTalkDuring && (
                  <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="et-teacher-talk-warning">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-destructive">Teacher was talking during Exit Ticket</p>
                      <p className="text-xs text-muted-foreground" data-testid="et-teacher-talk-detail">
                        Teacher talked for {et.teacherTalkOverlapMin} min during the exit ticket discussing: {et.teacherTalkTopics}. Students should answer independently.
                      </p>
                    </div>
                  </div>
                )}

                {et.overallInsights.length > 0 && (
                  <div className="space-y-2" data-testid="et-overall-insights">
                    <p className="text-sm font-medium">Insights</p>
                    <ul className="space-y-1.5">
                      {et.overallInsights.map((insight, iIdx) => (
                        <li key={iIdx} className="flex gap-2 text-sm text-muted-foreground" data-testid={`et-insight-${iIdx}`}>
                          <span className="flex-shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {et.questions.length > 0 && (
                  <Collapsible open={questionsOpen} onOpenChange={setQuestionsOpen}>
                    <CollapsibleTrigger
                      className="flex items-center gap-2 text-sm font-medium hover-elevate rounded-md px-2 py-1"
                      data-testid="toggle-question-breakdown"
                    >
                      {questionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Question Breakdown ({et.questions.length} questions)
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 mt-3">
                        {et.questions.map((q, qIdx) => (
                          <div key={q.questionId} className="border rounded-md p-3 space-y-2" data-testid={`et-question-card-${qIdx}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="text-sm text-muted-foreground flex-shrink-0">Q{qIdx + 1}.</span>
                                <span className="text-sm line-clamp-2" data-testid={`text-et-question-${qIdx}`}>{q.questionText}</span>
                              </div>
                              <Badge variant={q.percent >= 60 ? "default" : "secondary"} data-testid={`text-et-percent-${qIdx}`}>
                                {q.percent}%
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span data-testid={`text-et-answered-${qIdx}`}>Answered: {q.answered}/{q.seen}</span>
                              <span data-testid={`text-et-correct-${qIdx}`}>Correct: {q.correct}/{q.answered}</span>
                            </div>
                            {q.insights.length > 0 && (
                              <div className="space-y-1">
                                {q.insights.map((ins, insIdx) => (
                                  <p key={insIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border" data-testid={`et-q-insight-${qIdx}-${insIdx}`}>
                                    {ins}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── 4. TIME MANAGEMENT ── */}
        <div className="space-y-4" data-testid="section-time-management">
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="heading-time-management">
            <Clock className="h-5 w-5" />
            Time Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeedbackCard items={tmWentWell} icon="positive" title="What Went Right" testIdPrefix="tm-well" />
            <FeedbackCard items={tmNeedsImprovement} icon="negative" title="What Needs Improvement" testIdPrefix="tm-improve" />
          </div>
        </div>

        {/* ── 5. PEDAGOGY ── */}
        <div className="space-y-4" data-testid="section-pedagogy">
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="heading-pedagogy">
            <BookOpen className="h-5 w-5" />
            Pedagogy
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeedbackCard items={pedWentWell} icon="positive" title="What Went Right" testIdPrefix="ped-well" />
            <FeedbackCard items={pedNeedsImprovement} icon="negative" title="What Needs Improvement" testIdPrefix="ped-improve" />
          </div>
        </div>

        {/* ── 6. OTHER COMMENTS ── */}
        {(otherWentWell.length > 0 || otherNeedsImprovement.length > 0) && (
          <div className="space-y-4" data-testid="section-other-comments">
            <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="heading-other-comments">
              <MessageSquare className="h-5 w-5" />
              Other Comments
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeedbackCard items={otherWentWell} icon="positive" title="What Went Right" testIdPrefix="other-well" />
              <FeedbackCard items={otherNeedsImprovement} icon="negative" title="What Needs Improvement" testIdPrefix="other-improve" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
