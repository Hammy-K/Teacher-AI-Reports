# Noon Academy Classroom Session Analytics Dashboard — Complete Build Prompt (v3)

Build a full-stack web application (React + Express + PostgreSQL) that imports classroom session data from CSV files and generates a comprehensive **English-language, LTR** analytics dashboard for Noon Academy session review.

> **IMPORTANT**: This prompt is session-agnostic. The session ID is a variable `{SESSION_ID}` throughout. The system must auto-detect all CSV files in `attached_assets/` matching the patterns below, extract the session ID from the filenames, and use it for all data import and API queries. Nothing should be hardcoded to any specific session number.

> **LANGUAGE RULE**: The overall dashboard UI, analytics output, insights, feedback, QA evaluations, verdicts, and recommendations must all be in **English**. However, the following data fields contain Arabic source content and **must remain in Arabic** as-is — do NOT translate or transliterate them:
> - **Teacher name** (from `user_session` sheet, `user_name` where `user_type = 'TEACHER'`)
> - **Student names** (from `user_session` sheet, `user_name`)
> - **Question text** (from `f_user_poll` sheet, `question_text`)
> - **Chat messages** (from `chats` sheet, `message_text` and `creator_name`)
> - **Transcript text** (from `namra_transcript` sheet, `text` column)
> - **Session name** (from `course_session` sheet, `course_session_name`)
>
> These are Arabic-language source data — the UI labels around them (e.g. "Teacher:", "Question Breakdown", "Chat Log") are in English, but the data values themselves stay in Arabic.

> **ZERO VAGUE LANGUAGE RULE**: Never use "may", "could", "might", "suggests", "possibly", "perhaps", "either...or" in ANY generated insight, verdict, feedback, recommendation, or analysis output. Every statement must be **definitive** with data evidence (numbers, timestamps, percentages, or quoted text). Replace all hedging with direct statements backed by evidence.

---

## 1. DATA SOURCE

The app reads 7 CSV files from the `attached_assets/` directory. Each filename contains the session ID as a variable segment. On startup, scan the directory to detect available files:

| File Pattern | Content |
|---|---|
| `course_Session_{SESSION_ID}_*.csv` | Session metadata (1 row): session ID, course ID, session name, teacher ID, scheduled/actual start & end times, teaching time, session time, engagement events/durations (JSON strings), positive/negative/neutral users, session temperature |
| `namra_transcript_{SESSION_ID}_*.csv` | Teacher speech transcript: columns are `start_time, end_time, text` (headerless CSV, may have BOM encoding — strip BOM before parsing) |
| `chats_{SESSION_ID}_*.csv` | Chat messages: message_id, message_text, creator_id, user_type (STUDENT/TEACHER), creator_name, created_at_ts |
| `classroom_activity_{SESSION_ID}_*.csv` | Activities: activity_id, activity_type, start_time, end_time, activity_happened, planned_duration (seconds), duration (seconds), total_mcqs |
| `f_user_poll_{SESSION_ID}_*.csv` | Individual poll responses: attempt_id, poll_type, course_session_id, user_id, question_id, question_text, classroom_activity_id, is_correct_answer, poll_answered, poll_seen, poll_duration, poll_start_time, poll_end_time |
| `f_user_reaction_{SESSION_ID}_*.csv` | Student reactions: user_id, event_datetime, emotion, part_of_activity, total_reactions |
| `user_session_{SESSION_ID}_*.csv` | Per-student metrics: user_id, user_name, user_type, user_sentiment, teaching_time, session_time, user_enter_time, user_exit_time, room_time, learning_time, active_time, total_polls_seen, total_polls_responded, total_messages, total_hand_raise, total_unmutes, platforms |

**Session ID auto-detection**: On startup, scan `attached_assets/` for files matching `course_Session_*_*.csv`. Extract the session ID from the filename using regex: `/course_Session_(\d+)_/`. Use this detected ID for all other file lookups and database inserts.

Data is imported once on first startup and stored in PostgreSQL. Use `csv-parse` for parsing. Check `isDataImported()` to avoid re-importing.

### 1.1 Excel (.xlsx) Import Support

If an Excel file matching `compiled_{SESSION_ID}_*.xlsx` exists in `attached_assets/`, automatically extract each sheet to individual CSV files before import. Sheet names map to CSV output files as follows:

| Sheet Name Pattern (case-insensitive substring match) | Output CSV |
|---|---|
| `course_session` | `course_Session_{SESSION_ID}_extracted.csv` |
| `transcript` | `namra_transcript_{SESSION_ID}_extracted.csv` |
| `chats` | `chats_{SESSION_ID}_extracted.csv` |
| `classroom_activity` | `classroom_activity_{SESSION_ID}_extracted.csv` |
| `user_poll` | `f_user_poll_{SESSION_ID}_extracted.csv` |
| `user_reaction` | `f_user_reaction_{SESSION_ID}_extracted.csv` |
| `user_session` | `user_session_{SESSION_ID}_extracted.csv` |

Use the `xlsx` library to read the workbook and `XLSX.utils.sheet_to_csv()` to export each sheet. Only extract if the output CSV doesn't already exist.

### 1.2 Arabic Text Encoding Fix (Mac Roman → UTF-8)

Excel files exported from certain tools encode Arabic text using Mac Roman character encoding, which produces garbled characters (e.g., `ÿ£.ÿπÿ®ÿØÿßŸÑ` instead of `أ.عبدالرزاق`). During CSV import, apply an encoding fix to all string fields:

```
function fixMacRomanArabic(str: string): string {
  1. Check if string contains Mac Roman artifact characters (ÿ, Ÿ, ∫, π, ≤, ≥, etc.)
  2. If yes: encode the string as Mac Roman bytes using iconv-lite, then decode as UTF-8
  3. If the decoded result contains Arabic characters (Unicode range \u0600-\u06FF), use the decoded version
  4. Otherwise, return the original string unchanged
}
```

Use the `iconv-lite` library: `iconv.encode(str, 'macroman')` → `.toString('utf8')`. Apply this function to every string field in every CSV row during import.

---

## 2. DATABASE SCHEMA (PostgreSQL via Drizzle ORM)

Define all tables in `shared/schema.ts`. These are identical regardless of language:

- **course_sessions**: id (serial PK), course_session_id (int), course_id (int), course_session_name (text), course_session_class_type (text), course_session_type (text), teacher_id (int), scheduled_start_time (text), scheduled_end_time (text), teacher_start_time (text), teacher_end_time (text), teaching_time (real), session_time (real), avg_active_time_per_student (real), median_active_time_per_student (real), course_session_status (text), total_segments (int), engagement_events (jsonb), engagement_durations (jsonb), positive_users (int), negative_users (int), neutral_users (int), session_temperature (real)

- **session_transcripts**: id (serial PK), course_session_id (int), start_time (text), end_time (text), text (text), line_order (int)

- **session_chats**: id (serial PK), course_session_id (int), message_id (text), message_text (text), creator_id (int), user_type (text), creator_name (text), created_at_ts (text)

- **classroom_activities**: id (serial PK), activity_id (int), course_session_id (int), activity_type (text), start_time (text), end_time (text), activity_happened (boolean), planned_duration (int), duration (real), total_mcqs (int)

- **user_polls**: id (serial PK), attempt_id (text), poll_type (text), poll_type_2 (text), course_session_id (int), user_id (int), question_id (int), question_text (text), classroom_activity_id (int), is_correct_answer (boolean), poll_answered (boolean), poll_seen (boolean), poll_duration (int), poll_start_time (text), poll_end_time (text)

- **user_reactions**: id (serial PK), course_session_id (int), user_id (int), event_datetime (text), emotion (text), part_of_activity (boolean), total_reactions (int)

- **user_sessions**: id (serial PK), user_id (int), user_name (text), user_type (text), user_sentiment (text), course_session_id (int), teaching_time (real), session_time (real), user_enter_time (text), user_exit_time (text), room_time (real), learning_time (real), active_time (real), total_polls_seen (int), total_polls_responded (int), total_messages (int), total_hand_raise (int), total_unmutes (int), platforms (text)

---

## 3. ACTIVITY TYPE CLASSIFICATION SYSTEM

Activity types in the CSV can have arbitrary creative names. Implement a classification function that maps any activity name to one of 3 canonical categories:

```
classifyActivityType(activityType: string, totalMcqs: number | null): string {
  Step 1 — Normalize: uppercase, replace all spaces/dashes/underscores with single underscore

  Step 2 — Exact matches:
    SECTION_CHECK → SECTION_CHECK
    EXIT_TICKET → EXIT_TICKET
    TEAM_EXERCISE → TEAM_EXERCISE

  Step 3 — Known aliases → EXIT_TICKET:
    SQUID_GAMES, SQUID_GAME, SQUIDGAMES, SQUIDGAME

  Step 4 — Known aliases → TEAM_EXERCISE:
    BETTER_CALL_SAUL, BETTERCALLSAUL

  Step 5 — MCQ-based fallback:
    If totalMcqs > 0 → SECTION_CHECK

  Step 6 — Default fallback:
    SECTION_CHECK
}
```

Apply this classification EARLY in the data pipeline (when building the activities-with-correctness list) so all downstream analysis uses canonical types. Store the original type as `originalActivityType` for reference.

**English labels** for the 3 canonical types:
- SECTION_CHECK → "Section Check" (plural: "Section Checks")
- EXIT_TICKET → "Exit Ticket"
- TEAM_EXERCISE → "Team Exercise"

---

## 4. BACKEND ANALYTICS ENGINE (server/storage.ts)

The backend computes ALL analytics server-side in a single `getDashboardData(courseSessionId)` method that returns one comprehensive JSON object. The frontend is purely presentational.

### 4.0 Dashboard Summary Metrics — Exact Definitions

The dashboard header displays 5 key metrics. Each metric has a precise calculation formula and source sheet:

| Metric | Label | Source Sheet | Calculation | Display Format |
|---|---|---|---|---|
| **Attendance** | "Attendance" | `user_session` | Count of rows where `user_type = 'STUDENT'` | Integer (e.g., "23") |
| **Correctness** | "Correctness" | `f_user_poll` | `SUM(is_correct_answer = true) / SUM(poll_answered = true) × 100` across all poll rows for this session | Percentage with color: green ≥75%, amber ≥50%, red <50% |
| **Temperature** | "Temperature & Engagement" | `course_session` | Direct value from `session_temperature` column (already 0–100 scale) | Integer with "%" suffix |
| **Teaching Time** | "Teaching Time" | `course_session` | Direct value from `teaching_time` column (in minutes) | Number with "min" suffix (e.g., "50 min") |
| **Session Completion** | "Session Completion" | `user_session` + `course_session` | `AVG(learning_time where user_type = 'STUDENT') / teaching_time × 100` | Percentage, subtitle shows "{avg_learning_time} / {teaching_time} min" |

**Additional derived metrics used internally (not displayed as summary cards):**

| Metric | Source Sheet | Calculation |
|---|---|---|
| **Response Rate** | `f_user_poll` | `COUNT(poll_answered = true) / COUNT(all poll records) × 100` |
| **Teacher Name** | `user_session` | `user_name` where `user_type = 'TEACHER'` (kept in Arabic) |
| **Topic** | `course_session` | Extracted from `course_session_name` via regex `/^(.+?)(L\d+)$/` → group 1 is topic (kept in Arabic) |
| **Level** | `course_session` | Extracted from `course_session_name` via regex `/^(.+?)(L\d+)$/` → group 2 parsed as "Level {N}" (English) |
| **Teacher Talk Time** | `namra_transcript` | Sum of all `(end_time - start_time)` durations across transcript rows, converted to minutes |
| **Student Active %** | Derived | `(teaching_time - teacher_talk_time) / teaching_time × 100` |
| **Chat Participation** | `chats` + `user_session` | Count of distinct `creator_id` in chats where `user_type = 'STUDENT'` / total students × 100 |
| **Activities Completed** | `classroom_activity` | Count where `activity_happened = true` / total activities |
| **Per-Activity Correctness** | `f_user_poll` | Group polls by `classroom_activity_id`, then `SUM(is_correct_answer) / SUM(poll_answered) × 100` per group |

### 4.1 Session Metadata
- Extract teacher name from `user_sessions` where userType = 'TEACHER' (Arabic — do not translate)
- **Teacher name cleanup**: `name.replace(/أ\.(?!\s)/g, 'أ. ').replace(/\s+ال\s+/g, ' آل ').trim()` (handles Arabic naming conventions even in English output)
- **Parse session name**: Extract topic and level from `courseSessionName` using regex `/^(.+?)(L\d+)$/`
- Level formatting: L1→"Level 1", L2→"Level 2", L3→"Level 3", etc. (parse the digit, display as "Level {N}")
- Calculate `sessionCompletedPercent = avgLearningTime / teachingTime * 100`

### 4.2 Student Metrics
- Total students: count from `user_sessions` where userType = 'STUDENT'
- Average learning time: mean of `learningTime` across students (from `user_session` sheet, `learning_time` column)
- Session temperature: from `course_sessions` table (`session_temperature` column)

### 4.3 Poll Statistics
- Overall correctness percent = `SUM(is_correct_answer = true) / SUM(poll_answered = true) × 100` from `f_user_poll` sheet
- Per-question breakdown: group by `question_id`, for each: questionText (HTML-stripped, kept in Arabic), correct count, total answered, percent
- Per-activity correctness map: group by `classroom_activity_id` → {answered, correct, percent}

### 4.4 Activity Analysis (per canonical type)

**Display order**: SECTION_CHECK → TEAM_EXERCISE → EXIT_TICKET

**For SECTION_CHECK**: Combine all instances into one merged analysis showing:
- Total questions, average correctness, average students answered
- Combined duration, all questions merged into single list
- Combined insights and feedback

**For TEAM_EXERCISE and EXIT_TICKET**: Show each instance individually

**Per-activity instance analysis includes**:
- Per-question breakdown (strip all HTML tags from question text)
- Students who saw vs students who answered
- **Teacher talk overlap detection**: Check if any transcript segments overlap with the activity's time window (startTime–endTime). Calculate total overlap duration in minutes and extract topics from overlapping transcript text
- Completion rate = studentsAnswered / totalStudents × 100
- Unanswered student chat messages during activity time window
- **Pre-activity teaching analysis**: Extract transcript segments in the 5-minute window before the activity. Calculate duration, topics, and build explanation verdict (see Section 4.8)

**Question-level insights (English, definitive — no vague language)**:
- ≥80% correct: "Strong result — most students understood this concept well."
- 60–79%: "Acceptable, but some students struggled — schedule a quick review next session."
- 40–59%: "Low correctness — this topic needs additional explanation or re-teaching next session."
- <40%: "Very low correctness — the concept was not understood by the majority."
- Skip rate ≥20%: "{count} students ({percent}%) saw the question but didn't answer — the question is too difficult or confusing for this group."

**Activity-level insights (English, definitive)**:
- EXIT_TICKET with teacher talk overlap: "The teacher was talking for {X} min during the exit ticket, discussing: {topics}. The exit ticket should be completed independently to accurately measure comprehension."
- Low overall correctness (<50%): "Overall correctness is low at {X}% — the content delivery failed and requires a different explanation approach."
- Duration significantly shorter than planned (< 70%): "Activity was shorter than planned ({actual} min vs {planned} min planned) — insufficient time directly caused incomplete answers."
- Duration significantly longer than planned (> 130%): "Activity ran longer than planned ({actual} min vs {planned} min planned) — students needed more time than allocated."
- Low completion rate (<80%): "Only {X}% of students completed this activity — {100-X}% ran out of time or lost engagement."
- ≥3 unanswered student chats during activity: "{N} student messages during this activity went unanswered — students were seeking clarification and did not receive it."

**Combined Section Check insights (English, definitive)**:
- Questions with <40% correctness: "{N} out of {total} questions had very low correctness (below 40%) — these topics need re-teaching."
- Average completion rate <80%: "Average section check completion reached {X}% — indicating time pressure for some students."
- Teacher talk during section checks: "The teacher was speaking during {N} of {total} section checks ({X} min total)."
- Overall low correctness (<50%): "Correctness across all section checks is low at {X}% — the content or teaching approach requires revision."

### 4.5 Feedback System (What Went Well / Needs Improvement)

For each activity that happened and has correctness data, analyze post-activity teacher behavior. Look at teacher talk between the activity's end time and the next activity's start time.

**High correctness (>75%)**:
- Teacher explanation ≤15s → "The teacher spent {X} min explaining after this activity — appropriate since {Y}% of students answered correctly."
- Teacher explanation >15s → "The teacher spent {X} min explaining after this activity, but {Y}% of students already answered correctly. Should move on quickly."
- Student called to stage → "A student was called to explain, but {Y}% already answered correctly — unnecessary when average is above 75%."
- No student called → "The teacher did not call a student to explain — correct decision since {Y}% answered correctly."

**Medium correctness (50–75%)**:
- 30–60s explanation → "The teacher spent {X} min explaining — appropriate for {Y}% correctness."
- <30s → "The teacher spent only {X} min explaining, but {Y}% correctness warrants 0.5–1 min of targeted explanation." (recommended: "0.5–1 min")
- >60s → "The teacher spent {X} min explaining. With {Y}% correctness, 0.5–1 min would be sufficient." (recommended: "0.5–1 min")

**Low correctness (<50%)**:
- 60–120s → "The teacher spent {X} min explaining — appropriate for the low correctness of {Y}%."
- <60s → "The teacher spent only {X} min explaining, but only {Y}% answered correctly. Should spend up to 2 minutes to ensure comprehension." (recommended: "1–2 min")
- >120s → "The teacher spent {X} min explaining — thorough and appropriate explanation since only {Y}% answered correctly."

**Student stage detection**: Use regex `/اشرح|اشرحي|تعال|تعالي|يلا.*اشرح|stage|explain.*class|come.*up/i` on post-activity transcript text.

**Feedback deduplication**: Track analyzed `activityId` values. Only show feedback in the standalone "Time Management" / "Additional Observations" sections if the activity was NOT already covered in an activity analysis section. This prevents duplicate observations.

### 4.6 Pedagogy Feedback

Analyze teacher talk patterns from the transcript:

1. **Continuous talk segments**: Merge consecutive transcript lines with ≤5s gaps into continuous blocks. Flag any block exceeding 120 seconds (2 minutes).

2. **Total teacher talk time**: Sum all transcript durations. Flag if total exceeds 15 minutes.

3. **Student active time**: `sessionDuration - teacherTalkTime`. Flag if student active percentage is below 50%.

4. **Chat interaction analysis**: Detect "bursts" of ≥3 student chat messages within a 30-second window. Check how many bursts overlap with teacher talk segments (±10s tolerance). More overlapping bursts = better engagement.

5. **Long segment context**: For each >2min continuous talk segment, extract:
   - Time range (formatted as H:MM:SS–H:MM:SS)
   - Topics discussed (via regex topic extraction)
   - Nearby activity correctness (within ±60s of segment)
   - Student confusion in chat (within segment ±30s/+60s window)

**Topic extraction**: Regex-based detection for Arabic math/geometry terms mapped to English labels:

| Arabic Pattern | English Label |
|---|---|
| `الدائر[ةه]` | "Circles" |
| `المستقيم\|مستقيمات` | "Lines in circles" |
| `نصف القطر\|أنصاف.*القطر` | "Radius" |
| `القطر` | "Diameter" |
| `الوتر\|وتر` | "Chord" |
| `مماس\|التماس` | "Tangent" |
| `الزاوي[ةه]\s*المركزي[ةه]` | "Central angles" |
| `الزاوي[ةه]\s*المحيطي[ةه]` | "Inscribed angles" |
| `الزوايا\|زاوي[ةه]` | "Angles" |
| `المحيط` | "Perimeter" |
| `المساح[ةه]` | "Area" |
| `المضلع\|مضلعات\|رباعي` | "Polygons" |
| `القوس` | "Arc" |
| `طاء.*نق\|نق\s*تربيع` | "Circle formulas" |
| `مربع\|مثلث\|سداسي` | "Shapes in circles" |
| Default (no match) | "General teaching" |

**Chat confusion detection** (Arabic patterns, since student chat is in Arabic):
`/ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد|ما\s*قدر/i`

**Pedagogy feedback templates (English, definitive)**:

Continuous talk — no long segments:
- "The teacher kept all talk segments under 2 minutes — good pacing that allows students to stay engaged. The longest continuous segment was {X} seconds."

Continuous talk — long segments found:
- "The teacher had {N} continuous talk periods exceeding 2 minutes. The longest was {X} min ({startTime}–{endTime}). Break long periods with questions or student interaction."
- Segment details: "{startTime}–{endTime} ({X} min): The teacher was discussing {topics}. [Context about nearby activities or student confusion]"

Total teacher talk — within limit:
- "Total teacher talk time was {X} min out of {Y} min session — within the recommended 15-minute limit. This leaves sufficient time for student activities."

Total teacher talk — over limit:
- "Total teacher talk time was {X} min out of {Y} min session. Teacher talk should ideally be under 15 minutes to allow the majority of the session for active student learning."

Student active time — above 50%:
- "Students had {X} min ({Y}%) of active time vs {Z} min teacher talk — the majority of the session was student-centered."

Student active time — below 50%:
- "Students had only {X} min ({Y}%) of active time. Teacher talk ({Z} min) took up most of the session. The majority of session time should be active student time."

Chat engagement — 3+ overlapping bursts:
- "Students engaged in chat {N} times during or right after teacher talk ({total} total messages from {unique} students). This indicates the teacher actively solicited responses and checked understanding."

Chat engagement — 1-2 overlapping bursts:
- "Only {N} chat engagement bursts detected during teacher talk segments. With {total} total student messages, the teacher needs to do more to elicit responses — ask students to type their answers in chat after each explanation."

Chat engagement — 0 overlapping bursts:
- "While {total} student messages were sent in chat, none appeared to be direct responses to teacher prompts. The teacher should prompt students to respond in chat to check understanding during lessons."

No student chat at all:
- "No student chat messages were recorded during the session. Teachers should prompt students to respond in chat to check understanding and maintain engagement."

### 4.7 QA Evaluation (7 Criteria aligned to Noon Academy Teacher Performance Rubric)

Each criterion returns: id, nameEn (English name), score (1–5 with 0.5 increments), evidence (key indicators array), comments (transcript-backed observations array), recommendations (string array), notes (string).

**Transcript-Activity Cross-Referencing**: The system builds an `activityTimeline` that, for each activity, extracts:
- **Pre-teaching**: Teacher transcript in window from previous activity's end to this activity's start (duration, topics detected from Arabic transcript via regex)
- **During-teaching**: Whether the teacher was talking during the activity (duration, topics)
- **Post-teaching**: Teacher transcript from this activity's end to the next activity's start (duration, topics)
- **Confusion detection**: Student chat messages showing confusion during the activity (using Arabic confusion patterns)
- **Insights**: Specific definitive observations correlating teaching content with student results

This timeline feeds directly into each criterion's `comments` field to provide specific, transcript-backed observations.

**Criterion 1: Content Mastery and Explanation** (base score: 3)
- Evaluates: Teacher's knowledge, explanation clarity, accuracy, use of examples
- Score adjustments:
  - ≥10 questions: +0.5 | <6 questions: -0.5
  - Correctness ≥70%: +0.5 | <50%: -0.5
  - ≥50% of questions above 70%: +0.5
  - ≥30% of questions below 40%: -0.5
- Comments: For each activity, states what topic the teacher taught before it, for how long, and whether the explanation was effective/partially effective/not effective based on student results. Identifies weak topics needing re-explanation with specific evidence.

**Criterion 2: Student Support and Motivation** (base score: 3)
- Evaluates: Answering student questions, encouraging participation, emotional connection
- Score adjustments:
  - Response rate ≥85%: +0.5 | <70%: -0.5
  - Temperature ≥80%: +0.5 | <60%: -0.5
  - Chat participation ≥20%: +0.5 | <10%: -0.5
  - Positive sentiment ≥80%: +0.5 | <60%: -0.5
  - ≥3 unanswered student questions: -0.5
- Comments: Flags confusion detected in chat during activities with specific examples. Reports unanswered student questions. Reports teacher chat engagement level.

**Criterion 3: Communication and Teacher Presence** (base score: 3)
- Evaluates: Clear/engaging communication, tone variation, virtual presence
- Score adjustments:
  - ≥5 teacher chat messages: +0.5 | 0 messages: -0.5
  - No long segments (>2min): +0.5 | Long segments found: -0.5
  - Positive sentiment ≥75%: +0.5 | <60%: -0.5
- Comments: Lists specific long uninterrupted talk periods with timestamps, topics, and duration. Assesses delivery variation based on distinct talk segment count.

**Criterion 4: Adherence to Lesson Design, Plan, and Time Management** (base score: 3)
- Evaluates: Following lesson structure, time management, smooth transitions
- Score adjustments:
  - Duration within ±5/+10 min of 45-min target: +0.5 | Shorter by >5 min: -0.5
  - All activities completed: +0.5 | <80% completed: -0.5
  - Teacher talk ≤15 min: +0.5 | >20 min: -0.5
  - Student active ≥60%: evidence | <45%: -0.5 (teacher-dominated)
  - Completion rate <60%: -0.5
- Comments: Flags over-long explanations before high-scoring activities (>3 min + ≥75% = "longer than needed"), excessive post-activity time when correctness high, insufficient prep before low-scoring activities (<0.5 min + <50% = "insufficient preparation directly contributed to low score"). Detects transition gaps >5 min between activities.

**Criterion 5: Teacher Errors During Instruction and Explanation** (base score: 4)
- Evaluates: Instructional errors, their impact on learning
- Score adjustments:
  - Teacher talking during exit ticket: -1 (MAJOR error)
  - Each time management issue pattern (≥3 issues): -0.5
  - No time management issues: +0.5
- Comments: Lists each detected error with specific timestamps, topics discussed, and definitive impact assessment. Flags teacher talk during activities (>0.5 min). Flags low correctness (<40%) after long explanations (>2 min) as evidence the explanation was unclear or inaccurate.

**Criterion 6: Moments of Distinction** (base score: 3)
- Evaluates: Standout positive moments from the teacher
- Score adjustments:
  - ≥5 positive observations: +1 | ≥3: +0.5
  - Best question ≥75%: +0.5
  - High temperature + high sentiment: evidence
- Comments: Lists activities with high correctness (≥80%) and what the teacher taught before them with specific evidence ("this is a moment of effective teaching"). Reports good student-stage decisions. Notes excellent pacing achievements (all segments <2 min, total talk ≤15 min).

**Criterion 7: General Evaluation and Quality**
- Score = average of criteria 1–6, rounded to nearest 0.5
- Key Indicators: Lists strengths (criteria ≥4) and areas for improvement (criteria <3)
- Comments: Full activity-by-activity summary showing correctness, pre-teaching duration/topics, whether teacher talked during activity, and confusion events.

**QA Summary** (displayed in header card): totalStudents, totalQuestions, overallCorrectness, responseRate, sessionTemperature, teachingTimeMin, teacherTalkMin, studentActivePercent, activitiesCompleted, chatParticipation.

**Activity Timeline** (displayed below criteria): Visual cards for each activity showing Before/During/After teaching context with topics, timestamps, correctness, confusion alerts, and specific definitive insights.

### 4.8 Per-Question Teacher Explanation Verdicts

Each question in the question breakdown displays a **teacher explanation verdict** — a definitive, evidence-based paragraph that analyzes the actual transcript content before the activity and connects it to student results.

**Pre-activity window**: Extract transcript segments in the 5-minute window before the activity's start time (`actStartSec - 300` to `actStartSec`).

**`buildExplanationVerdict` analyzes 5 dimensions:**

1. **Depth Analysis** — Based on duration and topic count:
   - ≥4 min + >5 topics: "The teacher spent {X} min covering {N} different topics ({topics}). The explanation was long but spread across too many concepts — {Y} seconds average per topic is not enough depth for any single concept."
   - ≥4 min + 2-5 topics: "The teacher spent {X} min explaining {N} topics ({topics}). The explanation covered multiple concepts with reasonable time per topic ({Y} seconds each)."
   - ≥4 min + 1 topic: "The teacher spent {X} min on a single topic area ({topics}). This was a thorough, focused explanation with {N} teaching segments."
   - 2-4 min + >3 topics: "The teacher spent only {X} min on {N} topics ({topics}) — the explanation was rushed, averaging {Y} seconds per topic. Not enough time to explain any concept properly."
   - 2-4 min + ≤3 topics: "The teacher spent {X} min on {topics}. The explanation was brief but focused on {N} topic(s)."
   - <2 min: "The teacher spent only {X} min explaining before this activity — this was too brief for students to absorb the material."
   - 0 min: "No explanation was given before this activity — students had to rely on prior knowledge."

2. **Interaction Analysis** — Checks transcript for 3 Arabic pattern types:
   - Question patterns: `\?|يلا.*اجاوب|من\s*يعرف|من\s*يقدر|اش\s*رأيكم|...`
   - Student call patterns: `يلا|اشرح|جاوب|عطني\s*الجواب|ها\s*يا|...`
   - Repetition patterns: `يعني|بمعنى|نعيد|مرة\s*ثانية|...`
   - Both questions + calls: "The teacher asked questions and called on students to participate — this was an interactive explanation."
   - Questions only: "The teacher asked questions during the explanation but did not call on specific students to answer."
   - Calls only: "The teacher called on students to explain or answer during the teaching."
   - Neither: "The teacher lectured without asking questions or inviting student participation — this was a one-way explanation with no student interaction."

3. **Student Engagement** — Counts student chat messages during the explanation window:
   - ≥5 messages: "Students were actively engaged — {N} student messages in chat during the explanation period."
   - 2-4 messages: "Students showed moderate engagement — {N} student messages in chat during the explanation."
   - 1 message: "Only 1 student message in chat during the explanation — students were mostly silent."
   - 0 messages: "Zero student messages in chat during the explanation — no student participation was recorded in the chat."

4. **Confusion Signals** — Detects Arabic confusion patterns in student chat during the explanation window:
   - Confusion found: "{N} student(s) expressed confusion during the explanation: '{text}' — {name}; ..."
   - No confusion: "No confusion signals detected in student chat during the explanation."

5. **Pacing** — Based on average segment duration:
   - >30s average: "The teacher spoke in long uninterrupted blocks (avg {X}s per segment) — students had limited opportunity to process or ask questions between segments."
   - 15-30s average: "The teacher used moderate-length segments (avg {X}s each) — reasonable pacing that allowed some processing time."
   - <15s average: "The teacher used short segments (avg {X}s each) — quick pacing with frequent pauses or breaks."

**`buildQuestionSpecificVerdict` combines explanation analysis with correctness:**

The verdict paragraph is assembled from the depth analysis + correctness-specific outcome linkage:

- ≥80% correctness: "Students scored {X}% — the teaching was effective and students understood the material. {interaction context}"
- 60-79% correctness: "Students scored {X}% after this explanation — {topic-count-specific detail} and {100-X}% of students still got it wrong. {interaction context}"
- 40-59% correctness: "Students only scored {X}% after {Y} min of explanation — the teaching did not land. {interaction context}"
- 1-39% correctness: "Students scored only {X}% — the explanation failed. {confusion/silence context}. {interaction context}"
- 0% correctness: "0% correctness — no student answered correctly. The explanation completely failed to convey the concept. {confusion/silence context}"
- No explanation + high score: "Students scored {X}% without a pre-activity explanation — they relied on prior knowledge and performed well."
- No explanation + low score: "Students scored only {X}% with no explanation beforehand — they needed teaching on this topic before being assessed."
- No explanation + 0%: "0% correctness with no explanation beforehand — students had no preparation for this content and every answer was wrong."

Additional context appended when relevant:
- If confusion detected AND correctness <60%: append confusion details
- If no student interaction AND correctness <70%: append interaction analysis
- If zero student chat AND correctness <60%: append student engagement note

**Display**: Each question in the question breakdown shows:
1. "Teacher explained [{topics}] for {X} min before this activity" (header line)
2. The verdict paragraph (formatted text block with distinct styling)

### 4.9 Deep Transcript Analysis (6 Dimensions)

The system performs deep analysis of the teacher's transcript across 6 dimensions. All analysis uses Arabic regex pattern detection internally but produces English output. Every insight is definitive with specific evidence — no vague language.

#### 4.9.1 Concept Mastery Map (`buildConceptMasteryMap`)

For each concept detected in the transcript (via Arabic regex → English label):

- **Teaching time**: Sum of segment durations where the concept's regex pattern matches, converted to minutes
- **Time ranges**: Formatted as H:MM:SS–H:MM:SS, grouped into ranges (new range if gap >60s)
- **Average correctness**: Mean correctness across activities whose pre-teaching topics include this concept
- **Confusion signals**: Count of student chat messages matching confusion patterns during this concept's explanation (±30s before, +60s after matching segments)
- **Effectiveness rating**:
  - ≥75% avg correctness → "Excellent"
  - ≥60% → "Effective"
  - ≥40% → "Needs Reinforcement"
  - <40% → "Ineffective"
  - No related activities → "Not assessed"
- **Definitive insight** (correctness-based):
  - ≥75%: "The teacher explained '{concept}' for {X} min across {N} segment(s). Students scored {Y}% on related activities — the explanation was clear and well-structured."
  - 50-74%: "The teacher spent {X} min on '{concept}'. Students scored {Y}% — the explanation covered the topic but did not achieve full comprehension. {confusion count if any}"
  - <50%: "The teacher spent {X} min on '{concept}' but students scored only {Y}%. The explanation failed to build understanding. {confusion context or gap observation}"
  - No activity: "The teacher explained '{concept}' for {X} min ({ranges}) but no related activity directly tested this concept."
- **Evidence**: Up to 2 transcript excerpts (120 chars each)
- **Related activities**: List of activity labels with correctness percentages

Concepts are sorted by average correctness ascending (weakest first).

#### 4.9.2 Teaching Clarity Evaluation (`buildTeachingClarityEvaluation`)

For each continuous teaching block (≥30s duration, gap ≤5s between segments):

- **5 clarity techniques scored** (each detected via Arabic regex patterns):

| Technique | Arabic Patterns | English Label |
|---|---|---|
| Step-by-step structure | `أولا\|ثانيا\|ثالثا\|الخطوة\|أول شي\|بعدين\|ثم\|بعد كذا\|نبدأ.*ب\|أول حاجة\|1\.\|2\.\|3\.` | "Step-by-step structure detected" |
| Repetition/rephrasing | `يعني\|بمعنى\|نقدر نقول\|بالعربي\|بشكل ثاني\|مرة ثانية\|نعيد` | "Rephrasing/repetition detected" |
| Examples/analogies | `مثلا\|مثال\|على سبيل\|لو عندنا\|تخيل\|فرض\|يعني مثل\|لو كان` | "Example or analogy used" |
| Comprehension check | `واضح\|صح\|فاهمين\|تمام\|سؤال\|فهمتوا\|ماشي\|صح ولا لا\|عرفتوا` | "Student comprehension check detected" |
| Transition markers | `طيب\|الحين\|ننتقل\|نروح\|نكمل\|خلاص\|يلا\|هسا` | "Transition markers used" |

- **Clarity score**: Count of detected techniques out of 5
- **Behaviors**: List of detected and missing techniques. Missing techniques listed as definitive gaps:
  - "No step-by-step structure — explanation was unstructured"
  - "No examples or analogies — abstract explanation only"
  - "No comprehension check — teacher did not verify student understanding"
- **Impact statement** (definitive, linked to following activity):
  - Score ≥4: "This {X} min explanation on '{topics}' used {N}/5 clarity techniques — a well-structured delivery that supports strong retention."
  - Score 2-3: "This explanation on '{topics}' used {N}/5 clarity techniques. Adding {missing techniques} would strengthen student understanding."
  - Score 0-1: "This explanation on '{topics}' used only {N}/5 clarity techniques. The teacher delivered content without structure, examples, or verification — this is a direct risk to student comprehension."
- **Evidence**: First 200 characters of combined transcript text

#### 4.9.3 Questioning Quality Analysis (`buildQuestioningAnalysis`)

Counts questioning behavior across the entire session transcript:

| Question Type | Arabic Pattern | English Label |
|---|---|---|
| Open-ended | `ليش\|لماذا\|كيف ممكن\|ايش رأيكم\|شو تتوقعوا\|ايش الفرق\|وش السبب\|ليه` | "Open-ended" |
| Closed | `صح ولا غلط\|صح ولا لا\|ايش الجواب\|كم يساوي\|ايش يكون\|كم عدد` | "Closed" |
| Engagement prompts | `اكتبوا\|في الشات\|ردوا\|جاوبوا\|ارفعوا\|حطوا\|اختاروا\|شاركوا` | "Engagement prompt" |
| Rhetorical | `صح ؟\|مو كذا ؟\|واضح ؟\|تمام ؟\|ماشي ؟\|ولا لا ؟` | "Rhetorical" |

- **Total count**: openEnded + closed + prompts
- **Examples**: Up to 5 timestamped examples with type label and text (80 chars)
- **Definitive insight**:
  - 0 total: "The teacher asked 0 questions during the entire session. No open-ended, closed, or engagement prompts were detected in the transcript. This is a significant gap — questioning drives student engagement and checks understanding."
  - ≥3 open-ended + ≥2 prompts: "The teacher asked {N} questions ({open} open-ended, {closed} closed, {prompts} engagement prompts). Open-ended questions encourage deeper thinking and were used effectively."
  - ≥3 prompts: "The teacher used {N} engagement prompts (e.g., 'write in chat', 'answer'). This drove participation but lacked open-ended conceptual questions that test deeper understanding."
  - Low total: "The teacher asked only {N} question(s) total. With {open} open-ended and {prompts} engagement prompts, the session lacked interactive questioning. Students had limited opportunities to demonstrate understanding."

#### 4.9.4 Confusion Moment Detection (`buildConfusionMoments`)

Clusters student confusion signals in chat:

1. Filter student chats matching confusion patterns (same regex as Section 4.6)
2. Sort by timestamp
3. Cluster messages within 45-second windows
4. Minimum 2 signals required to form a cluster

For each cluster:
- **Timestamp**: H:MM:SS of cluster start
- **Concept**: Extracted from transcript segments being taught at that time (transcript within cluster ±60s before, +30s after)
- **Signal count**: Number of confusion messages in the cluster
- **Messages**: Up to 3 student messages quoted as `"{text}" — {name}`
- **Teacher response analysis**:
  - Check transcript 0-60s after cluster end for clarification patterns (`يعني|بمعنى|اقصد|خلني|بشكل ثاني|وضحت|فهمتوا الحين`)
  - Clarification found: "Teacher provided immediate clarification after confusion signals"
  - Teacher talked but no clarification: "Teacher continued talking but did not address the confusion directly"
  - No teacher response: "No teacher response detected — confusion was ignored"
- **Risk level**: ≥3 signals → "High" | 2 signals → "Medium"
- **Risk assessment** (definitive):
  - High: "{N} students expressed confusion about '{concept}' within {X} seconds. This is a critical comprehension breakdown — the concept was not understood."
  - Medium: "{N} confusion signals about '{concept}' indicate partial understanding gaps."

#### 4.9.5 Teaching Pattern Recognition (`buildTeachingPatterns`)

Identifies 5 recurring behavior patterns across the session:

1. **Over-explaining high-correctness concepts**: Pre-teaching >3 min on activities scoring ≥75%
   - Details: "{label} ({time}): {X} min explanation, students scored {Y}%"
   - Impact: "The teacher spent excessive time ({durations}) explaining concepts students already understood. This consumed {total} min total — time that is better allocated to practice or weaker topics."
   - Recommendation: "Reduce explanation time for concepts where students demonstrate strong understanding. Reallocate this time to low-scoring topics."

2. **Rushing through low-correctness concepts**: Pre-teaching <1 min on activities scoring <50%
   - Details: "{label} ({time}): only {X} min explanation, students scored {Y}%"
   - Impact: "Students scored poorly ({percentages}) on concepts that received minimal explanation. The teacher moved to activities before building sufficient understanding."
   - Recommendation: "Spend at least 2-3 minutes explaining concepts before testing. Use examples and check understanding before starting an activity."

3. **Speaking during student solving time**: Teacher talk >0.3 min during ≥2 activities
   - Details: "{label} ({time}): teacher talked {X} min about '{topics}'"
   - Impact: "The teacher interrupted student independent work in {N} activities. This disrupts concentration and reduces the reliability of assessment results."
   - Recommendation: "Stay silent during activities. If students need help, use chat or wait until the activity ends to explain."

4. **Ignoring student confusion signals**: Confusion moments where teacher response includes "ignored" or "did not address"
   - Details: "{timestamp}: {N} confusion signals about '{concept}' — {teacher response}"
   - Impact: "{N} confusion moment(s) went unaddressed. Students who expressed confusion did not receive clarification, leading to persistent misunderstanding."
   - Recommendation: "Monitor the chat during and after explanations. When students express confusion, pause and re-explain the concept with a different approach."

5. **Strong engagement prompting behavior** (positive pattern): ≥3 engagement prompts in transcript + ≥10 student chat messages
   - Details: Up to 3 examples: "{timestamp}: '{text}'"
   - Impact: "The teacher actively prompted students to participate {N} times, resulting in {M} student chat messages. This kept students engaged throughout the session."
   - Recommendation: "Continue this practice — prompting drives engagement and gives the teacher visibility into student understanding."

#### 4.9.6 Micro-Moment Highlights (`buildMicroMoments`)

Top 3 strong moments + Top 3 risk moments:

**Strong moments** (prioritized by correctness descending):
- High-correctness activities (≥75%): "{label} achieved {X}% correctness after {Y} min of teaching on '{topics}'."
  - Why: "Students demonstrated strong understanding of '{topics}'. The explanation duration ({Y} min) was well-calibrated for this concept."
  - Evidence: "Pre-teaching: {Y} min → Activity result: {X}% correct"
- High-clarity explanations (clarity score ≥4/5): "Explanation at {timestamp} on '{topics}' scored {N}/5 on clarity (used {behaviors})."
  - Why: "A high-clarity explanation improves retention. The teacher structured this explanation well."
  - Evidence: First 100 chars of transcript

**Risk moments** (prioritized by correctness ascending):
- Low-correctness activities (<40%): "{label} scored only {X}% after {context}."
  - Why (long explanation): "Despite {Y} min of explanation, students did not understand '{topics}'. The teaching approach was ineffective for this concept."
  - Why (short explanation): "Insufficient explanation time ({Y} min) before a complex activity led to poor student performance."
  - Evidence: "Pre-teaching: {Y} min → Activity result: {X}% correct"
- Confusion events: "{N} students expressed confusion about '{concept}' at {timestamp}."
  - Why: "{risk assessment}. {teacher response}."
  - Evidence: Student messages joined by " | "

### 4.10 Teacher Communication & Motivational Style Analysis (`buildTeacherCommunicationInsights`)

5 analysis components returned as a single `teacherCommunication` object:

#### 4.10.1 Explanation Effectiveness (`explanationReviews`)

For each continuous teaching block (≥20s duration, gap ≤5s, filtered to ≥30s for analysis):

**7 teaching techniques detected via Arabic regex patterns:**

| Technique | Arabic Pattern | English Label (if detected) | Coaching (if missing) |
|---|---|---|---|
| Concept introduction | `الحين نتكلم عن\|اليوم بنتعلم\|الدرس اليوم\|نبدأ ب\|موضوعنا\|بنشرح` | "Clear concept introduction detected" | "Add a clear concept introduction before diving into details" |
| Step-by-step breakdown | `أولا\|ثانيا\|ثالثا\|الخطوة\|أول شي\|بعدين\|ثم\|بعد كذا\|نبدأ.*ب\|أول حاجة` | "Logical step-by-step breakdown used" | "Break the explanation into smaller, numbered steps" |
| Examples/demonstrations | `مثلا\|مثال\|على سبيل\|لو عندنا\|تخيل\|فرض\|يعني مثل\|لو كان` | "Example or demonstration provided" | "Use real-world examples or analogies to make the concept concrete" |
| Summary/reinforcement | `يعني باختصار\|بمعنى\|الخلاصة\|القصد\|نلخص\|الملخص` | "Summary or reinforcement statement included" | "End with a brief summary to reinforce key points" |
| Comprehension verification | `واضح\|صح\|فاهمين\|تمام\|سؤال\|فهمتوا\|ماشي\|صح ولا لا\|عرفتوا` | "Checked student understanding" | "Ask verification questions to check student understanding" |
| Rephrasing for clarity | `يعني\|بمعنى\|نقدر نقول\|بالعربي\|بشكل ثاني\|مرة ثانية\|نعيد` | "Rephrased concept for clarity" | "N/A (not flagged as missing)" |
| Student interaction prompts | `اكتبوا\|في الشات\|ردوا\|جاوبوا\|ارفعوا\|حطوا\|اختاروا\|شاركوا` | "Encouraged student interaction" | "Prompt students to participate (e.g., 'write your answer in chat')" |

- **Strengths list**: Techniques detected (English labels)
- **Improvements list**: Missing techniques with specific coaching advice
- **Impact linked to following activity** (definitive, within 5 minutes of block end):
  - ≥70% correctness: "The activity following this explanation scored {X}% — the explanation effectively prepared students for the task."
  - 40-69% correctness: "The activity following this explanation scored {X}% — the explanation partially prepared students but gaps remain. {coaching if improvements exist}"
  - <40% correctness: "The activity following this explanation scored only {X}% — the explanation did not prepare students adequately. A fundamentally different approach is needed."
  - No following activity: "No activity directly followed this explanation to measure its impact. Using {N}/7 effective teaching techniques."
- **Evidence**: First 200 characters of combined transcript text

#### 4.10.2 Encouraging Tone Detection (`toneAnalysis`)

**Arabic encouragement patterns detected in transcript:**
`/ممتاز|أحسنت|رائع|شاطر|تمام|كويس|جميل|صح عليك|برافو|ممتاز جداً|فكرة حلوة|إجابة ممتازة|جرب مرة ثانية|لا بأس|قريب جداً/i`

- **Frequency**: Total count of matching segments
- **Duration**: Total time of matching segments in minutes
- **Examples**: Up to 5 timestamped examples with text (100 chars)
- **Tone rating**:
  - ≥5 instances + positive sentiment ≥70%: "Strongly Encouraging"
  - ≥3 instances OR positive sentiment ≥60%: "Moderately Encouraging"
  - ≥1 instance: "Neutral"
  - 0 instances: "Needs Improvement"
- **Strengths**:
  - ≥5 instances: "Used encouraging language {N} times throughout the session — consistent positive reinforcement"
  - 2-4 instances: "Used encouraging language {N} times — some positive reinforcement detected"
  - Positive sentiment ≥70%: "Student sentiment is {X}% positive — the encouraging tone is effective"
- **Improvements**:
  - <3 instances: "Increase frequency of praise — aim for at least 5 encouraging statements per session"
  - 0 instances: "No encouraging language detected — add praise for correct answers and effort" + "Use recovery encouragement after student mistakes"
  - No encouragement after mistakes: "Use encouragement after mistakes — reinforce effort, not just correctness"
- **Student impact** (definitive):
  - Positive ≥70%: "The encouraging tone directly correlates with {X}% positive student sentiment and {N} chat messages. Students are engaged and comfortable participating."
  - Positive 50-69%: "Student sentiment is {X}% positive. Increasing encouragement frequency would improve engagement and participation."
  - Positive <50%: "Student sentiment is only {X}% positive. The lack of encouraging language is contributing to low engagement. {chat count if low}"

#### 4.10.3 Positive Reinforcement Analysis (`reinforcementAnalysis`)

4 reinforcement categories tracked:

| Category | Detection Method | Arabic Patterns |
|---|---|---|
| **Praise for Correctness** | Encouragement pattern within 2 min after activities scoring ≥60% | Same as encouragement patterns |
| **Effort-based Encouragement** | Specific effort patterns anywhere in transcript | `جرب\|حاول\|لا بأس\|قريب\|شوي كمان\|برضو كويس` |
| **Pre-activity Motivation** | Motivation patterns within 1 min before activity starts | `يلا\|خلونا\|نبدأ\|جاهزين\|حماس` |
| **Recovery After Mistakes** | Recovery patterns within 2 min after activities scoring <50% | `لا بأس\|عادي\|جرب مرة ثانية\|قريب جداً\|الفكرة صح بس` |

- **Distribution**: Count per category
- **Total count**: Sum of all 4 categories
- **Strengths** (for each category with count ≥1-2):
  - "Praised correct answers {N} time(s) after activities — students see their effort recognized"
  - "Used effort-based encouragement {N} time(s) — reinforces growth mindset"
  - "Motivated students before {N} activity/activities — builds confidence before tasks"
  - "Provided recovery encouragement after {N} low-scoring activity/activities — normalizes mistakes"
- **Improvements** (for each category with count = 0):
  - "Praise correct answers immediately after activities to reinforce learning"
  - "Encourage effort and partial thinking, not just final correct answers"
  - "Add motivational language before activities to build student confidence"
  - "After low-scoring activities, use recovery language to normalize mistakes and encourage retry"
- **Outcome link** (definitive): "Reinforcement frequency: {N}. Chat participation: {X}% of students. Positive sentiment: {Y}%. {frequency-based conclusion}"

#### 4.10.4 Communication Style Pattern (`communicationPatterns`)

Classifies the teacher's overall communication style based on encouragement count and total reinforcement:

| Style | Criteria | Strengths Description | Growth Areas |
|---|---|---|---|
| **Highly Supportive and Motivating** | ≥5 encouraging + ≥4 total reinforcement | "The teacher consistently uses encouraging language ({N} instances), praise for correctness ({N}), and effort acknowledgment ({N}). Students respond with {X}% positive sentiment." | "Maintain this style. Consider varying the type of praise to keep it fresh and authentic." |
| **Moderately Encouraging** | ≥2 encouraging + ≥2 reinforcement | "The teacher shows some encouraging behavior ({N} instances) and reinforcement ({N} total). There is room to increase both frequency and variety." | "Double the frequency of encouraging statements. Add effort-based praise and pre-activity motivation." |
| **Neutral Informational Delivery** | ≤1 encouraging + ≤1 reinforcement | "The teacher delivers content efficiently but with minimal emotional engagement. Only {N} encouraging statement(s) detected." | "Add praise after correct answers, encouragement before activities, and recovery statements after mistakes. Aim for at least 5 encouraging moments per session." |
| **Directive / Lecture-Focused** | Default fallback | "The teacher focuses on content delivery with limited student interaction. {N} encouraging statement(s) and {M} reinforcement instance(s)." | "Shift from one-way lecture to interactive teaching. Add comprehension checks, praise, and student engagement prompts throughout." |

- **Evidence**: Up to 3 timestamped encouragement examples from transcript

#### 4.10.5 Communication Effectiveness Score (`communicationScore`)

Composite score 0-100, calculated from 4 components (25 points each):

| Component | Weight | Calculation | Cap |
|---|---|---|---|
| **Explanation Clarity** | 25 pts | `AVG(strengths.length per review block) / 7 × 25` | 25 |
| **Encouragement Frequency** | 25 pts | `encourageCount / 5 × 25` | 25 |
| **Reinforcement Balance** | 25 pts | `totalReinforcement / 8 × 25` | 25 |
| **Engagement Correlation** | 25 pts | `(chatParticipationRate / 100 × 12.5) + (positivePercent / 100 × 12.5)` | 25 |

- **Rating**:
  - ≥80: "Excellent Communicator"
  - ≥60: "Effective Communicator"
  - ≥40: "Developing Communication Skills"
  - <40: "Needs Communication Coaching"
- **Justification**: "Score: {X}/100. Explanation clarity: {N} blocks with avg {Y}/7 techniques. Encouragement: {N} instances. Reinforcement: {N} total. Student engagement: {X}% chat participation, {Y}% positive sentiment."
- **Breakdown**: Points per component (explanationClarity, encouragementFrequency, reinforcementBalance, engagementCorrelation)

---

## 5. FRONTEND DASHBOARD (Single Page, English LTR)

### 5.1 Global Settings
- `<html lang="en" dir="ltr">`
- Font: `Inter` as primary, `Open Sans` as fallback (do NOT use Noto Sans Arabic)
- Noon Academy branding: primary color = teal/green (`hsl(160, 40%, 45%)`), secondary = warm gold (`hsl(43, 40%, 92%)`)
- Dark mode support with CSS variables
- `--font-sans: Inter, Open Sans, sans-serif;`

### 5.2 Dashboard Layout (single scrolling page, max-width 5xl, centered)

**Section order from top to bottom:**

1. **Session Header** — Warm-tinted card with session info
   - "Session Report" as title with GraduationCap icon
   - Grid showing: Session ID, Teacher, Level, Topic
   - Level formatting: L1→"Level 1", L2→"Level 2", etc.

2. **Session Summary** — "Session Summary"
   - 5-metric grid:
     - Attendance (student count)
     - Correctness (overall % with color coding)
     - Temperature & Engagement (session temperature value)
     - Teaching Time (in minutes, with "min" suffix)
     - Session Completion (%, with subtitle showing avg/total learning time)

3. **Activities Table** — "Activities"
   - Badge showing `{completed}/{total} completed`
   - Table columns: Activity Type, Completed, Duration, Correctness
   - Activities grouped by canonical type with English labels

4. **Activity Analysis Sections** (one per canonical type, in order: Section Checks → Team Exercise → Exit Ticket)
   
   Each section has:
   - Section heading with appropriate icon (ClipboardCheck, Users, FileCheck)
   - Metrics grid: Questions, Students Answered, Correctness, Duration
   - **CorrectnessBar**: Visual bar — green ≥75%, amber ≥50%, red <50%
   - **InsightsList** with Lightbulb icon, labeled "Observations"
   - **Collapsible question breakdown**: "Question Breakdown ({count})" — each question shows:
     - Question text (HTML-stripped, Arabic preserved)
     - Correctness bar with percentage
     - Answered/seen student counts
     - **Teacher Explanation Header**: "Teacher explained [{topics}] for {X} min before this activity"
     - **Teacher Explanation Verdict** (formatted paragraph with distinct styling):
       - Depth analysis, outcome linkage, interaction analysis, student engagement, confusion signals
       - All evidence-based with specific numbers and definitive language
     - Per-question insights (correctness-based)
   - **FeedbackInline**: Two-column layout:
     - "What Went Well" (green accent, ThumbsUp icon)
     - "Needs Improvement" (amber accent, AlertTriangle icon)
   - Each feedback item shows: category badge, detail text, recommended vs actual values
   - Collapsible segment details where applicable (labeled "Details")

   **EXIT_TICKET special treatment**: Red warning banner when teacher spoke during exit ticket:
   "Warning: The teacher was speaking during the exit ticket for {X} min. Exit tickets should be completed independently."

5. **Time Management Section** — "Time Management"
   - Shows time_management and student_stage feedback items NOT already displayed in activity sections
   - Same two-column layout (What Went Well / Needs Improvement)

6. **QA Evaluation Section** — "Session Quality Evaluation"
   - Header card with:
     - Overall score displayed as "{X}/5"
     - ScoreBadge: ≥4 → "Excellent" (green), ≥3 → "Acceptable" (amber), <3 → "Needs Improvement" (red)
     - Summary metrics grid: total questions, teacher talk time, student active %
   - 7 expandable criteria rows (rubric-aligned), each showing:
     - Criterion number (circled)
     - English criterion name
     - ScoreBadge with color
     - ScoreStars (5-star display with half-star support using Star/StarHalf icons)
   - Expanded view shows:
     - "Key Indicators" — bullet list of evidence strings
     - "Transcript Observations" — comments backed by specific timestamps and transcript content
     - "Recommendations" — list with arrow icons
     - Notes line in muted text
   - Accordion behavior: only one criterion expanded at a time
   - **Activity Timeline** section below criteria showing per-activity cards with:
     - Activity label + time range + correctness percentage
     - Before/During/After teaching context with topics and duration
     - Confusion alerts from student chat
     - Specific definitive insights correlating teaching with results

7. **Deep Transcript Analysis Section** — "Deep Transcript Analysis"
   - 6 collapsible subsections (each with ChevronRight/ChevronDown toggle):

   7a. **Concept Mastery Map** — Table/cards showing each concept with:
     - Concept name, explanation duration, time ranges
     - Effectiveness badge (color-coded)
     - Average correctness bar
     - Confusion signal count
     - Definitive insight paragraph
     - Evidence excerpts and related activity results

   7b. **Teaching Clarity Evaluation** — Cards for each teaching block:
     - Timestamp range, duration, topic
     - Clarity score X/5 with star display
     - Detected behaviors list and missing behaviors
     - Impact statement
     - Evidence excerpt

   7c. **Questioning Quality** — Summary card showing:
     - Counts: open-ended, closed, engagement prompts, rhetorical
     - Total count
     - Up to 5 examples with type labels
     - Definitive insight paragraph

   7d. **Confusion Moments** — Cards for each cluster:
     - Timestamp, concept, signal count, risk level badge
     - Quoted student messages
     - Teacher response analysis
     - Risk assessment

   7e. **Teaching Patterns** — Cards for each detected pattern:
     - Pattern name, occurrence count
     - Specific details with timestamps
     - Impact analysis
     - Actionable recommendation

   7f. **Micro-Moment Highlights** — Two columns:
     - "Strong Moments" (green) — top 3 with what/why/evidence
     - "Risk Moments" (red) — top 3 with what/why/evidence

8. **Teacher Communication & Motivational Style Section** — "Teacher Communication & Motivational Style"
   - 5 collapsible subsections:

   8a. **Explanation Effectiveness** — Cards for each teaching block:
     - Timestamp, duration, concept
     - Strengths list (techniques detected)
     - Improvements list (coaching advice for missing techniques)
     - Impact prediction linked to activity result
     - Evidence excerpt

   8b. **Encouraging Tone** — Summary card:
     - Frequency count, duration, tone rating badge
     - Up to 5 timestamped examples
     - Strengths and improvements lists
     - Student impact statement

   8c. **Positive Reinforcement** — Distribution card:
     - 4 category counts (praise, effort, motivation, recovery)
     - Total count
     - Strengths and improvements lists
     - Outcome link statement

   8d. **Communication Style** — Pattern card:
     - Style classification badge
     - Strengths description
     - Growth areas
     - Evidence from transcript

   8e. **Communication Effectiveness Score** — Score card:
     - Composite score X/100
     - Rating badge
     - Justification text
     - 4-component breakdown with point values

9. **Additional Observations** — "Additional Observations"
   - Remaining pedagogy feedback items not shown in earlier sections

### 5.3 Collapsible Behavior
- Use Radix Collapsible (via shadcn)
- LTR chevrons: ChevronRight when collapsed (points right = "open me"), ChevronDown when expanded
- QA criteria: accordion behavior — only one open at a time
- Transcript Analysis & Teacher Communication subsections: independent open/close

### 5.4 Feedback Category Labels (English)
- time_management → "Time Management"
- student_stage → "Student Stage"
- pedagogy → "Teaching Methodology"

### 5.5 Score Badge Labels (English)
- Score ≥ 4: "Excellent" (green background)
- Score ≥ 3: "Acceptable" (amber background)
- Score < 3: "Needs Improvement" (red background)

### 5.6 UI Text (Complete English Label List)
| Context | Label |
|---|---|
| Page title | Session Report |
| Section: summary | Session Summary |
| Metric: attendance | Attendance |
| Metric: correctness | Correctness |
| Metric: temperature | Temperature & Engagement |
| Metric: teaching time | Teaching Time |
| Metric: completion | Session Completion |
| Suffix: minutes | min |
| Section: activities | Activities |
| Table: type | Activity Type |
| Table: completed | Completed |
| Table: duration | Duration |
| Table: correctness | Correctness |
| Badge: completed | completed |
| Section: analysis | (Activity type name as heading) |
| Metric: questions | Questions |
| Metric: students answered | Students Answered |
| Collapsible: question detail | Question Breakdown |
| Feedback: went well | What Went Well |
| Feedback: needs improvement | Needs Improvement |
| Feedback: recommended | Recommended |
| Feedback: actual | Actual |
| Section: time management | Time Management |
| Section: QA | Session Quality Evaluation |
| QA: overall | Overall Evaluation |
| QA: evidence | Key Indicators |
| QA: comments | Transcript Observations |
| QA: recommendations | Recommendations |
| QA: notes | Notes |
| QA: activity timeline | Activity Timeline |
| Section: transcript analysis | Deep Transcript Analysis |
| Transcript: concept mastery | Concept Mastery Map |
| Transcript: clarity | Teaching Clarity Evaluation |
| Transcript: questioning | Questioning Quality |
| Transcript: confusion | Confusion Moments |
| Transcript: patterns | Teaching Patterns |
| Transcript: micro-moments | Micro-Moment Highlights |
| Section: teacher communication | Teacher Communication & Motivational Style |
| Communication: explanation | Explanation Effectiveness |
| Communication: tone | Encouraging Tone |
| Communication: reinforcement | Positive Reinforcement |
| Communication: style | Communication Style |
| Communication: score | Communication Effectiveness Score |
| Section: observations | Additional Observations |
| Label: planned | Planned |
| Label: details | Details |
| Label: strong moments | Strong Moments |
| Label: risk moments | Risk Moments |
| Error: load failed | Failed to load dashboard |
| Empty: no activities | No activities |
| Label: observations (insights) | Observations |
| Header label: session id | Session ID |
| Header label: teacher | Teacher |
| Header label: level | Level |
| Header label: topic | Topic |
| Verdict: teacher explained | Teacher explained [{topics}] for {X} min before this activity |

---

## 6. API ENDPOINTS

Single endpoint: `GET /api/dashboard/:courseSessionId`

Returns the complete DashboardData JSON object with all computed analytics including:
- Session metadata, summary metrics
- Activities with correctness
- Activity analyses (per canonical type) with per-question verdicts
- Feedback (wentWell, needsImprovement)
- QA evaluation (7 criteria, activity timeline)
- Transcript analysis (6 dimensions)
- Teacher communication (5 components)

Additional endpoint: `GET /api/detected-session`

Returns `{ sessionId: number }` — the auto-detected session ID from CSV filenames. The frontend calls this on load to determine which session to fetch.

---

## 7. TECH STACK

- **Frontend**: React + TypeScript, Vite, TanStack React Query, Wouter, shadcn/ui (Card, Badge, Collapsible, Skeleton), Tailwind CSS, lucide-react icons, Recharts
- **Backend**: Express.js + TypeScript (tsx), csv-parse, xlsx (for Excel import), iconv-lite (for Arabic encoding fix)
- **Database**: PostgreSQL via Drizzle ORM, drizzle-zod for validation
- **Fonts**: Inter, Open Sans (Google Fonts)
- **Bind frontend to 0.0.0.0:5000**

---

## 8. KEY DESIGN DECISIONS

1. **Session-agnostic**: The system auto-detects the session ID from CSV filenames. Nothing is hardcoded to any specific session number. The API endpoint accepts any session ID as a URL parameter.
2. **All analytics computed server-side** — the frontend is purely presentational with no business logic.
3. **Data imported once** from CSV on first startup. Checked via `isDataImported()`.
4. **Activity classification applied early** in the pipeline so all downstream analysis uses canonical types (SECTION_CHECK, TEAM_EXERCISE, EXIT_TICKET).
5. **Section Checks combined** into one merged view; Exit Ticket and Team Exercise shown individually.
6. **Feedback system** analyzes post-activity teacher behavior based on correctness brackets (>75%, 50–75%, <50%).
7. **QA scoring** uses 0.5 increments, starts at baseline 3 (or 4 for errors criterion), adjusts up/down based on evidence.
8. **Teacher talk analysis** merges transcript segments with ≤5s gaps to form continuous talk blocks.
9. **LTR layout** throughout — all text alignment, chevron directions, and grid ordering follow English left-to-right reading direction.
10. **Arabic content preserved** — teacher names, student names, question text, chat messages, transcript text, and session names remain in Arabic (as that's the source language). All UI labels, headings, insights, recommendations, feedback text, verdicts, and QA evaluations are displayed in English.
11. **Excel import supported** — if a `compiled_{SESSION_ID}_*.xlsx` file exists, sheets are auto-extracted to individual CSVs before import.
12. **Mac Roman encoding fix** — Arabic text garbled by Mac Roman encoding (common in Excel exports) is automatically detected and decoded to proper UTF-8 during import using iconv-lite.
13. **Metrics are deterministic** — every dashboard metric has a precise formula defined in Section 4.0. The same input data always produces the same output, making the prompt portable across Replit accounts.
14. **Zero vague language** — all generated text uses definitive statements backed by data evidence. No "may", "could", "might", "suggests" anywhere in the output.
15. **Per-question explanation verdicts** — each question shows a comprehensive analysis of the actual transcript content before the activity, connecting teaching approach to student outcomes with specific evidence.
16. **Deep transcript analysis** — 6 analytical dimensions (concept mastery, clarity, questioning, confusion, patterns, micro-moments) provide granular insight into teaching effectiveness.
17. **Teacher communication analysis** — 5 components (explanation effectiveness, tone, reinforcement, style, composite score) evaluate motivational and communication strategies.
18. **Feedback deduplication** — activity IDs are tracked to prevent the same observation appearing in both activity sections and standalone feedback sections.
