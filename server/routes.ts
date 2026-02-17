import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { importAllData, getDetectedSessionId, importSessionFromFiles } from "./import-data";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "./db";
import { eq, sql, count, and, desc, avg } from "drizzle-orm";
import {
  courseSessions, sessionTranscripts, sessionChats,
  classroomActivities, userPolls, userReactions, userSessions,
  teachers, reportViews, reportFeedback,
} from "@shared/schema";
import { verifyGoogleToken, generateToken, requireAuth, requireAdmin } from "./auth";

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

  // ============ Auth Routes ============

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body;
      if (!credential) {
        res.status(400).json({ error: "Google credential is required" });
        return;
      }

      const googleUser = await verifyGoogleToken(credential);
      if (!googleUser) {
        res.status(401).json({ error: "Invalid Google token" });
        return;
      }

      // Look up teacher by email — only pre-registered emails allowed
      const [teacher] = await db.select().from(teachers)
        .where(eq(teachers.email, googleUser.email))
        .limit(1);

      if (!teacher) {
        res.status(403).json({ error: "هذا الحساب غير مسجل. تواصل مع المسؤول." });
        return;
      }

      if (!teacher.isActive) {
        res.status(403).json({ error: "هذا الحساب معطل." });
        return;
      }

      // Update googleId and name if not set
      if (!teacher.googleId) {
        await db.update(teachers)
          .set({ googleId: googleUser.googleId, updatedAt: new Date() })
          .where(eq(teachers.id, teacher.id));
      }

      const token = generateToken(teacher.id, teacher.email, teacher.role);
      res.cookie("authToken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        teacher: {
          id: teacher.id,
          email: teacher.email,
          name: teacher.name,
          nameArabic: teacher.nameArabic,
          role: teacher.role,
        },
      });
    } catch (err: any) {
      console.error("Google auth error:", err);
      res.status(500).json({ error: "Failed to authenticate" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("authToken");
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const [teacher] = await db.select().from(teachers)
        .where(eq(teachers.id, req.teacher!.teacherId))
        .limit(1);

      if (!teacher) {
        res.status(404).json({ error: "Teacher not found" });
        return;
      }

      res.json({
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        nameArabic: teacher.nameArabic,
        role: teacher.role,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // ============ Upload & Multi-Session Routes ============

  const uploadDir = path.join(process.cwd(), "attached_assets", "pending");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const upload = multer({ dest: uploadDir });

  app.post("/api/sessions/upload", requireAuth, upload.array("files", 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const teacherId = req.teacher!.teacherId;
      const result = await importSessionFromFiles(
        files.map(f => ({ originalname: f.originalname, path: f.path })),
        teacherId,
      );

      if (!result.success) {
        res.status(400).json({ error: result.error, sessionId: result.sessionId });
        return;
      }

      res.status(201).json({ sessionId: result.sessionId, success: true });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Failed to process upload" });
    }
  });

  app.get("/api/teachers/:teacherId/sessions", requireAuth, async (req, res) => {
    try {
      const teacherId = parseInt(req.params.teacherId as string);
      if (req.teacher!.teacherId !== teacherId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const sessions = await db.select().from(courseSessions)
        .where(eq(courseSessions.teacherDbId, teacherId));

      res.json(sessions.map(s => ({
        id: s.id,
        courseSessionId: s.courseSessionId,
        courseSessionName: s.courseSessionName,
        scheduledStartTime: s.scheduledStartTime,
        teachingTime: s.teachingTime,
        sessionTime: s.sessionTime,
        sessionTemperature: s.sessionTemperature,
        courseSessionStatus: s.courseSessionStatus,
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get all sessions (for teacher dashboard - returns sessions linked to current teacher)
  app.get("/api/my-sessions", requireAuth, async (req, res) => {
    try {
      const teacherId = req.teacher!.teacherId;
      const sessions = await db.select().from(courseSessions)
        .where(eq(courseSessions.teacherDbId, teacherId));

      res.json(sessions.map(s => ({
        id: s.id,
        courseSessionId: s.courseSessionId,
        courseSessionName: s.courseSessionName,
        scheduledStartTime: s.scheduledStartTime,
        teachingTime: s.teachingTime,
        sessionTime: s.sessionTime,
        sessionTemperature: s.sessionTemperature,
        courseSessionStatus: s.courseSessionStatus,
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // ============ Event Logging & Feedback Routes ============

  app.post("/api/report-views", requireAuth, async (req, res) => {
    try {
      const { courseSessionId, durationSeconds } = req.body;
      const teacherId = req.teacher!.teacherId;

      await db.insert(reportViews).values({
        teacherId,
        courseSessionId: String(courseSessionId),
        durationSeconds: durationSeconds || null,
        userAgent: req.headers["user-agent"]?.substring(0, 500) || null,
        ipAddress: req.ip || null,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to log view" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { courseSessionId, rating, comment } = req.body;
      const teacherId = req.teacher!.teacherId;

      if (!rating || rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be between 1 and 5" });
        return;
      }

      // Upsert: insert or update existing feedback
      const existing = await db.select().from(reportFeedback)
        .where(eq(reportFeedback.teacherId, teacherId))
        .limit(1);

      const match = existing.find(f => f.courseSessionId === String(courseSessionId));

      if (match) {
        await db.update(reportFeedback)
          .set({ rating, comment: comment || null, updatedAt: new Date() })
          .where(eq(reportFeedback.id, match.id));
      } else {
        await db.insert(reportFeedback).values({
          teacherId,
          courseSessionId: String(courseSessionId),
          rating,
          comment: comment || null,
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Feedback error:", err);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  app.get("/api/feedback/:sessionId", requireAuth, async (req, res) => {
    try {
      const teacherId = req.teacher!.teacherId;
      const sessionId = req.params.sessionId as string;

      const rows = await db.select().from(reportFeedback)
        .where(eq(reportFeedback.teacherId, teacherId));

      const feedback = rows.find(f => f.courseSessionId === sessionId);
      res.json(feedback || null);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // ============ Admin Routes ============

  // Helper: verify the requesting teacher is an admin
  async function assertAdmin(teacherId: number): Promise<boolean> {
    const [t] = await db.select().from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.role, "admin")))
      .limit(1);
    return !!t;
  }

  // GET /api/admin/teachers - List all teachers
  app.get("/api/admin/teachers", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const allTeachers = await db.select({
        id: teachers.id,
        email: teachers.email,
        name: teachers.name,
        nameArabic: teachers.nameArabic,
        isActive: teachers.isActive,
        role: teachers.role,
        createdAt: teachers.createdAt,
      }).from(teachers);

      // Attach session count per teacher
      const sessionCounts = await db
        .select({ teacherDbId: courseSessions.teacherDbId, count: count() })
        .from(courseSessions)
        .groupBy(courseSessions.teacherDbId);

      const countMap = new Map(sessionCounts.map(s => [s.teacherDbId, Number(s.count)]));

      res.json(allTeachers.map(t => ({
        ...t,
        sessionCount: countMap.get(t.id) || 0,
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch teachers" });
    }
  });

  // POST /api/admin/teachers - Create a new teacher
  app.post("/api/admin/teachers", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const { email, name, nameArabic, role } = req.body;
      if (!email || !name) {
        res.status(400).json({ error: "Email and name are required" });
        return;
      }

      const existing = await db.select().from(teachers).where(eq(teachers.email, email)).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const [teacher] = await db.insert(teachers).values({
        email,
        name,
        nameArabic: nameArabic || null,
        role: role === "admin" ? "admin" : "teacher",
      }).returning();

      res.status(201).json({
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        nameArabic: teacher.nameArabic,
        role: teacher.role,
        isActive: teacher.isActive,
      });
    } catch (err: any) {
      console.error("Admin create teacher error:", err);
      res.status(500).json({ error: "Failed to create teacher" });
    }
  });

  // PUT /api/admin/teachers/:id - Update teacher
  app.put("/api/admin/teachers/:id", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const id = parseInt(req.params.id as string);
      const { name, nameArabic, isActive, role } = req.body;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (nameArabic !== undefined) updates.nameArabic = nameArabic;
      if (isActive !== undefined) updates.isActive = isActive;
      if (role !== undefined) updates.role = role;

      const [updated] = await db.update(teachers)
        .set(updates)
        .where(eq(teachers.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Teacher not found" });
        return;
      }

      res.json({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        nameArabic: updated.nameArabic,
        role: updated.role,
        isActive: updated.isActive,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update teacher" });
    }
  });

  // DELETE /api/admin/teachers/:id - Deactivate teacher (soft delete)
  app.delete("/api/admin/teachers/:id", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const id = parseInt(req.params.id as string);

      // Don't let admin deactivate themselves
      if (id === req.teacher!.teacherId) {
        res.status(400).json({ error: "Cannot deactivate your own account" });
        return;
      }

      await db.update(teachers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(teachers.id, id));

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to deactivate teacher" });
    }
  });

  // GET /api/admin/analytics - Dashboard analytics
  app.get("/api/admin/analytics", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const [sessionCount] = await db.select({ count: count() }).from(courseSessions);
      const [teacherCount] = await db.select({ count: count() }).from(teachers).where(eq(teachers.isActive, true));
      const [viewCount] = await db.select({ count: count() }).from(reportViews);
      const [feedbackCount] = await db.select({ count: count() }).from(reportFeedback);

      // Average feedback rating
      const [avgRating] = await db.select({ avg: avg(reportFeedback.rating) }).from(reportFeedback);

      // Sessions with views vs without
      const viewedSessions = await db
        .selectDistinct({ courseSessionId: reportViews.courseSessionId })
        .from(reportViews);

      // Recent views (last 10)
      const recentViews = await db.select({
        id: reportViews.id,
        teacherId: reportViews.teacherId,
        courseSessionId: reportViews.courseSessionId,
        viewedAt: reportViews.viewedAt,
        durationSeconds: reportViews.durationSeconds,
      }).from(reportViews)
        .orderBy(desc(reportViews.viewedAt))
        .limit(10);

      // Recent feedback (last 10)
      const recentFeedback = await db.select({
        id: reportFeedback.id,
        teacherId: reportFeedback.teacherId,
        courseSessionId: reportFeedback.courseSessionId,
        rating: reportFeedback.rating,
        comment: reportFeedback.comment,
        createdAt: reportFeedback.createdAt,
      }).from(reportFeedback)
        .orderBy(desc(reportFeedback.createdAt))
        .limit(10);

      res.json({
        totalSessions: Number(sessionCount.count),
        totalTeachers: Number(teacherCount.count),
        totalViews: Number(viewCount.count),
        totalFeedback: Number(feedbackCount.count),
        avgRating: avgRating.avg ? parseFloat(String(avgRating.avg)) : null,
        viewedSessionCount: viewedSessions.length,
        recentViews,
        recentFeedback,
      });
    } catch (err: any) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // GET /api/admin/sessions - All sessions across all teachers
  app.get("/api/admin/sessions", requireAuth, async (req, res) => {
    try {
      if (!(await assertAdmin(req.teacher!.teacherId))) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const sessions = await db.select({
        id: courseSessions.id,
        courseSessionId: courseSessions.courseSessionId,
        courseSessionName: courseSessions.courseSessionName,
        scheduledStartTime: courseSessions.scheduledStartTime,
        teachingTime: courseSessions.teachingTime,
        sessionTemperature: courseSessions.sessionTemperature,
        teacherDbId: courseSessions.teacherDbId,
      }).from(courseSessions);

      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  return httpServer;
}
