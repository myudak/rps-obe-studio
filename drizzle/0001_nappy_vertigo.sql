ALTER TYPE "public"."cqi_status" ADD VALUE 'pending_review';--> statement-breakpoint
CREATE TABLE "cqi_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cqi_id" uuid NOT NULL,
	"uploaded_by_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cqi_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cqi_id" uuid NOT NULL,
	"actor_profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD COLUMN "stage" text DEFAULT 'GPM' NOT NULL;--> statement-breakpoint
ALTER TABLE "cqi_attachment" ADD CONSTRAINT "cqi_attachment_cqi_id_cqi_id_fk" FOREIGN KEY ("cqi_id") REFERENCES "public"."cqi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cqi_attachment" ADD CONSTRAINT "cqi_attachment_uploaded_by_profile_id_obe_profile_id_fk" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cqi_history" ADD CONSTRAINT "cqi_history_cqi_id_cqi_id_fk" FOREIGN KEY ("cqi_id") REFERENCES "public"."cqi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cqi_history" ADD CONSTRAINT "cqi_history_actor_profile_id_obe_profile_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."obe_profile"("id") ON DELETE no action ON UPDATE no action;