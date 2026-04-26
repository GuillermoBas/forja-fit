import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    rules: {
      "import/no-anonymous-default-export": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**"
    ]
  }
]

export default eslintConfig
