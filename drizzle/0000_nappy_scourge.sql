CREATE TYPE "public"."achievement_status" AS ENUM('achieved', 'not_achieved', 'no_data');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('planned', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."cqi_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TYPE "public"."curriculum_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('pending', 'approved', 'rejected', 'stale');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."rps_status" AS ENUM('draft', 'submitted', 'needs_revision', 'verified', 'archived');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."score_status" AS ENUM('draft', 'released');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"student_id" uuid,
	"scope" text NOT NULL,
	"outcome_code" text NOT NULL,
	"value" numeric(7, 2),
	"target" numeric(7, 2) NOT NULL,
	"status" "achievement_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rps_id" uuid NOT NULL,
	"requested_by_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"decision" "decision_status" DEFAULT 'pending' NOT NULL,
	"decided_by_profile_id" uuid,
	"decided_at" timestamp with time zone,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rps_id" uuid NOT NULL,
	"submitted_by_profile_id" uuid NOT NULL,
	"reviewer_profile_id" uuid,
	"decision" "decision_status" DEFAULT 'pending' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rps_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"weight" numeric(7, 4) NOT NULL,
	"maximum_score" numeric(7, 2) DEFAULT '100' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_weight_valid" CHECK ("assessment"."weight" > 0 and "assessment"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_profile_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"requested_by_profile_id" uuid NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_course_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 40 NOT NULL,
	"status" "class_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_capacity_positive" CHECK ("class_section"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"entry_year" integer NOT NULL,
	"name" text NOT NULL,
	"status" "profile_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_credits_positive" CHECK ("course"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "cqi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"achievement_id" uuid NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"analysis" text NOT NULL,
	"action_plan" text DEFAULT '' NOT NULL,
	"status" "cqi_status" DEFAULT 'open' NOT NULL,
	"due_on" date,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "curriculum_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"semester" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_course_semester_valid" CHECK ("curriculum_course"."semester" between 1 and 14)
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "profile_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_dates_valid" CHECK ("period"."ends_on" >= "period"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "obe_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"staff_or_student_id" text,
	"status" "profile_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"faculty" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "rps_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"data" jsonb NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"raw_score" numeric(7, 2) NOT NULL,
	"status" "score_status" DEFAULT 'draft' NOT NULL,
	"graded_by_profile_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_non_negative" CHECK ("score"."raw_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"cohort_id" uuid NOT NULL,
	"nim" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"responsibility" text DEFAULT 'lecturer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_run_id_calculation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."calculation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_rps_id_rps_id_fk" FOREIGN KEY ("rps_id") REFERENCES "public"."rps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_requested_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("requested_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion" ADD CONSTRAINT "ai_suggestion_decided_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("decided_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_rps_id_rps_id_fk" FOREIGN KEY ("rps_id") REFERENCES "public"."rps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_submitted_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("submitted_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_reviewer_profile_id_obe_profile_id_fk" FOREIGN KEY ("reviewer_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_rps_id_rps_id_fk" FOREIGN KEY ("rps_id") REFERENCES "public"."rps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_profile_id_obe_profile_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_run" ADD CONSTRAINT "calculation_run_class_id_class_section_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_section"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_run" ADD CONSTRAINT "calculation_run_requested_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("requested_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_curriculum_course_id_curriculum_course_id_fk" FOREIGN KEY ("curriculum_course_id") REFERENCES "public"."curriculum_course"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_period_id_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cqi" ADD CONSTRAINT "cqi_achievement_id_achievement_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cqi" ADD CONSTRAINT "cqi_owner_profile_id_obe_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum" ADD CONSTRAINT "curriculum_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_course" ADD CONSTRAINT "curriculum_course_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_course" ADD CONSTRAINT "curriculum_course_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_class_id_class_section_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_section"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obe_profile" ADD CONSTRAINT "obe_profile_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps" ADD CONSTRAINT "rps_class_id_class_section_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_section"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps" ADD CONSTRAINT "rps_author_profile_id_obe_profile_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps" ADD CONSTRAINT "rps_verified_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("verified_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_graded_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("graded_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_profile_id_obe_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_class_id_class_section_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignment" ADD CONSTRAINT "teaching_assignment_profile_id_obe_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_profile_id_obe_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_provider_unique" ON "auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "achievement_run_idx" ON "achievement" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "achievement_student_idx" ON "achievement" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_rps_idx" ON "ai_suggestion" USING btree ("rps_id");--> statement-breakpoint
CREATE INDEX "approval_rps_idx" ON "approval" USING btree ("rps_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_rps_code_unique" ON "assessment" USING btree ("rps_id","code");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_profile_id");--> statement-breakpoint
CREATE INDEX "calculation_run_class_idx" ON "calculation_run" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_period_code_unique" ON "class_section" USING btree ("period_id","code");--> statement-breakpoint
CREATE INDEX "class_cohort_idx" ON "class_section" USING btree ("cohort_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_program_year_unique" ON "cohort" USING btree ("program_id","entry_year");--> statement-breakpoint
CREATE INDEX "cohort_curriculum_idx" ON "cohort" USING btree ("curriculum_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_program_code_unique" ON "course" USING btree ("program_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_version_unique" ON "curriculum" USING btree ("program_id","code","version");--> statement-breakpoint
CREATE INDEX "curriculum_program_idx" ON "curriculum" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_course_unique" ON "curriculum_course" USING btree ("curriculum_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_class_student_unique" ON "enrollment" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollment_student_idx" ON "enrollment" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_code_unique" ON "period" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "obe_profile_user_unique" ON "obe_profile" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_code_unique" ON "program" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_code_unique" ON "role" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rps_class_version_unique" ON "rps" USING btree ("class_id","version");--> statement-breakpoint
CREATE INDEX "rps_class_idx" ON "rps" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_attempt_unique" ON "score" USING btree ("enrollment_id","assessment_id","attempt");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_nim_unique" ON "student" USING btree ("nim");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_assignment_unique" ON "teaching_assignment" USING btree ("class_id","profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_scope_unique" ON "user_role" USING btree ("profile_id","role_id","program_id");--> statement-breakpoint
CREATE INDEX "user_role_profile_idx" ON "user_role" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "user_role_program_idx" ON "user_role" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");