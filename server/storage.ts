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

    const activitiesWithCorrectness = activities.map(a => ({
      activityId: a.activityId,
      activityType: a.activityType,
      startTime: a.startTime,
      endTime: a.endTime,
      activityHappened: a.activityHappened,
      plannedDuration: a.plannedDuration,
      duration: a.duration,
      totalMcqs: a.totalMcqs,
      correctness: activityCorrectness[a.activityId] || null,
    }));

    const feedback = this.generateFeedback(activitiesWithCorrectness, transcripts, chats, session, pollStats);

    return {
      session,
      transcripts,
      chats: chats.slice(0, 200),
      activities: activitiesWithCorrectness,
      pollStats,
      reactionData,
      engagementTimeline,
      feedback,
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

      const actLabel = `${act.activityType} (${correctPercent}% correct)`;

      if (correctPercent > 75) {
        if (explanationTimeSec <= 15) {
          wentWell.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity — appropriate since ${correctPercent}% of students got it correct. No extra explanation needed.`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity, but ${correctPercent}% of students already got it correct. Should spend no more than 10–15 seconds and move on.`,
            recommended: "10–15 seconds",
            actual: `${explanationTimeSec} seconds`,
          });
        }

        if (calledStudentOnStage) {
          needsImprovement.push({
            category: "student_stage",
            activity: actLabel,
            detail: `A student was called on stage to explain, but ${correctPercent}% of the class already answered correctly. Calling students on stage is unnecessary when class average is above 75%.`,
          });
        } else {
          wentWell.push({
            category: "student_stage",
            activity: actLabel,
            detail: `Teacher did not call a student on stage — good decision since ${correctPercent}% of students got it correct and no extra explanation was needed.`,
          });
        }
      } else if (correctPercent >= 50) {
        if (explanationTimeSec >= 30 && explanationTimeSec <= 60) {
          wentWell.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity — appropriate for ${correctPercent}% correctness. The 30–60 second range is ideal here.`,
          });
        } else if (explanationTimeSec < 30) {
          needsImprovement.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent only ${explanationTimeSec}s explaining after this activity, but ${correctPercent}% correctness suggests 30–60 seconds of explanation would be appropriate.`,
            recommended: "30–60 seconds",
            actual: `${explanationTimeSec} seconds`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity. With ${correctPercent}% correctness, 30–60 seconds would be sufficient — the extra time could be used elsewhere.`,
            recommended: "30–60 seconds",
            actual: `${explanationTimeSec} seconds`,
          });
        }
      } else {
        if (explanationTimeSec >= 60 && explanationTimeSec <= 120) {
          wentWell.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity — appropriate for low correctness of ${correctPercent}%. Students needed this extra time.`,
          });
        } else if (explanationTimeSec < 60) {
          needsImprovement.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent only ${explanationTimeSec}s explaining after this activity, but only ${correctPercent}% of students got it correct. Should spend up to 2 minutes to ensure understanding.`,
            recommended: "60–120 seconds",
            actual: `${explanationTimeSec} seconds`,
          });
        } else {
          wentWell.push({
            category: "time_management",
            activity: actLabel,
            detail: `Teacher spent ${explanationTimeSec}s explaining after this activity — thorough explanation was appropriate since only ${correctPercent}% of students got it correct.`,
          });
        }
      }
    }

    this.generatePedagogyFeedback(transcriptTimes, chats, session, wentWell, needsImprovement);

    return { wentWell, needsImprovement };
  }

  private generatePedagogyFeedback(
    transcriptTimes: { startSec: number | null; endSec: number | null; text: string }[],
    chats: SessionChat[],
    session: any,
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

    if (longSegments.length === 0) {
      wentWell.push({
        category: "pedagogy",
        activity: "Continuous Talk",
        detail: `Teacher kept all talk segments under 2 minutes — good pacing that allows students to stay engaged. Longest continuous segment was ${Math.round(Math.max(...continuousSegments.map(s => s.durationSec)))}s.`,
      });
    } else {
      const longestSeg = longSegments.reduce((a, b) => a.durationSec > b.durationSec ? a : b);
      const longestMin = Math.round(longestSeg.durationSec / 60 * 10) / 10;
      needsImprovement.push({
        category: "pedagogy",
        activity: "Continuous Talk",
        detail: `Teacher had ${longSegments.length} stretch${longSegments.length > 1 ? 'es' : ''} of non-stop talking exceeding 2 minutes. The longest was ${longestMin} min (${formatTime(longestSeg.startSec)}–${formatTime(longestSeg.endSec)}). Break up long stretches with questions or student interaction.`,
        recommended: "Under 2 min per stretch",
        actual: `${longestMin} min longest stretch`,
      });
    }

    const sessionDurationMin = session?.sessionTime || session?.teachingTime || 55;

    if (totalTeacherTalkMin <= MAX_TOTAL_TALK_MIN) {
      wentWell.push({
        category: "pedagogy",
        activity: "Total Teacher Talk",
        detail: `Total teacher talk time was ${totalTeacherTalkMin} min out of ${sessionDurationMin} min session — within the recommended limit of 15 minutes. This leaves ample time for student activities.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Total Teacher Talk",
        detail: `Total teacher talk time was ${totalTeacherTalkMin} min out of ${sessionDurationMin} min session. Ideally, teacher talk should be under 15 minutes to allow the majority of the session for student active learning.`,
        recommended: "Under 15 min",
        actual: `${totalTeacherTalkMin} min`,
      });
    }

    const studentActiveMin = Math.round((sessionDurationMin - totalTeacherTalkMin) * 10) / 10;
    const studentActivePercent = Math.round((studentActiveMin / sessionDurationMin) * 100);

    if (studentActivePercent > 50) {
      wentWell.push({
        category: "pedagogy",
        activity: "Student Active Time",
        detail: `Students had ${studentActiveMin} min (${studentActivePercent}%) of active time vs ${totalTeacherTalkMin} min teacher talk — the majority of the session was student-centered.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Student Active Time",
        detail: `Students only had ${studentActiveMin} min (${studentActivePercent}%) of active time. Teacher talk (${totalTeacherTalkMin} min) took up most of the session. The majority of session time should be student active time.`,
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
        activity: "Chat Engagement",
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

    const totalBursts = chatBursts.length;
    const engagedBursts = burstsOverlappingTalk.length;

    if (engagedBursts >= 3) {
      wentWell.push({
        category: "pedagogy",
        activity: "Chat Engagement",
        detail: `Students responded in chat ${engagedBursts} times during or right after teacher talk (${studentChats.length} total messages from ${new Set(studentChats.map(c => c.creatorId)).size} students). This indicates the teacher actively elicited responses and checked understanding.`,
      });
    } else if (engagedBursts >= 1) {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Chat Engagement",
        detail: `Only ${engagedBursts} chat engagement burst${engagedBursts > 1 ? 's' : ''} detected during teacher talk segments. With ${studentChats.length} total student messages, the teacher could do more to elicit responses — ask students to type answers in chat after each explanation.`,
        recommended: "3+ engagement prompts per session",
        actual: `${engagedBursts} engagement bursts`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "Chat Engagement",
        detail: `While ${studentChats.length} student chat messages were sent, none appeared to be direct responses to teacher prompts. The teacher should ask students to respond in chat to check for understanding during lessons.`,
        recommended: "Regular chat check-ins",
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
