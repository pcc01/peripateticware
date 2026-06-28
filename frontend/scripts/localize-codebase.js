const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const TARGET_DIR = path.join(__dirname, '../src');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 30);
}

function processFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy']
    });
  } catch (e) {
    console.error(`Skipping file due to parse error: ${filePath}`);
    return;
  }

  let hasChanges = false;
  let needsHookImport = false;

  traverse(ast, {
    // 1. Process Raw Text between elements like <div>Hello</div>
    JSXText(p) {
      const value = p.node.value.trim();
      if (!value || /^[0-9\W_]+$/.test(value)) return; // Skip spaces or solitary numbers

      const key = slugify(value);
      // Construct {t('key', 'Default')} expression container
      const translationExpression = t.jsxExpressionContainer(
        t.callExpression(t.identifier('t'), [
          t.stringLiteral(key),
          t.stringLiteral(value)
        ])
      );

      p.replaceWith(translationExpression);
      hasChanges = true;
      needsHookImport = true;
    },

    // 2. Process attribute properties like placeholder="Enter Name"
    JSXAttribute(p) {
      if (p.node.name.name === 'placeholder' || p.node.name.name === 'title' || p.node.name.name === 'alt') {
        if (p.node.value && p.node.value.type === 'StringLiteral') {
          const value = p.node.value.value.trim();
          if (!value) return;

          const key = slugify(value);
          const translationCall = t.jsxExpressionContainer(
            t.callExpression(t.identifier('t'), [
              t.stringLiteral(key),
              t.stringLiteral(value)
            ])
          );

          p.get('value').replaceWith(translationCall);
          hasChanges = true;
          needsHookImport = true;
        }
      }
    }
  });

  if (hasChanges) {
    let { code: output } = generate(ast, { retainLines: true }, code);
    
    // Inject the hook at top of component if we added missing t() variants
    if (needsHookImport && !output.includes('useTranslation')) {
      output = `import { useTranslation } from 'react-i18next';\n` + output;
    }

    fs.writeFileSync(filePath, output, 'utf-8');
    console.log(`✨ Safely injected localization tags into: ${filePath}`);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
      processFile(fullPath);
    }
  }
}

console.log("🚀 Scanning codebase for un-localized text nodes...");
walk(TARGET_DIR);
console.log("🏁 Base tagging injection complete.");