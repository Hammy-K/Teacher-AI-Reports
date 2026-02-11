import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { storage } from "./storage";
import type {
  InsertCourseSession, InsertSessionTranscript, InsertSessionChat,
  InsertClassroomActivity, InsertUserPoll, InsertUserReaction, InsertUserSession,
} from "@shared/schema";

const ASSETS_DIR = path.join(process.cwd(), "attached_assets");

function readCsv(filename: string): any[] {
  const filePath = path.join(ASSETS_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function safeInt(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function safeFloat(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function safeBool(val: any): boolean | null {
  if (val === undefined || val === null || val === '') return null;
  if (val === 'true' || val === 'True' || val === '1' || val === true) return true;
  if (val === 'false' || val === 'False' || val === '0' || val === false) return false;
  return null;
}

function detectSessionId(): number | null {
  const files = fs.readdirSync(ASSETS_DIR);
  for (const file of files) {
    const match = file.match(/(?:course_[Ss]ession|chats|classroom_activity|f_user_poll|f_user_reaction|user_session|namra_transcript)_(\d+)_/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

interface CsvFileMap {
  courseSession: string | null;
  transcript: string | null;
  chats: string | null;
  classroomActivity: string | null;
  userPoll: string | null;
  userReaction: string | null;
  userSession: string | null;
}

function findCsvFiles(sessionId: number): CsvFileMap {
  const files = fs.readdirSync(ASSETS_DIR);
  const sid = String(sessionId);

  const find = (patterns: RegExp[]): string | null => {
    for (const pattern of patterns) {
      const found = files.find(f => pattern.test(f) && f.includes(sid));
      if (found) return found;
    }
    return null;
  };

  return {
    courseSession: find([/^course_session/i]),
    transcript: find([/^namra_transcript/i, /^transcript/i]),
    chats: find([/^chats/i, /^chat/i]),
    classroomActivity: find([/^classroom_activity/i]),
    userPoll: find([/^f_user_poll/i, /^user_poll/i]),
    userReaction: find([/^f_user_reaction/i, /^user_reaction/i]),
    userSession: find([/^user_session/i]),
  };
}

function tryExtractExcel(sessionId: number): boolean {
  const files = fs.readdirSync(ASSETS_DIR);
  const xlsxFile = files.find(f => f.endsWith('.xlsx') && f.includes(String(sessionId)));
  if (!xlsxFile) return false;

  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(path.join(ASSETS_DIR, xlsxFile));

    const sheetMapping: Record<string, string> = {
      'course_session': `course_Session_${sessionId}_extracted.csv`,
      'transcript': `namra_transcript_${sessionId}_extracted.csv`,
      'chats': `chats_${sessionId}_extracted.csv`,
      'classroom_activity': `classroom_activity_${sessionId}_extracted.csv`,
      'user_poll': `f_user_poll_${sessionId}_extracted.csv`,
      'user_reaction': `f_user_reaction_${sessionId}_extracted.csv`,
      'user_session': `user_session_${sessionId}_extracted.csv`,
    };

    for (const sheetName of wb.SheetNames) {
      const normalizedName = sheetName.toLowerCase().replace(/[\s-]+/g, '_');
      for (const [key, outputFilename] of Object.entries(sheetMapping)) {
        if (normalizedName.includes(key)) {
          const outputPath = path.join(ASSETS_DIR, outputFilename);
          if (!fs.existsSync(outputPath)) {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
            fs.writeFileSync(outputPath, csv, 'utf-8');
            console.log(`Extracted sheet "${sheetName}" → ${outputFilename}`);
          }
          break;
        }
      }
    }
    return true;
  } catch (err) {
    console.warn("Excel extraction failed:", err);
    return false;
  }
}

export async function importAllData() {
  const already = await storage.isDataImported();
  if (already) {
    console.log("Data already imported, skipping...");
    return;
  }

  const sessionId = detectSessionId();
  if (!sessionId) {
    console.warn("No session ID detected from CSV filenames in attached_assets/");
    return;
  }
  console.log(`Detected session ID: ${sessionId}`);

  tryExtractExcel(sessionId);

  const csvFiles = findCsvFiles(sessionId);
  console.log("CSV files found:", csvFiles);

  if (csvFiles.courseSession) {
    const sessionRows = readCsv(csvFiles.courseSession);
    for (const row of sessionRows) {
      const data: InsertCourseSession = {
        courseSessionId: safeInt(row.course_session_id) || sessionId,
        courseId: safeInt(row.course_id),
        courseSessionName: row.course_session_name || null,
        courseSessionClassType: row.course_session_class_type || null,
        courseSessionType: row.course_session_type || null,
        teacherId: safeInt(row.teacher_id),
        scheduledStartTime: row.course_session_scheduled_start_time || row.scheduled_start_time || null,
        scheduledEndTime: row.course_session_scheduled_end_time || row.scheduled_end_time || null,
        teacherStartTime: row.teacher_start_time || null,
        teacherEndTime: row.teacher_end_time || null,
        teachingTime: safeFloat(row.teaching_time),
        sessionTime: safeFloat(row.session_time),
        avgActiveTimePerStudent: safeFloat(row.avg_active_time_per_student),
        medianActiveTimePerStudent: safeFloat(row.median_active_time_per_student),
        courseSessionStatus: row.course_session_status || null,
        totalSegments: safeInt(row.total_segments),
        engagementEvents: row.engagement_events ? JSON.parse(row.engagement_events.replace(/'/g, '"')) : null,
        engagementDurations: row.engagement_durations ? JSON.parse(row.engagement_durations.replace(/'/g, '"')) : null,
        positiveUsers: safeInt(row.positive_users),
        negativeUsers: safeInt(row.negative_users),
        neutralUsers: safeInt(row.neutral_users),
        sessionTemperature: safeFloat(row.session_temperature),
      };
      await storage.insertCourseSession(data);
    }
    console.log("Imported course sessions");
  }

  if (csvFiles.transcript) {
    const transcriptPath = path.join(ASSETS_DIR, csvFiles.transcript);
    let transcriptContent = fs.readFileSync(transcriptPath, "utf-8");
    if (transcriptContent.charCodeAt(0) === 0xFEFF) transcriptContent = transcriptContent.slice(1);
    const transcriptParsed = parse(transcriptContent, { columns: false, skip_empty_lines: true, relax_column_count: true });
    const transcripts: InsertSessionTranscript[] = transcriptParsed.map((cols: string[], i: number) => ({
      courseSessionId: sessionId,
      startTime: (cols[0] || '').trim(),
      endTime: (cols[1] || '').trim(),
      text: (cols.slice(2).join(',') || '').trim(),
      lineOrder: i + 1,
    }));
    await storage.insertTranscripts(transcripts);
    console.log(`Imported ${transcripts.length} transcripts`);
  }

  if (csvFiles.chats) {
    const chatRows = readCsv(csvFiles.chats);
    const chats: InsertSessionChat[] = chatRows.map((row: any) => ({
      courseSessionId: safeInt(row.course_session_id) || sessionId,
      messageId: row.message_id || null,
      messageText: row.message_text || null,
      creatorId: safeInt(row.creator_id),
      userType: row.user_type || null,
      creatorName: row.creator_name || null,
      createdAtTs: row.created_at_ts || null,
    }));
    await storage.insertChats(chats);
    console.log("Imported chats");
  }

  if (csvFiles.classroomActivity) {
    const activityRows = readCsv(csvFiles.classroomActivity);
    const activities: InsertClassroomActivity[] = activityRows.map((row: any) => ({
      activityId: safeInt(row.activity_id) || 0,
      courseSessionId: safeInt(row.course_session_id) || sessionId,
      activityType: row.type || row.activity_type || null,
      startTime: row.start_time || null,
      endTime: row.end_time || null,
      activityHappened: safeBool(row.activity_happened),
      plannedDuration: safeInt(row.planned_duration),
      duration: safeFloat(row.duration),
      totalMcqs: safeInt(row.total_mcqs),
    }));
    await storage.insertActivities(activities);
    console.log("Imported activities");
  }

  if (csvFiles.userPoll) {
    const pollRows = readCsv(csvFiles.userPoll);
    const polls: InsertUserPoll[] = pollRows.map((row: any) => ({
      attemptId: row.attempt_id || null,
      pollType: row.poll_type || null,
      pollType2: row.poll_type_2 || null,
      courseSessionId: safeInt(row.course_session_id) || sessionId,
      userId: safeInt(row.user_id),
      questionId: safeInt(row.question_id),
      questionText: row.question_text || null,
      classroomActivityId: safeInt(row.classroom_activity_id),
      isCorrectAnswer: safeBool(row.is_correct_answer),
      pollAnswered: safeBool(row.poll_answered),
      pollSeen: safeBool(row.poll_seen),
      pollDuration: safeInt(row.poll_duration),
      pollStartTime: row.poll_start_time || null,
      pollEndTime: row.poll_end_time || null,
    }));
    await storage.insertPolls(polls);
    console.log("Imported polls");
  }

  if (csvFiles.userReaction) {
    const reactionRows = readCsv(csvFiles.userReaction);
    const reactions: InsertUserReaction[] = reactionRows.map((row: any) => ({
      courseSessionId: safeInt(row.course_session_id) || sessionId,
      userId: safeInt(row.user_id),
      eventDatetime: row.event_datetime || null,
      emotion: row.emotion || null,
      partOfActivity: safeBool(row.part_of_activity),
      totalReactions: safeInt(row.total_reactions),
    }));
    await storage.insertReactions(reactions);
    console.log("Imported reactions");
  }

  if (csvFiles.userSession) {
    const userSessionRows = readCsv(csvFiles.userSession);
    const userSessionData: InsertUserSession[] = userSessionRows.map((row: any) => ({
      userId: safeInt(row.user_id) || 0,
      userName: row.user_name || null,
      userType: row.user_type || null,
      userSentiment: row.user_sentiment || null,
      courseSessionId: safeInt(row.course_session_id) || sessionId,
      teachingTime: safeFloat(row.teaching_time),
      sessionTime: safeFloat(row.session_time),
      userEnterTime: row.user_enter_time || null,
      userExitTime: row.user_exit_time || null,
      roomTime: safeFloat(row.room_time),
      learningTime: safeFloat(row.learning_time),
      activeTime: safeFloat(row.active_time),
      totalPollsSeen: safeInt(row.total_polls_seen),
      totalPollsResponded: safeInt(row.total_polls_responded),
      totalMessages: safeInt(row.total_messages),
      totalHandRaise: safeInt(row.total_hand_raise),
      totalUnmutes: safeInt(row.total_unmutes),
      platforms: row.platforms || null,
    }));
    await storage.insertUserSessions(userSessionData);
    console.log("Imported user sessions");
  }

  console.log("All data imported successfully!");
}

export function getDetectedSessionId(): number | null {
  return detectSessionId();
}
