import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Users, Clock, ThermometerSun, CheckCircle, BarChart3, Percent,
  ThumbsUp, AlertTriangle, BookOpen, ClipboardCheck, ChevronDown, ChevronLeft, ChevronRight,
  ListChecks, UsersRound, Target, Timer, Lightbulb, MessageSquare, GraduationCap,
  ShieldCheck, Star, ArrowRight, Eye, HelpCircle, TrendingUp, TrendingDown,
  Sparkles, Search, Quote, Heart, Mic, Award, SmilePlus, Volume2
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

interface TranscriptEvidence {
  timestamp: string;
  text: string;
}

interface ExplanationQuality {
  review: string;
  suggestedApproach: string;
  whatTeacherSaid: string;
  conceptAlignment: 'aligned' | 'partial' | 'misaligned' | 'no_explanation';
}

interface QuestionAnalysis {
  questionId: string;
  questionText: string;
  seen: number;
  answered: number;
  correct: number;
  percent: number;
  insights: string[];
  teacherExplanationMin?: number;
  teacherExplanationTopic?: string;
  teacherExplanationVerdict?: string;
  transcriptEvidence?: TranscriptEvidence[];
  pedagogicalAnalysis?: {
    clarityScore: number;
    techniques: string[];
    missingTechniques: string[];
    communicationTone?: string;
  };
  explanationQuality?: ExplanationQuality;
  confusionMoments?: { timestamp: string; messages: string[] }[];
  transcriptDuringActivity?: TranscriptEvidence[];
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
  qaEvaluation: {
    criteria: {
      id: number;
      nameAr: string;
      nameEn: string;
      score: number;
      evidence: string[];
      comments: string[];
      recommendations: string[];
      notes: string;
    }[];
    overallScore: number;
    activityTimeline: {
      activityId: number;
      activityType: string;
      label: string;
      startTime: string;
      endTime: string;
      correctPercent: number;
      preTeaching: { durationMin: number; topics: string; sampleText: string };
      duringTeaching: { teacherTalking: boolean; durationMin: number; topics: string };
      postTeaching: { durationMin: number; topics: string };
      studentChatsDuring: number;
      confusionDetected: boolean;
      confusionExamples: string[];
      insights: string[];
    }[];
    executiveSummary?: {
      overallScore: number;
      overallVerdict: string;
      strengths: { text: string; evidence?: string }[];
      concerns: { text: string; evidence?: string }[];
      strongCriteria: string[];
      weakCriteria: string[];
      keyMetrics: {
        totalStudents: number;
        totalQuestions: number;
        overallCorrectness: number;
        responseRate: number;
        sessionTemperature: number;
        teacherTalkMin: number;
        studentActivePercent: number;
        activitiesCompleted: string;
      };
    };
    transcriptAnalysis?: {
      teachingClarity: {
        timestamp: string;
        durationMin: number;
        concept: string;
        behaviors: string[];
        clarityScore: number;
        impact: string;
        evidence: string;
      }[];
      questioningAnalysis: {
        openEnded: number;
        closed: number;
        prompts: number;
        rhetorical: number;
        total: number;
        insight: string;
        examples: { type: string; text: string }[];
      };
      confusionMoments: {
        timestamp: string;
        concept: string;
        signalCount: number;
        messages: string[];
        teacherResponse: string;
        riskLevel: string;
        riskAssessment: string;
      }[];
      teachingPatterns: {
        pattern: string;
        occurrences: number;
        details: string[];
        impact: string;
        recommendation: string;
      }[];
    };
    teacherCommunication?: {
      explanationReviews: {
        timestamp: string;
        durationMin: number;
        concept: string;
        strengths: string[];
        improvements: string[];
        evidence: string;
        impactPrediction: string;
      }[];
      toneAnalysis: {
        frequency: number;
        durationMin: number;
        rating: string;
        strengths: string[];
        improvements: string[];
        examples: { timestamp: string; text: string }[];
        studentImpact: string;
      };
      reinforcementAnalysis: {
        totalCount: number;
        distribution: {
          praiseForCorrectness: number;
          effortEncouragement: number;
          motivationBeforeTasks: number;
          recoveryAfterMistakes: number;
        };
        strengths: string[];
        improvements: string[];
        outcomeLink: string;
      };
      communicationPatterns: {
        pattern: string;
        occurrences: number;
        strengths: string;
        growth: string;
        evidence: string;
      }[];
      communicationScore: {
        score: number;
        rating: string;
        justification: string;
        breakdown: {
          explanationClarity: number;
          encouragementFrequency: number;
          reinforcementBalance: number;
          engagementCorrelation: number;
        };
      };
    };
    correctnessDistribution?: {
      below40: { count: number; avgPostExplanationMin: number };
      between40and70: { count: number; avgPostExplanationMin: number };
      above70: { count: number; avgPostExplanationMin: number };
      total: number;
    };
    instructionalTimeAnalysis?: {
      sessionDurationMin: number;
      teacherTalkMin: number;
      teacherTalkPercent: number;
      studentActivityMin: number;
      studentActivityPercent: number;
    };
    positiveTeachingMoments?: {
      type: string;
      description: string;
      timestamp: string;
      quote?: string;
    }[];
    summary: {
      totalStudents: number;
      totalQuestions: number;
      overallCorrectness: number;
      responseRate: number;
      sessionTemperature: number;
      teachingTimeMin: number;
      teacherTalkMin: number;
      studentActivePercent: number;
      activitiesCompleted: string;
      chatParticipation: string;
    };
  };
}

function ScoreStars({ score }: { score: number }) {
  const fullStars = Math.floor(score);
  const hasHalf = score % 1 >= 0.5;
  return (
    <div className="flex items-center gap-0.5" data-testid="score-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < fullStars
              ? "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
              : i === fullStars && hasHalf
              ? "fill-amber-500/50 text-amber-500 dark:fill-amber-400/50 dark:text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
      <span className="ml-1.5 text-sm font-semibold tabular-nums">{score}/5</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 4
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
    : score >= 3
    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  const label = score >= 4 ? "Excellent" : score >= 3 ? "Acceptable" : "Needs Improvement";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`} data-testid="score-badge">
      {label}
    </span>
  );
}

function ExecutiveSummarySection({ summary }: { summary: NonNullable<DashboardData["qaEvaluation"]["executiveSummary"]> }) {
  const verdictColor = summary.overallScore >= 4
    ? "text-emerald-700 dark:text-emerald-400"
    : summary.overallScore >= 3
    ? "text-amber-700 dark:text-amber-400"
    : "text-red-700 dark:text-red-400";

  return (
    <div className="space-y-3" data-testid="section-executive-summary">
      <SectionHeading
        icon={<Sparkles className="h-4 w-4" />}
        title="Executive Summary"
        badge={`${summary.overallScore}/5`}
        testId="heading-executive-summary"
      />
      <Card data-testid="card-executive-summary">
        <CardContent className="pt-6 space-y-5">
          <div className="flex items-center gap-3">
            <ScoreStars score={summary.overallScore} />
            <span className={`text-sm font-semibold ${verdictColor}`}>{summary.overallVerdict}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-md bg-muted/50 dark:bg-muted/20">
              <p className="text-lg font-bold tabular-nums" data-testid="metric-students">{summary.keyMetrics.totalStudents}</p>
              <p className="text-xs text-muted-foreground">Students</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50 dark:bg-muted/20">
              <p className="text-lg font-bold tabular-nums" data-testid="metric-correctness">{summary.keyMetrics.overallCorrectness}%</p>
              <p className="text-xs text-muted-foreground">Correctness</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50 dark:bg-muted/20">
              <p className="text-lg font-bold tabular-nums" data-testid="metric-teacher-talk">{summary.keyMetrics.teacherTalkMin}m</p>
              <p className="text-xs text-muted-foreground">Teacher Talk</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50 dark:bg-muted/20">
              <p className="text-lg font-bold tabular-nums" data-testid="metric-activities">{summary.keyMetrics.activitiesCompleted}</p>
              <p className="text-xs text-muted-foreground">Activities</p>
            </div>
          </div>

          {summary.strengths.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Strengths
              </p>
              <ul className="space-y-1.5">
                {summary.strengths.map((s, i) => (
                  <li key={i} className="text-sm" data-testid={`strength-${i}`}>
                    <span>{s.text}</span>
                    {s.evidence && (
                      <span className="block text-xs text-muted-foreground mt-0.5 pl-3 border-l-2 border-emerald-200 dark:border-emerald-800">{s.evidence}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.concerns.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Concerns
              </p>
              <ul className="space-y-1.5">
                {summary.concerns.map((c, i) => (
                  <li key={i} className="text-sm" data-testid={`concern-${i}`}>
                    <span>{c.text}</span>
                    {c.evidence && (
                      <span className="block text-xs text-muted-foreground mt-0.5 pl-3 border-l-2 border-amber-200 dark:border-amber-800">{c.evidence}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(summary.strongCriteria.length > 0 || summary.weakCriteria.length > 0) && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t">
              {summary.strongCriteria.map((c, i) => (
                <Badge key={`s-${i}`} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate">{c}</Badge>
              ))}
              {summary.weakCriteria.map((c, i) => (
                <Badge key={`w-${i}`} className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">{c}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QAEvaluationSection({ evaluation }: { evaluation: DashboardData["qaEvaluation"] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-3" data-testid="section-qa-evaluation">
      <SectionHeading
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Session Quality Evaluation"
        badge={`${evaluation.overallScore}/5`}
        testId="heading-qa-evaluation"
      />

      <Card data-testid="card-qa-summary">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary/10 dark:bg-primary/20 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Evaluation</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold tabular-nums" data-testid="text-overall-score">{evaluation.overallScore}</span>
                  <span className="text-lg text-muted-foreground">/5</span>
                  <ScoreBadge score={evaluation.overallScore} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm flex-1">
              <div><span className="text-muted-foreground">Questions:</span> <span className="font-medium">{evaluation.summary.totalQuestions}</span></div>
              <div><span className="text-muted-foreground">Teacher Talk:</span> <span className="font-medium">{evaluation.summary.teacherTalkMin} min</span></div>
              <div><span className="text-muted-foreground">Student Activity:</span> <span className="font-medium">{evaluation.summary.studentActivePercent}%</span></div>
            </div>
          </div>

          <div className="space-y-1">
            {evaluation.criteria.map((criterion) => (
              <Collapsible
                key={criterion.id}
                open={expandedId === criterion.id}
                onOpenChange={(open) => setExpandedId(open ? criterion.id : null)}
              >
                <CollapsibleTrigger
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-md hover-elevate"
                  data-testid={`qa-criterion-${criterion.id}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {expandedId === criterion.id ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                    <span className="text-sm font-medium tabular-nums text-muted-foreground w-5">{criterion.id}.</span>
                    <span className="text-sm font-medium truncate">{criterion.nameEn}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ScoreBadge score={criterion.score} />
                    <ScoreStars score={criterion.score} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-9 mr-3 mb-3 mt-1 space-y-3 rounded-md border p-3" data-testid={`qa-detail-${criterion.id}`}>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Indicators</p>
                      <ul className="space-y-1">
                        {criterion.evidence.map((e, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="flex-shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50" />
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {criterion.comments && criterion.comments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcript Observations</p>
                        <ul className="space-y-1.5">
                          {criterion.comments.map((c, i) => (
                            <li key={i} className="text-sm bg-muted/50 dark:bg-muted/20 rounded-md px-3 py-2">
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {criterion.recommendations.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recommendations</p>
                        <ul className="space-y-1">
                          {criterion.recommendations.map((r, i) => (
                            <li key={i} className="flex gap-2 text-sm">
                              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground border-t pt-2">{criterion.notes}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </CardContent>
      </Card>

      {evaluation.activityTimeline && evaluation.activityTimeline.length > 0 && (
        <Card data-testid="card-activity-timeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Transcript-Activity Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">What the teacher was teaching before, during, and after each activity — cross-referenced with student results.</p>
            {evaluation.activityTimeline.map((atl, idx) => {
              const corrColor = atl.correctPercent >= 75 ? "text-emerald-600 dark:text-emerald-400"
                : atl.correctPercent >= 50 ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400";
              return (
                <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`timeline-activity-${idx}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" data-testid={`badge-activity-type-${idx}`}>{atl.label}</Badge>
                      <span className="text-xs text-muted-foreground">{atl.startTime} – {atl.endTime}</span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${corrColor}`} data-testid={`text-activity-correct-${idx}`}>{atl.correctPercent}% correct</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2">
                      <span className="text-muted-foreground">Before:</span>{' '}
                      <span className="font-medium">{atl.preTeaching.durationMin} min</span>{' '}
                      <span>on "{atl.preTeaching.topics}"</span>
                    </div>
                    <div className="bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2">
                      <span className="text-muted-foreground">During:</span>{' '}
                      {atl.duringTeaching.teacherTalking
                        ? <span className="font-medium text-amber-600 dark:text-amber-400">{atl.duringTeaching.durationMin} min talking on "{atl.duringTeaching.topics}"</span>
                        : <span className="text-emerald-600 dark:text-emerald-400">No teacher talk</span>
                      }
                    </div>
                    <div className="bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2">
                      <span className="text-muted-foreground">After:</span>{' '}
                      <span className="font-medium">{atl.postTeaching.durationMin} min</span>{' '}
                      {atl.postTeaching.topics !== 'General teaching' && <span>on "{atl.postTeaching.topics}"</span>}
                    </div>
                  </div>
                  {atl.confusionDetected && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span>Student confusion detected: {atl.confusionExamples.join('; ')}</span>
                    </div>
                  )}
                  <ul className="space-y-1">
                    {atl.insights.map((ins, j) => (
                      <li key={j} className="flex gap-2 text-xs">
                        <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary/70" />
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

    </div>
  );
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
        <span>Observations</span>
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

function AlignmentIndicator({ alignment }: { alignment: string }) {
  const config: Record<string, { label: string; color: string }> = {
    aligned: { label: 'Aligned', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    partial: { label: 'Partially Aligned', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    misaligned: { label: 'Misaligned', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    no_explanation: { label: 'No Explanation', color: 'bg-muted text-muted-foreground' },
  };
  const c = config[alignment] || config.no_explanation;
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.color}`} data-testid="alignment-indicator">{c.label}</span>;
}

function QuestionBreakdown({ questions, prefix }: { questions: QuestionAnalysis[]; prefix: string }) {
  if (questions.length === 0) return null;
  return (
    <div className="space-y-2" data-testid={`${prefix}-questions`}>
      <p className="text-sm font-medium flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" />
        Question Breakdown ({questions.length})
      </p>
      <div className="space-y-3">
        {questions.map((q, qIdx) => {
          const eq = q.explanationQuality;
          const showCoaching = q.percent < 70 && eq;

          return (
            <div key={q.questionId} className="rounded-md border p-3 space-y-2.5" data-testid={`${prefix}-q-${qIdx}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0 mt-0.5">Q{qIdx + 1}</span>
                  <span className="text-sm leading-snug" dir="auto" data-testid={`${prefix}-q-text-${qIdx}`}>{q.questionText}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {eq && <AlignmentIndicator alignment={eq.conceptAlignment} />}
                  {q.pedagogicalAnalysis && q.pedagogicalAnalysis.clarityScore > 0 && (
                    <ScoreStars score={q.pedagogicalAnalysis.clarityScore} />
                  )}
                </div>
              </div>
              <CorrectnessBar percent={q.percent} />
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>Answered: {q.answered}/{q.seen}</span>
                <span>Correct: {q.correct}/{q.answered}</span>
                <span>Correctness: {q.percent}%</span>
              </div>

              

              {q.pedagogicalAnalysis && q.pedagogicalAnalysis.techniques.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap" data-testid={`${prefix}-q-techniques-${qIdx}`}>
                  <span className="text-xs text-muted-foreground">Techniques:</span>
                  {q.pedagogicalAnalysis.techniques.map((t, tIdx) => (
                    <Badge key={tIdx} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              )}

              {showCoaching && (
                <div className="space-y-2 rounded-md bg-muted/30 dark:bg-muted/10 p-2.5" data-testid={`${prefix}-q-coaching-${qIdx}`}>
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Explanation Analysis
                  </p>

                  {eq.review && (
                    <p className="text-xs leading-relaxed" data-testid={`${prefix}-q-review-${qIdx}`}>
                      {eq.review}
                    </p>
                  )}

                  {eq.whatTeacherSaid && (
                    <div className="space-y-1" data-testid={`${prefix}-q-said-${qIdx}`}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Mic className="h-3 w-3" /> What the teacher said
                      </p>
                      <p className="text-xs text-muted-foreground pl-3 border-l-2 border-blue-200 dark:border-blue-800 leading-relaxed" dir="auto">
                        {eq.whatTeacherSaid}
                      </p>
                    </div>
                  )}

                  {eq.suggestedApproach && (
                    <div className="space-y-1" data-testid={`${prefix}-q-suggested-${qIdx}`}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <GraduationCap className="h-3 w-3" /> How to explain this effectively
                      </p>
                      <p className="text-xs leading-relaxed bg-emerald-50/50 dark:bg-emerald-950/20 rounded px-2.5 py-2">
                        {eq.suggestedApproach}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {q.confusionMoments && (() => {
                const cm = q.confusionMoments as any;
                const isObj = cm && typeof cm === 'object' && !Array.isArray(cm);
                const confused = isObj ? cm.confused : (Array.isArray(cm) && cm.length > 0);
                const examples: string[] = isObj ? (cm.examples || []) : (Array.isArray(cm) ? cm.flatMap((c: any) => c.messages || []) : []);
                if (!confused || examples.length === 0) return null;
                return (
                  <div className="space-y-1 pt-1 bg-red-50/50 dark:bg-red-950/20 rounded p-2" data-testid={`${prefix}-q-confusion-${qIdx}`}>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Confusion Detected
                    </p>
                    {examples.slice(0, 2).map((msg: string, mIdx: number) => (
                      <p key={mIdx} className="text-xs text-muted-foreground pl-3" dir="auto">{msg}</p>
                    ))}
                  </div>
                );
              })()}

              {q.insights.length > 0 && !showCoaching && (
                <div className="space-y-1 pt-1">
                  {q.insights.map((ins, insIdx) => (
                    <p key={insIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">
                      {ins}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackInline({ feedback, prefix }: { feedback: { wentWell: FeedbackItem[]; needsImprovement: FeedbackItem[] }; prefix: string }) {
  const hasWell = feedback.wentWell.length > 0;
  const hasImprove = feedback.needsImprovement.length > 0;
  if (!hasWell && !hasImprove) return null;

  return (
    <div className="space-y-3 pt-3 border-t" data-testid={`${prefix}-feedback`}>
      <p className="text-sm font-medium">Observations</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasWell && (
          <div className="space-y-2.5 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">What Went Well</span>
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
  if (cat === "pedagogy") return "Teaching Methodology";
  return cat;
}

function formatLevel(level: string): string {
  const map: Record<string, string> = {
    L1: "Level 1",
    L2: "Level 2",
    L3: "Level 3",
    L4: "Level 4",
    L5: "Level 5",
    L6: "Level 6",
    L7: "Level 7",
    L8: "Level 8",
    L9: "Level 9",
    L10: "Level 10",
    L11: "Level 11",
    L12: "Level 12",
  };
  return map[level] || level;
}

function classifyActivityType(type: string): string {
  const t = (type || '').toUpperCase().replace(/[\s_-]+/g, '_');
  if (t === 'SECTION_CHECK') return 'SECTION_CHECK';
  if (t === 'EXIT_TICKET') return 'EXIT_TICKET';
  if (t === 'TEAM_EXERCISE') return 'TEAM_EXERCISE';
  if (['SQUID_GAMES', 'SQUID_GAME', 'SQUIDGAMES', 'SQUIDGAME'].includes(t)) return 'EXIT_TICKET';
  if (['BETTER_CALL_SAUL', 'BETTERCALLSAUL'].includes(t)) return 'TEAM_EXERCISE';
  return 'SECTION_CHECK';
}

function formatActivityType(type: string): string {
  const canonical = classifyActivityType(type);
  const map: Record<string, string> = {
    SECTION_CHECK: "Section Check",
    EXIT_TICKET: "Exit Ticket",
    TEAM_EXERCISE: "Team Exercise",
  };
  return map[canonical] || type;
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
            label="Students Answered"
            value={`${combined.avgStudentsAnswered} / ${combined.totalStudents}`}
            testId={`${prefix}-metric-students`}
          />
          <MetricTile
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Correctness"
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
            label="Correctness"
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
              <p className="text-sm font-medium text-destructive">Teacher was speaking during the Exit Ticket</p>
              <p className="text-xs text-muted-foreground">
                Spoke for {inst.teacherTalkOverlapMin} min about: {inst.teacherTalkTopics}. Students should answer independently.
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
                  <span className="text-sm font-medium">What Went Well</span>
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

<<<<<<< HEAD
function CorrectnessDistributionTable({ dist }: { dist: NonNullable<DashboardData['qaEvaluation']['correctnessDistribution']> }) {
  return (
    <div className="space-y-3" data-testid="section-correctness-distribution">
      <SectionHeading
        icon={<Target className="h-4 w-4" />}
        title="Question Performance Summary"
        testId="heading-correctness-distribution"
      />
      <Card data-testid="card-correctness-distribution">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-correctness-distribution">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Correctness Range</th>
                  <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Questions</th>
                  <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Avg Pre-Explanation Time</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b" data-testid="row-below40">
                  <td className="py-3 pl-4 font-medium">Below 40%</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.below40.count}</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.below40.avgPostExplanationMin} min</td>
                  <td className="py-3">
                    {dist.below40.count > 0 && (
                      <Badge variant="destructive" className="text-xs">Needs Reteaching</Badge>
                    )}
                    {dist.below40.count === 0 && (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                </tr>
                <tr className="border-b" data-testid="row-40to70">
                  <td className="py-3 pl-4 font-medium">40% – 70%</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.between40and70.count}</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.between40and70.avgPostExplanationMin} min</td>
                  <td className="py-3">
                    {dist.between40and70.count > 0 && (
                      <Badge variant="secondary" className="text-xs">Partial Understanding</Badge>
                    )}
                    {dist.between40and70.count === 0 && (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                </tr>
                <tr data-testid="row-above70">
                  <td className="py-3 pl-4 font-medium">70%+</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.above70.count}</td>
                  <td className="py-3 pl-4 tabular-nums">{dist.above70.avgPostExplanationMin} min</td>
                  <td className="py-3">
                    {dist.above70.count > 0 && (
                      <Badge variant="default" className="text-xs">Well Understood</Badge>
                    )}
                    {dist.above70.count === 0 && (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 pl-4">Total: {dist.total} questions</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InstructionalTimeSection({ analysis }: { analysis: NonNullable<DashboardData['qaEvaluation']['instructionalTimeAnalysis']> }) {
  return (
    <div className="space-y-3" data-testid="section-instructional-time">
      <SectionHeading
        icon={<Timer className="h-4 w-4" />}
        title="Instructional Time Analysis"
        testId="heading-instructional-time"
      />
      <Card data-testid="card-instructional-time">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-instructional-time">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Component</th>
                  <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Time</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">%</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b" data-testid="row-teacher-talk">
                  <td className="py-3 pl-4 font-medium">Teacher Explanation & Modelling</td>
                  <td className="py-3 pl-4 tabular-nums">{analysis.teacherTalkMin} min</td>
                  <td className="py-3 tabular-nums">{analysis.teacherTalkPercent}%</td>
                </tr>
                <tr data-testid="row-student-activity">
                  <td className="py-3 pl-4 font-medium">Student Activity & Response</td>
                  <td className="py-3 pl-4 tabular-nums">{analysis.studentActivityMin} min</td>
                  <td className="py-3 tabular-nums">{analysis.studentActivityPercent}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 h-3 rounded-full overflow-hidden bg-muted flex">
            <div
              className="bg-primary/70 dark:bg-primary/50 h-full transition-all"
              style={{ width: `${analysis.teacherTalkPercent}%` }}
              data-testid="bar-teacher-talk"
            />
            <div
              className="bg-emerald-500/50 dark:bg-emerald-400/30 h-full transition-all"
              style={{ width: `${analysis.studentActivityPercent}%` }}
              data-testid="bar-student-activity"
            />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-primary/70 dark:bg-primary/50" />
              <span>Teacher</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500/50 dark:bg-emerald-400/30" />
              <span>Student</span>
            </div>
            <span className="ml-auto">Session: {analysis.sessionDurationMin} min</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PositiveTeachingMomentsSection({ moments }: { moments: NonNullable<DashboardData['qaEvaluation']['positiveTeachingMoments']> }) {
  if (moments.length === 0) return null;

  const iconMap: Record<string, typeof Star> = {
    encouragement: Heart,
    mic_interaction: Mic,
    adaptive_teaching: Lightbulb,
    flexible_method: Sparkles,
    tech_handling: ShieldCheck,
    effective_delivery: CheckCircle,
    pacing_observation: AlertTriangle,
  };

  return (
    <div className="space-y-3" data-testid="section-positive-moments">
      <SectionHeading
        icon={<Award className="h-4 w-4" />}
        title="Notable Teaching Moments"
        testId="heading-positive-moments"
      />
      <Card data-testid="card-positive-moments">
        <CardContent className="pt-6 space-y-3">
          {moments.map((moment, idx) => {
            const IconComp = iconMap[moment.type] || Star;
            const isPacing = moment.type === 'pacing_observation';
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 rounded-md p-3 ${isPacing ? 'bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30' : 'bg-muted/30 dark:bg-muted/10'}`}
                data-testid={`moment-${moment.type}-${idx}`}
              >
                <div className={`flex-shrink-0 mt-0.5 ${isPacing ? 'text-amber-500' : 'text-primary'}`}>
                  <IconComp className="h-4 w-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-sm leading-relaxed">{moment.description}</p>
                  {moment.quote && (
                    <p className="text-xs text-muted-foreground pl-3 border-l-2 border-blue-200 dark:border-blue-800 leading-relaxed" dir="auto">
                      {moment.quote}
                    </p>
                  )}
                  {moment.timestamp && (
                    <p className="text-[10px] font-mono text-muted-foreground/60">{moment.timestamp}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
=======
export default function Dashboard(props: { overrideSessionId?: number } & Record<string, any> = {}) {
  const overrideSessionId = props.overrideSessionId;
>>>>>>> 15c85cab3d45af363dc2f403263cd4cb6630626a
  const { data: sessionInfo } = useQuery<{ sessionId: number | null }>({
    queryKey: ["/api/detected-session"],
    enabled: !overrideSessionId,
  });

  const sessionId = overrideSessionId || sessionInfo?.sessionId;

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard", sessionId],
    enabled: !!sessionId,
  });

  if (!sessionId || isLoading) {
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

  const { session, activities, pollStats, studentMetrics, feedback, activityAnalyses, qaEvaluation } = data;

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
              <span className="font-medium">{formatLevel(session.level) || 'Not specified'}</span>
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
                  label="Correctness"
                  value={`${pollStats.correctnessPercent}%`}
                  testId="metric-correctness"
                />
                <MetricTile
                  icon={<ThermometerSun className="h-3.5 w-3.5" />}
                  label="Temperature & Engagement"
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
                  label="Session Completion"
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
                      <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Activity Type</th>
                      <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Completed</th>
                      <th className="pb-3 pl-4 text-left font-medium text-muted-foreground">Duration</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">Correctness</th>
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
                          <td className="py-3 pl-4 font-medium">{formatActivityType(group.activityType)}</td>
                          <td className="py-3 pl-4">
                            <Badge variant={group.happenedCount === group.count ? "default" : "secondary"}>
                              {group.happenedCount}/{group.count}
                            </Badge>
                          </td>
                          <td className="py-3 pl-4 text-left tabular-nums">
                            {durationRound > 0 ? `${durationRound} min` : "\u2014"}
                          </td>
                          <td className="py-3 text-left">
                            {correctnessPercent != null ? (
                              <span className="tabular-nums">{correctnessPercent}%</span>
                            ) : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                    {groupedActivities.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground">No activities</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {qaEvaluation?.correctnessDistribution && (
          <CorrectnessDistributionTable dist={qaEvaluation.correctnessDistribution} />
        )}

        {qaEvaluation?.instructionalTimeAnalysis && (
          <InstructionalTimeSection analysis={qaEvaluation.instructionalTimeAnalysis} />
        )}

        {qaEvaluation?.executiveSummary && (
          <ExecutiveSummarySection summary={qaEvaluation.executiveSummary} />
        )}

        {qaEvaluation?.positiveTeachingMoments && qaEvaluation.positiveTeachingMoments.length > 0 && (
          <PositiveTeachingMomentsSection moments={qaEvaluation.positiveTeachingMoments} />
        )}

        {activityAnalyses.map((analysis) => (
          <ActivitySection key={analysis.activityType} analysis={analysis} />
        ))}

        {qaEvaluation && (
          <QAEvaluationSection evaluation={qaEvaluation} />
        )}

        <PedagogySection
          items={{ wentWell: pedWentWell, needsImprovement: pedNeedsImprovement }}
          prefix="other-comments"
          title="Additional Observations"
          icon={<MessageSquare className="h-4 w-4" />}
        />

      </div>
    </div>
  );
}
