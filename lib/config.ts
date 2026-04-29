export const appConfig = {
  businessName: process.env.BUSINESS_NAME || "Trainium",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  timezone: process.env.APP_TIMEZONE || "Europe/Madrid"
}

export function isInsforgeConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_INSFORGE_URL &&
      process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY
  )
}
