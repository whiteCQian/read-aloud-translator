/**
 * 构建脚本
 * 用于打包Chrome插件，排除测试文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let marked;
async function ensureMarked() {
  if (!marked) {
    marked = (await import('marked')).marked;
  }
}

// 发布文件列表
const releaseFiles = [
  'src/manifest.json',
  'src/shared.js',
  'src/audio.html',
  'src/audio.js',
  'src/background.js',
  'src/content.js',
  'src/popup.html',
  'src/popup.js',
  'src/popup.css',
  'src/icons/icon-16.png',
  'src/icons/icon-48.png',
  'src/icons/icon-128.png'
];

// 发布目录
const releaseDir = 'release';

function build() {
  console.log('🔨 开始构建Chrome插件...\n');
  
  // 创建发布目录
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
    console.log('📁 创建发布目录');
  }
  // 创建 icons 子目录
  const iconsReleaseDir = path.join(releaseDir, 'icons');
  if (!fs.existsSync(iconsReleaseDir)) {
    fs.mkdirSync(iconsReleaseDir, { recursive: true });
  }
  // 复制发布文件
  let copiedCount = 0;
  releaseFiles.forEach(file => {
    const sourcePath = path.join(__dirname, file);
    // 去掉src/前缀，发布到release根目录
    const targetPath = path.join(__dirname, releaseDir, file.replace(/^src\//, ''));
    // 确保子目录存在
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`📄 复制: ${file}`);
      copiedCount++;
    } else {
      console.log(`⚠️  文件不存在: ${file}`);
    }
  });
  
  console.log(`\n✅ 构建完成！复制了 ${copiedCount} 个文件到 ${releaseDir} 目录`);
  console.log('📦 发布文件已准备就绪，测试文件已被排除');
  
  // 显示发布目录内容
  console.log('\n📋 发布目录内容:');
  const releaseDirFiles = fs.readdirSync(releaseDir);
  releaseDirFiles.forEach(file => {
    const stats = fs.statSync(path.join(releaseDir, file));
    const size = (stats.size / 1024).toFixed(2);
    console.log(`  ${file} (${size} KB)`);
  });
}

function clean() {
  console.log('🧹 清理发布目录...');
  
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    console.log('✅ 发布目录已清理');
  } else {
    console.log('📁 发布目录不存在，无需清理');
  }
  // 删除所有 release.*.zip
  const files = fs.readdirSync(__dirname);
  files.forEach(file => {
    if (/^release\..*\.zip$/.test(file)) {
      fs.unlinkSync(path.join(__dirname, file));
      console.log(`✅ ${file} 已删除`);
    }
  });
}

function test() {
  console.log('🧪 运行测试...\n');
  
  try {
    execSync('node tests/run-tests.js', { 
      stdio: 'inherit',
      cwd: __dirname 
    });
    console.log('\n✅ 测试通过，可以继续构建');
  } catch (error) {
    console.log('\n❌ 测试失败，请修复问题后重试');
    process.exit(1);
  }
}

function zipRelease() {
  const archiver = require('archiver');
  // 读取 src/manifest.json 获取版本号
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/manifest.json'), 'utf-8'));
  const version = manifest.version || 'unknown';
  const zipName = `release.${version}.zip`;
  const zipPath = path.join(__dirname, zipName);
  const releasePath = path.join(__dirname, releaseDir);
  if (!fs.existsSync(releasePath)) {
    console.log('❌ release 目录不存在，请先运行 build');
    process.exit(1);
  }
  // 创建输出流
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', function() {
    console.log(`\n✅ 打包完成，生成 ${zipPath} (${(archive.pointer()/1024).toFixed(2)} KB)`);
  });
  archive.on('error', function(err) {
    throw err;
  });
  archive.pipe(output);
  archive.directory(releasePath + '/', false);
  archive.finalize();
}

async function mdToHtml(mdPath, htmlPath, title) {
  await ensureMarked();
  if (!fs.existsSync(mdPath)) {
    console.log(`❌ 文件不存在: ${mdPath}`);
    return;
  }
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const htmlContent = `<!DOCTYPE html>\n<html lang='en'>\n<head>\n<meta charset='UTF-8'>\n<title>${title}</title>\n<style>body{max-width:800px;margin:40px auto;font-family:sans-serif;line-height:1.7;padding:0 16px;}pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto;}code{background:#f6f8fa;padding:2px 4px;border-radius:4px;}h1,h2,h3{margin-top:2em;}table{border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px 12px;}blockquote{color:#555;border-left:4px solid #ddd;padding-left:12px;}</style>\n</head>\n<body>\n${marked.parse(mdContent)}\n</body>\n</html>`;
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`✅ 生成: ${htmlPath}`);
}

async function genHtml() {
  await mdToHtml(path.join(__dirname, 'README.md'), path.join(__dirname, 'README.html'), 'README');
  await mdToHtml(path.join(__dirname, 'PRIVACY_POLICY.md'), path.join(__dirname, 'PRIVACY_POLICY.html'), 'Privacy Policy');
}

// 命令行参数处理
const args = process.argv.slice(2);
const command = args[0];

(async () => {
  switch (command) {
    case 'build':
      await build();
      break;
    case 'clean':
      clean();
      break;
    case 'test':
      test();
      break;
    case 'build:test':
      test();
      await build();
      break;
    case 'build:zip':
      await build();
      zipRelease();
      break;
    case 'zip':
      zipRelease();
      break;
    case 'gen:html':
      await genHtml();
      break;
    default:
      console.log('🔨 Chrome插件构建工具');
      console.log('');
      console.log('使用方法:');
      console.log('  node build.js build      - 构建发布文件');
      console.log('  node build.js clean      - 清理发布目录');
      console.log('  node build.js test       - 运行测试');
      console.log('  node build.js build:test - 运行测试后构建');
      console.log('  node build.js build:zip  - 构建并打包为zip');
      console.log('  node build.js zip        - 仅打包release为zip');
      console.log('  node build.js gen:html   - 生成README和隐私政策的HTML文件');
      console.log('');
      console.log('注意: 构建时会自动排除 tests/ 目录中的测试文件');
  }
})();
