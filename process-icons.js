const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function processIcons() {
  const sourceFile = path.join(__dirname, 'assets/icons/source.png');
  const iconPng = path.join(__dirname, 'assets/icons/icon.png');
  const sidebarFile = path.join(__dirname, 'assets/icons/installerSidebar.png');
  const headerFile = path.join(__dirname, 'assets/icons/installerHeader.png');

  await sharp(sourceFile).toFormat('png').toFile(iconPng);

  // Generate square 256x256 for icon.ico
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    {
      input: await sharp(sourceFile).resize(256, 256, { fit: 'contain' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .toFormat('png')
  .toFile(path.join(__dirname, 'assets/icons/icon_square.png'));
  console.log('Creado icon_square.png');

  await sharp({
    create: {
      width: 164,
      height: 314,
      channels: 4,
      background: { r: 13, g: 13, b: 15, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(sourceFile).resize(120, 120, { fit: 'contain' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .toFormat('png')
  .toFile(sidebarFile);
  console.log('Creado installerSidebar.png');

  await sharp({
    create: {
      width: 150,
      height: 57,
      channels: 4,
      background: { r: 9, g: 9, b: 11, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(sourceFile).resize(40, 40, { fit: 'contain' }).toBuffer(),
      left: 105,
      top: 8
    }
  ])
  .toFormat('png')
  .toFile(headerFile);
  console.log('Creado installerHeader.png');
}

processIcons().catch(console.error);
