# Noon Academy Classroom Session Analytics Dashboard — English Version Build Prompt

Build a full-stack web application (React + Express + PostgreSQL) that imports classroom session data from CSV files and generates a comprehensive **English-language, LTR** analytics dashboard for Noon Academy session review.

> **IMPORTANT**: This prompt is session-agnostic. The session ID is a variable `{SESSION_ID}` throughout. The system must auto-detect all CSV files in `attached_assets/` matching the patterns below, extract the session ID from the filenames, and use it for all data import and API queries. Nothing should be hardcoded to any specific session number.

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

### 4.1 Session Metadata
- Extract teacher name from `user_sessions` where userType = 'TEACHER'
- **Teacher name cleanup**: `name.replace(/أ\.(?!\s)/g, 'أ. ').replace(/\s+ال\s+/g, ' آل ').trim()` (handles Arabic naming conventions even in English output)
- **Parse session name**: Extract topic and level from `courseSessionName` using regex `/^(.+?)(L\d+)$/`
- Level formatting: L1→"Level 1", L2→"Level 2", L3→"Level 3", etc. (parse the digit, display as "Level {N}")
- Calculate `sessionCompletedPercent = avgLearningTime / teachingTime * 100`

### 4.2 Student Metrics
- Total students: count from `user_sessions` where userType = 'STUDENT'
- Average learning time: mean of `learningTime` across students
- Session temperature: from `course_sessions` table

### 4.3 Poll Statistics
- Overall correctness percent = totalCorrect / totalAnswered × 100
- Per-question breakdown: questionId, questionText (HTML-stripped), correct count, total answered, percent
- Per-activity correctness map: classroomActivityId → {answered, correct, percent}

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

**Question-level insights (English)**:
- ≥80% correct: "Strong result — most students understood this concept well."
- 60–79%: "Acceptable, but some students struggled — may need a quick review next session."
- 40–59%: "Low correctness — this topic needs additional explanation or re-teaching next session."
- <40%: "Very low correctness — the concept was not understood by the majority. The explanation may have been confusing or too brief before the activity."
- Skip rate ≥20%: "{count} students ({percent}%) saw the question but didn't answer — the question may be too difficult or confusing."

**Activity-level insights (English)**:
- EXIT_TICKET with teacher talk overlap: "The teacher was speaking for {X} min during the exit ticket, discussing: {topics}. The exit ticket should be completed independently to accurately measure comprehension."
- Low overall correctness (<50%): "Overall correctness is low at {X}% — the content may need review or a different teaching approach."
- Duration significantly shorter than planned (< 70%): "The activity was shorter than planned ({actual} min vs {planned} min planned) — insufficient time may explain incomplete answers."
- Duration significantly longer than planned (> 130%): "The activity ran longer than planned ({actual} min vs {planned} min planned) — students may have needed more time."
- Low completion rate (<80%): "Only {X}% of students completed this activity — some may have run out of time or disengaged."
- ≥3 unanswered student chats during activity: "{N} student messages during this activity went unanswered — students may have been asking for clarification."

**Combined Section Check insights (English)**:
- Questions with <40% correctness: "{N} out of {total} questions had very low correctness (below 40%) — these topics need re-teaching."
- Average completion rate <80%: "Average section check completion reached {X}% — indicating time pressure for some students."
- Teacher talk during section checks: "The teacher was speaking during {N} of {total} section checks ({X} min total)."
- Overall low correctness (<50%): "Correctness across all section checks is low at {X}% — the content or teaching approach may need revision."

### 4.5 Feedback System (What Went Well / Needs Improvement)

For each activity that happened and has correctness data, analyze post-activity teacher behavior. Look at teacher talk between the activity's end time and the next activity's start time.

**High correctness (>75%)**:
- Teacher explanation ≤15s → ✅ "The teacher spent {X} min explaining after this activity — appropriate since {Y}% of students answered correctly."
- Teacher explanation >15s → ⚠️ "The teacher spent {X} min explaining after this activity, but {Y}% of students already answered correctly. Should move on quickly."
- Student called to stage → ⚠️ "A student was called to explain, but {Y}% already answered correctly — unnecessary when average is above 75%."
- No student called → ✅ "The teacher did not call a student to explain — good decision since {Y}% answered correctly."

**Medium correctness (50–75%)**:
- 30–60s explanation → ✅ "The teacher spent {X} min explaining — appropriate for {Y}% correctness."
- <30s → ⚠️ "The teacher spent only {X} min explaining, but {Y}% correctness suggests 0.5–1 min of explanation would be appropriate." (recommended: "0.5–1 min")
- >60s → ⚠️ "The teacher spent {X} min explaining. With {Y}% correctness, 0.5–1 min would be sufficient." (recommended: "0.5–1 min")

**Low correctness (<50%)**:
- 60–120s → ✅ "The teacher spent {X} min explaining — appropriate for the low correctness of {Y}%."
- <60s → ⚠️ "The teacher spent only {X} min explaining, but only {Y}% answered correctly. Should spend up to 2 minutes to ensure understanding." (recommended: "1–2 min")
- >120s → ✅ "The teacher spent {X} min explaining — thorough and appropriate since only {Y}% answered correctly."

**Student stage detection**: Use regex `/اشرح|اشرحي|تعال|تعالي|يلا.*اشرح|stage|explain.*class|come.*up/i` on post-activity transcript text.

### 4.6 Pedagogy Feedback

Analyze teacher talk patterns from the transcript:

1. **Continuous talk segments**: Merge consecutive transcript lines with ≤5s gaps into continuous blocks. Flag any block exceeding 120 seconds (2 minutes).

2. **Total teacher talk time**: Sum all transcript durations. Flag if total exceeds 15 minutes.

3. **Student active time**: `sessionDuration - teacherTalkTime`. Flag if student active percentage is below 50%.

4. **Chat interaction analysis**: Detect "bursts" of ≥3 student chat messages within a 30-second window. Check how many bursts overlap with teacher talk segments. More overlapping bursts = better engagement.

5. **Long segment context**: For each >2min continuous talk segment, extract:
   - Time range (formatted as H:MM:SS–H:MM:SS)
   - Topics discussed (via regex topic extraction)
   - Nearby activity correctness (within ±60s of segment)
   - Student confusion in chat (within segment ±30s/+60s window)

**Topic extraction**: Regex-based detection for Arabic math/geometry terms (these remain in Arabic since the transcript is in Arabic):
- الدائرة → "Circles", المستقيم → "Lines in circles", نصف القطر → "Radius", القطر → "Diameter", الوتر → "Chord", مماس → "Tangent", الزاوية المركزية → "Central angles", الزاوية المحيطية → "Inscribed angles", المحيط → "Perimeter", المساحة → "Area", المضلع → "Polygons", القوس → "Arc"
- Default if no topic matched: "General teaching"

**Chat confusion detection** (Arabic patterns, since student chat is in Arabic):
`/ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد/i`

**Pedagogy feedback templates (English)**:

Continuous talk — no long segments:
- ✅ "The teacher kept all talk segments under 2 minutes — good pacing that allows students to stay engaged. Longest continuous segment was {X} seconds."

Continuous talk — long segments found:
- ⚠️ "The teacher had {N} continuous talk periods exceeding 2 minutes. The longest was {X} min ({startTime}–{endTime}). Break long periods with questions or student interaction."
- Include segment details: "{startTime}–{endTime} ({X} min): The teacher was discussing {topics}. [Context about nearby activities or student confusion]"

Total teacher talk — within limit:
- ✅ "Total teacher talk time was {X} min out of {Y} min session — within the recommended 15-minute limit. This leaves sufficient time for student activities."

Total teacher talk — over limit:
- ⚠️ "Total teacher talk time was {X} min out of {Y} min session. Teacher talk should ideally be under 15 minutes to allow the majority of the session for active student learning."

Student active time — above 50%:
- ✅ "Students had {X} min ({Y}%) of active time vs {Z} min teacher talk — the majority of the session was student-centered."

Student active time — below 50%:
- ⚠️ "Students had only {X} min ({Y}%) of active time. Teacher talk ({Z} min) took up most of the session. The majority of session time should be active student time."

Chat engagement — 3+ overlapping bursts:
- ✅ "Students engaged in chat {N} times during or immediately after teacher talk ({total} total messages from {unique} students). This indicates the teacher actively solicited responses and checked understanding."

Chat engagement — 1-2 overlapping bursts:
- ⚠️ "Only {N} chat engagement bursts were detected during teacher talk segments. With {total} total student messages, the teacher could do more to elicit responses — ask students to type their answers in chat after each explanation."

Chat engagement — 0 overlapping bursts:
- ⚠️ "While {total} student messages were sent in chat, none appeared to be direct responses to teacher prompts. The teacher should prompt students to respond in chat to check understanding during lessons."

No student chat at all:
- ⚠️ "No student chat messages were recorded during the session. Teachers should prompt students to respond in chat to check understanding and maintain engagement."

### 4.7 QA Evaluation (9 Criteria, scored 1–5 with 0.5 increments)

Each criterion returns: id, nameEn (English name), score (number), evidence (string array in English), recommendations (string array in English), notes (string).

**Criterion 1: Instructional & Content Mastery**
- Base score: 3
- Adjustments:
  - totalQuestions ≥ 5: +0.5 (evidence: "Session included {N} questions across activities — good coverage")
  - totalQuestions < 3: -0.5 (evidence: "Only {N} questions — limited assessment of understanding")
  - overallCorrectness ≥ 70%: +0.5 (evidence: "Overall correctness {X}% indicates strong content delivery")
  - overallCorrectness < 50%: -0.5 (evidence: "Overall correctness {X}% suggests content delivery issues")
  - questionsAbove80Pct count ≥ 2: +0.5 (evidence: "{N} questions achieved 80%+ correctness")
  - questionsBelow40Pct count ≥ 2: -0.5 (evidence: "{N} questions below 40% correctness — significant gaps")
- Recommendations if score < 4: ["Review questions with low correctness and re-teach those concepts", "Use varied explanation methods (visuals, real-life examples) for difficult topics"]
- Recommendations if score ≥ 4: ["Continue using diverse question types to assess understanding"]

**Criterion 2: Student Engagement**
- Base score: 3
- Adjustments:
  - responseRate ≥ 80%: +0.5 (evidence: "Response rate {X}% — strong student participation")
  - responseRate < 60%: -0.5 (evidence: "Response rate {X}% — many students not participating")
  - sessionTemperature ≥ 0.7: +0.5 (evidence: "Session temperature {X} — high engagement level")
  - sessionTemperature < 0.4: -0.5 (evidence: "Session temperature {X} — low engagement")
  - chatParticipationRate ≥ 30%: +0.5 (evidence: "{N} students participated in chat")
  - positiveSentimentPercent ≥ 60%: +0.5 (evidence: "{X}% of students showed positive sentiment")
- Recommendations if score < 4: ["Use interactive activities to boost engagement", "Encourage chat participation by asking direct questions"]
- Recommendations if score ≥ 4: ["Continue maintaining the high level of student interaction"]

**Criterion 3: Tutor Communication**
- Base score: 3
- Adjustments:
  - teacherChatMessages ≥ 5: +0.5 (evidence: "Teacher sent {N} chat messages — active communication")
  - teacherChatMessages < 2: -0.5 (evidence: "Teacher sent only {N} chat messages — limited interaction")
  - longTalkSegments (>2min) = 0: +0.5 (evidence: "No extended talk periods — good pacing and dialogue")
  - longTalkSegments ≥ 3: -0.5 (evidence: "{N} extended talk periods — could reduce lecturing time")
  - positiveSentimentPercent ≥ 70%: +0.5 (evidence: "Strong positive sentiment ({X}%) suggests effective communication style")
- Recommendations if score < 4: ["Increase chat interaction with students", "Break long explanations into shorter segments with student check-ins"]
- Recommendations if score ≥ 4: ["Continue the effective communication approach"]

**Criterion 4: Time Management**
- Base score: 3
- Adjustments:
  - sessionDuration within 40–50min (target 45): +0.5 (evidence: "Session duration {X} min — within the ideal 40–50 minute range")
  - sessionDuration < 35 or > 55: -0.5 (evidence: "Session duration {X} min — outside the recommended range")
  - teacherTalkTime ≤ 15min: +0.5 (evidence: "Teacher talk {X} min — within the 15-minute limit")
  - teacherTalkTime > 20min: -0.5 (evidence: "Teacher talk {X} min — significantly over the 15-minute recommendation")
  - studentActivePercent ≥ 60%: +0.5 (evidence: "Students active {X}% of the session — student-centered")
  - studentActivePercent < 40%: -0.5 (evidence: "Students active only {X}% — teacher-dominated session")
- Recommendations if score < 4: ["Aim for 40–50 minute sessions with teacher talk under 15 minutes", "Plan activities to give students at least 60% active time"]
- Recommendations if score ≥ 4: ["Good time balance — continue this approach"]

**Criterion 5: Session Pacing**
- Base score: 3
- Adjustments:
  - allActivitiesCompleted: +0.5 (evidence: "All {N} planned activities were completed")
  - completedRatio < 0.75: -0.5 (evidence: "Only {completed}/{total} activities completed")
  - sessionCompletedPercent ≥ 80%: +0.5 (evidence: "Session completion rate {X}% — most students stayed engaged")
  - sessionCompletedPercent < 60%: -0.5 (evidence: "Session completion {X}% — many students dropped off")
  - avgLearningTime ≥ teachingTime × 0.7: +0.5 (evidence: "Average student learning time was {X} min out of {Y} min")
- Recommendations if score < 4: ["Ensure all planned activities are completed within the session", "Monitor student drop-off and adjust pacing accordingly"]
- Recommendations if score ≥ 4: ["Good pacing maintained throughout the session"]

**Criterion 6: Mistakes & Impact**
- Base score: 4 (benefit of the doubt — deduct for observable mistakes)
- Adjustments:
  - teacherTalkDuringExitTicket: -1.0 (evidence: "Teacher was speaking during the exit ticket — this compromises independent assessment")
  - timeManagementIssuesCount ≥ 3: -0.5 (evidence: "{N} time management issues detected")
  - timeManagementIssuesCount ≥ 5: additional -0.5 (evidence: "Significant number of time management mistakes ({N})")
- Recommendations if score < 4: ["Ensure exit tickets are completed independently without teacher input", "Review the feedback section for specific time management issues"]
- Recommendations if score ≥ 4: ["No significant mistakes detected — well-executed session"]

**Criterion 7: Distinct Moments**
- Base score: 3
- Adjustments:
  - wentWellCount ≥ 5: +0.5 (evidence: "{N} positive observations recorded")
  - wentWellCount ≥ 8: additional +0.5
  - bestQuestionCorrectness ≥ 90%: +0.5 (evidence: "Best question achieved {X}% correctness — outstanding comprehension")
  - highTemperature (≥0.7) AND positiveSentiment (≥60%): +0.5 (evidence: "Combination of high temperature and positive sentiment indicates an engaging session")
- Recommendations if score < 4: ["Create memorable learning moments through stories or real-world connections", "Celebrate student successes publicly to boost motivation"]
- Recommendations if score ≥ 4: ["Continue creating impactful teaching moments"]

**Criterion 8: Overall Session & Tutor Rating**
- Score = weighted average of criteria 1–7, rounded to nearest 0.5
- Evidence:
  - score ≥ 4: "Strong session overall — most criteria were met or exceeded"
  - score ≥ 3: "Acceptable session with room for improvement in specific areas"
  - score < 3: "The session needs significant improvement across multiple criteria"
  - Lists strong areas (score ≥ 4) and weak areas (score < 3) by English name
- Recommendations: Lists weak areas to focus on, or encouragement to maintain quality
- Notes: "Average: {X}/5 | Strong: {N} | Weak: {N}"

**Criterion 9: Session Objectives Achieved**
- Base score: 3
- Adjustments:
  - overallCorrectness ≥ 70%: +0.5 (evidence: "Correctness rate {X}% — learning objectives largely achieved")
  - overallCorrectness ≥ 50%: neutral (evidence: "Correctness rate {X}% — partially achieved")
  - overallCorrectness < 50%: -0.5 (evidence: "Correctness rate {X}% — objectives not sufficiently met")
  - sessionCompletedPercent ≥ 80%: +0.5 (evidence: "Session completion {X}% — most students stayed engaged")
  - sessionCompletedPercent < 60%: -0.5 (evidence: "Only {X}% session completion — many students lost engagement")
  - allActivitiesCompleted: +0.5 (evidence: "All planned activities were completed")
  - exitTicketCorrectness ≥ 70%: +0.5 (evidence: "Exit ticket correctness {X}% — strong final assessment")
  - exitTicketCorrectness < 50%: -0.5 (evidence: "Exit ticket correctness only {X}% — objectives not solidified by end of session")
- Recommendations if score < 4: Address specific shortcomings (low correctness → review unmet objectives; low exit ticket → use results to plan review)
- Recommendations if score ≥ 4: ["Learning objectives achieved successfully"]
- Notes: "Correctness: {X}%, Completion: {Y}%, Exit Ticket: {Z}%"

**QA Summary** (displayed in header card): totalStudents, totalQuestions, overallCorrectness, sessionTemperature, teachingTimeMin, teacherTalkMin, studentActivePercent, activitiesCompleted, chatParticipation. Do NOT display responseRate in the summary card.

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
     - Question text (HTML-stripped)
     - Correctness bar with percentage
     - Answered/seen student counts
     - Per-question insights
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
   - 9 expandable criteria rows, each showing:
     - Criterion number (circled)
     - English criterion name
     - ScoreBadge with color
     - ScoreStars (5-star display with half-star support using Star/StarHalf icons)
   - Expanded view shows:
     - "Evidence" — bullet list of evidence strings
     - "Recommendations" — list with arrow icons
     - Notes line in muted text
   - Accordion behavior: only one criterion expanded at a time

7. **Additional Observations** — "Additional Observations"
   - Remaining pedagogy feedback items not shown in earlier sections

### 5.3 Collapsible Behavior
- Use Radix Collapsible (via shadcn)
- LTR chevrons: ChevronRight when collapsed (points right = "open me"), ChevronDown when expanded
- QA criteria: accordion behavior — only one open at a time

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
| QA: evidence | Evidence |
| QA: recommendations | Recommendations |
| QA: notes | Notes |
| Section: observations | Additional Observations |
| Label: planned | Planned |
| Label: details | Details |
| Error: load failed | Failed to load dashboard |
| Empty: no activities | No activities |
| Label: observations (insights) | Observations |
| Header label: session id | Session ID |
| Header label: teacher | Teacher |
| Header label: level | Level |
| Header label: topic | Topic |

---

## 6. API ENDPOINTS

Single endpoint: `GET /api/dashboard/:courseSessionId`

Returns the complete DashboardData JSON object with all computed analytics.

The frontend fetches this on load, using the session ID from the URL or a default detected session.

---

## 7. TECH STACK

- **Frontend**: React + TypeScript, Vite, TanStack React Query, Wouter, shadcn/ui (Card, Badge, Collapsible, Skeleton), Tailwind CSS, lucide-react icons
- **Backend**: Express.js + TypeScript (tsx), csv-parse
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
7. **QA scoring** uses 0.5 increments, starts at baseline 3 (or 4 for mistakes criterion), adjusts up/down based on evidence.
8. **Teacher talk analysis** merges transcript segments with ≤5s gaps to form continuous talk blocks.
9. **LTR layout** throughout — all text alignment, chevron directions, and grid ordering follow English left-to-right reading direction.
10. **Arabic content preserved** — transcript text, chat messages, student names, and topic extraction remain in Arabic (as that's the source language), but all UI labels, insights, recommendations, and QA evaluations are displayed in English.
