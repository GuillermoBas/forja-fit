import type { NutritionMemory, WeeklyNutritionPlanPayload } from "@/features/client-portal/nutrition/server"

export const nutritionToolDefinitions = [
  {
    type: "function",
    function: {
      name: "read_nutrition_memory",
      description: "Lee la memoria nutricional persistente actual del cliente.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_nutrition_memory",
      description: "Actualiza campos concretos de memoria nutricional cuando el cliente revele datos personales o cambios de hábitos.",
      parameters: {
        type: "object",
        properties: {
          height_cm: { type: ["number", "null"] },
          weight_kg: { type: ["number", "null"] },
          goal: { type: ["string", "null"] },
          meals_per_day: { type: ["integer", "null"] },
          dietary_pattern: { type: ["string", "null"] },
          intermittent_fasting: { type: ["boolean", "null"] },
          allergies: { type: ["string", "null"] },
          intolerances: { type: ["string", "null"] },
          foods_to_avoid: { type: ["string", "null"] },
          preferred_foods: { type: ["string", "null"] },
          usual_schedule: { type: ["string", "null"] }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_weekly_plan",
      description: "Guarda un menú semanal estructurado cuando el cliente pida explícitamente un menú o plan semanal y quiera conservarlo.",
      parameters: {
        type: "object",
        properties: {
          week_starts_on: { type: "string" },
          title: { type: "string" },
          plan: {
            type: "object",
            properties: {
              week_goal: { type: "string" },
              notes: { type: "string" },
              shopping_list: {
                type: "array",
                items: { type: "string" }
              },
              days: {
                type: "object",
                properties: {
                  lunes: { type: "object" },
                  martes: { type: "object" },
                  miercoles: { type: "object" },
                  jueves: { type: "object" },
                  viernes: { type: "object" },
                  sabado: { type: "object" },
                  domingo: { type: "object" }
                },
                required: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
                additionalProperties: false
              }
            },
            required: ["week_goal", "days"],
            additionalProperties: true
          }
        },
        required: ["week_starts_on", "title", "plan"],
        additionalProperties: false
      }
    }
  }
] as const

export function buildMemoryToolResult(memory: NutritionMemory) {
  return {
    height_cm: memory.heightCm,
    weight_kg: memory.weightKg,
    goal: memory.goal,
    meals_per_day: memory.mealsPerDay,
    dietary_pattern: memory.dietaryPattern,
    intermittent_fasting: memory.intermittentFasting,
    allergies: memory.allergies,
    intolerances: memory.intolerances,
    foods_to_avoid: memory.foodsToAvoid,
    preferred_foods: memory.preferredFoods,
    usual_schedule: memory.usualSchedule
  }
}

export function buildWeeklyPlanToolResult(plan: WeeklyNutritionPlanPayload) {
  return {
    week_goal: plan.weekGoal,
    notes: plan.notes,
    shopping_list: plan.shoppingList,
    days: plan.days
  }
}
