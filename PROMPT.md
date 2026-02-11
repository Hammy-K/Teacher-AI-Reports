# Noon Academy Classroom Session Analytics Dashboard — Complete Build Prompt

Build a full-stack web application (React + Express + PostgreSQL) that imports classroom session data from CSV files and generates a comprehensive Arabic-language analytics dashboard for Noon Academy teachers.

---

## 1. DATA SOURCE

The app reads 7 CSV files from `attached_assets/` directory. Each file is named with the session ID (e.g., `70712`). The CSV filenames follow this pattern:

| File Pattern | Content |
|---|---|
| `course_Session_{id}_*.csv` | Session metadata (1 row): session ID, course ID, session name, teacher ID, scheduled/actual times, teaching time, session time, engagement events/durations (JSON), positive/negative/neutral users, session temperature |
| `namra_transcript_{id}_*.csv` | Teacher speech transcript: columns are `start_time, end_time, text` (headerless CSV, BOM-encoded) |
| `chats_{id}_*.csv` | Chat messages: message_id, message_text, creator_id, user_type (STUDENT/TEACHER), creator_name, created_at_ts |
| `classroom_activity_{id}_*.csv` | Activities: activity_id, activity_type, start_time, end_time, activity_happened, planned_duration (seconds), duration (seconds), total_mcqs |
| `f_user_poll_{id}_*.csv` | Individual poll responses: attempt_id, poll_type, course_session_id, user_id, question_id, question_text, classroom_activity_id, is_correct_answer, poll_answered, poll_seen, poll_duration, poll_start_time, poll_end_time |
| `f_user_reaction_{id}_*.csv` | Student reactions: user_id, event_datetime, emotion, part_of_activity, total_reactions |
| `user_session_{id}_*.csv` | Per-student metrics: user_id, user_name, user_type, user_sentiment, teaching_time, session_time, user_enter_time, user_exit_time, room_time, learning_time, active_time, total_polls_seen, total_polls_responded, total_messages, total_hand_raise, total_unmutes, platforms |

Data is imported once on first startup and stored in PostgreSQL. Use `csv-parse` for parsing.

---

## 2. DATABASE SCHEMA (PostgreSQL via Drizzle ORM)

Create these tables in `shared/schema.ts`:

- **course_sessions**: id (serial PK), course_session_id (int), course_id (int), course_session_name (text), course_session_class_type (text), course_session_type (text), teacher_id (int), scheduled_start_time (text), scheduled_end_time (text), teacher_start_time (text), teacher_end_time (text), teaching_time (real), session_time (real), avg_active_time_per_student (real), median_active_time_per_student (real), course_session_status (text), total_segments (int), engagement_events (jsonb), engagement_durations (jsonb), positive_users (int), negative_users (int), neutral_users (int), session_temperature (real)

- **session_transcripts**: id (serial PK), course_session_id (int), start_time (text), end_time (text), text (text), line_order (int)

- **session_chats**: id (serial PK), course_session_id (int), message_id (text), message_text (text), creator_id (int), user_type (text), creator_name (text), created_at_ts (text)

- **classroom_activities**: id (serial PK), activity_id (int), course_session_id (int), activity_type (text), start_time (text), end_time (text), activity_happened (boolean), planned_duration (int), duration (real), total_mcqs (int)

- **user_polls**: id (serial PK), attempt_id (text), poll_type (text), poll_type_2 (text), course_session_id (int), user_id (int), question_id (int), question_text (text), classroom_activity_id (int), is_correct_answer (boolean), poll_answered (boolean), poll_seen (boolean), poll_duration (int), poll_start_time (text), poll_end_time (text)

- **user_reactions**: id (serial PK), course_session_id (int), user_id (int), event_datetime (text), emotion (text), part_of_activity (boolean), total_reactions (int)

- **user_sessions**: id (serial PK), user_id (int), user_name (text), user_type (text), user_sentiment (text), course_session_id (int), teaching_time (real), session_time (real), user_enter_time (text), user_exit_time (text), room_time (real), learning_time (real), active_time (real), total_polls_seen (int), total_polls_responded (int), total_messages (int), total_hand_raise (int), total_unmutes (int), platforms (text)

---

## 3. ACTIVITY TYPE CLASSIFICATION SYSTEM

Activity types in the CSV can have arbitrary names. Implement a classification function that maps any activity name to one of 3 canonical categories:

```
classifyActivityType(activityType: string, totalMcqs: number | null): string {
  Normalize: uppercase, replace spaces/dashes/underscores with single underscore

  Exact matches:
    SECTION_CHECK → SECTION_CHECK
    EXIT_TICKET → EXIT_TICKET
    TEAM_EXERCISE → TEAM_EXERCISE

  Exit Ticket aliases (map to EXIT_TICKET):
    SQUID_GAMES, SQUID_GAME, SQUIDGAMES, SQUIDGAME

  Team Exercise aliases (map to TEAM_EXERCISE):
    BETTER_CALL_SAUL, BETTERCALLSAUL

  MCQ fallback:
    If totalMcqs > 0 → SECTION_CHECK

  Default fallback:
    SECTION_CHECK
}
```

Apply this classification EARLY in the data pipeline (when building `activitiesWithCorrectness`) so all downstream analysis uses canonical types. Preserve the original type as `originalActivityType` for reference.

Arabic labels for the 3 canonical types:
- SECTION_CHECK → "اختبار الفهم" (plural: "اختبارات الفهم")
- EXIT_TICKET → "اختبار الفهم النهائي"
- TEAM_EXERCISE → "تمرين جماعي"

---

## 4. BACKEND ANALYTICS ENGINE (server/storage.ts)

The backend computes ALL analytics server-side in a single `getDashboardData(courseSessionId)` method that returns one comprehensive JSON object. Key computations:

### 4.1 Session Metadata
- Extract teacher name from `user_sessions` where userType = 'TEACHER'
- **Teacher name cleanup**: `name.replace(/أ\.(?!\s)/g, 'أ. ').replace(/\s+ال\s+/g, ' آل ').trim()`
- **Parse session name**: Extract topic and level from `courseSessionName` using regex `/^(.+?)(L\d+)$/`
- Calculate `sessionCompletedPercent = avgLearningTime / teachingTime * 100`

### 4.2 Student Metrics
- Total students (filter userType = 'STUDENT')
- Average learning time across students
- Session temperature from course_sessions table

### 4.3 Poll Statistics
- Overall correctness percent = totalCorrect / totalAnswered * 100
- Per-question breakdown: questionId, questionText, correct count, total answered, percent
- Per-activity correctness map (classroomActivityId → {answered, correct, percent})

### 4.4 Activity Analysis (per canonical type)

**Display order**: SECTION_CHECK → TEAM_EXERCISE → EXIT_TICKET

**For SECTION_CHECK**: Combine all instances into one merged analysis with:
- Total questions, average correctness, average students answered
- Combined duration, all questions merged
- Combined insights and feedback

**For TEAM_EXERCISE and EXIT_TICKET**: Show each instance individually

**Per-activity instance analysis includes**:
- Per-question breakdown (strip HTML from question text)
- Students who saw vs answered
- Teacher talk overlap detection (check if transcript segments overlap activity time window)
- Teacher talk overlap duration and topics
- Completion rate
- Unanswered student chats during activity

**Question-level insights** (Arabic):
- ≥80% correct: "نتيجة قوية — معظم الطلاب فهموا هذا المفهوم جيداً."
- 60-79%: "مقبول لكن بعض الطلاب واجهوا صعوبة — قد يحتاج مراجعة سريعة في الحصة القادمة."
- 40-59%: "نسبة صحة منخفضة — هذا الموضوع يحتاج شرحاً إضافياً أو إعادة تدريس في الحصة القادمة."
- <40%: "نسبة صحة منخفضة جداً — المفهوم لم يُفهم من الأغلبية. قد يكون الشرح مربكاً أو قصيراً جداً قبل النشاط."
- Skip rate ≥20%: "{count} طالب ({percent}%) شاهدوا السؤال ولم يجيبوا — قد يكون السؤال صعباً أو مربكاً."

**Activity-level insights** (Arabic):
- EXIT_TICKET + teacher talk overlap: Warning about teacher speaking during exit ticket
- Low overall correctness (<50%): Suggest content review
- Duration significantly shorter/longer than planned (±30%)
- Low completion rate (<80%)
- ≥3 unanswered student chats during activity

**Combined SECTION_CHECK insights**:
- Questions with <40% correctness: "هذه المواضيع تحتاج إعادة شرح"
- Average completion rate <80%: "مما يشير إلى ضيق الوقت لدى بعض الطلاب"
- Teacher talk during section checks
- Overall low correctness (<50%)

### 4.5 Feedback System (What Went Well / Needs Improvement)

Analyze each activity that happened and has correctness data. For each, look at post-activity teacher talk (between activity end and next activity start):

**High correctness (>75%)**:
- If teacher explanation ≤15s → ✅ Good time management
- If teacher explanation >15s → ⚠️ Too much explanation for high-correctness activity
- If student called to stage → ⚠️ Unnecessary when >75% correct
- If no student called → ✅ Good decision

**Medium correctness (50-75%)**:
- Ideal explanation: 30-60s → ✅
- <30s → ⚠️ More explanation needed (recommend 0.5–1 min)
- >60s → ⚠️ Too much explanation (recommend 0.5–1 min)

**Low correctness (<50%)**:
- Ideal explanation: 60-120s → ✅
- <60s → ⚠️ Much more explanation needed (recommend 1–2 min)
- >120s → ✅ Thorough explanation appropriate

**Student stage detection**: Regex `/اشرح|اشرحي|تعال|تعالي|يلا.*اشرح|stage|explain.*class|come.*up/i`

### 4.6 Pedagogy Feedback

Analyze teacher talk patterns from transcripts:

1. **Continuous talk segments**: Merge transcript lines with ≤5s gaps. Flag segments >120s (2 min)
2. **Total teacher talk time**: Flag if >15 minutes
3. **Student active time percent**: Flag if <50%
4. **Chat interaction analysis**: Detect chat "bursts" (≥3 messages within 30s window) that overlap with teacher talk segments
5. **Long segment detail**: For each >2min segment, include time range, topics discussed, nearby activity correctness, student confusion in chat

**Topic extraction**: Regex-based detection for math/geometry terms (Arabic):
- الدائرة, المستقيم, نصف القطر, القطر, الوتر, مماس, الزاوية المركزية/المحيطية, المحيط, المساحة, المضلع, القوس, etc.

**Chat confusion detection**: Regex patterns for Arabic confusion expressions:
- `/ما\s*فهم|مو\s*فاهم|مو\s*واضح|ما\s*عرف|صعب|ما\s*فهمت|مش\s*فاهم|كيف|وش\s*يعني|يعني\s*ايش|ما\s*وضح|\?\?|اعيد/i`

### 4.7 QA Evaluation (9 Criteria, scored 1-5 with 0.5 increments)

Each criterion has: Arabic name, English name, numeric score, evidence array (Arabic), recommendations array (Arabic), notes string.

**Criterion 1: إتقان المحتوى والشرح (Instructional & Content Mastery)**
- Based on: total questions count, overall correctness %, high/low question counts

**Criterion 2: دعم الطلاب وتحفيزهم (Student Engagement)**
- Based on: response rate, session temperature, chat participation rate, positive sentiment %

**Criterion 3: التواصل وحضور المعلّم (Tutor Communication)**
- Based on: teacher chat messages count, long talk segments, positive sentiment %

**Criterion 4: إدارة الوقت والخطة التعليمية (Time Management)**
- Based on: actual vs scheduled duration (45 min target), teacher talk time (15 min cap), student active %

**Criterion 5: الإلتزام بتصميم وخطة الدرس وتوزيع الوقت (Session Pacing)**
- Based on: activities completed ratio, session completion %, avg learning time

**Criterion 6: الاخطاء و تأثيرها على الدرس (Mistakes & Impact)**
- Based on: teacher talk during EXIT_TICKET, time management issues count
- Starts at 4 (benefit of doubt), deducts for mistakes

**Criterion 7: لحظات تميّز من الأستاذ (Distinct Moments)**
- Based on: count of positive feedback items, best question correctness, temperature + sentiment combo

**Criterion 8: التقييم العام والجودة للحصة والمدرس (Overall Session & Tutor Rating)**
- Average of criteria 1-7, identifies strong areas (≥4) and weak areas (<3)

**Criterion 9: قياس مدى تحقيق أهداف الحصة (Session Objectives Achieved)**
- Based on: overall correctness, session completion %, activities completed, exit ticket correctness

**QA Summary object** (displayed in header): totalStudents, totalQuestions, overallCorrectness, responseRate, sessionTemperature, teachingTimeMin, teacherTalkMin, studentActivePercent, activitiesCompleted, chatParticipation. Note: Do NOT show responseRate metric in the QA summary card display.

---

## 5. FRONTEND DASHBOARD (Single Page, Arabic RTL)

### 5.1 Global Settings
- `<html lang="ar" dir="rtl">`
- Font: `Noto Sans Arabic` as primary, with `Open Sans` fallback
- Noon Academy branding: primary color = teal/green (`hsl(160, 40%, 45%)`), secondary = warm gold (`hsl(43, 40%, 92%)`)
- Dark mode support with CSS variables

### 5.2 Dashboard Layout (single scrolling page, max-width 5xl, centered)

**Section order from top to bottom:**

1. **Session Header** — Warm-tinted card with session info
   - تقرير الحصة (Session Report) as title with GraduationCap icon
   - Grid showing: رقم الحصة (Session ID), المعلم (Teacher), المستوى (Level), الموضوع (Topic)
   - Level formatting: L1→الأول, L2→الثاني, L3→الثالث, L4→الرابع, L5→الخامس, etc.

2. **Session Summary** — ملخص الحصة
   - 5-metric grid: الحضور (Attendance), نسبة الإجابات الصحيحة (Correctness), الحرارة والتفاعل (Temperature), وقت التدريس (Teaching Time, in minutes + "د"), إكمال الأسئلة (Session Completion %, with subtitle showing avg/total)

3. **Activities Table** — الأنشطة
   - Badge showing `{completed}/{total} مكتملة`
   - Table columns: نوع النشاط, المكتملة, المدة, نسبة الإجابات الصحيحة
   - Activities grouped by canonical type with Arabic labels

4. **Activity Analysis Sections** (one per canonical type, in order: SECTION_CHECK → TEAM_EXERCISE → EXIT_TICKET)
   - Each section has: section heading with icon, metrics grid (questions, students answered, correctness, duration)
   - CorrectnessBar (green ≥75%, amber ≥50%, red <50%)
   - InsightsList with lightbulb icon, labeled "ملاحظات"
   - Collapsible question breakdown: "تفصيل الأسئلة ({count})" — each question shows text, correctness bar, answered/seen counts, per-question insights
   - FeedbackInline: two-column layout for "ما تم بشكل صحيح" (green, ThumbsUp) and "يحتاج تحسين" (amber, AlertTriangle)
   - Each feedback item shows: category badge, detail text, recommended vs actual values, collapsible segment details

   **EXIT_TICKET special**: Red warning banner when teacher spoke during exit ticket

5. **Time Management Section** — إدارة الوقت
   - Shows time_management and student_stage feedback items NOT already shown in activity sections

6. **QA Evaluation Section** — تقييم جودة الحصة
   - Header card with overall score (/5), ScoreBadge (ممتاز/مقبول/يحتاج تحسين), summary metrics grid (questions count, teacher talk duration, student active %)
   - 9 expandable criteria rows, each showing: criterion number, Arabic name, ScoreBadge, ScoreStars (5-star with half-star support)
   - Expanded view: الأدلة (evidence bullets), التوصيات (recommendation arrows), notes line
   - Score colors: ≥4 green, ≥3 amber, <3 red

7. **Other Comments** — ملاحظات أخرى
   - Remaining pedagogy feedback items

### 5.3 Collapsible Behavior
- Use Radix Collapsible (via shadcn)
- RTL chevrons: ChevronLeft when collapsed (points left = "open me"), ChevronDown when expanded
- QA criteria: only one expanded at a time (accordion behavior)

### 5.4 Arabic Terminology (exact labels to use)
- نسبة الإجابات الصحيحة = Correctness percentage
- الحرارة والتفاعل = Temperature & engagement
- إكمال الأسئلة = Question completion
- عدد الطلاب الذين أجابوا = Students who answered
- اختبار الفهم النهائي = Exit ticket (final comprehension test)
- ما تم بشكل صحيح = What went well
- يحتاج تحسين = Needs improvement
- إدارة الوقت = Time management
- أسلوب التدريس = Teaching methodology
- مرحلة الطالب = Student stage
- تقييم جودة الحصة = Session quality evaluation
- التقييم العام = Overall evaluation
- الأدلة = Evidence
- التوصيات = Recommendations
- ملاحظات = Notes/observations
- تفصيل الأسئلة = Question breakdown
- التفاصيل = Details (for segment breakdown)
- فشل تحميل لوحة التحكم = Dashboard load failed
- لا توجد أنشطة = No activities
- المخطط = Planned (duration)

### 5.5 Feedback Category Labels
- time_management → "إدارة الوقت"
- student_stage → "مرحلة الطالب"
- pedagogy → "أسلوب التدريس"

---

## 6. API ENDPOINTS

Single endpoint: `GET /api/dashboard/:courseSessionId` returns the complete DashboardData JSON object.

---

## 7. TECH STACK

- **Frontend**: React + TypeScript, Vite, TanStack React Query, Wouter, shadcn/ui (Card, Badge, Collapsible, Skeleton), Tailwind CSS, lucide-react icons
- **Backend**: Express.js + TypeScript (tsx), csv-parse
- **Database**: PostgreSQL via Drizzle ORM, drizzle-zod for validation
- **Fonts**: Noto Sans Arabic (Google Fonts)
- **Bind frontend to 0.0.0.0:5000**

---

## 8. KEY DESIGN DECISIONS

1. ALL analytics computed server-side — frontend is purely presentational
2. Data imported once from CSV on first startup (check via `isDataImported()`)
3. Activity type classification applied early in pipeline so all analysis uses canonical types
4. SECTION_CHECK instances combined into one merged view; EXIT_TICKET and TEAM_EXERCISE shown individually
5. Feedback system analyzes post-activity teacher behavior based on correctness brackets
6. QA scoring uses 0.5 increments, starts at baseline 3 (or 4 for mistakes), adjusts up/down based on evidence
7. Teacher talk analysis merges transcript segments with ≤5s gaps to form continuous talk blocks
8. RTL layout throughout — all text alignment, chevron directions, and grid ordering respect Arabic reading direction
