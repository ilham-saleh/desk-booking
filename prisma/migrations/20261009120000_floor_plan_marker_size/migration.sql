-- Optional per-plan desk-marker size (plan pixels); NULL keeps automatic sizing.
ALTER TABLE "floor_plan_versions" ADD COLUMN "markerSize" DOUBLE PRECISION;
