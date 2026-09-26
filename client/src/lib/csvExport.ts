type AnalyticsCsvQuery = {
  analyticsExport: {
    projectCsv: {
      fetch(input: { projectId: number; days: number }): Promise<unknown>;
    };
    tagCsv: {
      fetch(input: { tag: string; days: number }): Promise<unknown>;
    };
  };
};

/**
 * Keep CSV fetching hook-free so it is safe to call from a click handler.
 * The tRPC utility object itself must be created at component render time.
 */
export async function fetchProjectAnalyticsCsv(
  utils: Pick<AnalyticsCsvQuery, "analyticsExport">,
  projectId: number,
  days: number,
) {
  const result = await utils.analyticsExport.projectCsv.fetch({ projectId, days });
  return result as any[];
}

export async function fetchTagAnalyticsCsv(
  utils: Pick<AnalyticsCsvQuery, "analyticsExport">,
  tag: string,
  days: number,
) {
  const result = await utils.analyticsExport.tagCsv.fetch({ tag, days });
  return result as any[];
}
