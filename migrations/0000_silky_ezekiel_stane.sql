CREATE TABLE "classroom_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"course_session_id" integer NOT NULL,
	"activity_type" text,
	"start_time" text,
	"end_time" text,
	"activity_happened" boolean,
	"planned_duration" integer,
	"duration" real,
	"total_mcqs" integer
);
--> statement-breakpoint
CREATE TABLE "course_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_session_id" integer NOT NULL,
	"course_id" integer,
	"course_session_name" text,
	"course_session_class_type" text,
	"course_session_type" text,
	"teacher_id" integer,
	"scheduled_start_time" text,
	"scheduled_end_time" text,
	"teacher_start_time" text,
	"teacher_end_time" text,
	"teaching_time" real,
	"session_time" real,
	"avg_active_time_per_student" real,
	"median_active_time_per_student" real,
	"course_session_status" text,
	"total_segments" integer,
	"engagement_events" jsonb,
	"engagement_durations" jsonb,
	"positive_users" integer,
	"negative_users" integer,
	"neutral_users" integer,
	"session_temperature" real,
	"teacher_db_id" integer
);
--> statement-breakpoint
CREATE TABLE "report_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"course_session_id" varchar(255) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"course_session_id" varchar(255) NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"duration_seconds" integer,
	"user_agent" varchar(500),
	"ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "session_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_session_id" integer NOT NULL,
	"message_id" text,
	"message_text" text,
	"creator_id" integer,
	"user_type" text,
	"creator_name" text,
	"created_at_ts" text
);
--> statement-breakpoint
CREATE TABLE "session_transcripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_session_id" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"text" text NOT NULL,
	"line_order" integer
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_arabic" varchar(255),
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "teachers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" text,
	"poll_type" text,
	"poll_type_2" text,
	"course_session_id" integer NOT NULL,
	"user_id" integer,
	"question_id" integer,
	"question_text" text,
	"classroom_activity_id" integer,
	"is_correct_answer" boolean,
	"poll_answered" boolean,
	"poll_seen" boolean,
	"poll_duration" integer,
	"poll_start_time" text,
	"poll_end_time" text
);
--> statement-breakpoint
CREATE TABLE "user_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_session_id" integer NOT NULL,
	"user_id" integer,
	"event_datetime" text,
	"emotion" text,
	"part_of_activity" boolean,
	"total_reactions" integer
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text,
	"user_type" text,
	"user_sentiment" text,
	"course_session_id" integer NOT NULL,
	"teaching_time" real,
	"session_time" real,
	"user_enter_time" text,
	"user_exit_time" text,
	"room_time" real,
	"learning_time" real,
	"active_time" real,
	"total_polls_seen" integer,
	"total_polls_responded" integer,
	"total_messages" integer,
	"total_hand_raise" integer,
	"total_unmutes" integer,
	"platforms" text
);
--> statement-breakpoint
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_teacher_db_id_teachers_id_fk" FOREIGN KEY ("teacher_db_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_feedback" ADD CONSTRAINT "report_feedback_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_views" ADD CONSTRAINT "report_views_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_feedback_teacher_session_idx" ON "report_feedback" USING btree ("teacher_id","course_session_id");