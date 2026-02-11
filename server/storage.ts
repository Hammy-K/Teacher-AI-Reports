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
    let teacherName = teacherRecord?.userName || 'معلم غير معروف';
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
    if (totalQuestions >= 10) { contentScore += 0.5; evidence1.push(`تم تغطية ${totalQuestions} سؤال — تغطية جيدة`); }
    else if (totalQuestions >= 6) { evidence1.push(`تم تغطية ${totalQuestions} سؤال`); }
    else { contentScore -= 0.5; evidence1.push(`${totalQuestions} أسئلة فقط — تغطية محدودة للمحتوى`); }

    if (overallCorrectness >= 70) { contentScore += 0.5; evidence1.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — فهم قوي`); }
    else if (overallCorrectness >= 50) { evidence1.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — فهم متوسط`); }
    else { contentScore -= 0.5; evidence1.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — ضعف في استيعاب المحتوى`); }

    const highQs = (pollStats.byQuestion || []).filter((q: any) => q.percent >= 70).length;
    const lowQs = (pollStats.byQuestion || []).filter((q: any) => q.percent < 40).length;
    if (highQs >= totalQuestions * 0.5) { contentScore += 0.5; evidence1.push(`${highQs}/${totalQuestions} سؤال فوق 70% — تم توصيل المحتوى بشكل جيد`); }
    if (lowQs >= totalQuestions * 0.3) { contentScore -= 0.5; evidence1.push(`${lowQs}/${totalQuestions} سؤال أقل من 40% — عدة مفاهيم لم تُفهم جيداً`); }

    contentScore = Math.max(1, Math.min(5, Math.round(contentScore * 2) / 2));
    criteria.push({
      id: 1,
      nameAr: "إتقان المحتوى والشرح",
      nameEn: "Instructional & Content Mastery",
      score: contentScore,
      evidence: evidence1,
      recommendations: contentScore < 4 ? [
        lowQs > 0 ? "أعد شرح المفاهيم التي سجلت أقل من 40% باستخدام أساليب مختلفة" : "",
        overallCorrectness < 60 ? "أبطئ في الشرح وأضف المزيد من الأمثلة المحلولة قبل التحقق من الفهم" : "",
        totalQuestions < 8 ? "أضف المزيد من أسئلة التحقق من الفهم خلال الحصة" : "",
      ].filter(Boolean) : ["حافظ على مستوى جودة التدريس الحالي"],
      notes: `${totalQuestions} سؤال، نسبة الإجابات الصحيحة ${overallCorrectness}%، ${highQs} قوي / ${lowQs} ضعيف`,
    });

    // 2. Student Engagement (دعم الطلاب وتحفيزهم)
    let engScore = 3;
    const evidence2: string[] = [];

    if (responseRate >= 85) { engScore += 0.5; evidence2.push(`معدل استجابة ${responseRate}% — مشاركة عالية`); }
    else if (responseRate >= 70) { evidence2.push(`معدل استجابة ${responseRate}%`); }
    else { engScore -= 0.5; evidence2.push(`معدل استجابة ${responseRate}% — كثير من الطلاب لم يستجيبوا`); }

    if (sessionTemperature >= 80) { engScore += 0.5; evidence2.push(`حرارة الحصة ${sessionTemperature}% — تفاعل عالي`); }
    else if (sessionTemperature >= 60) { evidence2.push(`حرارة الحصة ${sessionTemperature}%`); }
    else { engScore -= 0.5; evidence2.push(`حرارة الحصة ${sessionTemperature}% — تفاعل منخفض`); }

    const chatParticipationRate = totalStudents > 0 ? Math.round((uniqueChatStudents / totalStudents) * 100) : 0;
    if (chatParticipationRate >= 20) { engScore += 0.5; evidence2.push(`${uniqueChatStudents} طالب (${chatParticipationRate}%) شاركوا في المحادثة`); }
    else if (chatParticipationRate >= 10) { evidence2.push(`${uniqueChatStudents} طالب (${chatParticipationRate}%) شاركوا في المحادثة`); }
    else { engScore -= 0.5; evidence2.push(`فقط ${uniqueChatStudents} طالب (${chatParticipationRate}%) استخدموا المحادثة — تفاعل منخفض`); }

    if (positivePercent >= 80) { engScore += 0.5; evidence2.push(`مشاعر إيجابية ${positivePercent}% (${positiveUsers}/${totalSentiment})`); }
    else if (positivePercent >= 60) { evidence2.push(`مشاعر إيجابية ${positivePercent}%`); }
    else { engScore -= 0.5; evidence2.push(`فقط ${positivePercent}% مشاعر إيجابية — قد لا يستمتع الطلاب بالحصة`); }

    engScore = Math.max(1, Math.min(5, Math.round(engScore * 2) / 2));
    criteria.push({
      id: 2,
      nameAr: "دعم الطلاب وتحفيزهم",
      nameEn: "Student Engagement",
      score: engScore,
      evidence: evidence2,
      recommendations: engScore < 4 ? [
        responseRate < 80 ? "شجع جميع الطلاب على الاستجابة للاستطلاعات — امنحهم وقتاً كافياً" : "",
        chatParticipationRate < 15 ? "اطلب من الطلاب الرد في المحادثة على أسئلة التحقق من الفهم" : "",
        sessionTemperature < 70 ? "زد التفاعل باستخدام عناصر تفاعلية أكثر وتعزيز إيجابي" : "",
      ].filter(Boolean) : ["استمر في تعزيز تفاعل الطلاب"],
      notes: `${totalStudents} طالب، معدل استجابة ${responseRate}%، حرارة ${sessionTemperature}%`,
    });

    // 3. Tutor Communication (التواصل وحضور المعلّم)
    let commScore = 3;
    const evidence3: string[] = [];

    if (teacherChats.length >= 5) { commScore += 0.5; evidence3.push(`أرسل المعلم ${teacherChats.length} رسالة — تواصل فعال`); }
    else if (teacherChats.length >= 1) { evidence3.push(`أرسل المعلم ${teacherChats.length} رسالة`); }
    else { commScore -= 0.5; evidence3.push("لم يستخدم المعلم المحادثة للتواصل مع الطلاب"); }

    if (longSegments.length === 0) { commScore += 0.5; evidence3.push(`جميع مقاطع الحديث أقل من دقيقتين — إيقاع وتفاعل جيد`); }
    else { commScore -= 0.5; evidence3.push(`${longSegments.length} مقطع حديث تجاوز دقيقتين — يجب التقسيم بالتفاعل`); }

    if (positivePercent >= 75) { commScore += 0.5; evidence3.push(`مشاعر إيجابية ${positivePercent}% تدل على علاقة جيدة مع الطلاب`); }
    else if (positivePercent < 60) { commScore -= 0.5; evidence3.push(`مشاعر إيجابية منخفضة (${positivePercent}%) قد تدل على مشاكل في التواصل`); }

    commScore = Math.max(1, Math.min(5, Math.round(commScore * 2) / 2));
    criteria.push({
      id: 3,
      nameAr: "التواصل وحضور المعلّم",
      nameEn: "Tutor Communication",
      score: commScore,
      evidence: evidence3,
      recommendations: commScore < 4 ? [
        teacherChats.length < 3 ? "تفاعل مع أسئلة الطلاب في المحادثة بشكل أكثر" : "",
        longSegments.length > 0 ? "قسّم مقاطع الحديث الطويلة بتفاعل الطلاب كل دقيقتين" : "",
      ].filter(Boolean) : ["أسلوب التواصل فعال"],
      notes: `${teacherChats.length} رسالة للمعلم، أطول مقطع ${longestSegMin} د`,
    });

    // 4. Time Management (إدارة الوقت والخطة التعليمية)
    let timeScore = 3;
    const evidence4: string[] = [];
    const scheduledDuration = 45;
    const actualDuration = Math.round(teachingTime);

    if (actualDuration >= scheduledDuration - 5 && actualDuration <= scheduledDuration + 10) {
      timeScore += 0.5; evidence4.push(`استمرت الحصة ${actualDuration} د — ضمن الوقت المتوقع ${scheduledDuration} د`);
    } else if (actualDuration < scheduledDuration - 5) {
      timeScore -= 0.5; evidence4.push(`الحصة ${actualDuration} د فقط — أقصر من المقرر ${scheduledDuration} د`);
    } else {
      evidence4.push(`استمرت الحصة ${actualDuration} د مقابل المقرر ${scheduledDuration} د — تجاوز الوقت`);
    }

    if (totalTeacherTalkMin <= 15) {
      timeScore += 0.5; evidence4.push(`حديث المعلم ${totalTeacherTalkMin} د — ضمن حد 15 د`);
    } else if (totalTeacherTalkMin <= 20) {
      evidence4.push(`حديث المعلم ${totalTeacherTalkMin} د — أعلى قليلاً من هدف 15 د`);
    } else {
      timeScore -= 0.5; evidence4.push(`حديث المعلم ${totalTeacherTalkMin} د — يتجاوز حد 15 د بشكل كبير`);
    }

    if (studentActivePercent >= 60) {
      timeScore += 0.5; evidence4.push(`${studentActivePercent}% من الوقت كان نشاطاً للطلاب — توازن ممتاز`);
    } else if (studentActivePercent >= 45) {
      evidence4.push(`${studentActivePercent}% وقت نشاط الطلاب`);
    } else {
      timeScore -= 0.5; evidence4.push(`فقط ${studentActivePercent}% وقت نشاط الطلاب — حصة يهيمن عليها المعلم`);
    }

    timeScore = Math.max(1, Math.min(5, Math.round(timeScore * 2) / 2));
    criteria.push({
      id: 4,
      nameAr: "إدارة الوقت والخطة التعليمية",
      nameEn: "Time Management",
      score: timeScore,
      evidence: evidence4,
      recommendations: timeScore < 4 ? [
        totalTeacherTalkMin > 15 ? "قلل حديث المعلم لأقل من 15 د لإتاحة المزيد من وقت ممارسة الطلاب" : "",
        studentActivePercent < 50 ? "زد وقت نشاط الطلاب — استهدف 50% على الأقل من الحصة" : "",
      ].filter(Boolean) : ["إدارة الوقت متوازنة"],
      notes: `حصة ${actualDuration} د، حديث ${totalTeacherTalkMin} د، ${studentActivePercent}% وقت الطلاب`,
    });

    // 5. Session Pacing (الإلتزام بتصميم وخطة الدرس وتوزيع الوقت)
    let paceScore = 3;
    const evidence5: string[] = [];
    const totalActivities = activities.length;
    const completedActivities = happenedActivities.length;

    if (completedActivities === totalActivities) {
      paceScore += 0.5; evidence5.push(`جميع ${totalActivities} أنشطة مكتملة — تم تنفيذ خطة الدرس كاملة`);
    } else {
      const completionRate = Math.round((completedActivities / totalActivities) * 100);
      if (completionRate >= 80) { evidence5.push(`${completedActivities}/${totalActivities} نشاط مكتمل (${completionRate}%)`); }
      else { paceScore -= 0.5; evidence5.push(`فقط ${completedActivities}/${totalActivities} نشاط مكتمل (${completionRate}%) — لم تُنفذ خطة الدرس بالكامل`); }
    }

    if (sessionCompletedPercent >= 80) {
      paceScore += 0.5; evidence5.push(`معدل إكمال الحصة ${sessionCompletedPercent}% — الطلاب واكبوا`);
    } else if (sessionCompletedPercent >= 60) {
      evidence5.push(`معدل إكمال الحصة ${sessionCompletedPercent}%`);
    } else {
      paceScore -= 0.5; evidence5.push(`فقط ${sessionCompletedPercent}% إكمال الحصة — قد يكون الإيقاع سريعاً جداً`);
    }

    const avgLearningTimeMin = Math.round(avgLearningTime * 10) / 10;
    if (avgLearningTimeMin >= teachingTime * 0.7) {
      paceScore += 0.5; evidence5.push(`متوسط وقت تعلم الطلاب ${avgLearningTimeMin} د — إيقاع جيد`);
    } else {
      evidence5.push(`متوسط وقت تعلم الطلاب ${avgLearningTimeMin} د من أصل ${Math.round(teachingTime)} د`);
    }

    paceScore = Math.max(1, Math.min(5, Math.round(paceScore * 2) / 2));
    criteria.push({
      id: 5,
      nameAr: "الإلتزام بتصميم وخطة الدرس وتوزيع الوقت",
      nameEn: "Session Pacing",
      score: paceScore,
      evidence: evidence5,
      recommendations: paceScore < 4 ? [
        completedActivities < totalActivities ? "تأكد من إكمال جميع الأنشطة المخططة ضمن وقت الحصة" : "",
        sessionCompletedPercent < 70 ? "أبطئ الإيقاع ليتمكن المزيد من الطلاب من المواكبة" : "",
      ].filter(Boolean) : ["الإيقاع مضبوط بشكل جيد"],
      notes: `${completedActivities}/${totalActivities} نشاط، ${sessionCompletedPercent}% إكمال، متوسط ${avgLearningTimeMin} د`,
    });

    // 6. Mistakes & Impact (الاخطاء و تأثيرها على الدرس)
    let mistakeScore = 4;
    const evidence6: string[] = [];

    const exitTicketAnalysis = activityAnalyses.find((a: any) => a.activityType === 'EXIT_TICKET');
    const exitTicketInstance = exitTicketAnalysis?.instances?.[0];
    if (exitTicketInstance?.teacherTalkDuring) {
      mistakeScore -= 1;
      evidence6.push(`كان المعلم يتحدث أثناء اختبار الفهم النهائي لمدة ${exitTicketInstance.teacherTalkOverlapMin} د — يجب أن يجيب الطلاب بشكل مستقل`);
    } else {
      evidence6.push("لم يتحدث المعلم أثناء اختبار الفهم النهائي — تم اتباع البروتوكول الصحيح");
    }

    const tmImprovements = feedback.needsImprovement.filter((f: any) => f.category === 'time_management');
    if (tmImprovements.length >= 3) {
      mistakeScore -= 0.5;
      evidence6.push(`تم تحديد ${tmImprovements.length} مشاكل في إدارة الوقت — نمط متكرر`);
    } else if (tmImprovements.length > 0) {
      evidence6.push(`${tmImprovements.length} مشكلة بسيطة في إدارة الوقت`);
    } else {
      mistakeScore += 0.5;
      evidence6.push("لم يتم اكتشاف أخطاء كبيرة في إدارة الوقت");
    }

    mistakeScore = Math.max(1, Math.min(5, Math.round(mistakeScore * 2) / 2));
    criteria.push({
      id: 6,
      nameAr: "الاخطاء و تأثيرها على الدرس",
      nameEn: "Mistakes & Impact",
      score: mistakeScore,
      evidence: evidence6,
      recommendations: mistakeScore < 4 ? [
        exitTicketInstance?.teacherTalkDuring ? "لا تتحدث أثناء اختبار الفهم النهائي — دع الطلاب يجيبون بشكل مستقل" : "",
        tmImprovements.length > 0 ? "راجع توزيع الوقت بعد كل نشاط بناءً على نسبة صحة الطلاب" : "",
      ].filter(Boolean) : ["لم يتم اكتشاف أخطاء كبيرة"],
      notes: exitTicketInstance?.teacherTalkDuring
        ? `تحدث المعلم ${exitTicketInstance.teacherTalkOverlapMin} د أثناء اختبار الفهم النهائي`
        : "تم اتباع بروتوكول اختبار الفهم النهائي بشكل صحيح",
    });

    // 7. Distinct Moments (لحظات تميّز من الأستاذ)
    let distinctScore = 3;
    const evidence7: string[] = [];
    const wellCount = feedback.wentWell.length;

    if (wellCount >= 5) { distinctScore += 1; evidence7.push(`تم تحديد ${wellCount} ملاحظة إيجابية — الحصة كانت بها لحظات قوية كثيرة`); }
    else if (wellCount >= 3) { distinctScore += 0.5; evidence7.push(`${wellCount} ملاحظة إيجابية`); }
    else { evidence7.push(`فقط ${wellCount} ملاحظة إيجابية — لحظات تميز قليلة`); }

    const bestQuestion = (pollStats.byQuestion || []).reduce((best: any, q: any) => (!best || q.percent > best.percent) ? q : best, null);
    if (bestQuestion && bestQuestion.percent >= 75) {
      distinctScore += 0.5;
      evidence7.push(`أقوى سؤال حقق ${bestQuestion.percent}% صحة — تدريس فعال لهذا المفهوم`);
    }

    if (sessionTemperature >= 80 && positivePercent >= 80) {
      evidence7.push(`حرارة عالية (${sessionTemperature}%) مع ${positivePercent}% مشاعر إيجابية — الطلاب كانوا متحمسين`);
    }

    distinctScore = Math.max(1, Math.min(5, Math.round(distinctScore * 2) / 2));
    criteria.push({
      id: 7,
      nameAr: "لحظات تميّز من الأستاذ",
      nameEn: "Distinct Moments",
      score: distinctScore,
      evidence: evidence7,
      recommendations: distinctScore < 4 ? [
        "اصنع لحظات تعلم لا تُنسى من خلال القصص أو الربط بالواقع",
        "احتفل بنجاحات الطلاب علناً لتعزيز الدافعية",
      ] : ["استمر في صنع لحظات تدريس مؤثرة"],
      notes: `${wellCount} ملاحظة إيجابية، أفضل سؤال بنسبة ${bestQuestion?.percent || 0}%`,
    });

    // 8. Overall Rating (التقييم العام والجودة للحصة والمدرس)
    const avgOfAll = Math.round((contentScore + engScore + commScore + timeScore + paceScore + mistakeScore + distinctScore) / 7 * 2) / 2;
    const overallScore = Math.max(1, Math.min(5, avgOfAll));
    const evidence8: string[] = [];

    if (overallScore >= 4) { evidence8.push("حصة قوية بشكل عام — معظم المعايير تم تحقيقها أو تجاوزها"); }
    else if (overallScore >= 3) { evidence8.push("حصة مقبولة مع مجال للتحسين في مجالات محددة"); }
    else { evidence8.push("الحصة تحتاج تحسيناً كبيراً في عدة معايير"); }

    evidence8.push(`المتوسط المرجح عبر 7 معايير: ${overallScore}/5`);

    const strongAreas = criteria.filter((c: any) => c.score >= 4).map((c: any) => c.nameAr);
    const weakAreas = criteria.filter((c: any) => c.score < 3).map((c: any) => c.nameAr);
    if (strongAreas.length > 0) evidence8.push(`نقاط القوة: ${strongAreas.join('، ')}`);
    if (weakAreas.length > 0) evidence8.push(`مجالات التحسين: ${weakAreas.join('، ')}`);

    criteria.push({
      id: 8,
      nameAr: "التقييم العام والجودة للحصة والمدرس",
      nameEn: "Overall Session & Tutor Rating",
      score: overallScore,
      evidence: evidence8,
      recommendations: weakAreas.length > 0
        ? [`ركز على تحسين: ${weakAreas.join('، ')}`, "راجع تسجيل الحصة وقارنها بمعايير التقييم"]
        : ["استمر في الحفاظ على الجودة العالية في جميع المعايير"],
      notes: `المتوسط: ${overallScore}/5 | قوي: ${strongAreas.length} | ضعيف: ${weakAreas.length}`,
    });

    // 9. Session Objectives (قياس مدى تحقيق أهداف الحصة)
    let objScore = 3;
    const evidence9: string[] = [];

    if (overallCorrectness >= 70) { objScore += 0.5; evidence9.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — تم تحقيق أهداف التعلم بشكل كبير`); }
    else if (overallCorrectness >= 50) { evidence9.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — تم تحقيقها جزئياً`); }
    else { objScore -= 0.5; evidence9.push(`نسبة الإجابات الصحيحة ${overallCorrectness}% — لم تتحقق الأهداف بشكل كافٍ`); }

    if (sessionCompletedPercent >= 80) { objScore += 0.5; evidence9.push(`إكمال الحصة ${sessionCompletedPercent}% — معظم الطلاب بقوا متفاعلين`); }
    else if (sessionCompletedPercent < 60) { objScore -= 0.5; evidence9.push(`فقط ${sessionCompletedPercent}% إكمال الحصة — كثير من الطلاب فقدوا التفاعل`); }

    if (completedActivities === totalActivities) {
      objScore += 0.5; evidence9.push("تم إكمال جميع الأنشطة المخططة");
    } else {
      evidence9.push(`${completedActivities}/${totalActivities} نشاط مكتمل`);
    }

    const exitTicketCorrectness = exitTicketInstance?.overallCorrectness?.percent;
    if (exitTicketCorrectness != null) {
      if (exitTicketCorrectness >= 70) { objScore += 0.5; evidence9.push(`صحة اختبار الفهم النهائي ${exitTicketCorrectness}% — تقييم نهائي قوي`); }
      else if (exitTicketCorrectness >= 50) { evidence9.push(`صحة اختبار الفهم النهائي ${exitTicketCorrectness}%`); }
      else { objScore -= 0.5; evidence9.push(`صحة اختبار الفهم النهائي ${exitTicketCorrectness}% فقط — لم تتثبت الأهداف بنهاية الحصة`); }
    }

    objScore = Math.max(1, Math.min(5, Math.round(objScore * 2) / 2));
    criteria.push({
      id: 9,
      nameAr: "قياس مدى تحقيق أهداف الحصة",
      nameEn: "Session Objectives Achieved",
      score: objScore,
      evidence: evidence9,
      recommendations: objScore < 4 ? [
        overallCorrectness < 60 ? "راجع الأهداف التي لم تتحقق وخطط للمعالجة في الحصة القادمة" : "",
        exitTicketCorrectness != null && exitTicketCorrectness < 60 ? "استخدم نتائج اختبار الفهم النهائي للتخطيط للمراجعة في بداية الحصة القادمة" : "",
      ].filter(Boolean) : ["تم تحقيق أهداف التعلم بنجاح"],
      notes: `الصحة: ${overallCorrectness}%، الإكمال: ${sessionCompletedPercent}%، اختبار الفهم النهائي: ${exitTicketCorrectness ?? 'غ/م'}%`,
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
        chatParticipation: `${uniqueChatStudents}/${totalStudents} طالب`,
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
        SECTION_CHECK: "اختبارات الفهم",
        TEAM_EXERCISE: "تمرين جماعي",
        EXIT_TICKET: "اختبار الفهم النهائي",
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
      insights.push(`${lowQs.length} من أصل ${allQuestions.length} سؤال كانت نسبة صحتها منخفضة جداً (أقل من 40%) — هذه المواضيع تحتاج إعادة شرح.`);
    }

    const avgCompletionRate = count > 0
      ? Math.round(instances.reduce((s, i) => s + (i.studentsWhoAnswered / totalStudents * 100), 0) / count)
      : 0;
    if (avgCompletionRate < 80) {
      insights.push(`متوسط إكمال أسئلة اختبار الفهم وصل ${avgCompletionRate}% — مما يشير إلى ضيق الوقت لدى بعض الطلاب.`);
    }

    const teacherTalkInstances = instances.filter(i => i.teacherTalkDuring);
    if (teacherTalkInstances.length > 0) {
      const totalOverlap = Math.round(teacherTalkInstances.reduce((s, i) => s + i.teacherTalkOverlapMin, 0) * 10) / 10;
      insights.push(`كان المعلم يتحدث خلال ${teacherTalkInstances.length} من ${count} اختبار فهم (${totalOverlap} د إجمالاً).`);
    }

    if (avgCorrectness < 50) {
      insights.push(`نسبة الإجابات الصحيحة عبر جميع اختبارات الفهم منخفضة عند ${avgCorrectness}% — قد يحتاج المحتوى أو أسلوب الشرح لمراجعة.`);
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
          insights.push(`${notAnswered} طالب (${skipPercent}%) شاهدوا السؤال ولم يجيبوا — قد يكون السؤال صعباً أو مربكاً.`);
        }
      }

      if (percent >= 80) {
        insights.push(`نتيجة قوية — معظم الطلاب فهموا هذا المفهوم جيداً.`);
      } else if (percent >= 60) {
        insights.push(`مقبول لكن بعض الطلاب واجهوا صعوبة — قد يحتاج مراجعة سريعة في الحصة القادمة.`);
      } else if (percent >= 40) {
        insights.push(`نسبة صحة منخفضة — هذا الموضوع يحتاج شرحاً إضافياً أو إعادة تدريس في الحصة القادمة.`);
      } else if (q.answered > 0) {
        insights.push(`نسبة صحة منخفضة جداً — المفهوم لم يُفهم من الأغلبية. قد يكون الشرح مربكاً أو قصيراً جداً قبل النشاط.`);
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
      overallInsights.push(`كان المعلم يتحدث لمدة ${teacherTalkOverlapMin} د أثناء اختبار الفهم النهائي، يناقش: ${teacherTalkTopics}. يجب إكمال اختبار الفهم النهائي بشكل مستقل لقياس الفهم بدقة.`);
    }

    const overallPercent = act.correctness?.percent ?? 0;
    if (overallPercent < 50 && overallPercent > 0) {
      overallInsights.push(`نسبة الصحة الإجمالية منخفضة عند ${overallPercent}% — قد يحتاج المحتوى لمراجعة أو شرح مختلف.`);
    }

    const durationMin = act.durationMin || 0;
    const plannedMin = act.plannedDurationMin || 0;

    if (plannedMin > 0 && durationMin < plannedMin * 0.7) {
      overallInsights.push(`النشاط كان أقصر من المخطط (${durationMin} د مقابل ${plannedMin} د مخطط) — قلة الوقت قد تفسر الإجابات غير المكتملة.`);
    } else if (plannedMin > 0 && durationMin > plannedMin * 1.3) {
      overallInsights.push(`النشاط استمر أطول من المخطط (${durationMin} د مقابل ${plannedMin} د مخطط) — قد يكون الطلاب احتاجوا وقتاً أكثر.`);
    }

    const completionRate = totalStudents > 0 ? Math.round((totalAnswered / totalStudents) * 100) : 0;
    if (completionRate < 80) {
      overallInsights.push(`فقط ${completionRate}% من الطلاب أكملوا هذا النشاط — بعضهم قد نفد وقتهم أو فقدوا التفاعل.`);
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
        overallInsights.push(`${unansweredChats.length} رسالة من الطلاب أثناء هذا النشاط لم يتم الرد عليها — قد يكون الطلاب يطلبون توضيحاً.`);
      }
    }

    const highCorrectQs = questions.filter(q => q.percent >= 80);
    if (highCorrectQs.length > 0 && teacherTalkDuring && act.activityType === 'EXIT_TICKET') {
      overallInsights.push(`${highCorrectQs.length} سؤال حققوا نسبة صحة عالية (80%+)، ومع ذلك كان المعلم لا يزال يتحدث أثناء اختبار الفهم النهائي.`);
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

      const typeNameAr: Record<string, string> = {
        SECTION_CHECK: "اختبار الفهم",
        EXIT_TICKET: "اختبار الفهم النهائي",
        TEAM_EXERCISE: "تمرين جماعي",
      };
      const actLabel = `${typeNameAr[act.activityType] || act.activityType} (${correctPercent}% صحة)`;
      const explanationMin = this.toMin(explanationTimeSec);

      if (correctPercent > 75) {
        if (explanationTimeSec <= 15) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط — مناسب حيث أن ${correctPercent}% من الطلاب أجابوا بشكل صحيح.`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط، لكن ${correctPercent}% من الطلاب أجابوا بشكل صحيح بالفعل. يجب الانتقال بسرعة.`,
            recommended: "< 0.3 د",
            actual: `${explanationMin} د`,
          });
        }

        if (calledStudentOnStage) {
          needsImprovement.push({
            category: "student_stage",
            activityId: act.activityId,
            activity: actLabel,
            detail: `تم استدعاء طالب للشرح، لكن ${correctPercent}% أجابوا بشكل صحيح بالفعل — غير ضروري عندما يكون المتوسط فوق 75%.`,
          });
        } else {
          wentWell.push({
            category: "student_stage",
            activityId: act.activityId,
            activity: actLabel,
            detail: `لم يستدعِ المعلم طالباً للشرح — قرار صائب حيث أن ${correctPercent}% أجابوا بشكل صحيح.`,
          });
        }
      } else if (correctPercent >= 50) {
        if (explanationTimeSec >= 30 && explanationTimeSec <= 60) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط — مناسب لنسبة صحة ${correctPercent}%.`,
          });
        } else if (explanationTimeSec < 30) {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د فقط في الشرح بعد هذا النشاط، لكن نسبة صحة ${correctPercent}% تقترح أن 0.5–1 د من الشرح سيكون مناسباً.`,
            recommended: "0.5–1 د",
            actual: `${explanationMin} د`,
          });
        } else {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط. مع نسبة صحة ${correctPercent}%، 0.5–1 د سيكون كافياً.`,
            recommended: "0.5–1 د",
            actual: `${explanationMin} د`,
          });
        }
      } else {
        if (explanationTimeSec >= 60 && explanationTimeSec <= 120) {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط — مناسب لنسبة الصحة المنخفضة ${correctPercent}%.`,
          });
        } else if (explanationTimeSec < 60) {
          needsImprovement.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د فقط في الشرح بعد هذا النشاط، لكن فقط ${correctPercent}% أجابوا بشكل صحيح. يجب قضاء حتى دقيقتين لضمان الفهم.`,
            recommended: "1–2 د",
            actual: `${explanationMin} د`,
          });
        } else {
          wentWell.push({
            category: "time_management",
            activityId: act.activityId,
            activity: actLabel,
            detail: `قضى المعلم ${explanationMin} د في الشرح بعد هذا النشاط — شرح شامل ومناسب حيث أن فقط ${correctPercent}% أجابوا بشكل صحيح.`,
          });
        }
      }
    }

    this.generatePedagogyFeedback(transcriptTimes, chats, session, activities, wentWell, needsImprovement);

    return { wentWell, needsImprovement };
  }

  private extractTopics(texts: string[]): string {
    const topicMap: [RegExp, string][] = [
      [/الدائر[ةه]/i, "الدوائر"],
      [/المستقيم|مستقيمات/i, "المستقيمات في الدوائر"],
      [/نصف القطر|أنصاف.*القطر/i, "نصف القطر"],
      [/القطر/i, "القطر"],
      [/الوتر|وتر/i, "الوتر"],
      [/مماس|التماس/i, "المماس"],
      [/الزاوي[ةه]\s*المركزي[ةه]/i, "الزوايا المركزية"],
      [/الزاوي[ةه]\s*المحيطي[ةه]/i, "الزوايا المحيطية"],
      [/الزوايا|زاوي[ةه]/i, "الزوايا"],
      [/المحيط/i, "المحيط"],
      [/المساح[ةه]/i, "المساحة"],
      [/المضلع|مضلعات|رباعي/i, "المضلعات"],
      [/القوس/i, "القوس"],
      [/طاء.*نق|نق\s*تربيع/i, "قوانين الدائرة"],
      [/مربع|مثلث|سداسي/i, "الأشكال داخل الدوائر"],
      [/اشرح|اشرحي|يلا.*اشرح/i, "استدعاء طالب للشرح"],
    ];

    const combined = texts.join(' ');
    const found: string[] = [];
    for (const [pattern, label] of topicMap) {
      if (pattern.test(combined) && !found.includes(label)) {
        found.push(label);
      }
    }
    return found.length > 0 ? found.join(', ') : "تدريس عام";
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
          examples.push(`"${text.substring(0, 50)}" — ${chat.creatorName || 'طالب'}`);
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

      let context = `${formatTime(seg.startSec)}–${formatTime(seg.endSec)} (${durationMin} د): المعلم كان يناقش ${topics}.`;

      if (nearbyActivities.length > 0) {
        const actDetails = nearbyActivities.map(a => {
          const pct = a.correctness?.percent ?? 0;
          return `${a.activityType} سجل ${pct}% صحة`;
        });
        if (nearbyActivities.some(a => (a.correctness?.percent ?? 100) < 50)) {
          context += ` هذا جاء بعد نشاط بنسبة صحة منخفضة (${actDetails.join('؛ ')}) — المعلم كان على الأرجح يعيد شرح المفهوم.`;
        } else {
          context += ` بالقرب من نشاط: ${actDetails.join('؛ ')}.`;
        }
      }

      if (chatContext.confused) {
        context += ` أظهر الطلاب ارتباكاً في المحادثة: ${chatContext.examples.join('؛ ')}.`;
      }

      segmentDetails.push(context);
    }

    if (longSegments.length === 0) {
      wentWell.push({
        category: "pedagogy",
        activity: "الحديث المستمر",
        detail: `حافظ المعلم على جميع مقاطع الحديث أقل من دقيقتين — إيقاع جيد يسمح للطلاب بالبقاء متفاعلين. أطول مقطع مستمر كان ${Math.round(Math.max(...continuousSegments.map(s => s.durationSec)))} ثانية.`,
      });
    } else {
      const longestSeg = longSegments.reduce((a, b) => a.durationSec > b.durationSec ? a : b);
      const longestMin = Math.round(longestSeg.durationSec / 60 * 10) / 10;
      needsImprovement.push({
        category: "pedagogy",
        activity: "الحديث المستمر",
        detail: `المعلم كان لديه ${longSegments.length} فترة حديث متواصل تجاوزت دقيقتين. أطول فترة كانت ${longestMin} د (${formatTime(longestSeg.startSec)}–${formatTime(longestSeg.endSec)}). قسّم الفترات الطويلة بأسئلة أو تفاعل مع الطلاب.`,
        recommended: "أقل من دقيقتين لكل فترة",
        actual: `${longestMin} د أطول فترة`,
        segments: segmentDetails,
      });
    }

    const sessionDurationMin = session?.sessionTime || session?.teachingTime || 55;

    if (totalTeacherTalkMin <= MAX_TOTAL_TALK_MIN) {
      wentWell.push({
        category: "pedagogy",
        activity: "إجمالي حديث المعلم",
        detail: `إجمالي وقت حديث المعلم كان ${totalTeacherTalkMin} د من أصل ${sessionDurationMin} د حصة — ضمن الحد الموصى به 15 دقيقة. هذا يترك وقتاً كافياً لأنشطة الطلاب.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "إجمالي حديث المعلم",
        detail: `إجمالي وقت حديث المعلم كان ${totalTeacherTalkMin} د من أصل ${sessionDurationMin} د حصة. من الأفضل أن يكون حديث المعلم أقل من 15 دقيقة لإتاحة غالبية الحصة للتعلم النشط للطلاب.`,
        recommended: "أقل من 15 د",
        actual: `${totalTeacherTalkMin} د`,
      });
    }

    const studentActiveMin = Math.round((sessionDurationMin - totalTeacherTalkMin) * 10) / 10;
    const studentActivePercent = Math.round((studentActiveMin / sessionDurationMin) * 100);

    if (studentActivePercent > 50) {
      wentWell.push({
        category: "pedagogy",
        activity: "وقت نشاط الطلاب",
        detail: `حصل الطلاب على ${studentActiveMin} د (${studentActivePercent}%) من الوقت النشط مقابل ${totalTeacherTalkMin} د حديث المعلم — غالبية الحصة كانت محورها الطالب.`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "وقت نشاط الطلاب",
        detail: `حصل الطلاب على ${studentActiveMin} د فقط (${studentActivePercent}%) من الوقت النشط. حديث المعلم (${totalTeacherTalkMin} د) استغرق معظم الحصة. يجب أن يكون غالبية وقت الحصة وقتاً نشطاً للطلاب.`,
        recommended: "أكثر من 50% وقت الطلاب",
        actual: `${studentActivePercent}% وقت الطلاب`,
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
        activity: "تفاعل المحادثة",
        detail: `لم يتم تسجيل رسائل محادثة من الطلاب خلال الحصة. يجب على المعلمين حث الطلاب على الرد في المحادثة للتحقق من الفهم والحفاظ على التفاعل.`,
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
        activity: "تفاعل المحادثة",
        detail: `تفاعل الطلاب في المحادثة ${engagedBursts} مرات خلال أو بعد حديث المعلم مباشرة (${studentChats.length} رسالة إجمالية من ${new Set(studentChats.map(c => c.creatorId)).size} طالب). هذا يدل على أن المعلم طلب ردوداً بشكل فعال وتحقق من الفهم.`,
      });
    } else if (engagedBursts >= 1) {
      needsImprovement.push({
        category: "pedagogy",
        activity: "تفاعل المحادثة",
        detail: `تم اكتشاف ${engagedBursts} فقط من نوبات تفاعل المحادثة خلال مقاطع حديث المعلم. مع ${studentChats.length} رسالة إجمالية من الطلاب، يمكن للمعلم بذل المزيد لاستخراج الردود — اطلب من الطلاب كتابة إجاباتهم في المحادثة بعد كل شرح.`,
        recommended: "3+ طلبات تفاعل لكل حصة",
        actual: `${engagedBursts} نوبات تفاعل`,
      });
    } else {
      needsImprovement.push({
        category: "pedagogy",
        activity: "تفاعل المحادثة",
        detail: `بينما تم إرسال ${studentChats.length} رسالة من الطلاب في المحادثة، لم يبدُ أن أياً منها كان رداً مباشراً على طلبات المعلم. يجب على المعلم طلب الرد من الطلاب في المحادثة للتحقق من الفهم خلال الدروس.`,
        recommended: "متابعة منتظمة عبر المحادثة",
        actual: "لم يتم اكتشاف تفاعل محفّز",
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
