import { relations } from "drizzle-orm/relations";
import { projects, projectTabs } from "./schema";

export const projectTabsRelations = relations(projectTabs, ({one}) => ({
	project: one(projects, {
		fields: [projectTabs.projectId],
		references: [projects.id]
	}),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	projectTabs: many(projectTabs),
}));