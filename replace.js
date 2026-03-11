import fs from 'fs';
const file = 'src/store.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/if \(process\.env\.SUPABASE_KEY\) \{/g, 'if (true) {');
fs.writeFileSync(file, content);
console.log('Replaced process.env.SUPABASE_KEY with true');
