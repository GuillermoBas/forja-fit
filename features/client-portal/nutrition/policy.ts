import { nutritionAssistantConfig } from "@/features/client-portal/nutrition/config"

const offTopicPatterns = [
  /\bprograma(r|cion)?\b/i,
  /\bcodigo\b/i,
  /\bcriptomonedas?\b/i,
  /\bacciones?\b/i,
  /\bpolitica\b/i,
  /\bviaje(s)?\b/i,
  /\btiempo\b/i,
  /\bapuesta(s)?\b/i
]

const medicalPatterns = [
  /\bdiagnostico\b/i,
  /\bdiagnosticar\b/i,
  /\bpatologia\b/i,
  /\bcancer\b/i,
  /\bquimioterapia\b/i,
  /\binsuficiencia renal\b/i,
  /\bcrohn\b/i,
  /\bcolitis ulcerosa\b/i,
  /\bdiabetes tipo 1\b/i
]

const eatingDisorderPatterns = [
  /\banorexia\b/i,
  /\bbulimia\b/i,
  /\batracon(es)?\b/i,
  /\bpurga(s)?\b/i,
  /\bvomi(tar|tos)\b/i,
  /\blaxantes?\b/i,
  /\btca\b/i
]

export type NutritionRefusalType = "off_topic" | "medical" | "eating_disorder" | null

export function classifyNutritionPrompt(input: string): NutritionRefusalType {
  if (eatingDisorderPatterns.some((pattern) => pattern.test(input))) {
    return "eating_disorder"
  }

  if (medicalPatterns.some((pattern) => pattern.test(input))) {
    return "medical"
  }

  if (offTopicPatterns.some((pattern) => pattern.test(input))) {
    return "off_topic"
  }

  return null
}

export function getNutritionRefusalMessage(type: Exclude<NutritionRefusalType, null>) {
  if (type === "eating_disorder") {
    return nutritionAssistantConfig.refusalMessages.eatingDisorder
  }

  if (type === "medical") {
    return nutritionAssistantConfig.refusalMessages.medical
  }

  return nutritionAssistantConfig.refusalMessages.offTopic
}
