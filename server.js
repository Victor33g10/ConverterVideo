const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); // serve frontend

// Configura uploads com multer para pasta temp_uploads
const uploadDir = path.join(__dirname, 'temp_uploads');
const outDir = path.join(__dirname, 'converted');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || '';
    cb(null, id + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // limite 500MB

// Endpoint para upload e conversão
// POST /convert?format=mp3  ou format=mp4
app.post('/convert', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const format = (req.query.format || 'mp3').toLowerCase();
    const inputPath = req.file.path;
    const baseName = path.parse(req.file.filename).name;
    const outExt = format === 'mp4' ? '.mp4' : '.mp3';
    const outName = `${baseName}${outExt}`;
    const outPath = path.join(outDir, outName);

    // Remover se existir
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    // Conversão com ffmpeg
    await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .on('error', (err) => reject(err))
        .on('end', () => resolve());

      if (format === 'mp3') {
        command = command.noVideo().audioCodec('libmp3lame').audioBitrate('192k');
      } else if (format === 'mp4') {
        // re-encode para mp4 com h264 + aac (ajuste conforme necessário)
        command = command.videoCodec('libx264').audioCodec('aac').outputOptions('-preset', 'fast');
      } else {
        return reject(new Error('Formato inválido'));
      }

      command.save(outPath);
    });

    // Opcional: apagar arquivo enviado para economizar espaço
    fs.unlink(inputPath, () => {});

    // Retorna link para download
    const downloadUrl = `/download/${outName}`;
    res.json({ downloadUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao converter arquivo', detail: err.message });
  }
});

// Servir arquivos convertidos com segurança (token temporário poderia ser adicionado)
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // evita path traversal
  const filePath = path.join(outDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Arquivo não encontrado');
  res.download(filePath, filename, (err) => {
    if (err) console.error('Erro no download:', err);
    // Você pode deletar o arquivo após download, se desejar
    // fs.unlink(filePath, ()=>{});
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
