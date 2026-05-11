import { z } from "zod";

export const skillDefinitionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^\/?[a-z][a-z0-9-]*$/, "skill id must be kebab-case, optional leading slash"),
  label: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
