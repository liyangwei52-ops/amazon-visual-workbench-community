// Organize the ZIP downloaded through Edge's visible asset backup UI.
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const sharp = require('sharp');
const root = path.resolve('verification/edge-real-20261017');
const wbMap = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12];
const remixMap = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];
async function main() {
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2] || path.join(root, 'assets-30.zip')));
  const assets = JSON.parse(await zip.file('assets.json').async('string'));
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json'), 'utf8'));
  const simpleStart = Date.parse(plan.imageIntents.find(x => x.phase === 'simple')?.at || '9999-01-01');
  const first = [...assets].filter(x => /^请求 /.test(x.name)).sort((a, b) => a.createdAt - b.createdAt)[0];
  const manifest = [];
  for (const asset of assets) {
    const match = asset.name.match(/^(请求|提示词|版位) (\d+) 第(\d+)张$/);
    if (!match) throw new Error(`Unmapped asset: ${asset.name}`);
    const type = match[1], task = Number(match[2]), slot = Number(match[3]);
    // Planner and simple get explicit mapping after their names are verified in the UI.
    let phase, original;
    if (type === '请求') { phase = '01-视觉工作台'; original = asset.id === first.id ? 1 : wbMap[task - 1]; }
    else if (type === '提示词' && asset.createdAt >= simpleStart) { phase = '04-极简生图'; original = task; }
    else if (type === '提示词') { phase = '02-提示词迁移'; original = remixMap[task - 1]; }
    else { phase = '03-一键策划'; original = task; }
    if (!original) throw new Error(`No original index: ${asset.name}`);
    const entry = Object.values(zip.files).find(x => x.name.startsWith(`images/${asset.id}.`));
    if (!entry) throw new Error(`Missing original: ${asset.id}`);
    const bytes = await entry.async('nodebuffer');
    const metadata = await sharp(bytes).metadata();
    await sharp(bytes).png().toBuffer(); // Full decoding, not just a valid PNG header.
    if (metadata.width !== asset.width || metadata.height !== asset.height) throw new Error('Pixel metadata mismatch');
    const directory = path.join(root, phase);
    fs.mkdirSync(directory, { recursive: true });
    const prefix = String(original).padStart(2, '0');
    const file = `${prefix}-图${slot}.${metadata.format === 'jpeg' ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(directory, file), bytes);
    fs.writeFileSync(path.join(directory, `${prefix}-提交提示词.txt`), asset.prompt || '');
    manifest.push({ phase, original, task, slot, file, assetId: asset.id, name: asset.name, createdAt: asset.createdAt,
      width: metadata.width, height: metadata.height, bytes: bytes.length, decoded: true });
  }
  for (const [filename, phase, mapping] of [['workbench-prompts.json', '01-视觉工作台'], ['remix-prompts.json', '02-提示词迁移', remixMap], ['simple-prompts.json', '04-极简生图']]) {
    const source = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
    for (const [i, prompt] of source.prompts.entries()) {
      if (!prompt.text.trim()) continue;
      const original = mapping ? mapping[i] : i + 1;
      fs.writeFileSync(path.join(root, phase, `${String(original).padStart(2, '0')}-提示词.txt`), prompt.text);
    }
  }
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ decoded: manifest.length, phases: manifest.reduce((out, x) => ({ ...out, [x.phase]: (out[x.phase] || 0) + 1 }), {}) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
