const { copyFileSync } = require('fs');

const files = [
  ['index.html',          'dist/index.html'],
  ['Test_House.glb',      'dist/Test_House.glb'],
  ['EUI_Compile_upd.csv', 'dist/EUI_Compile_upd.csv'],
];

files.forEach(([src, dest]) => {
  copyFileSync(src, dest);
  console.log(`copied ${src} → ${dest}`);
});
