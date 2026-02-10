import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Users, Clock, ThermometerSun, CheckCircle, BarChart3, Percent,
  ThumbsUp, AlertTriangle, BookOpen, ClipboardCheck, ChevronDown, ChevronRight,
  ListChecks, UsersRound, Target, Timer, Lightbulb, MessageSquare, GraduationCap
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
  activityId?: number;
  recommended?: string;
  actual?: string;
  segments?: string[];
}

interface QuestionAnalysis {
  questionId: string;
  questionText: string;
  seen: number;
  answered: number;
  correct: number;
  percent: number;
  insights: string[];
}

interface CombinedAnalysis {
  activityIds: number[];
  count: number;
  totalQuestions: number;
  avgCorrectness: number;
  avgStudentsAnswered: number;
  totalStudents: number;
  durationMin: number;
  plannedDurationMin: number;
  questions: QuestionAnalysis[];
  insights: string[];
  feedback: {
    wentWell: FeedbackItem[];
    needsImprovement: FeedbackItem[];
  };
}

interface ActivityInstance {
  activityId: number;
  activityType: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  plannedDurationMin: number;
  totalMcqs: number;
  totalStudents: number;
  studentsWhoSaw: number;
  studentsWhoAnswered: number;
  overallCorrectness: ActivityCorrectness | null;
  questions: QuestionAnalysis[];
  teacherTalkDuring: boolean;
  teacherTalkOverlapMin: number;
  teacherTalkTopics: string;
  overallInsights: string[];
  feedback: {
    wentWell: FeedbackItem[];
    needsImprovement: FeedbackItem[];
  };
}

interface ActivityAnalysis {
  activityType: string;
  label: string;
  sortOrder: number;
  combined: CombinedAnalysis | null;
  instances: ActivityInstance[];
}

interface DashboardData {
  session: {
    courseSessionId: number;
    courseSessionName: string;
    teacherName: string;
    topic: string;
    level: string;
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
    plannedDurationMin: number;
    durationMin: number;
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
  activityAnalyses: ActivityAnalysis[];
}

function CorrectnessBar({ percent }: { percent: number }) {
  const color = percent >= 75 ? "bg-emerald-500 dark:bg-emerald-400"
    : percent >= 50 ? "bg-amber-500 dark:bg-amber-400"
    : "bg-red-500 dark:bg-red-400";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{percent}%</span>
    </div>
  );
}

function MetricTile({ icon, label, value, sub, testId }: { icon: React.ReactNode; label: string; value: string; sub?: string; testId: string }) {
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function InsightsList({ insights, prefix }: { insights: string[]; prefix: string }) {
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md bg-muted/40 dark:bg-muted/20 p-3" data-testid={`${prefix}-insights`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lightbulb className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        <span>Insights</span>
      </div>
      <ul className="space-y-1.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground" data-testid={`${prefix}-insight-${i}`}>
            <span className="flex-shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500/50 dark:bg-amber-400/50" />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionBreakdown({ questions, prefix }: { questions: QuestionAnalysis[]; prefix: string }) {
  const [open, setOpen] = useState(false);
  if (questions.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-2 text-sm font-medium hover-elevate rounded-md px-2 py-1.5"
        data-testid={`${prefix}-toggle-questions`}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Question Breakdown ({questions.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-3">
          {questions.map((q, qIdx) => (
            <div key={q.questionId} className="rounded-md border p-3 space-y-2" data-testid={`${prefix}-q-${qIdx}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0 mt-0.5">Q{qIdx + 1}</span>
                  <span className="text-sm leading-snug" data-testid={`${prefix}-q-text-${qIdx}`}>{q.questionText}</span>
                </div>
              </div>
              <CorrectnessBar percent={q.percent} />
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Answered: {q.answered}/{q.seen}</span>
                <span>Correct: {q.correct}/{q.answered}</span>
              </div>
              {q.insights.length > 0 && (
                <div className="space-y-1 pt-1">
                  {q.insights.map((ins, insIdx) => (
                    <p key={insIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">
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
  );
}

function FeedbackInline({ feedback, prefix }: { feedback: { wentWell: FeedbackItem[]; needsImprovement: FeedbackItem[] }; prefix: string }) {
  const hasWell = feedback.wentWell.length > 0;
  const hasImprove = feedback.needsImprovement.length > 0;
  if (!hasWell && !hasImprove) return null;

  return (
    <div className="space-y-3 pt-3 border-t" data-testid={`${prefix}-feedback`}>
      <p className="text-sm font-medium">Comments</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasWell && (
          <div className="space-y-2.5 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">What Went Right</span>
            </div>
            <ul className="space-y-2.5">
              {feedback.wentWell.map((item, idx) => (
                <li key={idx} className="space-y-1" data-testid={`${prefix}-fb-well-${idx}`}>
                  <Badge variant="secondary" className="text-xs">{formatCategory(item.category)}</Badge>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasImprove && (
          <div className="space-y-2.5 rounded-md bg-amber-50/50 dark:bg-amber-950/20 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">Needs Improvement</span>
            </div>
            <ul className="space-y-2.5">
              {feedback.needsImprovement.map((item, idx) => (
                <li key={idx} className="space-y-1" data-testid={`${prefix}-fb-improve-${idx}`}>
                  <Badge variant="secondary" className="text-xs">{formatCategory(item.category)}</Badge>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                  {item.recommended && (
                    <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <Target className="h-3 w-3" /> {item.recommended}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <Timer className="h-3 w-3" /> {item.actual}
                      </span>
                    </div>
                  )}
                  {item.segments && item.segments.length > 0 && (
                    <SegmentBreakdown segments={item.segments} parentIdx={idx} prefix={`${prefix}-fb`} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentBreakdown({ segments, parentIdx, prefix }: { segments: string[]; parentIdx: number; prefix: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground mt-1 hover-elevate rounded-md px-1.5 py-0.5"
        data-testid={`toggle-segments-${prefix}-${parentIdx}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details ({segments.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1.5 space-y-1">
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

function formatCategory(cat: string): string {
  if (cat === "time_management") return "Time Management";
  if (cat === "student_stage") return "Student Stage";
  if (cat === "pedagogy") return "Pedagogy";
  return cat;
}

function SectionHeading({ icon, title, badge, testId }: { icon: React.ReactNode; title: string; badge?: string; testId: string }) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 dark:bg-primary/20 text-primary">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
    </div>
  );
}

function CombinedSectionCheckBlock({ combined, prefix }: { combined: CombinedAnalysis; prefix: string }) {
  return (
    <Card data-testid={`card-${prefix}`}>
      <CardContent className="pt-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <MetricTile
            icon={<ListChecks className="h-3.5 w-3.5" />}
            label="Total Questions"
            value={String(combined.totalQuestions)}
            sub={`across ${combined.count} checks`}
            testId={`${prefix}-metric-questions`}
          />
          <MetricTile
            icon={<Users className="h-3.5 w-3.5" />}
            label="Avg. Students Answered"
            value={`${combined.avgStudentsAnswered} / ${combined.totalStudents}`}
            testId={`${prefix}-metric-students`}
          />
          <MetricTile
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Avg. Correctness"
            value={`${combined.avgCorrectness}%`}
            testId={`${prefix}-metric-correctness`}
          />
          <MetricTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Total Duration"
            value={`${combined.durationMin} min`}
            sub={combined.plannedDurationMin > 0 ? `Planned: ${combined.plannedDurationMin} min` : undefined}
            testId={`${prefix}-metric-duration`}
          />
        </div>

        <CorrectnessBar percent={combined.avgCorrectness} />

        <InsightsList insights={combined.insights} prefix={prefix} />

        <QuestionBreakdown questions={combined.questions} prefix={prefix} />

        <FeedbackInline feedback={combined.feedback} prefix={prefix} />
      </CardContent>
    </Card>
  );
}

function SingleActivityBlock({ instance: inst, prefix }: { instance: ActivityInstance; prefix: string }) {
  return (
    <Card data-testid={`card-${prefix}`}>
      <CardContent className="pt-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <MetricTile
            icon={<ListChecks className="h-3.5 w-3.5" />}
            label="Questions"
            value={String(inst.totalMcqs)}
            testId={`${prefix}-metric-questions`}
          />
          <MetricTile
            icon={<Users className="h-3.5 w-3.5" />}
            label="Students Answered"
            value={`${inst.studentsWhoAnswered} / ${inst.totalStudents}`}
            testId={`${prefix}-metric-students`}
          />
          <MetricTile
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Overall Correctness"
            value={`${inst.overallCorrectness?.percent ?? 0}%`}
            testId={`${prefix}-metric-correctness`}
          />
          <MetricTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Duration"
            value={`${inst.durationMin} min`}
            sub={inst.plannedDurationMin > 0 ? `Planned: ${inst.plannedDurationMin} min` : undefined}
            testId={`${prefix}-metric-duration`}
          />
        </div>

        <CorrectnessBar percent={inst.overallCorrectness?.percent ?? 0} />

        {inst.teacherTalkDuring && inst.activityType === 'EXIT_TICKET' && (
          <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid={`${prefix}-teacher-talk-warning`}>
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">Teacher was talking during Exit Ticket</p>
              <p className="text-xs text-muted-foreground">
                Talked for {inst.teacherTalkOverlapMin} min discussing: {inst.teacherTalkTopics}. Students should answer independently.
              </p>
            </div>
          </div>
        )}

        <InsightsList insights={inst.overallInsights} prefix={prefix} />

        <QuestionBreakdown questions={inst.questions} prefix={prefix} />

        <FeedbackInline feedback={inst.feedback} prefix={prefix} />
      </CardContent>
    </Card>
  );
}

function ActivitySection({ analysis }: { analysis: ActivityAnalysis }) {
  const iconMap: Record<string, React.ReactNode> = {
    SECTION_CHECK: <ListChecks className="h-4 w-4" />,
    TEAM_EXERCISE: <UsersRound className="h-4 w-4" />,
    EXIT_TICKET: <ClipboardCheck className="h-4 w-4" />,
  };
  const icon = iconMap[analysis.activityType] || <BarChart3 className="h-4 w-4" />;
  const typeKey = analysis.activityType.toLowerCase();

  return (
    <div className="space-y-3" data-testid={`section-${typeKey}`}>
      <SectionHeading
        icon={icon}
        title={analysis.label}
        testId={`heading-${typeKey}`}
      />

      {analysis.combined ? (
        <CombinedSectionCheckBlock combined={analysis.combined} prefix={typeKey} />
      ) : (
        analysis.instances.map((inst, idx) => (
          <SingleActivityBlock key={inst.activityId} instance={inst} prefix={`${typeKey}-${idx}`} />
        ))
      )}
    </div>
  );
}

function PedagogySection({ items, prefix, title, icon }: { items: { wentWell: FeedbackItem[]; needsImprovement: FeedbackItem[] }; prefix: string; title: string; icon: React.ReactNode }) {
  const hasWell = items.wentWell.length > 0;
  const hasImprove = items.needsImprovement.length > 0;
  if (!hasWell && !hasImprove) return null;

  return (
    <div className="space-y-3" data-testid={`section-${prefix}`}>
      <SectionHeading icon={icon} title={title} testId={`heading-${prefix}`} />
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasWell && (
              <div className="space-y-2.5 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium">What Went Right</span>
                </div>
                <ul className="space-y-3">
                  {items.wentWell.map((item, idx) => (
                    <li key={idx} className="space-y-1" data-testid={`${prefix}-well-${idx}`}>
                      <Badge variant="outline">{item.activity}</Badge>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasImprove && (
              <div className="space-y-2.5 rounded-md bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium">Needs Improvement</span>
                </div>
                <ul className="space-y-3">
                  {items.needsImprovement.map((item, idx) => (
                    <li key={idx} className="space-y-1" data-testid={`${prefix}-improve-${idx}`}>
                      <Badge variant="outline">{item.activity}</Badge>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                      {item.recommended && (
                        <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <Target className="h-3 w-3" /> {item.recommended}
                          </span>
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                            <Timer className="h-3 w-3" /> {item.actual}
                          </span>
                        </div>
                      )}
                      {item.segments && item.segments.length > 0 && (
                        <SegmentBreakdown segments={item.segments} parentIdx={idx} prefix={`${prefix}-fb`} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/70712"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6" data-testid="dashboard-loading">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-48 w-full" />
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

  const { session, activities, pollStats, studentMetrics, feedback, activityAnalyses } = data;

  const teachingMinutes = Math.round(session.teachingTime || 0);
  const sessionTemp = session.sessionTemperature ?? studentMetrics.sessionTemperature ?? 0;

  const totalPlanned = activities.length;
  const totalHappened = activities.filter(a => a.activityHappened).length;

  const groupedActivities = Object.values(
    activities.reduce<Record<string, {
      activityType: string;
      count: number;
      happenedCount: number;
      totalDurationMin: number;
      totalPlannedDurationMin: number;
      totalAnswered: number;
      totalCorrect: number;
    }>>((acc, act) => {
      const type = act.activityType || "UNKNOWN";
      if (!acc[type]) {
        acc[type] = { activityType: type, count: 0, happenedCount: 0, totalDurationMin: 0, totalPlannedDurationMin: 0, totalAnswered: 0, totalCorrect: 0 };
      }
      acc[type].count++;
      if (act.activityHappened) acc[type].happenedCount++;
      acc[type].totalDurationMin += act.durationMin || 0;
      acc[type].totalPlannedDurationMin += act.plannedDurationMin || 0;
      if (act.correctness) {
        acc[type].totalAnswered += act.correctness.answered;
        acc[type].totalCorrect += act.correctness.correct;
      }
      return acc;
    }, {})
  );

  const analyzedActivityIds = new Set<number>();
  for (const a of activityAnalyses) {
    if (a.combined) {
      for (const id of a.combined.activityIds) analyzedActivityIds.add(id);
      for (const f of a.combined.feedback.wentWell) if (f.activityId) analyzedActivityIds.add(f.activityId);
      for (const f of a.combined.feedback.needsImprovement) if (f.activityId) analyzedActivityIds.add(f.activityId);
    }
    for (const inst of a.instances) {
      analyzedActivityIds.add(inst.activityId);
      for (const f of inst.feedback.wentWell) if (f.activityId) analyzedActivityIds.add(f.activityId);
      for (const f of inst.feedback.needsImprovement) if (f.activityId) analyzedActivityIds.add(f.activityId);
    }
  }

  const pedWentWell = feedback.wentWell.filter(i => i.category === "pedagogy" && !i.activityId);
  const pedNeedsImprovement = feedback.needsImprovement.filter(i => i.category === "pedagogy" && !i.activityId);

  const tmCategories = new Set(["time_management", "student_stage"]);
  const tmWentWell = feedback.wentWell.filter(i => tmCategories.has(i.category) && !analyzedActivityIds.has(i.activityId!));
  const tmNeedsImprovement = feedback.needsImprovement.filter(i => tmCategories.has(i.category) && !analyzedActivityIds.has(i.activityId!));

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        <div className="rounded-md bg-[hsl(43,55%,70%)]/15 dark:bg-[hsl(43,40%,30%)]/20 border border-[hsl(43,55%,70%)]/30 dark:border-[hsl(43,40%,40%)]/30 p-5 space-y-3" data-testid="dashboard-header">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/15 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Session Report</h1>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div data-testid="text-session-id">
              <span className="text-muted-foreground">Session ID:</span>{" "}
              <span className="font-medium">{session.courseSessionId}</span>
            </div>
            <div data-testid="text-teacher-name">
              <span className="text-muted-foreground">Teacher:</span>{" "}
              <span className="font-medium">{session.teacherName}</span>
            </div>
            <div data-testid="text-level">
              <span className="text-muted-foreground">Level:</span>{" "}
              <span className="font-medium">{session.level || 'N/A'}</span>
            </div>
            <div data-testid="text-topic">
              <span className="text-muted-foreground">Topic:</span>{" "}
              <span className="font-medium">{session.topic}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeading
            icon={<BarChart3 className="h-4 w-4" />}
            title="Session Summary"
            testId="heading-session-summary"
          />
          <Card data-testid="card-session-summary">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                <MetricTile
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Attendance"
                  value={String(studentMetrics.totalStudents)}
                  testId="metric-attendance"
                />
                <MetricTile
                  icon={<CheckCircle className="h-3.5 w-3.5" />}
                  label="Session Correctness"
                  value={`${pollStats.correctnessPercent}%`}
                  testId="metric-correctness"
                />
                <MetricTile
                  icon={<ThermometerSun className="h-3.5 w-3.5" />}
                  label="Temperature"
                  value={`${sessionTemp}%`}
                  testId="metric-temperature"
                />
                <MetricTile
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Teaching Time"
                  value={`${teachingMinutes} min`}
                  testId="metric-teaching-time"
                />
                <MetricTile
                  icon={<Percent className="h-3.5 w-3.5" />}
                  label="Session Completed"
                  value={`${studentMetrics.sessionCompletedPercent}%`}
                  sub={`avg ${studentMetrics.avgLearningTime} / ${teachingMinutes} min`}
                  testId="metric-session-completed"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3" data-testid="section-activities-table">
          <SectionHeading
            icon={<BarChart3 className="h-4 w-4" />}
            title="Activities"
            badge={`${totalHappened}/${totalPlanned} completed`}
            testId="heading-activities"
          />
          <Card data-testid="card-activity-table">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-activities">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Activity Type</th>
                      <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Completed</th>
                      <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Duration</th>
                      <th className="pb-3 text-right font-medium text-muted-foreground">Correctness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedActivities.map((group) => {
                      const correctnessPercent = group.totalAnswered > 0
                        ? Math.round((group.totalCorrect / group.totalAnswered) * 100)
                        : null;
                      const durationRound = Math.round(group.totalDurationMin * 10) / 10;
                      return (
                        <tr key={group.activityType} className="border-b last:border-0" data-testid={`row-activity-${group.activityType}`}>
                          <td className="py-3 pr-4 font-medium">{group.activityType}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={group.happenedCount === group.count ? "default" : "secondary"}>
                              {group.happenedCount}/{group.count}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {durationRound > 0 ? `${durationRound} min` : "\u2014"}
                          </td>
                          <td className="py-3 text-right">
                            {correctnessPercent != null ? (
                              <span className="tabular-nums">{correctnessPercent}%</span>
                            ) : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                    {groupedActivities.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground">No activities found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {activityAnalyses.map((analysis) => (
          <ActivitySection key={analysis.activityType} analysis={analysis} />
        ))}

        {(tmWentWell.length > 0 || tmNeedsImprovement.length > 0) && (
          <PedagogySection
            items={{ wentWell: tmWentWell, needsImprovement: tmNeedsImprovement }}
            prefix="time-management"
            title="Time Management"
            icon={<Clock className="h-4 w-4" />}
          />
        )}

        <PedagogySection
          items={{ wentWell: pedWentWell, needsImprovement: pedNeedsImprovement }}
          prefix="other-comments"
          title="Other Comments"
          icon={<MessageSquare className="h-4 w-4" />}
        />

      </div>
    </div>
  );
}
