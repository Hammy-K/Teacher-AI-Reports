import { db } from "./db";
import {
  courseSessions, sessionTranscripts, sessionChats,
  classroomActivities, userPolls, userReactions, userSessions,
  type InsertCourseSession, type InsertSessionTranscript,
  type InsertSessionChat, type InsertClassroomActivity,
  type InsertUserPoll, type InsertUserReaction, type InsertUserSession,
  type CourseSession, type SessionTranscript, type SessionChat,
  type ClassroomActivity, type UserPoll, type UserReaction, type UserSession,
} from "@shared/schema";
import { eq, sql, desc, asc, count } from "drizzle-orm";

export interface IStorage {
  getSessionOverview(): Promise<any>;
  getTranscripts(courseSessionId: number): Promise<SessionTranscript[]>;
  getChats(courseSessionId: number): Promise<SessionChat[]>;
  getActivities(courseSessionId: number): Promise<ClassroomActivity[]>;
  getPollStats(courseSessionId: number): Promise<any>;
  getReactionBreakdown(courseSessionId: number): Promise<any>;
  getStudentSessions(courseSessionId: number): Promise<UserSession[]>;
  getEngagementTimeline(courseSessionId: number): Promise<any>;
  getDashboardData(courseSessionId: number): Promise<any>;

  insertCourseSession(data: InsertCourseSession): Promise<CourseSession>;
  insertTranscripts(data: InsertSessionTranscript[]): Promise<void>;
  insertChats(data: InsertSessionChat[]): Promise<void>;
  insertActivities(data: InsertClassroomActivity[]): Promise<void>;
  insertPolls(data: InsertUserPoll[]): Promise<void>;
  insertReactions(data: InsertUserReaction[]): Promise<void>;
  insertUserSessions(data: InsertUserSession[]): Promise<void>;
  isDataImported(): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async isDataImported(): Promise<boolean> {
    const result = await db.select({ count: count() }).from(courseSessions);
    return (result[0]?.count ?? 0) > 0;
  }

  async getSessionOverview(): Promise<any> {
    const sessions = await db.select().from(courseSessions).limit(1);
    return sessions[0] || null;
  }

  async getTranscripts(courseSessionId: number): Promise<SessionTranscript[]> {
    return db.select().from(sessionTranscripts)
      .where(eq(sessionTranscripts.courseSessionId, courseSessionId))
      .orderBy(asc(sessionTranscripts.lineOrder));
  }

  async getChats(courseSessionId: number): Promise<SessionChat[]> {
    return db.select().from(sessionChats)
      .where(eq(sessionChats.courseSessionId, courseSessionId))
      .orderBy(asc(sessionChats.createdAtTs));
  }

  async getActivities(courseSessionId: number): Promise<ClassroomActivity[]> {
    return db.select().from(classroomActivities)
      .where(eq(classroomActivities.courseSessionId, courseSessionId));
  }

  async getPollStats(courseSessionId: number): Promise<any> {
    const polls = await db.select().from(userPolls)
      .where(eq(userPolls.courseSessionId, courseSessionId));

    const answered = polls.filter(p => p.pollAnswered);
    const correct = answered.filter(p => p.isCorrectAnswer);
    const totalAnswered = answered.length;
    const totalCorrect = correct.length;
    const correctnessPercent = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    const byQuestion: Record<string, { text: string; correct: number; total: number }> = {};
    for (const p of answered) {
      const qid = String(p.questionId);
      if (!byQuestion[qid]) {
        byQuestion[qid] = { text: p.questionText || '', correct: 0, total: 0 };
      }
      byQuestion[qid].total++;
      if (p.isCorrectAnswer) byQuestion[qid].correct++;
    }

    return {
      correctnessPercent,
      totalAnswered,
      totalCorrect,
      totalPolls: polls.length,
      totalSeen: polls.filter(p => p.pollSeen).length,
      byQuestion: Object.entries(byQuestion).map(([id, q]) => ({
        questionId: id,
        questionText: q.text,
        correct: q.correct,
        total: q.total,
        percent: Math.round((q.correct / q.total) * 100),
      })),
    };
  }

  async getReactionBreakdown(courseSessionId: number): Promise<any> {
    const reactions = await db.select().from(userReactions)
      .where(eq(userReactions.courseSessionId, courseSessionId));

    const breakdown: Record<string, number> = {};
    for (const r of reactions) {
      const emotion = r.emotion || 'unknown';
      breakdown[emotion] = (breakdown[emotion] || 0) + 1;
    }

    const timeline: Record<string, Record<string, number>> = {};
    for (const r of reactions) {
      if (!r.eventDatetime) continue;
      const minute = r.eventDatetime.substring(0, 16);
      if (!timeline[minute]) timeline[minute] = {};
      const emotion = r.emotion || 'unknown';
      timeline[minute][emotion] = (timeline[minute][emotion] || 0) + 1;
    }

    return {
      breakdown,
      total: reactions.length,
      timeline: Object.entries(timeline)
        .map(([time, emotions]) => ({ time, ...emotions }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    };
  }

  async getStudentSessions(courseSessionId: number): Promise<UserSession[]> {
    return db.select().from(userSessions)
      .where(eq(userSessions.courseSessionId, courseSessionId));
  }

  async getEngagementTimeline(courseSessionId: number): Promise<any> {
    const chats = await this.getChats(courseSessionId);
    const reactions = await db.select().from(userReactions)
      .where(eq(userReactions.courseSessionId, courseSessionId));

    const timeline: Record<string, { chats: number; reactions: number }> = {};

    for (const c of chats) {
      if (!c.createdAtTs) continue;
      const minute = c.createdAtTs.substring(0, 16);
      if (!timeline[minute]) timeline[minute] = { chats: 0, reactions: 0 };
      timeline[minute].chats++;
    }

    for (const r of reactions) {
      if (!r.eventDatetime) continue;
      const minute = r.eventDatetime.substring(0, 16);
      if (!timeline[minute]) timeline[minute] = { chats: 0, reactions: 0 };
      timeline[minute].reactions++;
    }

    return Object.entries(timeline)
      .map(([time, data]) => ({ time: time.substring(11), ...data }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  async getActivityCorrectnessMap(courseSessionId: number): Promise<Record<number, { answered: number; correct: number; percent: number }>> {
    const polls = await db.select().from(userPolls)
      .where(eq(userPolls.courseSessionId, courseSessionId));

    const map: Record<number, { answered: number; correct: number }> = {};
    for (const p of polls) {
      if (!p.classroomActivityId) continue;
      if (!map[p.classroomActivityId]) map[p.classroomActivityId] = { answered: 0, correct: 0 };
      if (p.pollAnswered) {
        map[p.classroomActivityId].answered++;
        if (p.isCorrectAnswer) map[p.classroomActivityId].correct++;
      }
    }

    const result: Record<number, { answered: number; correct: number; percent: number }> = {};
    for (const [id, data] of Object.entries(map)) {
      result[Number(id)] = {
        ...data,
        percent: data.answered > 0 ? Math.round((data.correct / data.answered) * 100) : 0,
      };
    }
    return result;
  }

  private parseSessionNameParts(name: string): { topic: string; level: string } {
    const match = name?.match(/^(.+?)(L\d+)$/);
    if (match) {
      return { topic: match[1].trim(), level: match[2] };
    }
    return { topic: name || '', level: '' };
  }

  async getDashboardData(courseSessionId: number): Promise<any> {
    const [session, transcripts, chats, activities, pollStats, reactionData, students, engagementTimeline, activityCorrectness] = await Promise.all([
      this.getSessionOverview(),
      this.getTranscripts(courseSessionId),
      this.getChats(courseSessionId),
      this.getActivities(courseSessionId),
      this.getPollStats(courseSessionId),
      this.getReactionBreakdown(courseSessionId),
      this.getStudentSessions(courseSessionId),
      this.getEngagementTimeline(courseSessionId),
      this.getActivityCorrectnessMap(courseSessionId),
    ]);

    const teacherRecord = students.find((s: any) => s.userType === 'TEACHER');
    let teacherName = teacherRecord?.userName || 'Unknown Teacher';
    teacherName = teacherName.replace(/أ\.(?!\s)/g, 'أ. ').replace(/\s+ال\s+/g, ' آل ').trim();
    const { topic, level } = this.parseSessionNameParts(session?.courseSessionName || '');

    const studentOnly = students.filter(s => s.userType === 'STUDENT');
    const totalStudents = studentOnly.length;

    const avgLearningTime = totalStudents > 0
      ? studentOnly.reduce((sum, s) => sum + (s.learningTime || 0), 0) / totalStudents
      : 0;
    const teachingTime = session?.teachingTime || 0;
    const sessionCompletedPercent = teachingTime > 0
      ? Math.round((avgLearningTime / teachingTime) * 100)
      : 0;

    const sessionTemperature = session?.sessionTemperature ?? 0;

    const activitiesWithCorrectness = activities.map(a => {
      const canonicalType = this.classifyActivityType(a.activityType || '', a.totalMcqs);
      return {
        activityId: a.activityId,
        activityType: canonicalType,
        originalActivityType: a.activityType,
        startTime: a.startTime,
        endTime: a.endTime,
        activityHappened: a.activityHappened,
        plannedDurationMin: this.toMin(a.plannedDuration || 0),
        durationMin: this.toMin(a.duration || 0),
        totalMcqs: a.totalMcqs,
        correctness: activityCorrectness[a.activityId] || null,
      };
    });

    const feedback = this.generateFeedback(activitiesWithCorrectness, transcripts, chats, session, pollStats);

    const activityAnalyses = await this.generateAllActivityAnalyses(
      courseSessionId, activitiesWithCorrectness, transcripts, chats, totalStudents, feedback
    );

    return {
      session: {
        ...session,
        teacherName,
        topic,
        level,
      },
      transcripts,
      chats: chats.slice(0, 200),
      activities: activitiesWithCorrectness,
      pollStats,
      reactionData,
      engagementTimeline,
      feedback,
      activityAnalyses,
      studentMetrics: {
        totalStudents,
        sessionTemperature,
        sessionCompletedPercent,
        avgLearningTime: Math.round(avgLearningTime * 10) / 10,
        teachingTime,
      },
      students: studentOnly.map(s => ({
        userId: s.userId,
        userName: s.userName,
        sentiment: s.userSentiment,
        activeTime: s.activeTime,
        learningTime: s.learningTime,
        pollsSeen: s.totalPollsSeen,
        pollsResponded: s.totalPollsResponded,
        messages: s.totalMessages,
        handRaises: s.totalHandRaise,
      })).sort((a, b) => (b.activeTime || 0) - (a.activeTime || 0)),
      qaEvaluation: this.computeQAEvaluation(
        session, activitiesWithCorrectness, transcripts, chats, studentOnly,
        pollStats, totalStudents, sessionTemperature, sessionCompletedPercent,
        avgLearningTime, feedback, activityAnalyses
      ),
    };
  }

  private getTranscriptForTimeRange(
    sorted: { startSec: number; endSec: number; text: string }[],
    rangeStartSec: number,
    rangeEndSec: number
  ): { texts: string[]; totalSec: number; topics: string } {
    const overlapping = sorted.filter(t => t.startSec < rangeEndSec && t.endSec > rangeStartSec);
    let totalSec = 0;
    for (const t of overlapping) {
      const s = Math.max(t.startSec, rangeStartSec);
      const e = Math.min(t.endSec, rangeEndSec);
      if (e > s) totalSec += (e - s);
    }
    const texts = overlapping.map(t => t.text);
    const topics = this.extractTopics(texts);
    return { texts, totalSec, topics };
  }

  private buildConceptMasteryMap(
    sorted: { startSec: number; endSec: number; text: string }[],
    activityTimeline: any[],
    chats: any[]
  ): any[] {
    const topicMap: [RegExp, string][] = [
      [/الدائر[ةه]/i, "Circles"],
      [/المستقيم|مستقيمات/i, "Lines in circles"],
      [/نصف القطر|أنصاف.*القطر/i, "Radius"],
      [/القطر/i, "Diameter"],
      [/الوتر|وتر/i, "Chord"],
      [/مماس|التماس/i, "Tangent"],
      [/الزاوي[ةه]\s*المركزي[ةه]/i, "Central angles"],
      [/الزاوي[ةه]\s*المحيطي[ةه]/i, "Inscribed angles"],
      [/الزوايا|زاوي[ةه]/i, "Angles"],
      [/المحيط/i, "Perimeter"],
      [/المساح[ةه]/i, "Area"],
      [/المضلع|مضلعات|رباعي/i, "Polygons"],
      [/القوس/i, "Arc"],
      [/طاء.*نق|نق\s*تربيع/i, "Circle formulas"],
      [/مربع|مثلث|سداسي/i, "Shapes in circles"],
    ];

    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const concepts: any[] = [];

    for (const [pattern, conceptName] of topicMap) {
      const matchingSegments = sorted.filter(t => pattern.test(t.text));
      if (matchingSegments.length === 0) continue;

      let totalExplanationSec = 0;
      const timeRanges: string[] = [];
      const excerpts: string[] = [];

      let rangeStart = matchingSegments[0].startSec;
      let rangeEnd = matchingSegments[0].endSec;
      for (let i = 0; i < matchingSegments.length; i++) {
        const seg = matchingSegments[i];
        totalExplanationSec += (seg.endSec - seg.startSec);
        if (excerpts.length < 2) {
          excerpts.push(seg.text.substring(0, 120));
        }
        if (i > 0 && seg.startSec - rangeEnd > 60) {
          timeRanges.push(`${formatTime(rangeStart)}–${formatTime(rangeEnd)}`);
          rangeStart = seg.startSec;
        }
        rangeEnd = seg.endSec;
      }
      timeRanges.push(`${formatTime(rangeStart)}–${formatTime(rangeEnd)}`);

      const relatedActivities = activityTimeline.filter(atl => {
        const preTopics = atl.preTeaching?.topics || '';
        return preTopics.includes(conceptName);
      });

      const avgCorrectness = relatedActivities.length > 0
        ? Math.round(relatedActivities.reduce((s: number, a: any) => s + a.correctPercent, 0) / relatedActivities.length)
        : null;

      const completionRates = relatedActivities.map((a: any) => a.correctPercent);

      const confusionCount = chats.filter(c => {
        if (c.userType !== 'STUDENT') return false;
        const ts = this.parseTimeToSeconds(c.createdAtTs || '');
        if (ts === null) return false;
        const confusionPatterns = /ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد/i;
        const duringExplanation = matchingSegments.some(seg => ts >= seg.startSec - 30 && ts <= seg.endSec + 60);
        return duringExplanation && confusionPatterns.test(c.messageText || '');
      }).length;

      let effectiveness: string;
      if (avgCorrectness === null) {
        effectiveness = "Not assessed";
      } else if (avgCorrectness >= 75) {
        effectiveness = "Excellent";
      } else if (avgCorrectness >= 60) {
        effectiveness = "Effective";
      } else if (avgCorrectness >= 40) {
        effectiveness = "Needs Reinforcement";
      } else {
        effectiveness = "Ineffective";
      }

      let insight = '';
      if (avgCorrectness !== null) {
        if (avgCorrectness >= 75) {
          insight = `The teacher explained "${conceptName}" for ${Math.round(totalExplanationSec / 60 * 10) / 10} min across ${timeRanges.length} segment(s). Students scored ${avgCorrectness}% on related activities — the explanation was clear and well-structured.`;
        } else if (avgCorrectness >= 50) {
          insight = `The teacher spent ${Math.round(totalExplanationSec / 60 * 10) / 10} min on "${conceptName}". Students scored ${avgCorrectness}% — the explanation covered the topic but did not achieve full comprehension. ${confusionCount > 0 ? `${confusionCount} confusion signal(s) appeared in chat during this explanation.` : ''}`;
        } else {
          insight = `The teacher spent ${Math.round(totalExplanationSec / 60 * 10) / 10} min on "${conceptName}" but students scored only ${avgCorrectness}%. The explanation failed to build understanding. ${confusionCount > 0 ? `${confusionCount} confusion signal(s) confirmed students were lost.` : 'No confusion signals appeared — students did not express confusion but still performed poorly, suggesting a gap between perceived and actual understanding.'}`;
        }
      } else {
        insight = `The teacher explained "${conceptName}" for ${Math.round(totalExplanationSec / 60 * 10) / 10} min (${timeRanges.join(', ')}) but no related activity directly tested this concept.`;
      }

      concepts.push({
        concept: conceptName,
        explanationDurationMin: Math.round(totalExplanationSec / 60 * 10) / 10,
        timeRanges,
        avgCorrectness,
        confusionSignals: confusionCount,
        effectiveness,
        insight,
        evidence: excerpts,
        relatedActivities: relatedActivities.map((a: any) => `${a.label} (${a.startTime}): ${a.correctPercent}%`),
      });
    }

    concepts.sort((a, b) => {
      if (a.avgCorrectness === null && b.avgCorrectness === null) return 0;
      if (a.avgCorrectness === null) return 1;
      if (b.avgCorrectness === null) return -1;
      return a.avgCorrectness - b.avgCorrectness;
    });

    return concepts;
  }

  private buildTeachingClarityEvaluation(
    sorted: { startSec: number; endSec: number; text: string }[]
  ): any[] {
    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const continuousBlocks: { startSec: number; endSec: number; texts: string[] }[] = [];
    if (sorted.length === 0) return [];

    let blockStart = sorted[0].startSec;
    let blockEnd = sorted[0].endSec;
    let blockTexts = [sorted[0].text];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startSec - blockEnd <= 5) {
        blockEnd = Math.max(blockEnd, sorted[i].endSec);
        blockTexts.push(sorted[i].text);
      } else {
        if (blockEnd - blockStart >= 30) {
          continuousBlocks.push({ startSec: blockStart, endSec: blockEnd, texts: blockTexts });
        }
        blockStart = sorted[i].startSec;
        blockEnd = sorted[i].endSec;
        blockTexts = [sorted[i].text];
      }
    }
    if (blockEnd - blockStart >= 30) {
      continuousBlocks.push({ startSec: blockStart, endSec: blockEnd, texts: blockTexts });
    }

    const stepByStepPattern = /أولا|ثانيا|ثالثا|الخطوة|أول شي|بعدين|ثم|بعد كذا|نبدأ.*ب|أول حاجة|1\.|2\.|3\./i;
    const repetitionPattern = /يعني|بمعنى|نقدر نقول|بالعربي|بشكل ثاني|مرة ثانية|نعيد/i;
    const examplePattern = /مثلا|مثال|على سبيل|لو عندنا|تخيل|فرض|يعني مثل|لو كان/i;
    const verificationPattern = /واضح|صح|فاهمين|تمام|سؤال|فهمتوا|ماشي|صح ولا لا|عرفتوا/i;
    const transitionPattern = /طيب|الحين|ننتقل|نروح|نكمل|خلاص|يلا|هسا/i;

    return continuousBlocks.map(block => {
      const combined = block.texts.join(' ');
      const durationSec = block.endSec - block.startSec;
      const topics = this.extractTopics(block.texts);

      const hasStepByStep = stepByStepPattern.test(combined);
      const hasRepetition = repetitionPattern.test(combined);
      const hasExample = examplePattern.test(combined);
      const hasVerification = verificationPattern.test(combined);
      const hasTransition = transitionPattern.test(combined);

      const clarityScore = [hasStepByStep, hasRepetition, hasExample, hasVerification, hasTransition]
        .filter(Boolean).length;

      const behaviors: string[] = [];
      if (hasStepByStep) behaviors.push("Step-by-step structure detected");
      if (hasRepetition) behaviors.push("Rephrasing/repetition detected");
      if (hasExample) behaviors.push("Example or analogy used");
      if (hasVerification) behaviors.push("Student comprehension check detected");
      if (hasTransition) behaviors.push("Transition markers used");

      if (!hasStepByStep) behaviors.push("No step-by-step structure — explanation was unstructured");
      if (!hasExample) behaviors.push("No examples or analogies — abstract explanation only");
      if (!hasVerification) behaviors.push("No comprehension check — teacher did not verify student understanding");

      let impact: string;
      if (clarityScore >= 4) {
        impact = `This ${Math.round(durationSec / 60 * 10) / 10} min explanation on "${topics}" used ${clarityScore}/5 clarity techniques — a well-structured delivery that supports strong retention.`;
      } else if (clarityScore >= 2) {
        impact = `This explanation on "${topics}" used ${clarityScore}/5 clarity techniques. Adding ${5 - clarityScore} more (${!hasExample ? 'examples' : ''}${!hasVerification ? ', comprehension checks' : ''}${!hasStepByStep ? ', step-by-step structure' : ''}) would strengthen student understanding.`;
      } else {
        impact = `This explanation on "${topics}" used only ${clarityScore}/5 clarity techniques. The teacher delivered content without structure, examples, or verification — this is a direct risk to student comprehension.`;
      }

      return {
        timestamp: `${formatTime(block.startSec)}–${formatTime(block.endSec)}`,
        durationMin: Math.round(durationSec / 60 * 10) / 10,
        concept: topics,
        behaviors,
        clarityScore,
        impact,
        evidence: combined.substring(0, 200),
      };
    });
  }

  private buildQuestioningAnalysis(
    sorted: { startSec: number; endSec: number; text: string }[],
    chats: any[],
    activityTimeline: any[]
  ): any {
    const openEndedPattern = /ليش|لماذا|كيف ممكن|ايش رأيكم|شو تتوقعوا|ايش الفرق|وش السبب|ليه/i;
    const closedPattern = /صح ولا غلط|صح ولا لا|ايش الجواب|كم يساوي|ايش يكون|كم عدد/i;
    const promptPattern = /اكتبوا|في الشات|ردوا|جاوبوا|ارفعوا|حطوا|اختاروا|شاركوا/i;
    const rhetoricalPattern = /صح ؟|مو كذا ؟|واضح ؟|تمام ؟|ماشي ؟|ولا لا ؟/i;

    let openEnded = 0, closed = 0, prompts = 0, rhetorical = 0;
    const timestamps: any[] = [];

    for (const seg of sorted) {
      const text = seg.text;
      if (openEndedPattern.test(text)) {
        openEnded++;
        if (timestamps.length < 5) timestamps.push({ type: 'Open-ended', text: text.substring(0, 80) });
      }
      if (closedPattern.test(text)) {
        closed++;
        if (timestamps.length < 5) timestamps.push({ type: 'Closed', text: text.substring(0, 80) });
      }
      if (promptPattern.test(text)) {
        prompts++;
        if (timestamps.length < 5) timestamps.push({ type: 'Engagement prompt', text: text.substring(0, 80) });
      }
      if (rhetoricalPattern.test(text)) {
        rhetorical++;
      }
    }

    const total = openEnded + closed + prompts;
    let insight: string;
    if (total === 0) {
      insight = `The teacher asked 0 questions during the entire session. No open-ended, closed, or engagement prompts were detected in the transcript. This is a significant gap — questioning drives student engagement and checks understanding.`;
    } else if (openEnded >= 3 && prompts >= 2) {
      insight = `The teacher asked ${total} questions (${openEnded} open-ended, ${closed} closed, ${prompts} engagement prompts). Open-ended questions encourage deeper thinking and were used effectively.`;
    } else if (prompts >= 3) {
      insight = `The teacher used ${prompts} engagement prompts (e.g., "write in chat", "answer"). This drove participation but lacked open-ended conceptual questions that test deeper understanding.`;
    } else {
      insight = `The teacher asked only ${total} question(s) total. With ${openEnded} open-ended and ${prompts} engagement prompts, the session lacked interactive questioning. Students had limited opportunities to demonstrate understanding.`;
    }

    return {
      openEnded,
      closed,
      prompts,
      rhetorical,
      total,
      insight,
      examples: timestamps,
    };
  }

  private buildConfusionMoments(
    sorted: { startSec: number; endSec: number; text: string }[],
    chats: any[]
  ): any[] {
    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const confusionPatterns = /ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد/i;

    const studentChats = chats
      .filter((c: any) => c.userType === 'STUDENT')
      .map((c: any) => ({
        ts: this.parseTimeToSeconds(c.createdAtTs || ''),
        text: c.messageText || '',
        name: c.creatorName || 'student',
      }))
      .filter(c => c.ts !== null && confusionPatterns.test(c.text))
      .sort((a, b) => a.ts! - b.ts!);

    if (studentChats.length === 0) return [];

    const clusters: { startSec: number; endSec: number; messages: typeof studentChats }[] = [];
    let clusterStart = studentChats[0].ts!;
    let clusterEnd = studentChats[0].ts!;
    let clusterMsgs = [studentChats[0]];

    for (let i = 1; i < studentChats.length; i++) {
      if (studentChats[i].ts! - clusterEnd <= 45) {
        clusterEnd = studentChats[i].ts!;
        clusterMsgs.push(studentChats[i]);
      } else {
        if (clusterMsgs.length >= 2) {
          clusters.push({ startSec: clusterStart, endSec: clusterEnd, messages: clusterMsgs });
        }
        clusterStart = studentChats[i].ts!;
        clusterEnd = studentChats[i].ts!;
        clusterMsgs = [studentChats[i]];
      }
    }
    if (clusterMsgs.length >= 2) {
      clusters.push({ startSec: clusterStart, endSec: clusterEnd, messages: clusterMsgs });
    }

    const clarificationPattern = /يعني|بمعنى|اقصد|خلني|بشكل ثاني|وضحت|فهمتوا الحين/i;

    return clusters.map(cluster => {
      const topic = this.extractTopics(
        sorted.filter(t => t.startSec >= cluster.startSec - 60 && t.endSec <= cluster.endSec + 30).map(t => t.text)
      );

      const teacherResponseAfter = sorted.filter(t =>
        t.startSec >= cluster.endSec && t.startSec <= cluster.endSec + 60
      );
      const hasClarification = teacherResponseAfter.some(t => clarificationPattern.test(t.text));

      const teacherResponse = hasClarification
        ? "Teacher provided immediate clarification after confusion signals"
        : teacherResponseAfter.length > 0
          ? "Teacher continued talking but did not address the confusion directly"
          : "No teacher response detected — confusion was ignored";

      return {
        timestamp: formatTime(cluster.startSec),
        concept: topic,
        signalCount: cluster.messages.length,
        messages: cluster.messages.slice(0, 3).map(m => `"${m.text.substring(0, 60)}" — ${m.name}`),
        teacherResponse,
        riskLevel: cluster.messages.length >= 3 ? "High" : "Medium",
        riskAssessment: cluster.messages.length >= 3
          ? `${cluster.messages.length} students expressed confusion about "${topic}" within ${Math.round((cluster.endSec - cluster.startSec))} seconds. This is a critical comprehension breakdown — the concept was not understood.`
          : `${cluster.messages.length} confusion signals about "${topic}" indicate partial understanding gaps.`,
      };
    });
  }

  private buildTeachingPatterns(
    sorted: { startSec: number; endSec: number; text: string }[],
    activityTimeline: any[],
    chats: any[],
    confusionMoments: any[]
  ): any[] {
    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const patterns: any[] = [];

    const overExplained = activityTimeline.filter(a => a.preTeaching.durationMin > 3 && a.correctPercent >= 75);
    if (overExplained.length >= 1) {
      patterns.push({
        pattern: "Over-explaining high-correctness concepts",
        occurrences: overExplained.length,
        details: overExplained.map((a: any) => `${a.label} (${a.startTime}): ${a.preTeaching.durationMin} min explanation, students scored ${a.correctPercent}%`),
        impact: `The teacher spent excessive time (${overExplained.map((a: any) => a.preTeaching.durationMin + ' min').join(', ')}) explaining concepts students already understood. This consumed ${Math.round(overExplained.reduce((s: number, a: any) => s + a.preTeaching.durationMin, 0))} min total — time that is better allocated to practice or weaker topics.`,
        recommendation: "Reduce explanation time for concepts where students demonstrate strong understanding. Reallocate this time to low-scoring topics.",
      });
    }

    const underExplained = activityTimeline.filter(a => a.preTeaching.durationMin < 1 && a.correctPercent < 50);
    if (underExplained.length >= 1) {
      patterns.push({
        pattern: "Rushing through low-correctness concepts",
        occurrences: underExplained.length,
        details: underExplained.map((a: any) => `${a.label} (${a.startTime}): only ${a.preTeaching.durationMin} min explanation, students scored ${a.correctPercent}%`),
        impact: `Students scored poorly (${underExplained.map((a: any) => a.correctPercent + '%').join(', ')}) on concepts that received minimal explanation. The teacher moved to activities before building sufficient understanding.`,
        recommendation: "Spend at least 2-3 minutes explaining concepts before testing. Use examples and check understanding before starting an activity.",
      });
    }

    const talkDuringActivities = activityTimeline.filter(a => a.duringTeaching.teacherTalking && a.duringTeaching.durationMin > 0.3);
    if (talkDuringActivities.length >= 2) {
      patterns.push({
        pattern: "Speaking during student solving time",
        occurrences: talkDuringActivities.length,
        details: talkDuringActivities.map((a: any) => `${a.label} (${a.startTime}): teacher talked ${a.duringTeaching.durationMin} min about "${a.duringTeaching.topics}"`),
        impact: `The teacher interrupted student independent work in ${talkDuringActivities.length} activities. This disrupts concentration and reduces the reliability of assessment results.`,
        recommendation: "Stay silent during activities. If students need help, use chat or wait until the activity ends to explain.",
      });
    }

    const ignoredConfusion = confusionMoments.filter(cm => cm.teacherResponse.includes("ignored") || cm.teacherResponse.includes("did not address"));
    if (ignoredConfusion.length >= 1) {
      patterns.push({
        pattern: "Ignoring student confusion signals",
        occurrences: ignoredConfusion.length,
        details: ignoredConfusion.map((cm: any) => `${cm.timestamp}: ${cm.signalCount} confusion signals about "${cm.concept}" — ${cm.teacherResponse}`),
        impact: `${ignoredConfusion.length} confusion moment(s) went unaddressed. Students who expressed confusion did not receive clarification, leading to persistent misunderstanding.`,
        recommendation: "Monitor the chat during and after explanations. When students express confusion, pause and re-explain the concept with a different approach.",
      });
    }

    const studentChats = chats.filter((c: any) => c.userType === 'STUDENT');
    const promptPattern = /اكتبوا|في الشات|ردوا|جاوبوا|ارفعوا|حطوا|اختاروا|شاركوا/i;
    const engagementPrompts = sorted.filter(t => promptPattern.test(t.text));
    if (engagementPrompts.length >= 3 && studentChats.length >= 10) {
      patterns.push({
        pattern: "Strong engagement prompting behavior",
        occurrences: engagementPrompts.length,
        details: engagementPrompts.slice(0, 3).map(t => `${formatTime(t.startSec)}: "${t.text.substring(0, 80)}"`),
        impact: `The teacher actively prompted students to participate ${engagementPrompts.length} times, resulting in ${studentChats.length} student chat messages. This kept students engaged throughout the session.`,
        recommendation: "Continue this practice — prompting drives engagement and gives the teacher visibility into student understanding.",
      });
    }

    return patterns;
  }

  private buildMicroMoments(
    activityTimeline: any[],
    confusionMoments: any[],
    teachingClarity: any[],
    sorted: { startSec: number; endSec: number; text: string }[]
  ): { strong: any[]; risk: any[] } {
    const strong: any[] = [];
    const risk: any[] = [];

    const highCorrActivities = activityTimeline
      .filter((a: any) => a.correctPercent >= 75)
      .sort((a: any, b: any) => b.correctPercent - a.correctPercent);

    for (const act of highCorrActivities.slice(0, 3)) {
      strong.push({
        type: "Strong",
        timestamp: act.startTime,
        what: `${act.label} achieved ${act.correctPercent}% correctness after ${act.preTeaching.durationMin} min of teaching on "${act.preTeaching.topics}".`,
        why: `Students demonstrated strong understanding of "${act.preTeaching.topics}". The explanation duration (${act.preTeaching.durationMin} min) was well-calibrated for this concept.`,
        evidence: `Pre-teaching: ${act.preTeaching.durationMin} min → Activity result: ${act.correctPercent}% correct`,
      });
    }

    const clearExplanations = teachingClarity.filter(tc => tc.clarityScore >= 4);
    for (const tc of clearExplanations.slice(0, 1)) {
      if (strong.length < 3) {
        strong.push({
          type: "Strong",
          timestamp: tc.timestamp,
          what: `Explanation at ${tc.timestamp} on "${tc.concept}" scored ${tc.clarityScore}/5 on clarity (used ${tc.behaviors.filter((b: string) => !b.includes('No ')).join(', ')}).`,
          why: `A high-clarity explanation improves retention. The teacher structured this explanation well, increasing the likelihood that students understood the material.`,
          evidence: `"${tc.evidence.substring(0, 100)}..."`,
        });
      }
    }

    const lowCorrActivities = activityTimeline
      .filter((a: any) => a.correctPercent > 0 && a.correctPercent < 40)
      .sort((a: any, b: any) => a.correctPercent - b.correctPercent);

    for (const act of lowCorrActivities.slice(0, 3)) {
      risk.push({
        type: "Risk",
        timestamp: act.startTime,
        what: `${act.label} scored only ${act.correctPercent}% after ${act.preTeaching.durationMin > 0 ? act.preTeaching.durationMin + ' min teaching on "' + act.preTeaching.topics + '"' : 'no pre-teaching'}.`,
        why: act.preTeaching.durationMin > 2
          ? `Despite ${act.preTeaching.durationMin} min of explanation, students did not understand "${act.preTeaching.topics}". The teaching approach was ineffective for this concept.`
          : `Insufficient explanation time (${act.preTeaching.durationMin} min) before a complex activity led to poor student performance.`,
        evidence: `Pre-teaching: ${act.preTeaching.durationMin} min → Activity result: ${act.correctPercent}% correct`,
      });
    }

    for (const cm of confusionMoments.slice(0, 2)) {
      if (risk.length < 3) {
        risk.push({
          type: "Risk",
          timestamp: cm.timestamp,
          what: `${cm.signalCount} students expressed confusion about "${cm.concept}" at ${cm.timestamp}.`,
          why: `${cm.riskAssessment} ${cm.teacherResponse}.`,
          evidence: cm.messages.join(' | '),
        });
      }
    }

    return { strong: strong.slice(0, 3), risk: risk.slice(0, 3) };
  }

  private buildTeacherCommunicationInsights(
    sorted: { startSec: number; endSec: number; text: string }[],
    chats: any[],
    activityTimeline: any[],
    session: any,
    totalStudents: number
  ): any {
    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const continuousBlocks: { startSec: number; endSec: number; texts: string[] }[] = [];
    if (sorted.length > 0) {
      let blockStart = sorted[0].startSec;
      let blockEnd = sorted[0].endSec;
      let blockTexts = [sorted[0].text];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startSec - blockEnd <= 5) {
          blockEnd = Math.max(blockEnd, sorted[i].endSec);
          blockTexts.push(sorted[i].text);
        } else {
          if (blockEnd - blockStart >= 20) {
            continuousBlocks.push({ startSec: blockStart, endSec: blockEnd, texts: blockTexts });
          }
          blockStart = sorted[i].startSec;
          blockEnd = sorted[i].endSec;
          blockTexts = [sorted[i].text];
        }
      }
      if (blockEnd - blockStart >= 20) {
        continuousBlocks.push({ startSec: blockStart, endSec: blockEnd, texts: blockTexts });
      }
    }

    const introPattern = /الحين نتكلم عن|اليوم بنتعلم|الدرس اليوم|نبدأ ب|موضوعنا|بنشرح/i;
    const stepPattern = /أولا|ثانيا|ثالثا|الخطوة|أول شي|بعدين|ثم|بعد كذا|نبدأ.*ب|أول حاجة/i;
    const examplePattern = /مثلا|مثال|على سبيل|لو عندنا|تخيل|فرض|يعني مثل|لو كان/i;
    const summaryPattern = /يعني باختصار|بمعنى|الخلاصة|القصد|نلخص|الملخص/i;
    const verifyPattern = /واضح|صح|فاهمين|تمام|سؤال|فهمتوا|ماشي|صح ولا لا|عرفتوا/i;
    const rephrasePattern = /يعني|بمعنى|نقدر نقول|بالعربي|بشكل ثاني|مرة ثانية|نعيد/i;
    const interactPattern = /اكتبوا|في الشات|ردوا|جاوبوا|ارفعوا|حطوا|اختاروا|شاركوا/i;

    const explanationReviews: any[] = [];
    for (const block of continuousBlocks) {
      const combined = block.texts.join(' ');
      const durationSec = block.endSec - block.startSec;
      if (durationSec < 30) continue;
      const topics = this.extractTopics(block.texts);

      const hasIntro = introPattern.test(combined);
      const hasSteps = stepPattern.test(combined);
      const hasExample = examplePattern.test(combined);
      const hasSummary = summaryPattern.test(combined);
      const hasVerify = verifyPattern.test(combined);
      const hasRephrase = rephrasePattern.test(combined);
      const hasInteract = interactPattern.test(combined);

      const strengths: string[] = [];
      const improvements: string[] = [];

      if (hasIntro) strengths.push("Clear concept introduction detected");
      if (hasSteps) strengths.push("Logical step-by-step breakdown used");
      if (hasExample) strengths.push("Example or demonstration provided");
      if (hasSummary) strengths.push("Summary or reinforcement statement included");
      if (hasVerify) strengths.push("Checked student understanding");
      if (hasRephrase) strengths.push("Rephrased concept for clarity");
      if (hasInteract) strengths.push("Encouraged student interaction");

      if (!hasIntro) improvements.push("Add a clear concept introduction before diving into details");
      if (!hasSteps) improvements.push("Break the explanation into smaller, numbered steps");
      if (!hasExample) improvements.push("Use real-world examples or analogies to make the concept concrete");
      if (!hasSummary) improvements.push("End with a brief summary to reinforce key points");
      if (!hasVerify) improvements.push("Ask verification questions to check student understanding");
      if (!hasInteract) improvements.push("Prompt students to participate (e.g., 'write your answer in chat')");

      const nearbyActivities = activityTimeline.filter(a => {
        const actStartSec = this.parseTimeToSeconds(a.startTime) || 0;
        return actStartSec > block.endSec && actStartSec < block.endSec + 300;
      });

      let impactPrediction: string;
      if (nearbyActivities.length > 0) {
        const avgCorr = Math.round(nearbyActivities.reduce((s: number, a: any) => s + a.correctPercent, 0) / nearbyActivities.length);
        if (avgCorr >= 70) {
          impactPrediction = `The activity following this explanation scored ${avgCorr}% — the explanation effectively prepared students for the task.`;
        } else if (avgCorr >= 40) {
          impactPrediction = `The activity following this explanation scored ${avgCorr}% — the explanation partially prepared students but gaps remain. ${improvements.length > 0 ? 'Implementing the suggested improvements would increase comprehension.' : ''}`;
        } else {
          impactPrediction = `The activity following this explanation scored only ${avgCorr}% — the explanation did not prepare students adequately. A fundamentally different approach is needed.`;
        }
      } else {
        impactPrediction = `No activity directly followed this explanation to measure its impact. Using ${strengths.length}/7 effective teaching techniques.`;
      }

      explanationReviews.push({
        timestamp: `${formatTime(block.startSec)}–${formatTime(block.endSec)}`,
        durationMin: Math.round(durationSec / 60 * 10) / 10,
        concept: topics,
        strengths,
        improvements,
        evidence: combined.substring(0, 200),
        impactPrediction,
      });
    }

    const encouragePattern = /ممتاز|أحسنت|رائع|شاطر|تمام|كويس|جميل|صح عليك|برافو|ممتاز جداً|فكرة حلوة|إجابة ممتازة|جرب مرة ثانية|لا بأس|قريب جداً/i;
    let encourageCount = 0;
    let encourageDurationSec = 0;
    const encourageExamples: { timestamp: string; text: string }[] = [];

    for (const seg of sorted) {
      if (encouragePattern.test(seg.text)) {
        encourageCount++;
        encourageDurationSec += (seg.endSec - seg.startSec);
        if (encourageExamples.length < 5) {
          encourageExamples.push({
            timestamp: formatTime(seg.startSec),
            text: seg.text.substring(0, 100),
          });
        }
      }
    }

    const toneStrengths: string[] = [];
    const toneImprovements: string[] = [];

    if (encourageCount >= 5) toneStrengths.push(`Used encouraging language ${encourageCount} times throughout the session — consistent positive reinforcement`);
    else if (encourageCount >= 2) toneStrengths.push(`Used encouraging language ${encourageCount} times — some positive reinforcement detected`);

    const studentChats = chats.filter((c: any) => c.userType === 'STUDENT');
    const positiveUsers = session?.positiveUsers || 0;
    const negativeUsers = session?.negativeUsers || 0;
    const neutralUsers = session?.neutralUsers || 0;
    const totalSentiment = positiveUsers + negativeUsers + neutralUsers;
    const positivePercent = totalSentiment > 0 ? Math.round((positiveUsers / totalSentiment) * 100) : 0;

    if (positivePercent >= 70) toneStrengths.push(`Student sentiment is ${positivePercent}% positive — the encouraging tone is effective`);

    if (encourageCount < 3) toneImprovements.push("Increase frequency of praise — aim for at least 5 encouraging statements per session");
    if (encourageCount > 0) {
      const afterMistake = sorted.filter(seg => {
        if (!encouragePattern.test(seg.text)) return false;
        const nearbyLow = activityTimeline.some(a => {
          const actEnd = this.parseTimeToSeconds(a.endTime) || 0;
          return actEnd > 0 && seg.startSec > actEnd && seg.startSec < actEnd + 60 && a.correctPercent < 50;
        });
        return nearbyLow;
      });
      if (afterMistake.length === 0) toneImprovements.push("Use encouragement after mistakes — reinforce effort, not just correctness");
    } else {
      toneImprovements.push("No encouraging language detected — add praise for correct answers and effort");
      toneImprovements.push("Use recovery encouragement after student mistakes (e.g., 'close, try again')");
    }

    let toneRating: string;
    if (encourageCount >= 5 && positivePercent >= 70) toneRating = "Strongly Encouraging";
    else if (encourageCount >= 3 || positivePercent >= 60) toneRating = "Moderately Encouraging";
    else if (encourageCount >= 1) toneRating = "Neutral";
    else toneRating = "Needs Improvement";

    const studentImpact = positivePercent >= 70
      ? `The encouraging tone directly correlates with ${positivePercent}% positive student sentiment and ${studentChats.length} chat messages. Students are engaged and comfortable participating.`
      : positivePercent >= 50
      ? `Student sentiment is ${positivePercent}% positive. Increasing encouragement frequency would improve engagement and participation.`
      : `Student sentiment is only ${positivePercent}% positive. The lack of encouraging language is contributing to low engagement. ${studentChats.length < 10 ? `Only ${studentChats.length} student chat messages were recorded — students are disengaged.` : ''}`;

    const toneAnalysis = {
      frequency: encourageCount,
      durationMin: Math.round(encourageDurationSec / 60 * 10) / 10,
      rating: toneRating,
      strengths: toneStrengths,
      improvements: toneImprovements,
      examples: encourageExamples,
      studentImpact,
    };

    const praiseForCorrect = sorted.filter(seg => {
      if (!encouragePattern.test(seg.text)) return false;
      return activityTimeline.some(a => {
        const actEnd = this.parseTimeToSeconds(a.endTime) || 0;
        return actEnd > 0 && seg.startSec > actEnd && seg.startSec < actEnd + 120 && a.correctPercent >= 60;
      });
    }).length;

    const effortEncouragement = sorted.filter(seg => {
      return /جرب|حاول|لا بأس|قريب|شوي كمان|برضو كويس/i.test(seg.text);
    }).length;

    const motivationBefore = sorted.filter(seg => {
      if (!/يلا|خلونا|نبدأ|جاهزين|حماس/i.test(seg.text)) return false;
      return activityTimeline.some(a => {
        const actStart = this.parseTimeToSeconds(a.startTime) || 0;
        return actStart > 0 && seg.startSec > actStart - 60 && seg.startSec < actStart;
      });
    }).length;

    const recoveryAfterMistake = sorted.filter(seg => {
      if (!/لا بأس|عادي|جرب مرة ثانية|قريب جداً|الفكرة صح بس/i.test(seg.text)) return false;
      return activityTimeline.some(a => {
        const actEnd = this.parseTimeToSeconds(a.endTime) || 0;
        return actEnd > 0 && seg.startSec > actEnd && seg.startSec < actEnd + 120 && a.correctPercent < 50;
      });
    }).length;

    const totalReinforcement = praiseForCorrect + effortEncouragement + motivationBefore + recoveryAfterMistake;

    const reinforceStrengths: string[] = [];
    const reinforceImprovements: string[] = [];

    if (praiseForCorrect >= 2) reinforceStrengths.push(`Praised correct answers ${praiseForCorrect} time(s) after activities — students see their effort recognized`);
    if (effortEncouragement >= 2) reinforceStrengths.push(`Used effort-based encouragement ${effortEncouragement} time(s) — reinforces growth mindset`);
    if (motivationBefore >= 1) reinforceStrengths.push(`Motivated students before ${motivationBefore} activity/activities — builds confidence before tasks`);
    if (recoveryAfterMistake >= 1) reinforceStrengths.push(`Provided recovery encouragement after ${recoveryAfterMistake} low-scoring activity/activities — normalizes mistakes`);

    if (praiseForCorrect === 0) reinforceImprovements.push("Praise correct answers immediately after activities to reinforce learning");
    if (effortEncouragement === 0) reinforceImprovements.push("Encourage effort and partial thinking, not just final correct answers");
    if (motivationBefore === 0) reinforceImprovements.push("Add motivational language before activities to build student confidence");
    if (recoveryAfterMistake === 0) reinforceImprovements.push("After low-scoring activities, use recovery language to normalize mistakes and encourage retry");

    const chatParticipationRate = totalStudents > 0 ? Math.round((new Set(studentChats.map((c: any) => c.creatorId)).size / totalStudents) * 100) : 0;

    const reinforcementAnalysis = {
      totalCount: totalReinforcement,
      distribution: {
        praiseForCorrectness: praiseForCorrect,
        effortEncouragement,
        motivationBeforeTasks: motivationBefore,
        recoveryAfterMistakes: recoveryAfterMistake,
      },
      strengths: reinforceStrengths,
      improvements: reinforceImprovements,
      outcomeLink: `Reinforcement frequency: ${totalReinforcement}. Chat participation: ${chatParticipationRate}% of students. Positive sentiment: ${positivePercent}%. ${totalReinforcement >= 5 ? 'The consistent reinforcement is driving participation.' : totalReinforcement >= 2 ? 'Increasing reinforcement would boost engagement further.' : 'The lack of reinforcement is directly linked to low participation.'}`,
    };

    let stylePattern: string;
    let styleStrengths: string;
    let styleGrowth: string;
    const encourageRatio = sorted.length > 0 ? encourageCount / sorted.length : 0;

    if (encourageCount >= 5 && totalReinforcement >= 4) {
      stylePattern = "Highly Supportive and Motivating";
      styleStrengths = `The teacher consistently uses encouraging language (${encourageCount} instances), praise for correctness (${praiseForCorrect}), and effort acknowledgment (${effortEncouragement}). Students respond with ${positivePercent}% positive sentiment.`;
      styleGrowth = "Maintain this style. Consider varying the type of praise to keep it fresh and authentic.";
    } else if (encourageCount >= 2 && totalReinforcement >= 2) {
      stylePattern = "Moderately Encouraging";
      styleStrengths = `The teacher shows some encouraging behavior (${encourageCount} instances) and reinforcement (${totalReinforcement} total). There is room to increase both frequency and variety.`;
      styleGrowth = "Double the frequency of encouraging statements. Add effort-based praise and pre-activity motivation.";
    } else if (encourageCount <= 1 && totalReinforcement <= 1) {
      stylePattern = "Neutral Informational Delivery";
      styleStrengths = `The teacher delivers content efficiently but with minimal emotional engagement. Only ${encourageCount} encouraging statement(s) detected.`;
      styleGrowth = "Add praise after correct answers, encouragement before activities, and recovery statements after mistakes. Aim for at least 5 encouraging moments per session.";
    } else {
      stylePattern = "Directive / Lecture-Focused";
      styleStrengths = `The teacher focuses on content delivery with limited student interaction. ${encourageCount} encouraging statement(s) and ${totalReinforcement} reinforcement instance(s).`;
      styleGrowth = "Shift from one-way lecture to interactive teaching. Add comprehension checks, praise, and student engagement prompts throughout.";
    }

    const communicationPatterns = [{
      pattern: stylePattern,
      occurrences: encourageCount + totalReinforcement,
      strengths: styleStrengths,
      growth: styleGrowth,
      evidence: encourageExamples.slice(0, 3).map(e => `${e.timestamp}: "${e.text}"`).join(' | ') || 'No encouraging language detected in transcript',
    }];

    let commScoreValue = 0;
    const clarityScore = explanationReviews.length > 0
      ? Math.round(explanationReviews.reduce((s, r) => s + r.strengths.length, 0) / explanationReviews.length * 10) / 10
      : 0;
    commScoreValue += Math.min(clarityScore / 7 * 25, 25);
    commScoreValue += Math.min(encourageCount / 5 * 25, 25);
    commScoreValue += Math.min(totalReinforcement / 8 * 25, 25);
    const engagementCorrelation = (chatParticipationRate / 100 * 12.5) + (positivePercent / 100 * 12.5);
    commScoreValue += Math.min(engagementCorrelation, 25);
    commScoreValue = Math.round(commScoreValue);

    let commRating: string;
    if (commScoreValue >= 80) commRating = "Excellent Communicator";
    else if (commScoreValue >= 60) commRating = "Effective Communicator";
    else if (commScoreValue >= 40) commRating = "Developing Communication Skills";
    else commRating = "Needs Communication Coaching";

    const commJustification = `Score: ${commScoreValue}/100. Explanation clarity: ${explanationReviews.length} blocks with avg ${Math.round(clarityScore * 10) / 10}/7 techniques. Encouragement: ${encourageCount} instances. Reinforcement: ${totalReinforcement} total. Student engagement: ${chatParticipationRate}% chat participation, ${positivePercent}% positive sentiment.`;

    const communicationScore = {
      score: commScoreValue,
      rating: commRating,
      justification: commJustification,
      breakdown: {
        explanationClarity: Math.round(Math.min(clarityScore / 7 * 25, 25)),
        encouragementFrequency: Math.round(Math.min(encourageCount / 5 * 25, 25)),
        reinforcementBalance: Math.round(Math.min(totalReinforcement / 8 * 25, 25)),
        engagementCorrelation: Math.round(Math.min(engagementCorrelation, 25)),
      },
    };

    return {
      explanationReviews,
      toneAnalysis,
      reinforcementAnalysis,
      communicationPatterns,
      communicationScore,
    };
  }

  private buildActivityTimeline(
    activities: any[],
    sorted: { startSec: number; endSec: number; text: string }[],
    chats: any[]
  ): any[] {
    const happened = activities
      .filter(a => a.activityHappened && a.startTime && a.endTime)
      .map(a => ({
        ...a,
        startSec: this.parseTimeToSeconds(a.startTime),
        endSec: this.parseTimeToSeconds(a.endTime),
      }))
      .filter(a => a.startSec !== null && a.endSec !== null && a.startSec > 0 && a.endSec > 0)
      .map(a => ({ ...a, startSec: a.startSec as number, endSec: a.endSec as number }))
      .sort((a, b) => a.startSec - b.startSec);

    const typeLabels: Record<string, string> = {
      SECTION_CHECK: "Section Check",
      EXIT_TICKET: "Exit Ticket",
      TEAM_EXERCISE: "Team Exercise",
    };

    const timeline: any[] = [];
    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    for (let i = 0; i < happened.length; i++) {
      const act = happened[i];
      const prevEndSec = i > 0 ? happened[i - 1].endSec : (sorted.length > 0 ? sorted[0].startSec : act.startSec);
      const preActivity = this.getTranscriptForTimeRange(sorted, prevEndSec, act.startSec);
      const duringActivity = this.getTranscriptForTimeRange(sorted, act.startSec, act.endSec);
      const postEndSec = i + 1 < happened.length ? happened[i + 1].startSec : act.endSec + 180;
      const postActivity = this.getTranscriptForTimeRange(sorted, act.endSec, postEndSec);

      const chatsDuring = chats.filter((c: any) => {
        if (c.userType !== 'STUDENT') return false;
        const ts = this.parseTimeToSeconds(c.createdAtTs || '');
        return ts !== null && ts >= act.startSec && ts <= act.endSec;
      });
      const confusionDuring = this.detectChatConfusion(chats, act.startSec, act.endSec);

      const correctPercent = act.correctness?.percent ?? 0;
      const label = typeLabels[act.activityType] || act.activityType;

      const entry: any = {
        activityId: act.activityId,
        activityType: act.activityType,
        label,
        startTime: formatTime(act.startSec),
        endTime: formatTime(act.endSec),
        correctPercent,
        preTeaching: {
          durationMin: Math.round(preActivity.totalSec / 60 * 10) / 10,
          topics: preActivity.topics,
          sampleText: preActivity.texts.slice(0, 3).join(' ').substring(0, 200),
        },
        duringTeaching: {
          teacherTalking: duringActivity.totalSec > 0,
          durationMin: Math.round(duringActivity.totalSec / 60 * 10) / 10,
          topics: duringActivity.topics,
        },
        postTeaching: {
          durationMin: Math.round(postActivity.totalSec / 60 * 10) / 10,
          topics: postActivity.topics,
        },
        studentChatsDuring: chatsDuring.length,
        confusionDetected: confusionDuring.confused,
        confusionExamples: confusionDuring.examples,
      };

      const insights: string[] = [];

      if (preActivity.totalSec > 0) {
        insights.push(`Before this ${label}, the teacher spent ${entry.preTeaching.durationMin} min teaching: ${preActivity.topics}.`);
      } else {
        insights.push(`No teacher explanation was detected before this ${label}.`);
      }

      if (correctPercent >= 80) {
        insights.push(`Students scored ${correctPercent}% — the explanation on "${preActivity.topics}" was effective.`);
      } else if (correctPercent >= 50) {
        insights.push(`Students scored ${correctPercent}% — the explanation on "${preActivity.topics}" was partially effective. ${100 - correctPercent}% of students did not answer correctly and need reinforcement.`);
      } else if (correctPercent > 0) {
        insights.push(`Students scored only ${correctPercent}% — the explanation on "${preActivity.topics}" was not effective. The concept needs re-teaching with a different approach.`);
      }

      if (duringActivity.totalSec > 0 && act.activityType === 'EXIT_TICKET') {
        insights.push(`The teacher was talking for ${entry.duringTeaching.durationMin} min during the exit ticket about "${duringActivity.topics}" — this compromises assessment validity.`);
      } else if (duringActivity.totalSec > 0) {
        insights.push(`The teacher was talking for ${entry.duringTeaching.durationMin} min during this activity about "${duringActivity.topics}".`);
      }

      if (confusionDuring.confused) {
        insights.push(`Students showed confusion during this activity: ${confusionDuring.examples.join('; ')}`);
      }

      if (postActivity.totalSec > 0 && correctPercent < 50) {
        insights.push(`After the activity, the teacher spent ${entry.postTeaching.durationMin} min re-explaining: ${postActivity.topics}. Given the low score, this was appropriate.`);
      } else if (postActivity.totalSec > 60 && correctPercent > 75) {
        insights.push(`After the activity (${correctPercent}% correct), the teacher spent ${entry.postTeaching.durationMin} min explaining. Since most students understood, this time is excessive — move on to the next concept.`);
      }

      entry.insights = insights;
      timeline.push(entry);
    }
    return timeline;
  }

  private computeQAEvaluation(
    session: any,
    activities: any[],
    transcripts: any[],
    chats: any[],
    students: any[],
    pollStats: any,
    totalStudents: number,
    sessionTemperature: number,
    sessionCompletedPercent: number,
    avgLearningTime: number,
    feedback: { wentWell: any[]; needsImprovement: any[] },
    activityAnalyses: any[]
  ): any {
    const criteria: any[] = [];
    const teachingTime = session?.teachingTime || 0;

    const happenedActivities = activities.filter(a => a.activityHappened);
    const totalQuestions = pollStats.byQuestion?.length || 0;
    const overallCorrectness = pollStats.correctnessPercent || 0;
    const totalPolls = pollStats.totalPolls || 0;
    const totalAnswered = pollStats.totalAnswered || 0;
    const responseRate = totalPolls > 0 ? Math.round((totalAnswered / totalPolls) * 100) : 0;

    const studentChats = chats.filter((c: any) => c.userType === 'STUDENT');
    const teacherChats = chats.filter((c: any) => c.userType !== 'STUDENT');
    const uniqueChatStudents = new Set(studentChats.map((c: any) => c.creatorId)).size;

    const positiveUsers = session?.positiveUsers || 0;
    const negativeUsers = session?.negativeUsers || 0;
    const neutralUsers = session?.neutralUsers || 0;
    const totalSentiment = positiveUsers + negativeUsers + neutralUsers;
    const positivePercent = totalSentiment > 0 ? Math.round((positiveUsers / totalSentiment) * 100) : 0;

    const sorted = transcripts
      .filter((t: any) => t.startTime && t.endTime)
      .map((t: any) => ({
        startSec: this.parseTimeToSeconds(t.startTime),
        endSec: this.parseTimeToSeconds(t.endTime),
        text: t.text || '',
      }))
      .filter((t: any) => t.startSec !== null && t.endSec !== null)
      .sort((a: any, b: any) => a.startSec - b.startSec) as { startSec: number; endSec: number; text: string }[];

    let totalTeacherTalkSec = 0;
    for (const t of sorted) {
      totalTeacherTalkSec += (t.endSec - t.startSec);
    }
    const totalTeacherTalkMin = Math.round(totalTeacherTalkSec / 60 * 10) / 10;

    const continuousSegments: { startSec: number; endSec: number; durationSec: number }[] = [];
    if (sorted.length > 0) {
      let segStart: number = sorted[0].startSec;
      let segEnd: number = sorted[0].endSec;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].startSec - segEnd;
        if (gap <= 5) {
          segEnd = Math.max(segEnd, sorted[i].endSec);
        } else {
          continuousSegments.push({ startSec: segStart, endSec: segEnd, durationSec: segEnd - segStart });
          segStart = sorted[i].startSec;
          segEnd = sorted[i].endSec;
        }
      }
      continuousSegments.push({ startSec: segStart, endSec: segEnd, durationSec: segEnd - segStart });
    }
    const longSegments = continuousSegments.filter(s => s.durationSec > 120);
    const longestSegMin = continuousSegments.length > 0
      ? Math.round(Math.max(...continuousSegments.map(s => s.durationSec)) / 60 * 10) / 10
      : 0;

    const studentActivePercent = teachingTime > 0
      ? Math.round(((teachingTime - totalTeacherTalkMin) / teachingTime) * 100)
      : 0;

    const activityTimeline = this.buildActivityTimeline(activities, sorted, chats);

    const conceptMasteryMap = this.buildConceptMasteryMap(sorted, activityTimeline, chats);
    const teachingClarity = this.buildTeachingClarityEvaluation(sorted);
    const questioningAnalysis = this.buildQuestioningAnalysis(sorted, chats, activityTimeline);
    const confusionMoments = this.buildConfusionMoments(sorted, chats);
    const teachingPatterns = this.buildTeachingPatterns(sorted, activityTimeline, chats, confusionMoments);
    const microMoments = this.buildMicroMoments(activityTimeline, confusionMoments, teachingClarity, sorted);
    const teacherCommunication = this.buildTeacherCommunicationInsights(sorted, chats, activityTimeline, session, totalStudents);

    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // === 1. Content Mastery and Explanation ===
    let contentScore = 3;
    const evidence1: string[] = [];
    const comments1: string[] = [];

    if (totalQuestions >= 10) { contentScore += 0.5; evidence1.push(`Session included ${totalQuestions} questions — good coverage`); }
    else if (totalQuestions >= 6) { evidence1.push(`Session included ${totalQuestions} questions`); }
    else { contentScore -= 0.5; evidence1.push(`Only ${totalQuestions} questions — limited content coverage`); }

    if (overallCorrectness >= 70) { contentScore += 0.5; evidence1.push(`Overall correctness ${overallCorrectness}% — strong comprehension`); }
    else if (overallCorrectness >= 50) { evidence1.push(`Overall correctness ${overallCorrectness}% — moderate comprehension`); }
    else { contentScore -= 0.5; evidence1.push(`Overall correctness ${overallCorrectness}% — content comprehension issues`); }

    const highQs = (pollStats.byQuestion || []).filter((q: any) => q.percent >= 70).length;
    const lowQs = (pollStats.byQuestion || []).filter((q: any) => q.percent < 40).length;
    if (highQs >= totalQuestions * 0.5) { contentScore += 0.5; evidence1.push(`${highQs}/${totalQuestions} questions above 70% — content delivered well`); }
    if (lowQs >= totalQuestions * 0.3) { contentScore -= 0.5; evidence1.push(`${lowQs}/${totalQuestions} questions below 40% — several concepts not well understood`); }

    for (const atl of activityTimeline) {
      if (atl.preTeaching.durationMin > 0) {
        const effectiveness = atl.correctPercent >= 70 ? "effective" : atl.correctPercent >= 50 ? "partially effective" : "not effective";
        comments1.push(`Before ${atl.label} (${atl.startTime}): Teacher taught "${atl.preTeaching.topics}" for ${atl.preTeaching.durationMin} min. Result: ${atl.correctPercent}% correct — explanation was ${effectiveness}.`);
      }
      if (atl.correctPercent > 0 && atl.correctPercent < 40) {
        comments1.push(`${atl.label} scored only ${atl.correctPercent}%. The teacher's explanation of "${atl.preTeaching.topics}" before this activity did not achieve comprehension. A different teaching approach (examples, analogies, visual aids) is needed.`);
      }
    }

    if (lowQs > 0) {
      const weakTopics = activityTimeline
        .filter(a => a.correctPercent < 40 && a.preTeaching.topics !== 'General teaching')
        .map(a => a.preTeaching.topics);
      if (weakTopics.length > 0) {
        comments1.push(`Weak topics needing re-explanation: ${Array.from(new Set(weakTopics)).join(', ')}.`);
      }
    }

    contentScore = Math.max(1, Math.min(5, Math.round(contentScore * 2) / 2));
    criteria.push({
      id: 1,
      nameAr: "إتقان المحتوى والشرح",
      nameEn: "Content Mastery and Explanation",
      score: contentScore,
      evidence: evidence1,
      comments: comments1,
      recommendations: contentScore < 4 ? [
        lowQs > 0 ? "Re-explain concepts that scored below 40% using different approaches (examples, analogies)" : "",
        overallCorrectness < 60 ? "Slow down explanations and add more worked examples before checking understanding" : "",
        totalQuestions < 8 ? "Add more comprehension check questions during the session" : "",
      ].filter(Boolean) : ["Explanations are consistently accurate and clear. Maintain current teaching quality level."],
      notes: `${totalQuestions} questions, overall correctness ${overallCorrectness}%, ${highQs} strong / ${lowQs} weak`,
    });

    // === 2. Student Support and Motivation ===
    let engScore = 3;
    const evidence2: string[] = [];
    const comments2: string[] = [];

    if (responseRate >= 85) { engScore += 0.5; evidence2.push(`Response rate ${responseRate}% — high participation`); }
    else if (responseRate >= 70) { evidence2.push(`Response rate ${responseRate}%`); }
    else { engScore -= 0.5; evidence2.push(`Response rate ${responseRate}% — many students did not respond`); }

    if (sessionTemperature >= 80) { engScore += 0.5; evidence2.push(`Session temperature ${sessionTemperature}% — high engagement`); }
    else if (sessionTemperature >= 60) { evidence2.push(`Session temperature ${sessionTemperature}%`); }
    else { engScore -= 0.5; evidence2.push(`Session temperature ${sessionTemperature}% — low engagement`); }

    const chatParticipationRate = totalStudents > 0 ? Math.round((uniqueChatStudents / totalStudents) * 100) : 0;
    if (chatParticipationRate >= 20) { engScore += 0.5; evidence2.push(`${uniqueChatStudents} students (${chatParticipationRate}%) participated in chat`); }
    else if (chatParticipationRate >= 10) { evidence2.push(`${uniqueChatStudents} students (${chatParticipationRate}%) participated in chat`); }
    else { engScore -= 0.5; evidence2.push(`Only ${uniqueChatStudents} students (${chatParticipationRate}%) used chat — low engagement`); }

    if (positivePercent >= 80) { engScore += 0.5; evidence2.push(`Positive sentiment ${positivePercent}% (${positiveUsers}/${totalSentiment})`); }
    else if (positivePercent >= 60) { evidence2.push(`Positive sentiment ${positivePercent}%`); }
    else { engScore -= 0.5; evidence2.push(`Only ${positivePercent}% positive sentiment — students are not engaged or enjoying the session`); }

    const confusedActivities = activityTimeline.filter(a => a.confusionDetected);
    if (confusedActivities.length > 0) {
      for (const ca of confusedActivities) {
        comments2.push(`During ${ca.label} (${ca.startTime}), students showed confusion: ${ca.confusionExamples.join('; ')}. The teacher should pause and address these questions.`);
      }
    }

    const unansweredStudentQuestions = studentChats.filter(c => {
      const chatTs = this.parseTimeToSeconds(c.createdAtTs || '');
      if (chatTs === null) return false;
      const hasReply = teacherChats.some(r => {
        const rTs = this.parseTimeToSeconds(r.createdAtTs || '');
        return rTs !== null && rTs > chatTs && rTs < chatTs + 120;
      });
      return !hasReply;
    });
    if (unansweredStudentQuestions.length >= 3) {
      comments2.push(`${unansweredStudentQuestions.length} student messages in chat appeared to go unanswered — the teacher should monitor and respond to student questions.`);
      engScore -= 0.5;
    }

    if (teacherChats.length >= 3) {
      comments2.push(`The teacher sent ${teacherChats.length} messages in chat, showing active communication and encouragement.`);
    } else if (teacherChats.length === 0) {
      comments2.push(`The teacher did not send any chat messages — encouraging participation through chat helps build connection.`);
    }

    engScore = Math.max(1, Math.min(5, Math.round(engScore * 2) / 2));
    criteria.push({
      id: 2,
      nameAr: "دعم الطلاب وتحفيزهم",
      nameEn: "Student Support and Motivation",
      score: engScore,
      evidence: evidence2,
      comments: comments2,
      recommendations: engScore < 4 ? [
        responseRate < 80 ? "Encourage all students to respond to polls — give them enough time" : "",
        chatParticipationRate < 15 ? "Ask students to reply in chat for comprehension check questions" : "",
        sessionTemperature < 70 ? "Increase engagement using more interactive elements and positive reinforcement" : "",
        confusedActivities.length > 0 ? "When students express confusion in chat, pause and address their questions before continuing" : "",
      ].filter(Boolean) : ["Continue reinforcing student engagement and motivation"],
      notes: `${totalStudents} students, response rate ${responseRate}%, temperature ${sessionTemperature}%, ${confusedActivities.length} confusion events`,
    });

    // === 3. Communication and Teacher Presence ===
    let commScore = 3;
    const evidence3: string[] = [];
    const comments3: string[] = [];

    if (teacherChats.length >= 5) { commScore += 0.5; evidence3.push(`The teacher sent ${teacherChats.length} messages — effective communication`); }
    else if (teacherChats.length >= 1) { evidence3.push(`The teacher sent ${teacherChats.length} messages`); }
    else { commScore -= 0.5; evidence3.push("The teacher did not use chat to communicate with students"); }

    if (longSegments.length === 0) {
      commScore += 0.5;
      evidence3.push(`All talk segments under 2 minutes — good pacing and interaction`);
      comments3.push(`The teacher maintains good variation in delivery, breaking explanations with interaction points. This keeps students attentive.`);
    } else {
      commScore -= 0.5;
      evidence3.push(`${longSegments.length} talk segments exceeded 2 minutes — should break with interaction`);
      for (const seg of longSegments.slice(0, 3)) {
        const segTopics = this.extractTopics(
          sorted.filter(t => t.startSec >= seg.startSec && t.endSec <= seg.endSec).map(t => t.text)
        );
        const dMin = Math.round(seg.durationSec / 60 * 10) / 10;
        comments3.push(`Long uninterrupted talk: ${formatTime(seg.startSec)}–${formatTime(seg.endSec)} (${dMin} min) about "${segTopics}". Break this with a student check-in or chat prompt.`);
      }
    }

    if (positivePercent >= 75) { commScore += 0.5; evidence3.push(`Positive sentiment ${positivePercent}% indicates good relationship with students`); }
    else if (positivePercent < 60) { commScore -= 0.5; evidence3.push(`Low positive sentiment (${positivePercent}%) — the communication style is not connecting with students`); }

    const toneVariation = continuousSegments.length > 0 ? continuousSegments.length : 0;
    if (toneVariation >= 8) {
      comments3.push(`The teacher had ${toneVariation} distinct talk segments, showing good variation in delivery pace.`);
    } else if (toneVariation <= 3 && sorted.length > 10) {
      comments3.push(`Only ${toneVariation} distinct talk segments detected — the teacher is delivering in long monotonous blocks without enough breaks.`);
    }

    commScore = Math.max(1, Math.min(5, Math.round(commScore * 2) / 2));
    criteria.push({
      id: 3,
      nameAr: "التواصل وحضور المعلّم",
      nameEn: "Communication and Teacher Presence",
      score: commScore,
      evidence: evidence3,
      comments: comments3,
      recommendations: commScore < 4 ? [
        teacherChats.length < 3 ? "Engage more with student questions in chat" : "",
        longSegments.length > 0 ? "Break long talk segments with student interaction every 2 minutes" : "",
        "Vary tone and energy levels throughout the session to maintain student attention",
      ].filter(Boolean) : ["Communication is clear and energetic with strong virtual presence"],
      notes: `${teacherChats.length} teacher messages, longest segment ${longestSegMin} min, ${toneVariation} talk segments`,
    });

    // === 4. Adherence to Lesson Design, Plan, and Time Management ===
    let timeScore = 3;
    const evidence4: string[] = [];
    const comments4: string[] = [];
    const scheduledDuration = 45;
    const actualDuration = Math.round(teachingTime);
    const totalActivities = activities.length;
    const completedActivities = happenedActivities.length;

    if (actualDuration >= scheduledDuration - 5 && actualDuration <= scheduledDuration + 10) {
      timeScore += 0.5; evidence4.push(`Session lasted ${actualDuration} min — within expected ${scheduledDuration} min`);
    } else if (actualDuration < scheduledDuration - 5) {
      timeScore -= 0.5; evidence4.push(`Session only ${actualDuration} min — shorter than scheduled ${scheduledDuration} min`);
    } else {
      evidence4.push(`Session lasted ${actualDuration} min vs scheduled ${scheduledDuration} min — exceeded time`);
    }

    if (completedActivities === totalActivities) {
      timeScore += 0.5; evidence4.push(`All ${totalActivities} activities completed — lesson plan fully executed`);
    } else {
      const actCompRate = Math.round((completedActivities / totalActivities) * 100);
      if (actCompRate >= 80) { evidence4.push(`${completedActivities}/${totalActivities} activities completed (${actCompRate}%)`); }
      else { timeScore -= 0.5; evidence4.push(`Only ${completedActivities}/${totalActivities} activities completed (${actCompRate}%) — lesson plan not fully executed`); }
    }

    if (totalTeacherTalkMin <= 15) {
      timeScore += 0.5; evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — within 15 min limit`);
    } else if (totalTeacherTalkMin <= 20) {
      evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — slightly above 15 min target`);
    } else {
      timeScore -= 0.5; evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — significantly exceeds 15 min limit`);
    }

    if (studentActivePercent >= 60) {
      evidence4.push(`${studentActivePercent}% of time was student activity — excellent balance`);
    } else if (studentActivePercent >= 45) {
      evidence4.push(`${studentActivePercent}% student activity time`);
    } else {
      timeScore -= 0.5; evidence4.push(`Only ${studentActivePercent}% student activity time — teacher-dominated session`);
    }

    const avgLearningTimeMin = Math.round(avgLearningTime * 10) / 10;
    if (sessionCompletedPercent >= 80) {
      evidence4.push(`Session completion rate ${sessionCompletedPercent}% — students kept up with the pace`);
    } else if (sessionCompletedPercent < 60) {
      timeScore -= 0.5; evidence4.push(`Only ${sessionCompletedPercent}% session completion — the pacing is too fast for students to keep up`);
    }

    for (const atl of activityTimeline) {
      if (atl.preTeaching.durationMin > 3 && atl.correctPercent >= 75) {
        comments4.push(`${atl.preTeaching.durationMin} min of explanation before ${atl.label} (${atl.startTime}), but students scored ${atl.correctPercent}% — explanation was longer than needed. Consider reducing to allow more activity time.`);
      }
      if (atl.postTeaching.durationMin > 2 && atl.correctPercent >= 75) {
        comments4.push(`${atl.postTeaching.durationMin} min of explanation after ${atl.label} (${atl.correctPercent}% correct) — since students scored well, this post-activity time is excessive. Move on quickly when comprehension is high.`);
      }
      if (atl.preTeaching.durationMin < 0.5 && atl.correctPercent < 50) {
        comments4.push(`Only ${atl.preTeaching.durationMin} min of explanation before ${atl.label} (${atl.startTime}), which scored ${atl.correctPercent}%. Insufficient preparation time directly contributed to the low score.`);
      }
    }

    const transitionGaps: string[] = [];
    for (let i = 0; i < activityTimeline.length - 1; i++) {
      const current = activityTimeline[i];
      const next = activityTimeline[i + 1];
      const currentEndSec = this.parseTimeToSeconds(current.endTime) || 0;
      const nextStartSec = this.parseTimeToSeconds(next.startTime) || 0;
      const gapMin = Math.round((nextStartSec - currentEndSec) / 60 * 10) / 10;
      if (gapMin > 5) {
        transitionGaps.push(`${gapMin} min gap between ${current.label} and ${next.label}`);
      }
    }
    if (transitionGaps.length > 0) {
      comments4.push(`Transition delays detected: ${transitionGaps.join('; ')}. Smooth transitions improve pacing.`);
    }

    timeScore = Math.max(1, Math.min(5, Math.round(timeScore * 2) / 2));
    criteria.push({
      id: 4,
      nameAr: "الالتزام بتصميم وخطة الدرس وإدارة الوقت",
      nameEn: "Adherence to Lesson Design, Plan, and Time Management",
      score: timeScore,
      evidence: evidence4,
      comments: comments4,
      recommendations: timeScore < 4 ? [
        totalTeacherTalkMin > 15 ? "Reduce teacher talk to under 15 min to allow more student practice time" : "",
        studentActivePercent < 50 ? "Increase student activity time — aim for at least 50% of the session" : "",
        completedActivities < totalActivities ? "Ensure all planned activities are completed within session time" : "",
        sessionCompletedPercent < 70 ? "Slow down pacing so more students can keep up" : "",
      ].filter(Boolean) : ["Time management is effective with smooth transitions between activities"],
      notes: `Session ${actualDuration} min, talk ${totalTeacherTalkMin} min, ${completedActivities}/${totalActivities} activities, ${studentActivePercent}% student time, avg learning ${avgLearningTimeMin} min`,
    });

    // === 5. Teacher Errors During Instruction and Explanation ===
    let errorScore = 4;
    const evidence5: string[] = [];
    const comments5: string[] = [];
    let errorCount = 0;

    const exitTicketAnalysis = activityAnalyses.find((a: any) => a.activityType === 'EXIT_TICKET');
    const exitTicketInstance = exitTicketAnalysis?.instances?.[0];
    if (exitTicketInstance?.teacherTalkDuring) {
      errorCount++;
      errorScore -= 1;
      const etTopics = exitTicketInstance.teacherTalkTopics || 'unknown topics';
      evidence5.push(`MAJOR: The teacher was talking during the exit ticket for ${exitTicketInstance.teacherTalkOverlapMin} min — students should answer independently`);
      comments5.push(`During the exit ticket, the teacher was discussing "${etTopics}" for ${exitTicketInstance.teacherTalkOverlapMin} min. This is a major error because exit tickets must be completed independently to accurately measure student comprehension. The teacher's talking gave hints or distracted students, invalidating the results.`);
    } else {
      evidence5.push("The teacher did not talk during the exit ticket — correct protocol followed");
    }

    for (const atl of activityTimeline) {
      if (atl.duringTeaching.teacherTalking && atl.activityType !== 'EXIT_TICKET' && atl.duringTeaching.durationMin > 0.5) {
        errorCount++;
        comments5.push(`The teacher talked for ${atl.duringTeaching.durationMin} min during ${atl.label} (${atl.startTime}) about "${atl.duringTeaching.topics}". Activities should be student-independent unless clarifying instructions.`);
      }
    }

    const lowCorrAfterLongExplain = activityTimeline.filter(a => a.preTeaching.durationMin > 2 && a.correctPercent < 40);
    for (const lc of lowCorrAfterLongExplain) {
      errorCount++;
      comments5.push(`Despite ${lc.preTeaching.durationMin} min of explanation on "${lc.preTeaching.topics}" before ${lc.label}, students scored only ${lc.correctPercent}%. The explanation was unclear or inaccurate. The teacher needs to verify their own understanding of this concept and reteach it.`);
    }

    const tmImprovements = feedback.needsImprovement.filter((f: any) => f.category === 'time_management');
    if (tmImprovements.length >= 3) {
      errorScore -= 0.5;
      evidence5.push(`${tmImprovements.length} time management issues identified — recurring pattern`);
    } else if (tmImprovements.length > 0) {
      evidence5.push(`${tmImprovements.length} minor time management issues`);
    } else {
      errorScore += 0.5;
      evidence5.push("No major time management errors detected");
    }

    if (errorCount === 0) {
      comments5.push("No significant instructional errors were detected during this session.");
    }

    errorScore = Math.max(1, Math.min(5, Math.round(errorScore * 2) / 2));
    criteria.push({
      id: 5,
      nameAr: "أخطاء المعلم أثناء التدريس والشرح",
      nameEn: "Teacher Errors During Instruction and Explanation",
      score: errorScore,
      evidence: evidence5,
      comments: comments5,
      recommendations: errorScore < 4 ? [
        exitTicketInstance?.teacherTalkDuring ? "Do not talk during the exit ticket — let students answer independently" : "",
        errorCount > 0 ? "Review concepts with low correctness and verify your own understanding before re-teaching" : "",
        tmImprovements.length > 0 ? "Review time allocation after each activity based on student correctness rate" : "",
      ].filter(Boolean) : ["No major errors detected — maintain current standards"],
      notes: `${errorCount} errors detected. ${exitTicketInstance?.teacherTalkDuring ? `Teacher talked ${exitTicketInstance.teacherTalkOverlapMin} min during exit ticket.` : "Exit ticket protocol followed."}`,
    });

    // === 6. Moments of Distinction ===
    let distinctScore = 3;
    const evidence6: string[] = [];
    const comments6: string[] = [];
    const wellCount = feedback.wentWell.length;

    if (wellCount >= 5) { distinctScore += 1; evidence6.push(`${wellCount} positive observations identified — the session had many strong moments`); }
    else if (wellCount >= 3) { distinctScore += 0.5; evidence6.push(`${wellCount} positive observations`); }
    else { evidence6.push(`Only ${wellCount} positive observations — few distinct moments`); }

    const bestQuestion = (pollStats.byQuestion || []).reduce((best: any, q: any) => (!best || q.percent > best.percent) ? q : best, null);
    if (bestQuestion && bestQuestion.percent >= 75) {
      distinctScore += 0.5;
      evidence6.push(`Strongest question achieved ${bestQuestion.percent}% correctness — effective teaching for this concept`);
    }

    if (sessionTemperature >= 80 && positivePercent >= 80) {
      evidence6.push(`High temperature (${sessionTemperature}%) with ${positivePercent}% positive sentiment — students were enthusiastic`);
    }

    const highCorrActivities = activityTimeline.filter(a => a.correctPercent >= 80);
    for (const hca of highCorrActivities) {
      comments6.push(`${hca.label} (${hca.startTime}) achieved ${hca.correctPercent}% correctness after teaching "${hca.preTeaching.topics}" for ${hca.preTeaching.durationMin} min — this is a moment of effective teaching. The explanation was clear and well-paced.`);
    }

    const goodFeedback = feedback.wentWell.filter(f => f.category === 'student_stage');
    for (const gf of goodFeedback) {
      comments6.push(`Good decision: ${gf.detail}`);
    }

    if (longSegments.length === 0 && totalTeacherTalkMin <= 15) {
      comments6.push(`The teacher maintained excellent pacing throughout — all talk segments under 2 minutes and total talk time within the 15-minute limit. This is a significant strength.`);
    }

    if (comments6.length === 0) {
      comments6.push("No standout moments of distinction were identified in this session. Aim to create memorable teaching moments through real-world examples, student celebration, or creative explanations.");
    }

    distinctScore = Math.max(1, Math.min(5, Math.round(distinctScore * 2) / 2));
    criteria.push({
      id: 6,
      nameAr: "لحظات تميّز من المعلم",
      nameEn: "Moments of Distinction",
      score: distinctScore,
      evidence: evidence6,
      comments: comments6,
      recommendations: distinctScore < 4 ? [
        "Create memorable learning moments through stories or real-world connections",
        "Celebrate student successes publicly to boost motivation",
      ] : ["Continue creating impactful teaching moments"],
      notes: `${wellCount} positive observations, best question at ${bestQuestion?.percent || 0}%`,
    });

    // === 7. General Evaluation and Quality ===
    const avgOfAll = Math.round((contentScore + engScore + commScore + timeScore + errorScore + distinctScore) / 6 * 2) / 2;
    const overallScore = Math.max(1, Math.min(5, avgOfAll));
    const evidence7: string[] = [];
    const comments7: string[] = [];

    if (overallScore >= 4) { evidence7.push("The session was strong overall — most criteria met or exceeded expectations"); }
    else if (overallScore >= 3) { evidence7.push("The session met basic expectations with room for improvement in specific areas"); }
    else { evidence7.push("The session needs significant improvement across multiple criteria"); }

    evidence7.push(`Average across 6 criteria: ${overallScore}/5`);

    const strongAreas = criteria.filter((c: any) => c.score >= 4).map((c: any) => c.nameEn);
    const weakAreas = criteria.filter((c: any) => c.score < 3).map((c: any) => c.nameEn);
    if (strongAreas.length > 0) evidence7.push(`Strengths: ${strongAreas.join(', ')}`);
    if (weakAreas.length > 0) evidence7.push(`Areas for improvement: ${weakAreas.join(', ')}`);

    for (const atl of activityTimeline) {
      comments7.push(`${atl.label} (${atl.startTime}–${atl.endTime}): ${atl.correctPercent}% correct. Pre-teaching: ${atl.preTeaching.durationMin} min on "${atl.preTeaching.topics}". ${atl.duringTeaching.teacherTalking ? `Teacher talked ${atl.duringTeaching.durationMin} min during activity.` : 'No teacher talk during activity.'} ${atl.confusionDetected ? 'Student confusion detected.' : ''}`);
    }

    criteria.push({
      id: 7,
      nameAr: "التقييم العام والجودة",
      nameEn: "General Evaluation and Quality",
      score: overallScore,
      evidence: evidence7,
      comments: comments7,
      recommendations: weakAreas.length > 0
        ? [`Focus on improving: ${weakAreas.join(', ')}`, "Review session recording and compare against evaluation criteria"]
        : ["Continue maintaining high quality across all criteria"],
      notes: `Average: ${overallScore}/5 | Strong: ${strongAreas.length} | Weak: ${weakAreas.length}`,
    });

    const overallAvg = Math.round(criteria.reduce((s: number, c: any) => s + c.score, 0) / criteria.length * 10) / 10;

    return {
      criteria,
      overallScore: overallAvg,
      activityTimeline,
      transcriptAnalysis: {
        conceptMasteryMap,
        teachingClarity,
        questioningAnalysis,
        confusionMoments,
        teachingPatterns,
        microMoments,
      },
      teacherCommunication,
      summary: {
        totalStudents,
        totalQuestions,
        overallCorrectness,
        responseRate,
        sessionTemperature,
        teachingTimeMin: Math.round(teachingTime),
        teacherTalkMin: totalTeacherTalkMin,
        studentActivePercent,
        activitiesCompleted: `${completedActivities}/${totalActivities}`,
        chatParticipation: `${uniqueChatStudents}/${totalStudents} students`,
      },
    };
  }

  private async generateAllActivityAnalyses(
    courseSessionId: number,
    activities: any[],
    transcripts: SessionTranscript[],
    chats: SessionChat[],
    totalStudents: number,
    feedback: { wentWell: any[]; needsImprovement: any[] }
  ): Promise<any[]> {
    const canonicalOrder = ['SECTION_CHECK', 'TEAM_EXERCISE', 'EXIT_TICKET'];
    const typeOrder: Record<string, number> = { SECTION_CHECK: 0, TEAM_EXERCISE: 1, EXIT_TICKET: 2 };
    const analyses: any[] = [];

    const grouped: Record<string, any[]> = {};
    for (const act of activities) {
      const canonical = act.activityType;
      if (!grouped[canonical]) grouped[canonical] = [];
      grouped[canonical].push(act);
    }

    for (const actType of canonicalOrder) {
      const typeActivities = (grouped[actType] || []).filter((a: any) => a.activityHappened);
      if (typeActivities.length === 0) continue;

      const instances: any[] = [];
      for (const act of typeActivities) {
        const instance = await this.generateSingleActivityAnalysis(
          courseSessionId, act, transcripts, chats, totalStudents
        );

        const relatedWell = feedback.wentWell.filter(f => f.activityId === act.activityId);
        const relatedImprove = feedback.needsImprovement.filter(f => f.activityId === act.activityId);
        instance.feedback = { wentWell: relatedWell, needsImprovement: relatedImprove };
        instances.push(instance);
      }

      const pluralLabels: Record<string, string> = {
        SECTION_CHECK: "Section Checks",
        TEAM_EXERCISE: "Team Exercise",
        EXIT_TICKET: "Exit Ticket",
      };
      const typeLabel = pluralLabels[actType] || actType;

      if (actType === 'SECTION_CHECK' && instances.length > 0) {
        const combined = this.combineSectionChecks(instances, totalStudents);
        analyses.push({
          activityType: actType,
          label: typeLabel,
          sortOrder: typeOrder[actType] ?? 99,
          combined,
          instances: [],
        });
      } else {
        analyses.push({
          activityType: actType,
          label: typeLabel,
          sortOrder: typeOrder[actType] ?? 99,
          combined: null,
          instances,
        });
      }
    }

    analyses.sort((a, b) => a.sortOrder - b.sortOrder);
    return analyses;
  }

  private combineSectionChecks(instances: any[], totalStudents: number): any {
    const count = instances.length;
    const totalDurationMin = instances.reduce((s, i) => s + (i.durationMin || 0), 0);
    const totalPlannedMin = instances.reduce((s, i) => s + (i.plannedDurationMin || 0), 0);
    const totalMcqs = instances.reduce((s, i) => s + (i.totalMcqs || 0), 0);

    const allCorrectness = instances.filter(i => i.overallCorrectness);
    const avgCorrectness = allCorrectness.length > 0
      ? Math.round(allCorrectness.reduce((s, i) => s + i.overallCorrectness.percent, 0) / allCorrectness.length)
      : 0;

    const avgStudentsAnswered = Math.round(
      instances.reduce((s, i) => s + i.studentsWhoAnswered, 0) / count
    );

    const allQuestions = instances.flatMap(i => i.questions);

    const allFeedbackWell = instances.flatMap(i => i.feedback?.wentWell || []);
    const allFeedbackImprove = instances.flatMap(i => i.feedback?.needsImprovement || []);

    const allActivityIds = instances.map(i => i.activityId);

    const insights: string[] = [];

    const lowQs = allQuestions.filter(q => q.percent < 40);
    const highQs = allQuestions.filter(q => q.percent >= 80);
    if (lowQs.length > 0) {
      insights.push(`${lowQs.length} out of ${allQuestions.length} questions had very low correctness (below 40%) — these topics need re-explanation.`);
    }

    const avgCompletionRate = count > 0
      ? Math.round(instances.reduce((s, i) => s + (i.studentsWhoAnswered / totalStudents * 100), 0) / count)
      : 0;
    if (avgCompletionRate < 80) {
      insights.push(`Average section check completion rate was ${avgCompletionRate}% — indicating some students ran out of time.`);
    }

    const teacherTalkInstances = instances.filter(i => i.teacherTalkDuring);
    if (teacherTalkInstances.length > 0) {
      const totalOverlap = Math.round(teacherTalkInstances.reduce((s, i) => s + i.teacherTalkOverlapMin, 0) * 10) / 10;
      insights.push(`The teacher was talking during ${teacherTalkInstances.length} out of ${count} section checks (${totalOverlap} min total).`);
    }

    if (avgCorrectness < 50) {
      insights.push(`Overall correctness across all section checks is low at ${avgCorrectness}% — the teaching approach failed to convey the material effectively and needs a complete rework.`);
    }

    return {
      activityIds: allActivityIds,
      count,
      totalQuestions: totalMcqs,
      avgCorrectness,
      avgStudentsAnswered,
      totalStudents,
      durationMin: Math.round(totalDurationMin * 10) / 10,
      plannedDurationMin: Math.round(totalPlannedMin * 10) / 10,
      questions: allQuestions,
      insights,
      feedback: { wentWell: allFeedbackWell, needsImprovement: allFeedbackImprove },
    };
  }

  private classifyActivityType(activityType: string, totalMcqs: number | null): string {
    const t = (activityType || '').toUpperCase().replace(/[\s_-]+/g, '_');

    if (t === 'SECTION_CHECK') return 'SECTION_CHECK';
    if (t === 'EXIT_TICKET') return 'EXIT_TICKET';
    if (t === 'TEAM_EXERCISE') return 'TEAM_EXERCISE';

    const exitTicketAliases = ['SQUID_GAMES', 'SQUID_GAME', 'SQUIDGAMES', 'SQUIDGAME'];
    if (exitTicketAliases.includes(t)) return 'EXIT_TICKET';

    const teamExerciseAliases = ['BETTER_CALL_SAUL', 'BETTERCALLSAUL'];
    if (teamExerciseAliases.includes(t)) return 'TEAM_EXERCISE';

    if (totalMcqs && totalMcqs > 0) return 'SECTION_CHECK';

    return 'SECTION_CHECK';
  }

  private toMin(seconds: number): number {
    return Math.round(seconds / 60 * 10) / 10;
  }

  private async generateSingleActivityAnalysis(
    courseSessionId: number,
    act: any,
    transcripts: SessionTranscript[],
    chats: SessionChat[],
    totalStudents: number
  ): Promise<any> {
    const polls = await db.select().from(userPolls)
      .where(eq(userPolls.courseSessionId, courseSessionId));

    const actPolls = polls.filter(p => p.classroomActivityId === act.activityId);

    const byQuestion: Record<string, { text: string; seen: number; answered: number; correct: number }> = {};
    for (const p of actPolls) {
      const qId = String(p.questionId || 'unknown');
      if (!byQuestion[qId]) {
        byQuestion[qId] = { text: p.questionText || '', seen: 0, answered: 0, correct: 0 };
      }
      if (p.pollSeen) byQuestion[qId].seen++;
      if (p.pollAnswered) {
        byQuestion[qId].answered++;
        if (p.isCorrectAnswer) byQuestion[qId].correct++;
      }
    }

    const actStartSec = this.parseTimeToSeconds(act.startTime || '');
    const transcriptTimed = transcripts.map(t => ({
      startSec: this.parseTimeToSeconds(t.startTime || ''),
      endSec: this.parseTimeToSeconds(t.endTime || ''),
      text: t.text || '',
    })).filter(t => t.startSec !== null && t.endSec !== null) as { startSec: number; endSec: number; text: string }[];

    let preTeachDurationMin = 0;
    let preTeachTopics = '';
    let preTeachSegments: { startSec: number; endSec: number; text: string }[] = [];
    if (actStartSec !== null) {
      preTeachSegments = transcriptTimed.filter(t =>
        t.endSec <= actStartSec && t.startSec >= actStartSec - 300
      );
      if (preTeachSegments.length > 0) {
        const totalSec = preTeachSegments.reduce((s, t) => s + (t.endSec - t.startSec), 0);
        preTeachDurationMin = Math.round(totalSec / 60 * 10) / 10;
        preTeachTopics = this.extractTopics(preTeachSegments.map(t => t.text));
      }
    }

    const preTeachVerdict = this.buildExplanationVerdict(
      preTeachSegments, chats, actStartSec, preTeachDurationMin, preTeachTopics
    );

    const questions = Object.entries(byQuestion).map(([id, q]) => {
      const cleanText = q.text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const percent = q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0;
      const notAnswered = q.seen - q.answered;

      const insights: string[] = [];

      if (notAnswered > 0 && q.seen > 0) {
        const skipPercent = Math.round((notAnswered / q.seen) * 100);
        if (skipPercent >= 20) {
          insights.push(`${notAnswered} students (${skipPercent}%) saw the question but didn't answer — the question is too difficult or confusing for this group.`);
        }
      }

      if (percent >= 80) {
        insights.push(`Strong result — most students understood this concept well.`);
      } else if (percent >= 60) {
        insights.push(`Acceptable, but some students struggled — schedule a quick review next session.`);
      } else if (percent >= 40) {
        insights.push(`Low correctness — this topic needs additional explanation or re-teaching next session.`);
      } else if (q.answered > 0) {
        insights.push(`Very low correctness — the concept was not understood by the majority.`);
      }

      const verdictForQuestion = this.buildQuestionSpecificVerdict(percent, preTeachDurationMin, preTeachVerdict);

      return {
        questionId: id,
        questionText: cleanText,
        seen: q.seen,
        answered: q.answered,
        correct: q.correct,
        percent,
        insights,
        teacherExplanationMin: preTeachDurationMin,
        teacherExplanationTopic: preTeachTopics,
        teacherExplanationVerdict: verdictForQuestion,
      };
    });

    const totalSeen = new Set(actPolls.filter(p => p.pollSeen).map(p => p.userId)).size;
    const totalAnswered = new Set(actPolls.filter(p => p.pollAnswered).map(p => p.userId)).size;

    const etStartSec = this.parseTimeToSeconds(act.startTime || '');
    const etEndSec = this.parseTimeToSeconds(act.endTime || '');

    let teacherTalkDuring = false;
    let teacherTalkOverlapMin = 0;
    let teacherTalkTopics = '';
    const transcriptTimes = transcripts.map(t => ({
      startSec: this.parseTimeToSeconds(t.startTime || ''),
      endSec: this.parseTimeToSeconds(t.endTime || ''),
      text: t.text || '',
    }));

    if (etStartSec !== null && etEndSec !== null) {
      const overlapping = transcriptTimes.filter(t => {
        if (t.startSec === null || t.endSec === null) return false;
        return t.startSec < etEndSec && t.endSec > etStartSec;
      });

      if (overlapping.length > 0) {
        teacherTalkDuring = true;
        let totalOverlapSec = 0;
        for (const t of overlapping) {
          const overlapStart = Math.max(t.startSec!, etStartSec);
          const overlapEnd = Math.min(t.endSec!, etEndSec);
          if (overlapEnd > overlapStart) totalOverlapSec += (overlapEnd - overlapStart);
        }
        teacherTalkTopics = this.extractTopics(overlapping.map(t => t.text));
        teacherTalkOverlapMin = Math.round(totalOverlapSec / 60 * 10) / 10;
      }
    }

    const overallInsights: string[] = [];

    if (act.activityType === 'EXIT_TICKET' && teacherTalkDuring) {
      overallInsights.push(`The teacher was talking for ${teacherTalkOverlapMin} min during the exit ticket, discussing: ${teacherTalkTopics}. The exit ticket should be completed independently to accurately measure comprehension.`);
    }

    const overallPercent = act.correctness?.percent ?? 0;
    if (overallPercent < 50 && overallPercent > 0) {
      overallInsights.push(`Overall correctness is low at ${overallPercent}% — the content delivery failed and requires a different explanation approach.`);
    }

    const durationMin = act.durationMin || 0;
    const plannedMin = act.plannedDurationMin || 0;

    if (plannedMin > 0 && durationMin < plannedMin * 0.7) {
      overallInsights.push(`Activity was shorter than planned (${durationMin} min vs ${plannedMin} min planned) — insufficient time directly caused incomplete answers.`);
    } else if (plannedMin > 0 && durationMin > plannedMin * 1.3) {
      overallInsights.push(`Activity ran longer than planned (${durationMin} min vs ${plannedMin} min planned) — students needed more time than allocated.`);
    }

    const completionRate = totalStudents > 0 ? Math.round((totalAnswered / totalStudents) * 100) : 0;
    if (completionRate < 80) {
      overallInsights.push(`Only ${completionRate}% of students completed this activity — ${100 - completionRate}% ran out of time or lost engagement.`);
    }

    if (etStartSec !== null && etEndSec !== null) {
      const studentChats = chats.filter(c => c.userType === 'STUDENT');
      const chatsDuringAct = studentChats.filter(c => {
        const ts = this.parseTimeToSeconds(c.createdAtTs || '');
        return ts !== null && ts >= etStartSec && ts <= etEndSec;
      });
      const unansweredChats = chatsDuringAct.filter(c => {
        const chatTs = this.parseTimeToSeconds(c.createdAtTs || '');
        if (chatTs === null) return false;
        const hasTeacherReply = chats.some(r => {
          if (r.userType === 'STUDENT') return false;
          const rTs = this.parseTimeToSeconds(r.createdAtTs || '');
          return rTs !== null && rTs > chatTs && rTs < chatTs + 120;
        });
        return !hasTeacherReply;
      });
      if (unansweredChats.length >= 3) {
        overallInsights.push(`${unansweredChats.length} student messages during this activity went unanswered — students were seeking clarification and did not receive it.`);
      }
    }

    const highCorrectQs = questions.filter(q => q.percent >= 80);
    if (highCorrectQs.length > 0 && teacherTalkDuring && act.activityType === 'EXIT_TICKET') {
      overallInsights.push(`${highCorrectQs.length} questions achieved high correctness (80%+), yet the teacher was still talking during the exit ticket.`);
    }

    return {
      activityId: act.activityId,
      activityType: act.activityType,
      startTime: act.startTime,
      endTime: act.endTime,
      durationMin: durationMin,
      plannedDurationMin: plannedMin,
      totalMcqs: act.totalMcqs || 0,
      totalStudents,
      studentsWhoSaw: totalSeen,
      studentsWhoAnswered: totalAnswered,
      overallCorrectness: act.correctness,
      questions,
      teacherTalkDuring,
      teacherTalkOverlapMin,
      teacherTalkTopics,
      overallInsights,
    };
  }

  private parseTimeToSeconds(timeStr: string): number | null {
    if (!timeStr) return null;
    const match24 = timeStr.match(/(\d{4}-\d{2}-\d{2}\s+)?(\d{1,2}):(\d{2}):(\d{2})/);
    if (match24) {
      return parseInt(match24[2]) * 3600 + parseInt(match24[3]) * 60 + parseInt(match24[4]);
    }
    const match12 = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
    if (match12) {
      let h = parseInt(match12[1]);
      const m = parseInt(match12[2]);
      const s = parseInt(match12[3]);
      const ampm = match12[4].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 3600 + m * 60 + s;
    }
    const matchDateHM = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+(\d{1,2}):(\d{2})$/);
    if (matchDateHM) {
      return parseInt(matchDateHM[1]) * 3600 + parseInt(matchDateHM[2]) * 60;
    }
    return null;
  }

  private generateFeedback(
    activities: any[],
    transcripts: SessionTranscript[],
    chats: SessionChat[],
    session: any,
    pollStats: any
  ): { wentWell: any[]; needsImprovement: any[] } {
    const wentWell: any[] = [];
    const needsImprovement: any[] = [];

    const happenedActivities = activities
      .filter(a => a.activityHappened && a.endTime && a.correctness)
      .sort((a, b) => (a.endTime || '').localeCompare(b.endTime || ''));

    const transcriptTimes = transcripts.map(t => ({
      startSec: this.parseTimeToSeconds(t.startTime || ''),
      endSec: this.parseTimeToSeconds(t.endTime || ''),
      text: t.text || '',
    })).filter(t => t.startSec !== null);

    const stagePatterns = /اشرح|اشرحي|تعال|تعالي|يلا.*اشرح|stage|explain.*class|come.*up/i;

    for (let i = 0; i < happenedActivities.length; i++) {
      const act = happenedActivities[i];
      const actEndSec = this.parseTimeToSeconds(act.endTime);
      if (actEndSec === null) continue;

      const correctPercent = act.correctness.percent;

      const nextActivityStartSec = (i + 1 < happenedActivities.length)
        ? this.parseTimeToSeconds(happenedActivities[i + 1].startTime)
        : null;

      const postActivityTranscripts = transcriptTimes.filter(t => {
        if (t.startSec === null) return false;
        const afterActivity = t.startSec >= actEndSec;
        const beforeNext = nextActivityStartSec === null || t.startSec < nextActivityStartSec;
        return afterActivity && beforeNext;
      });

      let explanationTimeSec = 0;
      for (const t of postActivityTranscripts) {
        if (t.startSec !== null && t.endSec !== null) {
          explanationTimeSec += (t.endSec - t.startSec);
        }
      }

      const calledStudentOnStage = postActivityTranscripts.some(t => stagePatterns.test(t.text));

      const typeNameEn: Record<string, string> = {
        SECTION_CHECK: "Section Check",
        EXIT_TICKET: "Exit Ticket",
        TEAM_EXERCISE: "Team Exercise",
      };
      const actLabel = `${typeNameEn[act.activityType] || act.activityType} (${correctPercent}% correctness)`;
      const explanationMin = this.toMin(explanationTimeSec);

      if (correctPercent > 75) {
        if (explanationTimeSec <= 15) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity — appropriate since ${correctPercent}% of students answered correctly.`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity, but ${correctPercent}% of students already answered correctly. Should move on quickly.`,
            recommended: "< 0.3 min",
            actual: `${explanationMin} min`,
          });
        }

        if (calledStudentOnStage) {
          needsImprovement.push({
            category: "student_stage",
            activityId: act.activityId,
            activity: actLabel,
            detail: `A student was called to explain, but ${correctPercent}% already answered correctly — unnecessary when average is above 75%.`,
          });
        } else {
          wentWell.push({
            category: "student_stage",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher did not call a student to explain — correct decision since ${correctPercent}% answered correctly.`,
          });
        }
      } else if (correctPercent >= 50) {
        if (explanationTimeSec >= 30 && explanationTimeSec <= 60) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity — appropriate for ${correctPercent}% correctness.`,
          });
        } else if (explanationTimeSec < 30) {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent only ${explanationMin} min explaining after this activity, but ${correctPercent}% correctness warrants 0.5–1 min of targeted explanation.`,
            recommended: "0.5–1 min",
            actual: `${explanationMin} min`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity. With ${correctPercent}% correctness, 0.5–1 min would be sufficient.`,
            recommended: "0.5–1 min",
            actual: `${explanationMin} min`,
          });
        }
      } else {
        if (explanationTimeSec >= 60 && explanationTimeSec <= 120) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity — appropriate for low correctness of ${correctPercent}%.`,
          });
        } else if (explanationTimeSec < 60) {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent only ${explanationMin} min explaining after this activity, but only ${correctPercent}% answered correctly. Should spend up to 2 minutes to ensure comprehension.`,
            recommended: "1–2 min",
            actual: `${explanationMin} min`,
          });
        } else {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `The teacher spent ${explanationMin} min explaining after this activity — thorough and appropriate explanation since only ${correctPercent}% answered correctly.`,
          });
        }
      }
    }

    this.generatePedagogyFeedback(transcriptTimes, chats, session, activities, wentWell, needsImprovement);

    return { wentWell, needsImprovement };
  }

  private extractTopics(texts: string[]): string {
    const topicMap: [RegExp, string][] = [
      [/الدائر[ةه]/i, "Circles"],
      [/المستقيم|مستقيمات/i, "Lines in circles"],
      [/نصف القطر|أنصاف.*القطر/i, "Radius"],
      [/القطر/i, "Diameter"],
      [/الوتر|وتر/i, "Chord"],
      [/مماس|التماس/i, "Tangent"],
      [/الزاوي[ةه]\s*المركزي[ةه]/i, "Central angles"],
      [/الزاوي[ةه]\s*المحيطي[ةه]/i, "Inscribed angles"],
      [/الزوايا|زاوي[ةه]/i, "Angles"],
      [/المحيط/i, "Perimeter"],
      [/المساح[ةه]/i, "Area"],
      [/المضلع|مضلعات|رباعي/i, "Polygons"],
      [/القوس/i, "Arc"],
      [/طاء.*نق|نق\s*تربيع/i, "Circle formulas"],
      [/مربع|مثلث|سداسي/i, "Shapes in circles"],
      [/اشرح|اشرحي|يلا.*اشرح/i, "Student called to explain"],
    ];

    const combined = texts.join(' ');
    const found: string[] = [];
    for (const [pattern, label] of topicMap) {
      if (pattern.test(combined) && !found.includes(label)) {
        found.push(label);
      }
    }
    return found.length > 0 ? found.join(', ') : "General teaching";
  }

  private detectChatConfusion(chats: SessionChat[], startSec: number, endSec: number): { confused: boolean; examples: string[] } {
    const confusionPatterns = /ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد/i;
    const frustrationPatterns = /😭|😢|😞|💔/;

    const nearbyChats = chats.filter(c => {
      if (c.userType !== 'STUDENT') return false;
      const ts = this.parseTimeToSeconds(c.createdAtTs || '');
      if (ts === null) return false;
      return ts >= startSec - 30 && ts <= endSec + 60;
    });

    const examples: string[] = [];
    let confused = false;
    for (const chat of nearbyChats) {
      const text = chat.messageText || '';
      if (confusionPatterns.test(text) || frustrationPatterns.test(text)) {
        confused = true;
        if (examples.length < 3) {
          examples.push(`"${text.substring(0, 50)}" — ${chat.creatorName || 'student'}`);
        }
      }
    }
    return { confused, examples };
  }

  private buildExplanationVerdict(
    preTeachSegments: { startSec: number; endSec: number; text: string }[],
    chats: SessionChat[],
    actStartSec: number | null,
    durationMin: number,
    topics: string
  ): {
    depth: string;
    interaction: string;
    studentEngagement: string;
    confusion: string;
    pacing: string;
    topicCount: number;
    segmentCount: number;
    avgSegmentSec: number;
    hadStudentInteraction: boolean;
    hadConfusion: boolean;
    confusionExamples: string[];
    chatCountDuring: number;
    studentChatCount: number;
  } {
    if (preTeachSegments.length === 0 || actStartSec === null) {
      return {
        depth: 'No transcript segments found before this activity — the teacher gave no recorded explanation.',
        interaction: 'No teacher-student interaction detected before this activity.',
        studentEngagement: 'No student engagement data available for this period.',
        confusion: 'No confusion signals detected.',
        pacing: 'No pacing data available.',
        topicCount: 0,
        segmentCount: 0,
        avgSegmentSec: 0,
        hadStudentInteraction: false,
        hadConfusion: false,
        confusionExamples: [],
        chatCountDuring: 0,
        studentChatCount: 0,
      };
    }

    const combined = preTeachSegments.map(s => s.text).join(' ');
    const totalSec = preTeachSegments.reduce((s, t) => s + (t.endSec - t.startSec), 0);
    const segmentCount = preTeachSegments.length;
    const avgSegmentSec = segmentCount > 0 ? Math.round(totalSec / segmentCount) : 0;

    const topicList = topics.split(', ').filter(t => t.length > 0);
    const topicCount = topicList.length;

    const questionPatterns = /\?|يلا.*اجاوب|من\s*يعرف|من\s*يقدر|اش\s*رأيكم|شو\s*رأي|وش\s*تقول|ها\s*صح|مين.*عنده|مين.*يبي|طيب\s*اشرح|عطوني|وش.*الفرق|ليش|كيف.*نحسب|كيف.*نعرف/i;
    const studentCallPatterns = /يلا|اشرح|جاوب|عطني\s*الجواب|ها\s*يا|يا\s*.*اشرح|وش\s*تقول.*يا|من\s*يبي\s*يجاوب/i;
    const repeatPatterns = /يعني|بمعنى|نعيد|مرة\s*ثانية|نرجع.*نقول|زي\s*ما\s*قلنا/i;

    const hasQuestions = questionPatterns.test(combined);
    const hasStudentCalls = studentCallPatterns.test(combined);
    const hasRepetition = repeatPatterns.test(combined);
    const hadStudentInteraction = hasQuestions || hasStudentCalls;

    let depth = '';
    if (durationMin >= 4) {
      if (topicCount > 5) {
        depth = `The teacher spent ${durationMin} min covering ${topicCount} different topics (${topics}). The explanation was long but spread across too many concepts — ${Math.round(durationMin / topicCount * 60)} seconds average per topic is not enough depth for any single concept.`;
      } else if (topicCount >= 2) {
        depth = `The teacher spent ${durationMin} min explaining ${topicCount} topics (${topics}). The explanation covered multiple concepts with reasonable time per topic (${Math.round(durationMin / topicCount * 60)} seconds each).`;
      } else {
        depth = `The teacher spent ${durationMin} min on a single topic area (${topics}). This was a thorough, focused explanation with ${segmentCount} teaching segments.`;
      }
    } else if (durationMin >= 2) {
      if (topicCount > 3) {
        depth = `The teacher spent only ${durationMin} min on ${topicCount} topics (${topics}) — the explanation was rushed, averaging ${Math.round(durationMin / topicCount * 60)} seconds per topic. Not enough time to explain any concept properly.`;
      } else {
        depth = `The teacher spent ${durationMin} min on ${topics}. The explanation was brief but focused on ${topicCount} topic${topicCount > 1 ? 's' : ''}.`;
      }
    } else if (durationMin > 0) {
      depth = `The teacher spent only ${durationMin} min explaining before this activity — this was too brief for students to absorb the material. ${topicCount > 1 ? `Covered ${topicCount} topics (${topics}) in under ${Math.round(durationMin * 60)} seconds total.` : `Covered ${topics} in under ${Math.round(durationMin * 60)} seconds.`}`;
    } else {
      depth = 'No explanation was given before this activity — students had to rely on prior knowledge.';
    }

    let interaction = '';
    if (hasQuestions && hasStudentCalls) {
      interaction = 'The teacher asked questions and called on students to participate — this was an interactive explanation.';
      if (hasRepetition) {
        interaction += ' The teacher also repeated key points to reinforce understanding.';
      }
    } else if (hasQuestions) {
      interaction = 'The teacher asked questions during the explanation but did not call on specific students to answer.';
    } else if (hasStudentCalls) {
      interaction = 'The teacher called on students to explain or answer during the teaching.';
    } else {
      interaction = 'The teacher lectured without asking questions or inviting student participation — this was a one-way explanation with no student interaction.';
    }

    const windowStart = actStartSec - (durationMin > 0 ? durationMin * 60 : 300);
    const windowEnd = actStartSec;

    const studentChatsDuring = chats.filter(c => {
      if (c.userType !== 'STUDENT') return false;
      const ts = this.parseTimeToSeconds(c.createdAtTs || '');
      if (ts === null) return false;
      return ts >= windowStart && ts <= windowEnd;
    });

    const allChatsDuring = chats.filter(c => {
      const ts = this.parseTimeToSeconds(c.createdAtTs || '');
      if (ts === null) return false;
      return ts >= windowStart && ts <= windowEnd;
    });

    const studentChatCount = studentChatsDuring.length;
    const chatCountDuring = allChatsDuring.length;

    const confusionPatterns = /ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد|ما\s*قدر/i;
    const confusionChats = studentChatsDuring.filter(c => confusionPatterns.test(c.messageText || ''));
    const hadConfusion = confusionChats.length > 0;
    const confusionExamples = confusionChats.slice(0, 3).map(c =>
      `"${(c.messageText || '').substring(0, 60)}" — ${c.creatorName || 'student'}`
    );

    let studentEngagement = '';
    if (studentChatCount >= 5) {
      studentEngagement = `Students were actively engaged — ${studentChatCount} student messages in chat during the explanation period.`;
    } else if (studentChatCount >= 2) {
      studentEngagement = `Students showed moderate engagement — ${studentChatCount} student messages in chat during the explanation.`;
    } else if (studentChatCount === 1) {
      studentEngagement = `Only 1 student message in chat during the explanation — students were mostly silent.`;
    } else {
      studentEngagement = `Zero student messages in chat during the explanation — no student participation was recorded in the chat.`;
    }

    let confusion = '';
    if (hadConfusion) {
      confusion = `${confusionChats.length} student${confusionChats.length > 1 ? 's' : ''} expressed confusion during the explanation: ${confusionExamples.join('; ')}.`;
    } else {
      confusion = 'No confusion signals detected in student chat during the explanation.';
    }

    let pacing = '';
    if (avgSegmentSec > 30) {
      pacing = `The teacher spoke in long uninterrupted blocks (avg ${avgSegmentSec}s per segment) — students had limited opportunity to process or ask questions between segments.`;
    } else if (avgSegmentSec > 15) {
      pacing = `The teacher used moderate-length segments (avg ${avgSegmentSec}s each) — reasonable pacing that allowed some processing time.`;
    } else if (segmentCount > 0) {
      pacing = `The teacher used short segments (avg ${avgSegmentSec}s each) — quick pacing with frequent pauses or breaks.`;
    }

    return {
      depth, interaction, studentEngagement, confusion, pacing,
      topicCount, segmentCount, avgSegmentSec,
      hadStudentInteraction, hadConfusion, confusionExamples,
      chatCountDuring, studentChatCount,
    };
  }

  private buildQuestionSpecificVerdict(
    correctPercent: number,
    explanationMin: number,
    verdict: ReturnType<typeof DatabaseStorage.prototype.buildExplanationVerdict>
  ): string {
    const parts: string[] = [];

    if (explanationMin > 0) {
      parts.push(verdict.depth);

      if (correctPercent >= 80) {
        parts.push(`Students scored ${correctPercent}% — the teaching was effective and students understood the material.${verdict.hadStudentInteraction ? ' The teacher engaged students during the explanation, which contributed to the strong result.' : ''}`);
      } else if (correctPercent >= 60) {
        parts.push(`Students scored ${correctPercent}% after this explanation — ${verdict.topicCount > 3 ? `too many topics were covered at once and ${100 - correctPercent}% of students did not absorb all concepts` : `the explanation covered the material but ${100 - correctPercent}% of students still got it wrong`}. ${verdict.hadStudentInteraction ? 'The teacher interacted with students, but not all students kept up.' : 'The teacher did not interact with students to verify understanding during the explanation.'}`);
      } else if (correctPercent >= 40) {
        parts.push(`Students only scored ${correctPercent}% after ${explanationMin} min of explanation — the teaching did not land. ${verdict.hadStudentInteraction ? 'The teacher tried to engage students but the content was not absorbed.' : 'The teacher lectured without checking understanding, and students did not absorb the content.'}`);
      } else if (correctPercent > 0) {
        parts.push(`Students scored only ${correctPercent}% — the explanation failed. ${verdict.hadConfusion ? 'Students actively showed confusion during the teaching.' : 'Students were silent during the explanation, and the low score shows they did not understand.'} ${verdict.hadStudentInteraction ? '' : 'The teacher did not check for understanding at any point.'}`);
      } else {
        parts.push(`0% correctness — no student answered correctly. The explanation completely failed to convey the concept. ${verdict.hadConfusion ? 'Students showed confusion during the teaching and the results confirm they did not understand.' : 'Students were silent during the explanation and the zero score confirms total lack of understanding.'}`);
      }

      if (verdict.hadConfusion && correctPercent < 60) {
        parts.push(verdict.confusion);
      }

      if (!verdict.hadStudentInteraction && correctPercent < 70) {
        parts.push(verdict.interaction);
      }

      if (verdict.studentChatCount === 0 && correctPercent < 60) {
        parts.push(verdict.studentEngagement);
      }
    } else {
      parts.push('No recorded explanation before this activity.');
      if (correctPercent >= 80) {
        parts.push(`Students scored ${correctPercent}% without a pre-activity explanation — they relied on prior knowledge and performed well.`);
      } else if (correctPercent >= 50) {
        parts.push(`Students scored ${correctPercent}% without a pre-activity explanation — ${100 - correctPercent}% of students did not have enough prior knowledge to answer correctly.`);
      } else if (correctPercent > 0) {
        parts.push(`Students scored only ${correctPercent}% with no explanation beforehand — they needed teaching on this topic before being assessed.`);
      } else {
        parts.push(`0% correctness with no explanation beforehand — students had no preparation for this content and every answer was wrong.`);
      }
    }

    return parts.filter(p => p.length > 0).join(' ');
  }

  private generatePedagogyFeedback(
    transcriptTimes: { startSec: number | null; endSec: number | null; text: string }[],
    chats: SessionChat[],
    session: any,
    activities: any[],
    wentWell: any[],
    needsImprovement: any[]
  ): void {
    const GAP_THRESHOLD = 5;
    const MAX_CONTINUOUS_SEC = 120;
    const MAX_TOTAL_TALK_MIN = 15;

    const sorted = transcriptTimes
      .filter(t => t.startSec !== null && t.endSec !== null)
      .sort((a, b) => a.startSec! - b.startSec!);

    if (sorted.length === 0) return;

    const continuousSegments: { startSec: number; endSec: number; durationSec: number }[] = [];
    let segStart = sorted[0].startSec!;
    let segEnd = sorted[0].endSec!;

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].startSec! - segEnd;
      if (gap <= GAP_THRESHOLD) {
        segEnd = Math.max(segEnd, sorted[i].endSec!);
      } else {
        continuousSegments.push({ startSec: segStart, endSec: segEnd, durationSec: segEnd - segStart });
        segStart = sorted[i].startSec!;
        segEnd = sorted[i].endSec!;
      }
    }
    continuousSegments.push({ startSec: segStart, endSec: segEnd, durationSec: segEnd - segStart });

    let totalTeacherTalkSec = 0;
    for (const t of sorted) {
      totalTeacherTalkSec += (t.endSec! - t.startSec!);
    }
    const totalTeacherTalkMin = Math.round(totalTeacherTalkSec / 60 * 10) / 10;

    const longSegments = continuousSegments.filter(s => s.durationSec > MAX_CONTINUOUS_SEC);

    const formatTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const segmentDetails: any[] = [];
    for (const seg of longSegments) {
      const segTexts = sorted
        .filter(t => t.startSec! >= seg.startSec && t.endSec! <= seg.endSec)
        .map(t => t.text);
      const topics = this.extractTopics(segTexts);
      const durationMin = Math.round(seg.durationSec / 60 * 10) / 10;

      const nearbyActivities = activities.filter(a => {
        if (!a.endTime || !a.correctness) return false;
        const actEndSec = this.parseTimeToSeconds(a.endTime);
        if (actEndSec === null) return false;
        return actEndSec >= seg.startSec - 60 && actEndSec <= seg.endSec + 60;
      });

      const chatContext = this.detectChatConfusion(chats, seg.startSec, seg.endSec);

      let context = `${formatTime(seg.startSec)}–${formatTime(seg.endSec)} (${durationMin} min): The teacher was discussing ${topics}.`;

      if (nearbyActivities.length > 0) {
        const actDetails = nearbyActivities.map(a => {
          const pct = a.correctness?.percent ?? 0;
          return `${a.activityType} scored ${pct}% correctness`;
        });
        if (nearbyActivities.some(a => (a.correctness?.percent ?? 100) < 50)) {
          context += ` This came after an activity with low correctness (${actDetails.join('; ')}) — the teacher was re-explaining the concept.`;
        } else {
          context += ` Near activity: ${actDetails.join('; ')}.`;
        }
      }

      if (chatContext.confused) {
        context += ` Students showed confusion in chat: ${chatContext.examples.join('; ')}.`;
      }

      segmentDetails.push(context);
    }

    if (longSegments.length === 0) {
      wentWell.push({
        category: "pedagogy",
        activity: "Continuous talk",
        detail: `The teacher kept all talk segments under 2 minutes — good pacing that allows students to stay engaged. The longest continuous segment was ${Math.round(Math.max(...continuousSegments.map(s => s.durationSec)))} seconds.`,
      });
    } else {
      const longestSeg = longSegments.reduce((a, b) => a.durationSec > b.durationSec ? a : b);
      const longestMin = Math.round(longestSeg.durationSec / 60 * 10) / 10;
      needsImprovement.push({
        category: "pedagogy",
        activity: "Continuous talk",
        detail: `The teacher had ${longSegments.length} continuous talk periods exceeding 2 minutes. The longest was ${longestMin} min (${formatTime(longestSeg.startSec)}–${formatTime(longestSeg.endSec)}). Break long periods with questions or student interaction.`,
        recommended: "Under 2 minutes per segment",
        actual: `${longestMin} min longest segment`,
        segments: segmentDetails,
      });
    }

    const sessionDurationMin = session?.sessionTime || session?.teachingTime || 55;

    if (totalTeacherTalkMin <= MAX_TOTAL_TALK_MIN) {
      wentWell.push({
        category: "pedagogy",
        activity: "Total teacher talk",
        detail: `Total teacher talk time was ${totalTeacherTalkMin} min out of ${sessionDurationMin} min session — within the recommended 15 minute limit. This leaves sufficient time for student activities.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Total teacher talk",
        detail: `Total teacher talk time was ${totalTeacherTalkMin} min out of ${sessionDurationMin} min session. Teacher talk should ideally be under 15 minutes to allow the majority of the session for active student learning.`,
        recommended: "Under 15 min",
        actual: `${totalTeacherTalkMin} min`,
      });
    }

    const studentActiveMin = Math.round((sessionDurationMin - totalTeacherTalkMin) * 10) / 10;
    const studentActivePercent = Math.round((studentActiveMin / sessionDurationMin) * 100);

    if (studentActivePercent > 50) {
      wentWell.push({
        category: "pedagogy",
        activity: "Student active time",
        detail: `Students had ${studentActiveMin} min (${studentActivePercent}%) of active time vs ${totalTeacherTalkMin} min teacher talk — the majority of the session was student-centered.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Student active time",
        detail: `Students had only ${studentActiveMin} min (${studentActivePercent}%) of active time. Teacher talk (${totalTeacherTalkMin} min) took up most of the session. The majority of session time should be active student time.`,
        recommended: "Over 50% student time",
        actual: `${studentActivePercent}% student time`,
      });
    }

    const studentChats = chats.filter(c => c.userType === 'STUDENT');
    const chatTimestamps = studentChats
      .map(c => this.parseTimeToSeconds(c.createdAtTs || ''))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);

    if (chatTimestamps.length === 0) {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Chat engagement",
        detail: `No student chat messages were recorded during the session. Teachers should prompt students to respond in chat to check understanding and maintain engagement.`,
      });
      return;
    }

    const chatBursts: { startSec: number; endSec: number; count: number }[] = [];
    const BURST_WINDOW = 30;

    let burstStart = chatTimestamps[0];
    let burstCount = 1;
    let lastTs = chatTimestamps[0];

    for (let i = 1; i < chatTimestamps.length; i++) {
      if (chatTimestamps[i] - lastTs <= BURST_WINDOW) {
        burstCount++;
        lastTs = chatTimestamps[i];
      } else {
        if (burstCount >= 3) {
          chatBursts.push({ startSec: burstStart, endSec: lastTs, count: burstCount });
        }
        burstStart = chatTimestamps[i];
        burstCount = 1;
        lastTs = chatTimestamps[i];
      }
    }
    if (burstCount >= 3) {
      chatBursts.push({ startSec: burstStart, endSec: lastTs, count: burstCount });
    }

    const burstsOverlappingTalk = chatBursts.filter(burst => {
      return continuousSegments.some(seg => {
        return burst.startSec <= seg.endSec + 10 && burst.endSec >= seg.startSec - 10;
      });
    });

    const engagedBursts = burstsOverlappingTalk.length;

    if (engagedBursts >= 3) {
      wentWell.push({
        category: "pedagogy",
        activity: "Chat engagement",
        detail: `Students engaged in chat ${engagedBursts} times during or right after teacher talk (${studentChats.length} total messages from ${new Set(studentChats.map(c => c.creatorId)).size} students). This indicates the teacher actively solicited responses and checked understanding.`,
      });
    } else if (engagedBursts >= 1) {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Chat engagement",
        detail: `Only ${engagedBursts} chat engagement bursts detected during teacher talk segments. With ${studentChats.length} total student messages, the teacher needs to do more to elicit responses — ask students to type their answers in chat after each explanation.`,
        recommended: "3+ engagement prompts per session",
        actual: `${engagedBursts} engagement bursts`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Chat engagement",
        detail: `While ${studentChats.length} student messages were sent in chat, none appeared to be direct responses to teacher prompts. The teacher should prompt students to respond in chat to check understanding during lessons.`,
        recommended: "Regular chat-based check-ins",
        actual: "No prompted engagement detected",
      });
    }
  }

  async insertCourseSession(data: InsertCourseSession): Promise<CourseSession> {
    const [result] = await db.insert(courseSessions).values(data).returning();
    return result;
  }

  async insertTranscripts(data: InsertSessionTranscript[]): Promise<void> {
    if (data.length === 0) return;
    for (let i = 0; i < data.length; i += 100) {
      await db.insert(sessionTranscripts).values(data.slice(i, i + 100));
    }
  }

  async insertChats(data: InsertSessionChat[]): Promise<void> {
    if (data.length === 0) return;
    for (let i = 0; i < data.length; i += 100) {
      await db.insert(sessionChats).values(data.slice(i, i + 100));
    }
  }

  async insertActivities(data: InsertClassroomActivity[]): Promise<void> {
    if (data.length === 0) return;
    await db.insert(classroomActivities).values(data);
  }

  async insertPolls(data: InsertUserPoll[]): Promise<void> {
    if (data.length === 0) return;
    for (let i = 0; i < data.length; i += 100) {
      await db.insert(userPolls).values(data.slice(i, i + 100));
    }
  }

  async insertReactions(data: InsertUserReaction[]): Promise<void> {
    if (data.length === 0) return;
    for (let i = 0; i < data.length; i += 100) {
      await db.insert(userReactions).values(data.slice(i, i + 100));
    }
  }

  async insertUserSessions(data: InsertUserSession[]): Promise<void> {
    if (data.length === 0) return;
    for (let i = 0; i < data.length; i += 50) {
      await db.insert(userSessions).values(data.slice(i, i + 50));
    }
  }
}

export const storage = new DatabaseStorage();
