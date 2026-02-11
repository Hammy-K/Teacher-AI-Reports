import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { importAllData, getDetectedSessionId } from "./import-data";
import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  courseSessions, sessionTranscripts, sessionChats,
  classroomActivities, userPolls, userReactions, userSessions,
} from "@shared/schema";

async function pushSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_sessions (
      id SERIAL PRIMARY KEY,
      course_session_id INTEGER NOT NULL,
      course_id INTEGER,
      course_session_name TEXT,
      course_session_class_type TEXT,
      course_session_type TEXT,
      teacher_id INTEGER,
      scheduled_start_time TEXT,
      scheduled_end_time TEXT,
      teacher_start_time TEXT,
      teacher_end_time TEXT,
      teaching_time REAL,
      session_time REAL,
      avg_active_time_per_student REAL,
      median_active_time_per_student REAL,
      course_session_status TEXT,
      total_segments INTEGER,
      engagement_events JSONB,
      engagement_durations JSONB,
      positive_users INTEGER,
      negative_users INTEGER,
      neutral_users INTEGER,
      session_temperature REAL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session_transcripts (
      id SERIAL PRIMARY KEY,
      course_session_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      text TEXT NOT NULL,
      line_order INTEGER
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session_chats (
      id SERIAL PRIMARY KEY,
      course_session_id INTEGER NOT NULL,
      message_id TEXT,
      message_text TEXT,
      creator_id INTEGER,
      user_type TEXT,
      creator_name TEXT,
      created_at_ts TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classroom_activities (
      id SERIAL PRIMARY KEY,
      activity_id INTEGER NOT NULL,
      course_session_id INTEGER NOT NULL,
      activity_type TEXT,
      start_time TEXT,
      end_time TEXT,
      activity_happened BOOLEAN,
      planned_duration INTEGER,
      duration REAL,
      total_mcqs INTEGER
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_polls (
      id SERIAL PRIMARY KEY,
      attempt_id TEXT,
      poll_type TEXT,
      poll_type_2 TEXT,
      course_session_id INTEGER NOT NULL,
      user_id INTEGER,
      question_id INTEGER,
      question_text TEXT,
      classroom_activity_id INTEGER,
      is_correct_answer BOOLEAN,
      poll_answered BOOLEAN,
      poll_seen BOOLEAN,
      poll_duration INTEGER,
      poll_start_time TEXT,
      poll_end_time TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_reactions (
      id SERIAL PRIMARY KEY,
      course_session_id INTEGER NOT NULL,
      user_id INTEGER,
      event_datetime TEXT,
      emotion TEXT,
      part_of_activity BOOLEAN,
      total_reactions INTEGER
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      user_type TEXT,
      user_sentiment TEXT,
      course_session_id INTEGER NOT NULL,
      teaching_time REAL,
      session_time REAL,
      user_enter_time TEXT,
      user_exit_time TEXT,
      room_time REAL,
      learning_time REAL,
      active_time REAL,
      total_polls_seen INTEGER,
      total_polls_responded INTEGER,
      total_messages INTEGER,
      total_hand_raise INTEGER,
      total_unmutes INTEGER,
      platforms TEXT
    )
  `);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await pushSchema();
  await importAllData();

  app.get("/api/dashboard/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const data = await storage.getDashboardData(sessionId);
      res.json(data);
    } catch (err: any) {
      console.error("Dashboard error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sessions", async (_req, res) => {
    try {
      const session = await storage.getSessionOverview();
      res.json(session ? [session] : []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/detected-session", async (_req, res) => {
    try {
      const session = await storage.getSessionOverview();
      if (session) {
        res.json({ sessionId: session.courseSessionId });
      } else {
        const detected = getDetectedSessionId();
        res.json({ sessionId: detected });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/transcripts/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const data = await storage.getTranscripts(sessionId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/chats/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const data = await storage.getChats(sessionId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
