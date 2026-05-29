const fs = require("fs");
const path = require("path");

let fixed = 0;
function walkDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (["node_modules", ".git", "dist"].includes(item)) continue;
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (item.endsWith(".tsx") || item.endsWith(".ts")) {
      let content = fs.readFileSync(fullPath, "utf8");
      const orig = content;
      content = content.replace(/from ['"]@types\//g, "from '@/types/");
      content = content.replace(/from ['"]@components\//g, "from '@/components/");
      content = content.replace(/from ['"]@config\//g, "from '@/config/");
      content = content.replace(/from ['"]@services\//g, "from '@/services/");
      content = content.replace(/'student'/g, "'STUDENT'");
      content = content.replace(/'teacher'/g, "'TEACHER'");
      content = content.replace(/'parent'/g, "'PARENT'");
      content = content.replace(/'admin'/g, "'ADMIN'");
      if (content !== orig) { fs.writeFileSync(fullPath, content); fixed++; }
    }
  }
}
walkDir("src");
fs.mkdirSync("src/types", { recursive: true });
fs.writeFileSync("src/types/extended.ts", "export interface SessionContext { sessionId: string; session_id?: string; activity_name?: string; learning_objectives: any[]; competencies: any[]; }\nexport interface CaptureFormData { file: File; title: string; description?: string; capture_type: string; learning_objectives: string[]; competencies: string[]; }\nexport type ReflectionType = 'freeform' | 'guided' | 'evidence';");
console.log("Fixed " + fixed + " files. Created extended.ts");
