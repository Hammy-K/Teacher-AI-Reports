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
      const canonicalType = this.classifyActivityType(a.activityType, a.totalMcqs);
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

    const continuousSegments: { durationSec: number }[] = [];
    if (sorted.length > 0) {
      let segStart: number = sorted[0].startSec;
      let segEnd: number = sorted[0].endSec;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].startSec - segEnd;
        if (gap <= 5) {
          segEnd = Math.max(segEnd, sorted[i].endSec);
        } else {
          continuousSegments.push({ durationSec: segEnd - segStart });
          segStart = sorted[i].startSec;
          segEnd = sorted[i].endSec;
        }
      }
      continuousSegments.push({ durationSec: segEnd - segStart });
    }
    const longSegments = continuousSegments.filter(s => s.durationSec > 120);
    const longestSegMin = continuousSegments.length > 0
      ? Math.round(Math.max(...continuousSegments.map(s => s.durationSec)) / 60 * 10) / 10
      : 0;

    const studentActivePercent = teachingTime > 0
      ? Math.round(((teachingTime - totalTeacherTalkMin) / teachingTime) * 100)
      : 0;

    // 1. Content Mastery (إتقان المحتوى والشرح)
    let contentScore = 3;
    const evidence1: string[] = [];
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

    contentScore = Math.max(1, Math.min(5, Math.round(contentScore * 2) / 2));
    criteria.push({
      id: 1,
      nameAr: "إتقان المحتوى والشرح",
      nameEn: "Instructional & Content Mastery",
      score: contentScore,
      evidence: evidence1,
      recommendations: contentScore < 4 ? [
        lowQs > 0 ? "Re-explain concepts that scored below 40% using different approaches" : "",
        overallCorrectness < 60 ? "Slow down explanations and add more worked examples before checking understanding" : "",
        totalQuestions < 8 ? "Add more comprehension check questions during the session" : "",
      ].filter(Boolean) : ["Maintain current teaching quality level"],
      notes: `${totalQuestions} questions, overall correctness ${overallCorrectness}%, ${highQs} strong / ${lowQs} weak`,
    });

    // 2. Student Engagement (دعم الطلاب وتحفيزهم)
    let engScore = 3;
    const evidence2: string[] = [];

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
    else { engScore -= 0.5; evidence2.push(`Only ${positivePercent}% positive sentiment — students may not be enjoying the session`); }

    engScore = Math.max(1, Math.min(5, Math.round(engScore * 2) / 2));
    criteria.push({
      id: 2,
      nameAr: "دعم الطلاب وتحفيزهم",
      nameEn: "Student Engagement",
      score: engScore,
      evidence: evidence2,
      recommendations: engScore < 4 ? [
        responseRate < 80 ? "Encourage all students to respond to polls — give them enough time" : "",
        chatParticipationRate < 15 ? "Ask students to reply in chat for comprehension check questions" : "",
        sessionTemperature < 70 ? "Increase engagement using more interactive elements and positive reinforcement" : "",
      ].filter(Boolean) : ["Continue reinforcing student engagement"],
      notes: `${totalStudents} students, response rate ${responseRate}%, temperature ${sessionTemperature}%`,
    });

    // 3. Tutor Communication (التواصل وحضور المعلّم)
    let commScore = 3;
    const evidence3: string[] = [];

    if (teacherChats.length >= 5) { commScore += 0.5; evidence3.push(`The teacher sent ${teacherChats.length} messages — effective communication`); }
    else if (teacherChats.length >= 1) { evidence3.push(`The teacher sent ${teacherChats.length} messages`); }
    else { commScore -= 0.5; evidence3.push("The teacher did not use chat to communicate with students"); }

    if (longSegments.length === 0) { commScore += 0.5; evidence3.push(`All talk segments under 2 minutes — good pacing and interaction`); }
    else { commScore -= 0.5; evidence3.push(`${longSegments.length} talk segments exceeded 2 minutes — should break with interaction`); }

    if (positivePercent >= 75) { commScore += 0.5; evidence3.push(`Positive sentiment ${positivePercent}% indicates good relationship with students`); }
    else if (positivePercent < 60) { commScore -= 0.5; evidence3.push(`Low positive sentiment (${positivePercent}%) may indicate communication issues`); }

    commScore = Math.max(1, Math.min(5, Math.round(commScore * 2) / 2));
    criteria.push({
      id: 3,
      nameAr: "التواصل وحضور المعلّم",
      nameEn: "Tutor Communication",
      score: commScore,
      evidence: evidence3,
      recommendations: commScore < 4 ? [
        teacherChats.length < 3 ? "Engage more with student questions in chat" : "",
        longSegments.length > 0 ? "Break long talk segments with student interaction every 2 minutes" : "",
      ].filter(Boolean) : ["Communication style is effective"],
      notes: `${teacherChats.length} teacher messages, longest segment ${longestSegMin} min`,
    });

    // 4. Time Management (إدارة الوقت والخطة التعليمية)
    let timeScore = 3;
    const evidence4: string[] = [];
    const scheduledDuration = 45;
    const actualDuration = Math.round(teachingTime);

    if (actualDuration >= scheduledDuration - 5 && actualDuration <= scheduledDuration + 10) {
      timeScore += 0.5; evidence4.push(`Session lasted ${actualDuration} min — within expected ${scheduledDuration} min`);
    } else if (actualDuration < scheduledDuration - 5) {
      timeScore -= 0.5; evidence4.push(`Session only ${actualDuration} min — shorter than scheduled ${scheduledDuration} min`);
    } else {
      evidence4.push(`Session lasted ${actualDuration} min vs scheduled ${scheduledDuration} min — exceeded time`);
    }

    if (totalTeacherTalkMin <= 15) {
      timeScore += 0.5; evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — within 15 min limit`);
    } else if (totalTeacherTalkMin <= 20) {
      evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — slightly above 15 min target`);
    } else {
      timeScore -= 0.5; evidence4.push(`Teacher talk ${totalTeacherTalkMin} min — significantly exceeds 15 min limit`);
    }

    if (studentActivePercent >= 60) {
      timeScore += 0.5; evidence4.push(`${studentActivePercent}% of time was student activity — excellent balance`);
    } else if (studentActivePercent >= 45) {
      evidence4.push(`${studentActivePercent}% student activity time`);
    } else {
      timeScore -= 0.5; evidence4.push(`Only ${studentActivePercent}% student activity time — teacher-dominated session`);
    }

    timeScore = Math.max(1, Math.min(5, Math.round(timeScore * 2) / 2));
    criteria.push({
      id: 4,
      nameAr: "إدارة الوقت والخطة التعليمية",
      nameEn: "Time Management",
      score: timeScore,
      evidence: evidence4,
      recommendations: timeScore < 4 ? [
        totalTeacherTalkMin > 15 ? "Reduce teacher talk to under 15 min to allow more student practice time" : "",
        studentActivePercent < 50 ? "Increase student activity time — aim for at least 50% of the session" : "",
      ].filter(Boolean) : ["Time management is well-balanced"],
      notes: `Session ${actualDuration} min, talk ${totalTeacherTalkMin} min, ${studentActivePercent}% student time`,
    });

    // 5. Session Pacing (الإلتزام بتصميم وخطة الدرس وتوزيع الوقت)
    let paceScore = 3;
    const evidence5: string[] = [];
    const totalActivities = activities.length;
    const completedActivities = happenedActivities.length;

    if (completedActivities === totalActivities) {
      paceScore += 0.5; evidence5.push(`All ${totalActivities} activities completed — lesson plan fully executed`);
    } else {
      const completionRate = Math.round((completedActivities / totalActivities) * 100);
      if (completionRate >= 80) { evidence5.push(`${completedActivities}/${totalActivities} activities completed (${completionRate}%)`); }
      else { paceScore -= 0.5; evidence5.push(`Only ${completedActivities}/${totalActivities} activities completed (${completionRate}%) — lesson plan not fully executed`); }
    }

    if (sessionCompletedPercent >= 80) {
      paceScore += 0.5; evidence5.push(`Session completion rate ${sessionCompletedPercent}% — students kept up`);
    } else if (sessionCompletedPercent >= 60) {
      evidence5.push(`Session completion rate ${sessionCompletedPercent}%`);
    } else {
      paceScore -= 0.5; evidence5.push(`Only ${sessionCompletedPercent}% session completion — pacing may be too fast`);
    }

    const avgLearningTimeMin = Math.round(avgLearningTime * 10) / 10;
    if (avgLearningTimeMin >= teachingTime * 0.7) {
      paceScore += 0.5; evidence5.push(`Average student learning time ${avgLearningTimeMin} min — good pacing`);
    } else {
      evidence5.push(`Average student learning time ${avgLearningTimeMin} min out of ${Math.round(teachingTime)} min`);
    }

    paceScore = Math.max(1, Math.min(5, Math.round(paceScore * 2) / 2));
    criteria.push({
      id: 5,
      nameAr: "الإلتزام بتصميم وخطة الدرس وتوزيع الوقت",
      nameEn: "Session Pacing",
      score: paceScore,
      evidence: evidence5,
      recommendations: paceScore < 4 ? [
        completedActivities < totalActivities ? "Ensure all planned activities are completed within session time" : "",
        sessionCompletedPercent < 70 ? "Slow down pacing so more students can keep up" : "",
      ].filter(Boolean) : ["Pacing is well-calibrated"],
      notes: `${completedActivities}/${totalActivities} activities, ${sessionCompletedPercent}% completion, avg ${avgLearningTimeMin} min`,
    });

    // 6. Mistakes & Impact (الاخطاء و تأثيرها على الدرس)
    let mistakeScore = 4;
    const evidence6: string[] = [];

    const exitTicketAnalysis = activityAnalyses.find((a: any) => a.activityType === 'EXIT_TICKET');
    const exitTicketInstance = exitTicketAnalysis?.instances?.[0];
    if (exitTicketInstance?.teacherTalkDuring) {
      mistakeScore -= 1;
      evidence6.push(`The teacher was talking during the exit ticket for ${exitTicketInstance.teacherTalkOverlapMin} min — students should answer independently`);
    } else {
      evidence6.push("The teacher did not talk during the exit ticket — correct protocol followed");
    }

    const tmImprovements = feedback.needsImprovement.filter((f: any) => f.category === 'time_management');
    if (tmImprovements.length >= 3) {
      mistakeScore -= 0.5;
      evidence6.push(`${tmImprovements.length} time management issues identified — recurring pattern`);
    } else if (tmImprovements.length > 0) {
      evidence6.push(`${tmImprovements.length} minor time management issues`);
    } else {
      mistakeScore += 0.5;
      evidence6.push("No major time management errors detected");
    }

    mistakeScore = Math.max(1, Math.min(5, Math.round(mistakeScore * 2) / 2));
    criteria.push({
      id: 6,
      nameAr: "الاخطاء و تأثيرها على الدرس",
      nameEn: "Mistakes & Impact",
      score: mistakeScore,
      evidence: evidence6,
      recommendations: mistakeScore < 4 ? [
        exitTicketInstance?.teacherTalkDuring ? "Do not talk during the exit ticket — let students answer independently" : "",
        tmImprovements.length > 0 ? "Review time allocation after each activity based on student correctness rate" : "",
      ].filter(Boolean) : ["No major errors detected"],
      notes: exitTicketInstance?.teacherTalkDuring
        ? `Teacher talked ${exitTicketInstance.teacherTalkOverlapMin} min during exit ticket`
        : "Exit ticket protocol followed correctly",
    });

    // 7. Distinct Moments (لحظات تميّز من الأستاذ)
    let distinctScore = 3;
    const evidence7: string[] = [];
    const wellCount = feedback.wentWell.length;

    if (wellCount >= 5) { distinctScore += 1; evidence7.push(`${wellCount} positive observations identified — the session had many strong moments`); }
    else if (wellCount >= 3) { distinctScore += 0.5; evidence7.push(`${wellCount} positive observations`); }
    else { evidence7.push(`Only ${wellCount} positive observations — few distinct moments`); }

    const bestQuestion = (pollStats.byQuestion || []).reduce((best: any, q: any) => (!best || q.percent > best.percent) ? q : best, null);
    if (bestQuestion && bestQuestion.percent >= 75) {
      distinctScore += 0.5;
      evidence7.push(`Strongest question achieved ${bestQuestion.percent}% correctness — effective teaching for this concept`);
    }

    if (sessionTemperature >= 80 && positivePercent >= 80) {
      evidence7.push(`High temperature (${sessionTemperature}%) with ${positivePercent}% positive sentiment — students were enthusiastic`);
    }

    distinctScore = Math.max(1, Math.min(5, Math.round(distinctScore * 2) / 2));
    criteria.push({
      id: 7,
      nameAr: "لحظات تميّز من الأستاذ",
      nameEn: "Distinct Moments",
      score: distinctScore,
      evidence: evidence7,
      recommendations: distinctScore < 4 ? [
        "Create memorable learning moments through stories or real-world connections",
        "Celebrate student successes publicly to boost motivation",
      ] : ["Continue creating impactful teaching moments"],
      notes: `${wellCount} positive observations, best question at ${bestQuestion?.percent || 0}%`,
    });

    // 8. Overall Rating (التقييم العام والجودة للحصة والمدرس)
    const avgOfAll = Math.round((contentScore + engScore + commScore + timeScore + paceScore + mistakeScore + distinctScore) / 7 * 2) / 2;
    const overallScore = Math.max(1, Math.min(5, avgOfAll));
    const evidence8: string[] = [];

    if (overallScore >= 4) { evidence8.push("Strong session overall — most criteria met or exceeded"); }
    else if (overallScore >= 3) { evidence8.push("Acceptable session with room for improvement in specific areas"); }
    else { evidence8.push("The session needs significant improvement across multiple criteria"); }

    evidence8.push(`Weighted average across 7 criteria: ${overallScore}/5`);

    const strongAreas = criteria.filter((c: any) => c.score >= 4).map((c: any) => c.nameEn);
    const weakAreas = criteria.filter((c: any) => c.score < 3).map((c: any) => c.nameEn);
    if (strongAreas.length > 0) evidence8.push(`Strengths: ${strongAreas.join(', ')}`);
    if (weakAreas.length > 0) evidence8.push(`Areas for improvement: ${weakAreas.join(', ')}`);

    criteria.push({
      id: 8,
      nameAr: "التقييم العام والجودة للحصة والمدرس",
      nameEn: "Overall Session & Tutor Rating",
      score: overallScore,
      evidence: evidence8,
      recommendations: weakAreas.length > 0
        ? [`Focus on improving: ${weakAreas.join(', ')}`, "Review session recording and compare against evaluation criteria"]
        : ["Continue maintaining high quality across all criteria"],
      notes: `Average: ${overallScore}/5 | Strong: ${strongAreas.length} | Weak: ${weakAreas.length}`,
    });

    // 9. Session Objectives (قياس مدى تحقيق أهداف الحصة)
    let objScore = 3;
    const evidence9: string[] = [];

    if (overallCorrectness >= 70) { objScore += 0.5; evidence9.push(`Overall correctness ${overallCorrectness}% — learning objectives largely achieved`); }
    else if (overallCorrectness >= 50) { evidence9.push(`Overall correctness ${overallCorrectness}% — partially achieved`); }
    else { objScore -= 0.5; evidence9.push(`Overall correctness ${overallCorrectness}% — objectives not sufficiently achieved`); }

    if (sessionCompletedPercent >= 80) { objScore += 0.5; evidence9.push(`Session completion ${sessionCompletedPercent}% — most students stayed engaged`); }
    else if (sessionCompletedPercent < 60) { objScore -= 0.5; evidence9.push(`Only ${sessionCompletedPercent}% session completion — many students lost engagement`); }

    if (completedActivities === totalActivities) {
      objScore += 0.5; evidence9.push("All planned activities were completed");
    } else {
      evidence9.push(`${completedActivities}/${totalActivities} activities completed`);
    }

    const exitTicketCorrectness = exitTicketInstance?.overallCorrectness?.percent;
    if (exitTicketCorrectness != null) {
      if (exitTicketCorrectness >= 70) { objScore += 0.5; evidence9.push(`Exit ticket correctness ${exitTicketCorrectness}% — strong final assessment`); }
      else if (exitTicketCorrectness >= 50) { evidence9.push(`Exit ticket correctness ${exitTicketCorrectness}%`); }
      else { objScore -= 0.5; evidence9.push(`Exit ticket correctness only ${exitTicketCorrectness}% — objectives not solidified by end of session`); }
    }

    objScore = Math.max(1, Math.min(5, Math.round(objScore * 2) / 2));
    criteria.push({
      id: 9,
      nameAr: "قياس مدى تحقيق أهداف الحصة",
      nameEn: "Session Objectives Achieved",
      score: objScore,
      evidence: evidence9,
      recommendations: objScore < 4 ? [
        overallCorrectness < 60 ? "Review unmet objectives and plan remediation for the next session" : "",
        exitTicketCorrectness != null && exitTicketCorrectness < 60 ? "Use exit ticket results to plan review at the start of the next session" : "",
      ].filter(Boolean) : ["Learning objectives achieved successfully"],
      notes: `Correctness: ${overallCorrectness}%, Completion: ${sessionCompletedPercent}%, Exit ticket: ${exitTicketCorrectness ?? 'N/A'}%`,
    });

    const overallAvg = Math.round(criteria.reduce((s: number, c: any) => s + c.score, 0) / criteria.length * 10) / 10;

    return {
      criteria,
      overallScore: overallAvg,
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
      insights.push(`Overall correctness across all section checks is low at ${avgCorrectness}% — content or teaching approach may need review.`);
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

    const questions = Object.entries(byQuestion).map(([id, q]) => {
      const cleanText = q.text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const percent = q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0;
      const notAnswered = q.seen - q.answered;

      const insights: string[] = [];

      if (notAnswered > 0 && q.seen > 0) {
        const skipPercent = Math.round((notAnswered / q.seen) * 100);
        if (skipPercent >= 20) {
          insights.push(`${notAnswered} students (${skipPercent}%) saw the question but didn't answer — the question may be too difficult or confusing.`);
        }
      }

      if (percent >= 80) {
        insights.push(`Strong result — most students understood this concept well.`);
      } else if (percent >= 60) {
        insights.push(`Acceptable, but some students struggled — may need a quick review next session.`);
      } else if (percent >= 40) {
        insights.push(`Low correctness — this topic needs additional explanation or re-teaching next session.`);
      } else if (q.answered > 0) {
        insights.push(`Very low correctness — the concept was not understood by the majority. The explanation may have been confusing or too brief before the activity.`);
      }

      return {
        questionId: id,
        questionText: cleanText,
        seen: q.seen,
        answered: q.answered,
        correct: q.correct,
        percent,
        insights,
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
      overallInsights.push(`Overall correctness is low at ${overallPercent}% — content may need review or different explanation.`);
    }

    const durationMin = act.durationMin || 0;
    const plannedMin = act.plannedDurationMin || 0;

    if (plannedMin > 0 && durationMin < plannedMin * 0.7) {
      overallInsights.push(`Activity was shorter than planned (${durationMin} min vs ${plannedMin} min planned) — insufficient time may explain incomplete answers.`);
    } else if (plannedMin > 0 && durationMin > plannedMin * 1.3) {
      overallInsights.push(`Activity ran longer than planned (${durationMin} min vs ${plannedMin} min planned) — students may have needed more time.`);
    }

    const completionRate = totalStudents > 0 ? Math.round((totalAnswered / totalStudents) * 100) : 0;
    if (completionRate < 80) {
      overallInsights.push(`Only ${completionRate}% of students completed this activity — some may have run out of time or lost engagement.`);
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
        overallInsights.push(`${unansweredChats.length} student messages during this activity went unanswered — students may be seeking clarification.`);
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
            detail: `The teacher spent only ${explanationMin} min explaining after this activity, but ${correctPercent}% correctness suggests 0.5–1 min of explanation would be appropriate.`,
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
          context += ` This came after an activity with low correctness (${actDetails.join('; ')}) — the teacher was likely re-explaining the concept.`;
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
        detail: `Only ${engagedBursts} chat engagement bursts detected during teacher talk segments. With ${studentChats.length} total student messages, the teacher could do more to elicit responses — ask students to type their answers in chat after each explanation.`,
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
