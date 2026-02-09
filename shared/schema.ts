import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const courseSessions = pgTable("course_sessions", {
  id: serial("id").primaryKey(),
  courseSessionId: integer("course_session_id").notNull(),
  courseId: integer("course_id"),
  courseSessionName: text("course_session_name"),
  courseSessionClassType: text("course_session_class_type"),
  courseSessionType: text("course_session_type"),
  teacherId: integer("teacher_id"),
  scheduledStartTime: text("scheduled_start_time"),
  scheduledEndTime: text("scheduled_end_time"),
  teacherStartTime: text("teacher_start_time"),
  teacherEndTime: text("teacher_end_time"),
  teachingTime: real("teaching_time"),
  sessionTime: real("session_time"),
  avgActiveTimePerStudent: real("avg_active_time_per_student"),
  medianActiveTimePerStudent: real("median_active_time_per_student"),
  courseSessionStatus: text("course_session_status"),
  totalSegments: integer("total_segments"),
  engagementEvents: jsonb("engagement_events"),
  engagementDurations: jsonb("engagement_durations"),
  positiveUsers: integer("positive_users"),
  negativeUsers: integer("negative_users"),
  neutralUsers: integer("neutral_users"),
  sessionTemperature: real("session_temperature"),
});

export const sessionTranscripts = pgTable("session_transcripts", {
  id: serial("id").primaryKey(),
  courseSessionId: integer("course_session_id").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  text: text("text").notNull(),
  lineOrder: integer("line_order"),
});

export const sessionChats = pgTable("session_chats", {
  id: serial("id").primaryKey(),
  courseSessionId: integer("course_session_id").notNull(),
  messageId: text("message_id"),
  messageText: text("message_text"),
  creatorId: integer("creator_id"),
  userType: text("user_type"),
  creatorName: text("creator_name"),
  createdAtTs: text("created_at_ts"),
});

export const classroomActivities = pgTable("classroom_activities", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull(),
  courseSessionId: integer("course_session_id").notNull(),
  activityType: text("activity_type"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  activityHappened: boolean("activity_happened"),
  plannedDuration: integer("planned_duration"),
  duration: real("duration"),
  totalMcqs: integer("total_mcqs"),
});

export const userPolls = pgTable("user_polls", {
  id: serial("id").primaryKey(),
  attemptId: text("attempt_id"),
  pollType: text("poll_type"),
  pollType2: text("poll_type_2"),
  courseSessionId: integer("course_session_id").notNull(),
  userId: integer("user_id"),
  questionId: integer("question_id"),
  questionText: text("question_text"),
  classroomActivityId: integer("classroom_activity_id"),
  isCorrectAnswer: boolean("is_correct_answer"),
  pollAnswered: boolean("poll_answered"),
  pollSeen: boolean("poll_seen"),
  pollDuration: integer("poll_duration"),
  pollStartTime: text("poll_start_time"),
  pollEndTime: text("poll_end_time"),
});

export const userReactions = pgTable("user_reactions", {
  id: serial("id").primaryKey(),
  courseSessionId: integer("course_session_id").notNull(),
  userId: integer("user_id"),
  eventDatetime: text("event_datetime"),
  emotion: text("emotion"),
  partOfActivity: boolean("part_of_activity"),
  totalReactions: integer("total_reactions"),
});

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name"),
  userType: text("user_type"),
  userSentiment: text("user_sentiment"),
  courseSessionId: integer("course_session_id").notNull(),
  teachingTime: real("teaching_time"),
  sessionTime: real("session_time"),
  userEnterTime: text("user_enter_time"),
  userExitTime: text("user_exit_time"),
  roomTime: real("room_time"),
  learningTime: real("learning_time"),
  activeTime: real("active_time"),
  totalPollsSeen: integer("total_polls_seen"),
  totalPollsResponded: integer("total_polls_responded"),
  totalMessages: integer("total_messages"),
  totalHandRaise: integer("total_hand_raise"),
  totalUnmutes: integer("total_unmutes"),
  platforms: text("platforms"),
});

export const insertCourseSessionSchema = createInsertSchema(courseSessions).omit({ id: true });
export const insertSessionTranscriptSchema = createInsertSchema(sessionTranscripts).omit({ id: true });
export const insertSessionChatSchema = createInsertSchema(sessionChats).omit({ id: true });
export const insertClassroomActivitySchema = createInsertSchema(classroomActivities).omit({ id: true });
export const insertUserPollSchema = createInsertSchema(userPolls).omit({ id: true });
export const insertUserReactionSchema = createInsertSchema(userReactions).omit({ id: true });
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true });

export type CourseSession = typeof courseSessions.$inferSelect;
export type SessionTranscript = typeof sessionTranscripts.$inferSelect;
export type SessionChat = typeof sessionChats.$inferSelect;
export type ClassroomActivity = typeof classroomActivities.$inferSelect;
export type UserPoll = typeof userPolls.$inferSelect;
export type UserReaction = typeof userReactions.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;

export type InsertCourseSession = z.infer<typeof insertCourseSessionSchema>;
export type InsertSessionTranscript = z.infer<typeof insertSessionTranscriptSchema>;
export type InsertSessionChat = z.infer<typeof insertSessionChatSchema>;
export type InsertClassroomActivity = z.infer<typeof insertClassroomActivitySchema>;
export type InsertUserPoll = z.infer<typeof insertUserPollSchema>;
export type InsertUserReaction = z.infer<typeof insertUserReactionSchema>;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
