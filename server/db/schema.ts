import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import type { RpsData } from "../../src/schemas/rps-schema.ts"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}

// Better Auth owns these four tables. Domain tables reference user.id but never
// duplicate credentials or session state.
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps,
})

export const session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [index("auth_session_user_idx").on(table.userId)])

export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
}, (table) => [
  index("auth_account_user_idx").on(table.userId),
  uniqueIndex("auth_account_provider_unique").on(table.providerId, table.accountId),
])

export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("auth_verification_identifier_idx").on(table.identifier)])

export const profileStatus = pgEnum("profile_status", ["active", "inactive"])
export const curriculumStatus = pgEnum("curriculum_status", ["draft", "active", "archived"])
export const classStatus = pgEnum("class_status", ["planned", "active", "closed"])
export const rpsStatus = pgEnum("rps_status", ["draft", "submitted", "needs_revision", "verified", "archived"])
export const scoreStatus = pgEnum("score_status", ["draft", "released"])
export const decisionStatus = pgEnum("decision_status", ["pending", "approved", "rejected", "stale"])
export const runStatus = pgEnum("run_status", ["running", "completed", "failed"])
export const achievementStatus = pgEnum("achievement_status", ["achieved", "not_achieved", "no_data"])
export const cqiStatus = pgEnum("cqi_status", ["open", "in_progress", "closed", "pending_review"])

export const programs = pgTable("program", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  faculty: text("faculty").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("program_code_unique").on(table.code)])

export const profiles = pgTable("obe_profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  staffOrStudentId: text("staff_or_student_id"),
  status: profileStatus("status").default("active").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("obe_profile_user_unique").on(table.userId)])

export const roles = pgTable("role", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ...timestamps,
}, (table) => [uniqueIndex("role_code_unique").on(table.code)])

export const userRoles = pgTable("user_role", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("user_role_scope_unique").on(table.profileId, table.roleId, table.programId),
  index("user_role_profile_idx").on(table.profileId),
  index("user_role_program_idx").on(table.programId),
])

export const periods = pgTable("period", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("period_code_unique").on(table.code),
  check("period_dates_valid", sql`${table.endsOn} >= ${table.startsOn}`),
])

export const curricula = pgTable("curriculum", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: curriculumStatus("status").default("draft").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("curriculum_version_unique").on(table.programId, table.code, table.version),
  index("curriculum_program_idx").on(table.programId),
])

export const cohorts = pgTable("cohort", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id, { onDelete: "restrict" }),
  entryYear: integer("entry_year").notNull(),
  name: text("name").notNull(),
  status: profileStatus("status").default("active").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("cohort_program_year_unique").on(table.programId, table.entryYear),
  index("cohort_curriculum_idx").on(table.curriculumId),
])

export const courses = pgTable("course", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  credits: integer("credits").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("course_program_code_unique").on(table.programId, table.code),
  check("course_credits_positive", sql`${table.credits} > 0`),
])

export const curriculumCourses = pgTable("curriculum_course", {
  id: uuid("id").defaultRandom().primaryKey(),
  curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id, { onDelete: "restrict" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
  semester: integer("semester").notNull(),
  required: boolean("required").default(true).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("curriculum_course_unique").on(table.curriculumId, table.courseId),
  check("curriculum_course_semester_valid", sql`${table.semester} between 1 and 14`),
])

export const classSections = pgTable("class_section", {
  id: uuid("id").defaultRandom().primaryKey(),
  curriculumCourseId: uuid("curriculum_course_id").notNull().references(() => curriculumCourses.id, { onDelete: "restrict" }),
  cohortId: uuid("cohort_id").notNull().references(() => cohorts.id, { onDelete: "restrict" }),
  periodId: uuid("period_id").notNull().references(() => periods.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(40),
  status: classStatus("status").default("planned").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("class_period_code_unique").on(table.periodId, table.code),
  index("class_cohort_idx").on(table.cohortId),
  check("class_capacity_positive", sql`${table.capacity} > 0`),
])

export const teachingAssignments = pgTable("teaching_assignment", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").notNull().references(() => classSections.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  responsibility: text("responsibility").notNull().default("lecturer"),
  ...timestamps,
}, (table) => [uniqueIndex("teaching_assignment_unique").on(table.classId, table.profileId)])

export const students = pgTable("student", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  cohortId: uuid("cohort_id").notNull().references(() => cohorts.id, { onDelete: "restrict" }),
  nim: text("nim").notNull(),
  name: text("name").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("student_nim_unique").on(table.nim)])

export const enrollments = pgTable("enrollment", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").notNull().references(() => classSections.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "restrict" }),
  status: profileStatus("status").default("active").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("enrollment_class_student_unique").on(table.classId, table.studentId),
  index("enrollment_student_idx").on(table.studentId),
])

export const rpsDocuments = pgTable("rps", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").notNull().references(() => classSections.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  revision: integer("revision").notNull().default(0),
  status: rpsStatus("status").default("draft").notNull(),
  title: text("title").notNull(),
  data: jsonb("data").$type<RpsData>().notNull(),
  authorProfileId: uuid("author_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByProfileId: uuid("verified_by_profile_id").references(() => profiles.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("rps_class_version_unique").on(table.classId, table.version),
  index("rps_class_idx").on(table.classId),
])

export const assessments = pgTable("assessment", {
  id: uuid("id").defaultRandom().primaryKey(),
  rpsId: uuid("rps_id").notNull().references(() => rpsDocuments.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  weight: numeric("weight", { precision: 7, scale: 4 }).notNull(),
  maximumScore: numeric("maximum_score", { precision: 7, scale: 2 }).notNull().default("100"),
  ...timestamps,
}, (table) => [
  uniqueIndex("assessment_rps_code_unique").on(table.rpsId, table.code),
  check("assessment_weight_valid", sql`${table.weight} > 0 and ${table.weight} <= 100`),
])

export const scores = pgTable("score", {
  id: uuid("id").defaultRandom().primaryKey(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "restrict" }),
  assessmentId: uuid("assessment_id").notNull().references(() => assessments.id, { onDelete: "restrict" }),
  attempt: integer("attempt").notNull().default(1),
  rawScore: numeric("raw_score", { precision: 7, scale: 2 }).notNull(),
  status: scoreStatus("status").default("draft").notNull(),
  gradedByProfileId: uuid("graded_by_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("score_attempt_unique").on(table.enrollmentId, table.assessmentId, table.attempt),
  check("score_non_negative", sql`${table.rawScore} >= 0`),
])

export const calculationRuns = pgTable("calculation_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").notNull().references(() => classSections.id, { onDelete: "restrict" }),
  status: runStatus("status").default("running").notNull(),
  requestedByProfileId: uuid("requested_by_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  ...timestamps,
}, (table) => [index("calculation_run_class_idx").on(table.classId)])

export const achievements = pgTable("achievement", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => calculationRuns.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "restrict" }),
  scope: text("scope").notNull(),
  outcomeCode: text("outcome_code").notNull(),
  value: numeric("value", { precision: 7, scale: 2 }),
  target: numeric("target", { precision: 7, scale: 2 }).notNull(),
  status: achievementStatus("status").notNull(),
  ...timestamps,
}, (table) => [
  index("achievement_run_idx").on(table.runId),
  index("achievement_student_idx").on(table.studentId),
])

export const cqiFindings = pgTable("cqi", {
  id: uuid("id").defaultRandom().primaryKey(),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "restrict" }),
  ownerProfileId: uuid("owner_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  analysis: text("analysis").notNull(),
  actionPlan: text("action_plan").notNull().default(""),
  status: cqiStatus("status").default("open").notNull(),
  dueOn: date("due_on"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
})

export const approvals = pgTable("approval", {
  id: uuid("id").defaultRandom().primaryKey(),
  rpsId: uuid("rps_id").notNull().references(() => rpsDocuments.id, { onDelete: "restrict" }),
  round: integer("round").notNull().default(1),
  stage: text("stage").notNull().default("GPM"),
  submittedByProfileId: uuid("submitted_by_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  reviewerProfileId: uuid("reviewer_profile_id").references(() => profiles.id, { onDelete: "restrict" }),
  decision: decisionStatus("decision").default("pending").notNull(),
  comment: text("comment").notNull().default(""),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("approval_rps_idx").on(table.rpsId)])

export const aiSuggestions = pgTable("ai_suggestion", {
  id: uuid("id").defaultRandom().primaryKey(),
  rpsId: uuid("rps_id").notNull().references(() => rpsDocuments.id, { onDelete: "restrict" }),
  requestedByProfileId: uuid("requested_by_profile_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  model: text("model").notNull(),
  inputHash: text("input_hash").notNull(),
  proposal: jsonb("proposal").$type<Record<string, unknown>>().notNull(),
  decision: decisionStatus("decision").default("pending").notNull(),
  decidedByProfileId: uuid("decided_by_profile_id").references(() => profiles.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  latencyMs: integer("latency_ms"),
  ...timestamps,
}, (table) => [index("ai_suggestion_rps_idx").on(table.rpsId)])

export const auditLogs = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorProfileId: uuid("actor_profile_id").references(() => profiles.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_entity_idx").on(table.entityType, table.entityId),
  index("audit_actor_idx").on(table.actorProfileId),
])

export const authSchema = { user, session, account, verification }

export const cqiHistory = pgTable("cqi_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  cqiId: uuid("cqi_id").notNull().references(() => cqiFindings.id),
  actorProfileId: uuid("actor_profile_id").notNull().references(() => profiles.id),
  status: text("status").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
export const cqiAttachments = pgTable("cqi_attachment", {
  id: uuid("id").primaryKey(),
  cqiId: uuid("cqi_id").notNull().references(() => cqiFindings.id),
  uploadedByProfileId: uuid("uploaded_by_profile_id").notNull().references(() => profiles.id),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
