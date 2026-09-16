CREATE TYPE "public"."demo_scenario_status" AS ENUM('active', 'reset');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'implemented');--> statement-breakpoint
CREATE TABLE "assessment_outcome_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"course_outcome_id" uuid NOT NULL,
	"sub_outcome_id" uuid,
	"weight" numeric(7, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_outcome_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_outcome_id" uuid NOT NULL,
	"curriculum_outcome_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"contribution" numeric(7, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_outcome_mapping_level_valid" CHECK ("course_outcome_mapping"."level" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "course_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_course_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"weight" numeric(7, 2) DEFAULT '0' NOT NULL,
	"target" numeric(7, 2) DEFAULT '70' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target" numeric(7, 2) DEFAULT '70' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_course_id" uuid NOT NULL,
	"proposed_by_profile_id" uuid NOT NULL,
	"decided_by_profile_id" uuid,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"decision_comment" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_scenario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_by_profile_id" uuid NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "demo_scenario_status" DEFAULT 'active' NOT NULL,
	"reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_outcome_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"weight" numeric(7, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "impersonator_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_outcome_mapping" ADD CONSTRAINT "assessment_outcome_mapping_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_outcome_mapping" ADD CONSTRAINT "assessment_outcome_mapping_course_outcome_id_course_outcome_id_fk" FOREIGN KEY ("course_outcome_id") REFERENCES "public"."course_outcome"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_outcome_mapping" ADD CONSTRAINT "assessment_outcome_mapping_sub_outcome_id_sub_outcome_id_fk" FOREIGN KEY ("sub_outcome_id") REFERENCES "public"."sub_outcome"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_outcome_mapping" ADD CONSTRAINT "course_outcome_mapping_course_outcome_id_course_outcome_id_fk" FOREIGN KEY ("course_outcome_id") REFERENCES "public"."course_outcome"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_outcome_mapping" ADD CONSTRAINT "course_outcome_mapping_curriculum_outcome_id_curriculum_outcome_id_fk" FOREIGN KEY ("curriculum_outcome_id") REFERENCES "public"."curriculum_outcome"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_outcome" ADD CONSTRAINT "course_outcome_curriculum_course_id_curriculum_course_id_fk" FOREIGN KEY ("curriculum_course_id") REFERENCES "public"."curriculum_course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_outcome" ADD CONSTRAINT "curriculum_outcome_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_proposal" ADD CONSTRAINT "curriculum_proposal_curriculum_course_id_curriculum_course_id_fk" FOREIGN KEY ("curriculum_course_id") REFERENCES "public"."curriculum_course"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_proposal" ADD CONSTRAINT "curriculum_proposal_proposed_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("proposed_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_proposal" ADD CONSTRAINT "curriculum_proposal_decided_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("decided_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_scenario" ADD CONSTRAINT "demo_scenario_created_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_outcome" ADD CONSTRAINT "sub_outcome_course_outcome_id_course_outcome_id_fk" FOREIGN KEY ("course_outcome_id") REFERENCES "public"."course_outcome"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_outcome_mapping_unique" ON "assessment_outcome_mapping" USING btree ("assessment_id","course_outcome_id","sub_outcome_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_outcome_mapping_unique" ON "course_outcome_mapping" USING btree ("course_outcome_id","curriculum_outcome_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_outcome_code_unique" ON "course_outcome" USING btree ("curriculum_course_id","code");--> statement-breakpoint
CREATE INDEX "course_outcome_course_idx" ON "course_outcome" USING btree ("curriculum_course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_outcome_code_unique" ON "curriculum_outcome" USING btree ("curriculum_id","code");--> statement-breakpoint
CREATE INDEX "curriculum_outcome_curriculum_idx" ON "curriculum_outcome" USING btree ("curriculum_id");--> statement-breakpoint
CREATE INDEX "curriculum_proposal_course_idx" ON "curriculum_proposal" USING btree ("curriculum_course_id");--> statement-breakpoint
CREATE INDEX "demo_scenario_status_idx" ON "demo_scenario" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_outcome_code_unique" ON "sub_outcome" USING btree ("course_outcome_id","code");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonator_profile_id_obe_profile_id_fk" FOREIGN KEY ("impersonator_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_impersonated_by_auth_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "auth_user"
SET "role" = 'admin'
WHERE "id" IN (
	SELECT p."user_id"
	FROM "obe_profile" p
	INNER JOIN "user_role" ur ON ur."profile_id" = p."id"
	INNER JOIN "role" r ON r."id" = ur."role_id"
	WHERE r."code" = 'SUPERADMIN'
);
