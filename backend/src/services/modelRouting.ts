const FREE_ROUTER = "openrouter/free";

export function buildModelFallbacks(
  primaryModel: string,
  configuredFallbacks: string[],
): string[] {
  const unique = [primaryModel, ...configuredFallbacks].filter(
    (model, index, models) =>
      model !== "openrouter/auto" && models.indexOf(model) === index,
  );
  if (!unique.length) return [FREE_ROUTER];
  if (!unique.includes(FREE_ROUTER)) return unique.slice(0, 3);
  return [
    ...unique.filter((model) => model !== FREE_ROUTER).slice(0, 2),
    FREE_ROUTER,
  ];
}
