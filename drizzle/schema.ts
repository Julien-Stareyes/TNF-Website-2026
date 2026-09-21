import { pgTable, unique, uuid, text, jsonb, timestamp, integer, boolean, date, foreignKey, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	description: text(),
	format: text().default('16:9').notNull(),
	theme: text().default('dark'),
	posterUrl: text("poster_url"),
	gallery: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	year: integer(),
	category: text(),
	bgImageUrl: text("bg_image_url"),
	bgColor: text("bg_color"),
	isPublished: boolean("is_published").default(true).notNull(),
	position: integer().default(0).notNull(),
	showInImage: boolean("show_in_image").default(false).notNull(),
	showInImmersive: boolean("show_in_immersive").default(false).notNull(),
	imageCoverDesktopUrl: text("image_cover_desktop_url"),
	imageCoverMobileUrl: text("image_cover_mobile_url"),
	completedAt: date("completed_at"),
	detailMode: text("detail_mode").default('image').notNull(),
	blocks: jsonb().default([]).notNull(),
	technologies: text(),
	posterMobileUrl: text("poster_mobile_url"),
	imageCoverDesktopHevcUrl: text("image_cover_desktop_hevc_url"),
	imageCoverMobileHevcUrl: text("image_cover_mobile_hevc_url"),
}, (table) => [
	unique("projects_slug_unique").on(table.slug),
]);

export const settings = pgTable("settings", {
	key: text().primaryKey().notNull(),
	value: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const projectTabs = pgTable("project_tabs", {
	projectId: uuid("project_id").notNull(),
	tab: text().notNull(),
	position: integer().default(0).notNull(),
	published: boolean().default(true).notNull(),
	imageCoverDesktopUrl: text("image_cover_desktop_url"),
	imageCoverMobileUrl: text("image_cover_mobile_url"),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_tabs_project_id_projects_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tab, table.projectId], name: "project_tabs_project_id_tab_pk"}),
]);
