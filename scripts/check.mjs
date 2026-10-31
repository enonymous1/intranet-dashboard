// Syntax-check every runtime module. Discovers files by glob instead of
// a hand-maintained list in package.json, so a newly added module cannot
// silently escape the check (the old list had to be edited by hand for
// every new file, and forgetting it meant the file was never checked).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));

function collect(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) collect(path, out);
        else if (path.endsWith('.js') || path.endsWith('.mjs')) out.push(path);
    }
    return out;
}

const files = [
    ...collect(join(root, 'dashboard-app', 'js')),
    ...collect(join(root, 'scripts')),
].sort();

let failed = false;
for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
        failed = true;
        process.stderr.write(`FAIL ${relative(root, file)}\n${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}`);
    }
}
if (failed) process.exit(1);
console.log(`check ok: ${files.length} files`);
