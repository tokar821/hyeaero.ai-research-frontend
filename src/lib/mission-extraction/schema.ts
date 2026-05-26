/**
 * Zod validation mirror for the backend Mission Extraction Layer.
 * Keep in sync with `backend/services/mission_extraction/schema.py`.
 */
import { z } from "zod";

export const MissionTypeSchema = z.enum([
  "point_to_point",
  "multi_city",
  "comparison",
  "ownership",
  "feasibility",
  "acquisition",
  "general",
]);

export const PriorityLevelSchema = z.enum(["low", "medium", "high"]);

export const OwnershipInterestSchema = z.enum([
  "fractional",
  "full_ownership",
  "charter",
  "undecided",
]);

export const AircraftCategorySchema = z.enum([
  "light_jet",
  "midsize",
  "super_midsize",
  "large_cabin",
  "ultra_long_range",
  "turboprop",
  "regional_utility",
]);

export const MissionExtractionResultSchema = z
  .object({
    passengers: z.number().int().min(1).max(24).nullable(),
    origin: z.string().min(1).nullable(),
    destination: z.array(z.string().min(1)).nullable(),
    mission_type: MissionTypeSchema.nullable(),
    nonstop_required: z.boolean().nullable(),
    westbound_sensitive: z.boolean().nullable(),
    winter_ops: z.boolean().nullable(),
    runway_priority: PriorityLevelSchema.nullable(),
    operating_cost_priority: PriorityLevelSchema.nullable(),
    cabin_priority: PriorityLevelSchema.nullable(),
    baggage_priority: PriorityLevelSchema.nullable(),
    ownership_interest: OwnershipInterestSchema.nullable(),
    annual_hours: z.number().int().min(1).max(2000).nullable(),
    budget: z.number().nonnegative().nullable(),
    hot_high_ops: z.boolean().nullable(),
    mountain_airports: z.boolean().nullable(),
    short_runway_ops: z.boolean().nullable(),
    international_ops: z.boolean().nullable(),
    transatlantic: z.boolean().nullable(),
    transpacific: z.boolean().nullable(),
    south_america: z.boolean().nullable(),
    caribbean: z.boolean().nullable(),
    europe: z.boolean().nullable(),
    asia: z.boolean().nullable(),
    inferred_aircraft_category: AircraftCategorySchema.nullable(),
  })
  .strict();

export type MissionExtractionResult = z.infer<typeof MissionExtractionResultSchema>;

export function parseMissionExtractionJson(raw: string): MissionExtractionResult {
  const parsed: unknown = JSON.parse(raw);
  return MissionExtractionResultSchema.parse(parsed);
}

export function safeParseMissionExtraction(
  data: unknown,
): { success: true; data: MissionExtractionResult } | { success: false; error: z.ZodError } {
  const result = MissionExtractionResultSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
