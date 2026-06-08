import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const MAX_LINES = 600;
const ROOT = process.cwd();

const GENERATED_OR_BUILD_EXCLUDED_DIRS = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);

const TEMPORARY_EXCEPTIONS = new Map([]);

const walk = (dir) => {
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!GENERATED_OR_BUILD_EXCLUDED_DIRS.has(entry.name)) {
        files.push(...walk(path.join(dir, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
};

const lineCount = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.length === 0 ? 0 : content.split(/\r?\n/u).length;
};

const oversized = walk(path.join(ROOT, 'src'))
  .map((filePath) => {
    const relativePath = path.relative(ROOT, filePath);
    return {
      exception: TEMPORARY_EXCEPTIONS.get(relativePath),
      lineCount: lineCount(filePath),
      relativePath,
    };
  })
  .filter((file) => file.lineCount > MAX_LINES)
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const failures = oversized.filter((file) => !file.exception);
const exceptions = oversized.filter((file) => file.exception);

if (oversized.length > 0) {
  process.stdout.write(`File-size limit: ${MAX_LINES} lines\n`);
  process.stdout.write(`Generated/build exclusions: ${Array.from(GENERATED_OR_BUILD_EXCLUDED_DIRS).sort().join(', ')}\n`);

  if (failures.length > 0) {
    process.stdout.write('\nHard failures:\n');
    for (const file of failures) {
      process.stdout.write(`- ${file.relativePath}: ${file.lineCount}\n`);
    }
  } else {
    process.stdout.write('\nHard failures: none\n');
  }

  if (exceptions.length > 0) {
    process.stdout.write('\nTemporary exceptions:\n');
    for (const file of exceptions) {
      process.stdout.write(`- ${file.relativePath}: ${file.lineCount} - ${file.exception}\n`);
    }
  } else {
    process.stdout.write('\nTemporary exceptions: none\n');
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(`File-size check passed. ${exceptions.length} temporary exception${exceptions.length === 1 ? '' : 's'} documented.\n`);
}
