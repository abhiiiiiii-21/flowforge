export type LLMOutputType = "text" | "image";

export interface LLMModelOption {
  id: string;
  label: string;
  outputType: LLMOutputType;
}

export const TEXT_LLM_MODELS: readonly LLMModelOption[] = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", outputType: "text" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", outputType: "text" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", outputType: "text" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", outputType: "text" },
] as const;

export const IMAGE_LLM_MODELS: readonly LLMModelOption[] = [
  { id: "stability-core", label: "Stability Core", outputType: "image" },
] as const;

const ALL_LLM_MODELS = [...TEXT_LLM_MODELS, ...IMAGE_LLM_MODELS] as const;

export function normalizeLLMOutputType(value: unknown): LLMOutputType {
  return value === "image" ? "image" : "text";
}

export function getLLMModelsForOutputType(outputType: LLMOutputType): readonly LLMModelOption[] {
  return outputType === "image" ? IMAGE_LLM_MODELS : TEXT_LLM_MODELS;
}

export function getDefaultLLMModel(outputType: LLMOutputType): string {
  return getLLMModelsForOutputType(outputType)[0].id;
}

export function isLLMModelCompatible(model: unknown, outputType: LLMOutputType): boolean {
  return (
    typeof model === "string" &&
    getLLMModelsForOutputType(outputType).some((option) => option.id === model)
  );
}

export function normalizeLLMModel(model: unknown, outputType: LLMOutputType): string {
  return isLLMModelCompatible(model, outputType)
    ? (model as string)
    : getDefaultLLMModel(outputType);
}

export function getLLMModelLabel(model: string): string {
  return ALL_LLM_MODELS.find((option) => option.id === model)?.label ?? model;
}

export function getLLMOutputHandleId(outputType: LLMOutputType): "text-out" | "image-out" {
  return outputType === "image" ? "image-out" : "text-out";
}