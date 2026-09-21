CREATE TABLE "project_tabs" (
	"project_id" uuid NOT NULL,
	"tab" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"image_cover_desktop_url" text,
	"image_cover_mobile_url" text,
	CONSTRAINT "project_tabs_project_id_tab_pk" PRIMARY KEY("project_id","tab")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"format" text DEFAULT '16:9' NOT NULL,
	"theme" text DEFAULT 'dark',
	"poster_url" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "project_tabs" ADD CONSTRAINT "project_tabs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;