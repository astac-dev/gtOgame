import fs from 'fs';

const files = [
    'dist/galExpl.js',
    'dist/galaxytool-modern.user.js',
    'dashboard/app.js',
    'dashboard/index.html',
    'src/userscript/parser-galaxy.js'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const corrupted = content.match(/[\uFFFD]|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã|Ã‰|Ã|Ã“|Ãš|Ã‘|Â¿|Â¡/g);
    console.log(`${file}: ${corrupted ? corrupted.length : 0} corrupted sequences found.`);
    if (corrupted && corrupted.length > 0) {
        console.log(`  Sample:`, corrupted.slice(0, 5));
    }
}

