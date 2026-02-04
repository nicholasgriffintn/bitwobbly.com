import { z } from "zod";

export const CreateTeamInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

