const fs = require('fs');

let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

code = code.replace(/a\.type === 'usd_nakit'/g, "a.type === 'doviz' && a.symbol === 'USD'");
code = code.replace(/a\.type === 'eur_nakit'/g, "a.type === 'doviz' && a.symbol === 'EUR'");

code = code.replace(/\['bes', 'vadeli', 'nakit', 'usd_nakit', 'eur_nakit'\]/g, "['bes', 'vadeli', 'nakit']");
code = code.replace(/\['nakit', 'usd_nakit', 'eur_nakit'\]/g, "['nakit']");

code = code.replace(/\.eq\('type', 'usd_nakit'\)/g, ".eq('type', 'doviz').eq('symbol', 'USD')");

// Clean up manual insertion block for usd_nakit / eur_nakit
code = code.replace(/if \(form\.type === 'usd_nakit'\) \{[\s\S]*?\}\s*if \(form\.type === 'eur_nakit'\) \{[\s\S]*?\}/g, "");
code = code.replace(/if \(manualAsset\.type === 'usd_nakit'\) \{[\s\S]*?\}\s*if \(manualAsset\.type === 'eur_nakit'\) \{[\s\S]*?\}/g, "");

// Remove form.type checks for usd/eur_nakit
code = code.replace(/form\.type === 'usd_nakit' \? \([\s\S]*?\) : /g, "");
code = code.replace(/\(form\.type === 'usd_nakit' \? 'USD' : form\.type === 'eur_nakit' \? 'EUR' : null\)/g, "null");

// Remove colors
code = code.replace(/usd_nakit: '#16a34a',/g, "");
code = code.replace(/eur_nakit: '#16a34a',/g, "");

// Update specific ternary forms
code = code.replace(/t\.value === 'usd_nakit' \? 'USD Nakit' : t\.value === 'eur_nakit' \? 'EUR Nakit' : /g, "");

fs.writeFileSync('src/pages/Assets.tsx', code);
console.log('Assets.tsx refactored');
