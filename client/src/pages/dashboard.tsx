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
  ShieldCheck, Star, ArrowRight, Brain, Eye, HelpCircle, Zap, TrendingUp, TrendingDown,
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
    transcriptAnalysis?: {
      conceptMasteryMap: {
        concept: string;
        explanationDurationMin: number;
        timeRanges: string[];
        avgCorrectness: number | null;
        confusionSignals: number;
        effectiveness: string;
        insight: string;
        evidence: string[];
        relatedActivities: string[];
      }[];
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
      microMoments: {
        strong: { type: string; timestamp: string; what: string; why: string; evidence: string }[];
        risk: { type: string; timestamp: string; what: string; why: string; evidence: string }[];
      };
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

      {evaluation.transcriptAnalysis && (
        <TranscriptAnalysisSection analysis={evaluation.transcriptAnalysis} />
      )}
    </div>
  );
}

function TranscriptAnalysisSection({ analysis }: { analysis: NonNullable<DashboardData["qaEvaluation"]["transcriptAnalysis"]> }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const effectivenessColor = (eff: string) => {
    if (eff === "High") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (eff === "Medium") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    if (eff === "Low") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    return "bg-muted text-muted-foreground";
  };

  const clarityColor = (score: number) => {
    if (score >= 4) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 2) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const riskColor = (level: string) => {
    if (level === "High") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  };

  const sections = [
    { id: "concepts", icon: <Brain className="h-4 w-4" />, title: "Concept Mastery Map", count: analysis.conceptMasteryMap.length },
    { id: "clarity", icon: <Eye className="h-4 w-4" />, title: "Teaching Clarity Evaluation", count: analysis.teachingClarity.length },
    { id: "questioning", icon: <HelpCircle className="h-4 w-4" />, title: "Questioning Quality", count: analysis.questioningAnalysis.total },
    { id: "confusion", icon: <AlertTriangle className="h-4 w-4" />, title: "Confusion Moments", count: analysis.confusionMoments.length },
    { id: "patterns", icon: <TrendingUp className="h-4 w-4" />, title: "Teaching Patterns", count: analysis.teachingPatterns.length },
    { id: "micro", icon: <Zap className="h-4 w-4" />, title: "Micro-Moment Highlights", count: analysis.microMoments.strong.length + analysis.microMoments.risk.length },
  ];

  return (
    <Card data-testid="card-transcript-analysis">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Search className="h-4 w-4" />
          Deep Transcript Analysis
        </CardTitle>
        <Badge variant="secondary" data-testid="badge-analysis-dimensions">6 Dimensions</Badge>
      </CardHeader>
      <CardContent className="space-y-1">
        {sections.map((sec) => (
          <Collapsible
            key={sec.id}
            open={expandedSection === sec.id}
            onOpenChange={(open) => setExpandedSection(open ? sec.id : null)}
          >
            <CollapsibleTrigger
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-md hover-elevate"
              data-testid={`transcript-section-${sec.id}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {expandedSection === sec.id ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                {sec.icon}
                <span className="text-sm font-medium">{sec.title}</span>
              </div>
              <Badge variant="secondary">{sec.count}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-9 mr-3 mb-3 mt-1 space-y-3">

                {sec.id === "concepts" && (
                  <div className="space-y-2" data-testid="analysis-concept-mastery">
                    {analysis.conceptMasteryMap.map((concept, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`concept-${idx}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{concept.concept}</span>
                            <Badge variant="secondary">{concept.explanationDurationMin} min</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {concept.avgCorrectness !== null && (
                              <span className={`text-sm font-bold tabular-nums ${concept.avgCorrectness >= 75 ? "text-emerald-600 dark:text-emerald-400" : concept.avgCorrectness >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                {concept.avgCorrectness}%
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${effectivenessColor(concept.effectiveness)}`}>
                              {concept.effectiveness}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs">{concept.insight}</p>
                        {concept.confusionSignals > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{concept.confusionSignals} confusion signal(s)</span>
                          </div>
                        )}
                        {concept.relatedActivities.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Activities:</span> {concept.relatedActivities.join(', ')}
                          </div>
                        )}
                        {concept.evidence.length > 0 && (
                          <div className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2 space-y-1">
                            {concept.evidence.slice(0, 2).map((e, i) => (
                              <p key={i} className="text-muted-foreground" dir="rtl"><Quote className="h-3 w-3 inline mr-1" />{e}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {analysis.conceptMasteryMap.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No concepts detected in transcript.</p>
                    )}
                  </div>
                )}

                {sec.id === "clarity" && (
                  <div className="space-y-2" data-testid="analysis-teaching-clarity">
                    {analysis.teachingClarity.map((block, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`clarity-${idx}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{block.timestamp}</span>
                            <span className="text-sm font-medium">{block.concept}</span>
                            <Badge variant="secondary">{block.durationMin} min</Badge>
                          </div>
                          <span className={`text-sm font-bold tabular-nums ${clarityColor(block.clarityScore)}`}>
                            {block.clarityScore}/5
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {block.behaviors.map((b, i) => (
                            <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${b.includes("No ") ? "bg-red-100/60 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"}`}>
                              {b.includes("No ") ? <TrendingDown className="h-3 w-3 mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              {b}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs">{block.impact}</p>
                        <div className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2" dir="rtl">
                          <Quote className="h-3 w-3 inline mr-1" />{block.evidence}
                        </div>
                      </div>
                    ))}
                    {analysis.teachingClarity.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No continuous teaching blocks detected.</p>
                    )}
                  </div>
                )}

                {sec.id === "questioning" && (
                  <div className="space-y-3" data-testid="analysis-questioning">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-md border px-3 py-2 text-center">
                        <p className="text-lg font-bold tabular-nums">{analysis.questioningAnalysis.openEnded}</p>
                        <p className="text-xs text-muted-foreground">Open-ended</p>
                      </div>
                      <div className="rounded-md border px-3 py-2 text-center">
                        <p className="text-lg font-bold tabular-nums">{analysis.questioningAnalysis.closed}</p>
                        <p className="text-xs text-muted-foreground">Closed</p>
                      </div>
                      <div className="rounded-md border px-3 py-2 text-center">
                        <p className="text-lg font-bold tabular-nums">{analysis.questioningAnalysis.prompts}</p>
                        <p className="text-xs text-muted-foreground">Engagement Prompts</p>
                      </div>
                      <div className="rounded-md border px-3 py-2 text-center">
                        <p className="text-lg font-bold tabular-nums">{analysis.questioningAnalysis.rhetorical}</p>
                        <p className="text-xs text-muted-foreground">Rhetorical</p>
                      </div>
                    </div>
                    <p className="text-xs">{analysis.questioningAnalysis.insight}</p>
                    {analysis.questioningAnalysis.examples.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Examples</p>
                        {analysis.questioningAnalysis.examples.map((ex, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2">
                            <Badge variant="secondary" className="flex-shrink-0">{ex.type}</Badge>
                            <span dir="rtl">{ex.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {sec.id === "confusion" && (
                  <div className="space-y-2" data-testid="analysis-confusion">
                    {analysis.confusionMoments.map((cm, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`confusion-${idx}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{cm.timestamp}</span>
                            <span className="text-sm font-medium">{cm.concept}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{cm.signalCount} signals</Badge>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${riskColor(cm.riskLevel)}`}>
                              {cm.riskLevel} Risk
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {cm.messages.map((msg, i) => (
                            <p key={i} className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-1.5" dir="rtl">
                              {msg}
                            </p>
                          ))}
                        </div>
                        <div className={`flex items-start gap-2 text-xs rounded-md px-2.5 py-2 ${cm.teacherResponse.includes("clarification") ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"}`}>
                          <ArrowRight className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span>{cm.teacherResponse}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{cm.riskAssessment}</p>
                      </div>
                    ))}
                    {analysis.confusionMoments.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No confusion clusters detected in student chat.</p>
                    )}
                  </div>
                )}

                {sec.id === "patterns" && (
                  <div className="space-y-2" data-testid="analysis-patterns">
                    {analysis.teachingPatterns.map((pat, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`pattern-${idx}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">{pat.pattern}</span>
                          <Badge variant="secondary">{pat.occurrences}x</Badge>
                        </div>
                        <p className="text-xs">{pat.impact}</p>
                        <div className="space-y-1">
                          {pat.details.map((d, i) => (
                            <p key={i} className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-1.5">{d}</p>
                          ))}
                        </div>
                        <div className="flex items-start gap-2 text-xs text-primary">
                          <ArrowRight className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span>{pat.recommendation}</span>
                        </div>
                      </div>
                    ))}
                    {analysis.teachingPatterns.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No recurring teaching patterns detected.</p>
                    )}
                  </div>
                )}

                {sec.id === "micro" && (
                  <div className="space-y-3" data-testid="analysis-micro-moments">
                    {analysis.microMoments.strong.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" />
                          Strong Moments
                        </p>
                        {analysis.microMoments.strong.map((m, idx) => (
                          <div key={idx} className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1.5" data-testid={`micro-strong-${idx}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{m.timestamp}</span>
                            </div>
                            <p className="text-xs font-medium">{m.what}</p>
                            <p className="text-xs text-muted-foreground">{m.why}</p>
                            <p className="text-xs bg-emerald-100/60 dark:bg-emerald-900/20 rounded px-2 py-1 text-emerald-800 dark:text-emerald-300">{m.evidence}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {analysis.microMoments.risk.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Risk Moments
                        </p>
                        {analysis.microMoments.risk.map((m, idx) => (
                          <div key={idx} className="rounded-md border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-1.5" data-testid={`micro-risk-${idx}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{m.timestamp}</span>
                            </div>
                            <p className="text-xs font-medium">{m.what}</p>
                            <p className="text-xs text-muted-foreground">{m.why}</p>
                            <p className="text-xs bg-red-100/60 dark:bg-red-900/20 rounded px-2 py-1 text-red-800 dark:text-red-300">{m.evidence}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {analysis.microMoments.strong.length === 0 && analysis.microMoments.risk.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No micro-moments detected.</p>
                    )}
                  </div>
                )}

              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
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
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>Answered: {q.answered}/{q.seen}</span>
                <span>Correct: {q.correct}/{q.answered}</span>
                <span>Correctness: {q.percent}%</span>
              </div>
              {(q.teacherExplanationMin !== undefined && q.teacherExplanationMin > 0) && (
                <div className="flex items-center gap-2 text-xs bg-muted/40 dark:bg-muted/20 rounded px-2 py-1.5" data-testid={`${prefix}-q-teach-${qIdx}`}>
                  <BookOpen className="h-3 w-3 text-primary flex-shrink-0" />
                  <span>
                    Teacher explained{q.teacherExplanationTopic ? ` "${q.teacherExplanationTopic}"` : ''} for <span className="font-semibold">{q.teacherExplanationMin} min</span> before this activity
                  </span>
                </div>
              )}
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

function TeacherCommunicationSection({ comm }: { comm: NonNullable<DashboardData['qaEvaluation']['teacherCommunication']> }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpenSections(p => ({ ...p, [id]: !p[id] }));

  const ratingColor = (r: string) => {
    if (r === "Strongly Encouraging" || r === "Excellent Communicator") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (r === "Moderately Encouraging" || r === "Effective Communicator") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  };

  const sections = [
    { id: "explanations", label: "Explanation Effectiveness", icon: <BookOpen className="h-3.5 w-3.5" />, count: comm.explanationReviews.length },
    { id: "tone", label: "Encouraging Tone", icon: <Heart className="h-3.5 w-3.5" />, count: comm.toneAnalysis.frequency },
    { id: "reinforcement", label: "Positive Reinforcement", icon: <Award className="h-3.5 w-3.5" />, count: comm.reinforcementAnalysis.totalCount },
    { id: "patterns", label: "Communication Style", icon: <Volume2 className="h-3.5 w-3.5" />, count: comm.communicationPatterns.length },
    { id: "score", label: "Communication Score", icon: <Sparkles className="h-3.5 w-3.5" />, count: null },
  ];

  return (
    <div className="space-y-3" data-testid="section-teacher-communication">
      <SectionHeading
        icon={<Mic className="h-4 w-4" />}
        title="Teacher Communication & Motivational Style"
        testId="heading-teacher-communication"
      />
      <Card>
        <CardContent className="pt-6 space-y-1">
          {sections.map(sec => (
            <Collapsible key={sec.id} open={openSections[sec.id]} onOpenChange={() => toggle(sec.id)}>
              <CollapsibleTrigger
                className="flex items-center justify-between gap-2 w-full text-sm font-medium hover-elevate rounded-md px-3 py-2.5"
                data-testid={`toggle-comm-${sec.id}`}
              >
                <div className="flex items-center gap-2">
                  {openSections[sec.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {sec.icon}
                  <span>{sec.label}</span>
                </div>
                {sec.count !== null && <Badge variant="secondary">{sec.count}</Badge>}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-3">

                  {sec.id === "explanations" && (
                    <div className="space-y-2" data-testid="comm-explanations">
                      {comm.explanationReviews.map((rev, idx) => (
                        <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`explanation-review-${idx}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{rev.timestamp}</span>
                            <span className="text-sm font-medium">{rev.concept}</span>
                            <Badge variant="secondary">{rev.durationMin} min</Badge>
                          </div>
                          {rev.strengths.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Strengths</p>
                              {rev.strengths.map((s, i) => (
                                <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-emerald-400/30">{s}</p>
                              ))}
                            </div>
                          )}
                          {rev.improvements.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Improvements</p>
                              {rev.improvements.map((s, i) => (
                                <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">{s}</p>
                              ))}
                            </div>
                          )}
                          <div className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2" dir="rtl">
                            <Quote className="h-3 w-3 inline mr-1" />{rev.evidence}
                          </div>
                          <p className="text-xs text-muted-foreground">{rev.impactPrediction}</p>
                        </div>
                      ))}
                      {comm.explanationReviews.length === 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-2">No explanation segments detected.</p>
                      )}
                    </div>
                  )}

                  {sec.id === "tone" && (
                    <div className="space-y-3" data-testid="comm-tone">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.toneAnalysis.frequency}</p>
                          <p className="text-xs text-muted-foreground">Instances</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.toneAnalysis.durationMin} min</p>
                          <p className="text-xs text-muted-foreground">Duration</p>
                        </div>
                        <Badge className={ratingColor(comm.toneAnalysis.rating)}>{comm.toneAnalysis.rating}</Badge>
                      </div>
                      {comm.toneAnalysis.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Strengths</p>
                          {comm.toneAnalysis.strengths.map((s, i) => (
                            <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-emerald-400/30">{s}</p>
                          ))}
                        </div>
                      )}
                      {comm.toneAnalysis.improvements.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Suggestions</p>
                          {comm.toneAnalysis.improvements.map((s, i) => (
                            <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">{s}</p>
                          ))}
                        </div>
                      )}
                      {comm.toneAnalysis.examples.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                          {comm.toneAnalysis.examples.map((ex, i) => (
                            <div key={i} className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-1.5 flex items-start gap-2">
                              <span className="text-muted-foreground flex-shrink-0">{ex.timestamp}</span>
                              <span dir="rtl">{ex.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{comm.toneAnalysis.studentImpact}</p>
                    </div>
                  )}

                  {sec.id === "reinforcement" && (
                    <div className="space-y-3" data-testid="comm-reinforcement">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.reinforcementAnalysis.distribution.praiseForCorrectness}</p>
                          <p className="text-xs text-muted-foreground">Praise for Correct</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.reinforcementAnalysis.distribution.effortEncouragement}</p>
                          <p className="text-xs text-muted-foreground">Effort-based</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.reinforcementAnalysis.distribution.motivationBeforeTasks}</p>
                          <p className="text-xs text-muted-foreground">Pre-activity</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.reinforcementAnalysis.distribution.recoveryAfterMistakes}</p>
                          <p className="text-xs text-muted-foreground">Recovery</p>
                        </div>
                      </div>
                      {comm.reinforcementAnalysis.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Strengths</p>
                          {comm.reinforcementAnalysis.strengths.map((s, i) => (
                            <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-emerald-400/30">{s}</p>
                          ))}
                        </div>
                      )}
                      {comm.reinforcementAnalysis.improvements.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Suggestions</p>
                          {comm.reinforcementAnalysis.improvements.map((s, i) => (
                            <p key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">{s}</p>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{comm.reinforcementAnalysis.outcomeLink}</p>
                    </div>
                  )}

                  {sec.id === "patterns" && (
                    <div className="space-y-2" data-testid="comm-patterns">
                      {comm.communicationPatterns.map((cp, idx) => (
                        <div key={idx} className="rounded-md border p-3 space-y-2" data-testid={`comm-pattern-${idx}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary">{cp.pattern}</Badge>
                            <span className="text-xs text-muted-foreground">{cp.occurrences} occurrences</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Strengths</p>
                            <p className="text-xs text-muted-foreground pl-3 border-l-2 border-emerald-400/30">{cp.strengths}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Growth Opportunities</p>
                            <p className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-400/30">{cp.growth}</p>
                          </div>
                          <div className="text-xs bg-muted/30 dark:bg-muted/10 rounded-md px-2.5 py-2" dir="rtl">
                            <Quote className="h-3 w-3 inline mr-1" />{cp.evidence}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sec.id === "score" && (
                    <div className="space-y-3" data-testid="comm-score">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center">
                          <p className="text-3xl font-bold tabular-nums">{comm.communicationScore.score}</p>
                          <p className="text-xs text-muted-foreground">/100</p>
                        </div>
                        <Badge className={ratingColor(comm.communicationScore.rating)}>{comm.communicationScore.rating}</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.communicationScore.breakdown.explanationClarity}</p>
                          <p className="text-xs text-muted-foreground">Clarity /25</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.communicationScore.breakdown.encouragementFrequency}</p>
                          <p className="text-xs text-muted-foreground">Encourage /25</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.communicationScore.breakdown.reinforcementBalance}</p>
                          <p className="text-xs text-muted-foreground">Reinforce /25</p>
                        </div>
                        <div className="rounded-md border px-3 py-2 text-center">
                          <p className="text-lg font-bold tabular-nums">{comm.communicationScore.breakdown.engagementCorrelation}</p>
                          <p className="text-xs text-muted-foreground">Engage /25</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{comm.communicationScore.justification}</p>
                    </div>
                  )}

                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
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

export default function Dashboard() {
  const { data: sessionInfo } = useQuery<{ sessionId: number | null }>({
    queryKey: ["/api/detected-session"],
  });

  const sessionId = sessionInfo?.sessionId;

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

        {qaEvaluation && (
          <QAEvaluationSection evaluation={qaEvaluation} />
        )}

        {qaEvaluation?.teacherCommunication && (
          <TeacherCommunicationSection comm={qaEvaluation.teacherCommunication} />
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
