import fs from "fs";
import path from "path";

const stubs = {
  "src/types/teacher.ts": "export interface TeacherActivityData { id: string; title: string; }",
  "src/stores/teacher.ts": "export const useTeacherStore = () => ({ });",
  "src/components/teacher/ActivityBuilder.tsx": "export const ActivityBuilder = () => <div>Activity Builder</div>;",
  "src/components/teacher/ActivityPreview.tsx": "export const ActivityPreview = () => <div>Preview</div>;",
  "src/components/common/LoadingSpinner.tsx": "export const LoadingSpinner = () => <div>Loading...</div>;",
};

for (const [file, content] of Object.entries(stubs)) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, content);
    console.log("? " + file);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts.build = "vite build";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
console.log("? Updated build script");
