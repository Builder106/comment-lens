import { globalIgnores } from "eslint/config";

export default [globalIgnores([".next/**", "node_modules/**"]), { rules: {} }];
