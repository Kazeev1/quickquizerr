const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');

async function processFile(buffer, mimetype, filename) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = filename.toLowerCase().split('.').pop();

  let text = '';
  let hasImages = false;
  let imageWarnings = [];

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const result = await pdf(buffer);
    text = result.text || '';

    // Heuristic: very little text per page likely means image-based PDF
    const charsPerPage = result.numpages > 0 ? text.trim().length / result.numpages : 0;
    if (charsPerPage < 80 && result.numpages > 0) {
      hasImages = true;
      imageWarnings.push('PDF содержит мало текста — возможно, страницы состоят из изображений');
    }
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const rawResult = await mammoth.extractRawText({ buffer });
    text = rawResult.value || '';

    // Detect embedded images via HTML output
    if (htmlResult.value.includes('<img')) {
      hasImages = true;
      imageWarnings.push('В документе обнаружены встроенные изображения');
    }

    // Also check mammoth messages for image warnings
    const imgMessages = htmlResult.messages.filter(
      (m) => m.type === 'warning' && /image|drawing|picture/i.test(m.message)
    );
    if (imgMessages.length > 0) {
      hasImages = true;
      imageWarnings.push('Документ содержит графические элементы (рисунки/схемы)');
    }
  } else if (mimetype === 'application/msword' || ext === 'doc') {
    try {
      const rawResult = await mammoth.extractRawText({ buffer });
      const htmlResult = await mammoth.convertToHtml({ buffer });
      text = rawResult.value || '';

      if (htmlResult.value.includes('<img')) {
        hasImages = true;
        imageWarnings.push('В документе обнаружены встроенные изображения');
      }
    } catch {
      throw new Error(
        'Не удалось обработать файл .doc. Пожалуйста, конвертируйте его в формат .docx и загрузите повторно.'
      );
    }
  } else {
    throw new Error('Неподдерживаемый формат файла. Используйте PDF, DOC или DOCX.');
  }

  if (text.trim().length < 50) {
    throw new Error(
      'Не удалось извлечь текст из файла. Возможно, документ состоит только из изображений.'
    );
  }

  return { text, hasImages, imageWarnings, hash };
}

module.exports = { processFile };
