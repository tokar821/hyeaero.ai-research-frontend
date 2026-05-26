/**
 * Pre-processed mission schema — sync with `backend/services/preprocessing/schema.py`.
 * All fields are concrete values or the literal "UNKNOWN".
 */
import { z } from "zod";

export const UNKNOWN = "UNKNOWN" as const;

const unknownOr = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.literal(UNKNOWN)]);

export const PreprocessedMissionSchema = z
  .object({
    passengers: unknownOr(z.number().int().min(1).max(24)),
    origin: unknownOr(z.string().min(1)),
    destination: unknownOr(z.string().min(1)),
    nonstop_required: unknownOr(z.boolean()),
    westbound: unknownOr(z.boolean()),
    winter_operation: unknownOr(z.boolean()),
    runway_priority: unknownOr(z.enum(["low", "medium", "high"])),
    operating_cost_priority: unknownOr(z.enum(["low", "medium", "high"])),
    luxury_priority: unknownOr(z.enum(["low", "medium", "high"])),
    budget: unknownOr(z.number().nonnegative()),
    annual_hours: unknownOr(z.number().int().min(1).max(2000)),
    ownership_interest: unknownOr(
      z.enum(["fractional", "full_ownership", "charter", "undecided"]),
    ),
    mountain_airport: unknownOr(z.boolean()),
    international: unknownOr(z.boolean()),
    transatlantic: unknownOr(z.boolean()),
    transpacific: unknownOr(z.boolean()),
  })
  .strict();

export type PreprocessedMission = z.infer<typeof PreprocessedMissionSchema>;
