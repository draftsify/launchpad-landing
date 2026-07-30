import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Dépendances Foundry : v3-core et OpenZeppelin sont vendus tels quels.
      // Les linter noie nos propres avertissements sous 900 problèmes qui ne
      // sont pas les nôtres et qu'on ne corrigera pas.
      "contracts/lib/**",
      "contracts/out/**",
      "contracts/cache/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
