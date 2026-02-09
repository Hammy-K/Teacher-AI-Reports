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

    return {
      session,
      transcripts,
      chats: chats.slice(0, 200),
      activities: activitiesWithCorrectness,
      pollStats,
      reactionData,
      engagementTimeline,
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
