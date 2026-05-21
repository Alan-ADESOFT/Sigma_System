/**
 * @fileoverview QualityCheck — detecta blur e baixa resolucao pos-saveImage
 * @description Sprint Image v2 (maio/2026).
 *
 * Estrategia:
 *   1. sharp.metadata() — pega width/height reais do arquivo gerado.
 *      Compara com o esperado (job.width/job.height). Se a imagem saiu
 *      menor que 70% do esperado em qualquer eixo → flag low resolution.
 *
 *   2. Laplacian variance em thumb 256px — Mede a variancia do filtro
 *      de Laplaciano (edges). Imagens borradas tem variancia baixa.
 *      Threshold = 80 (calibrado empiricamente: > 80 = nitida; 30-80 =
 *      borderline; < 30 = claramente borrada). So roda em thumb pra
 *      nao explodir CPU em imagens 4K.
 *
 * Nao bloqueia entrega — so seta low_quality_warning=true + grava o
 * detalhe em quality_check JSON. Frontend exibe badge sutil.
 *
 * Custo: ~50ms por imagem (downscale + filter via sharp). Roda fora do
 * critical path do response do worker.
 */

const sharp = require('sharp');

const BLUR_THRESHOLD = 80;            // variancia Laplaciana
const RESOLUTION_TOLERANCE = 0.70;     // 70% do esperado
const PROBE_SIZE = 256;                // thumb pra Laplaciano

/**
 * Convolui uma kernel 3x3 sobre um buffer de bytes single-channel,
 * retornando o array de respostas. Implementacao manual minimal.
 */
function applyKernel3x3(grayBuffer, width, height, kernel) {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let v = 0;
      let kIdx = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          v += grayBuffer[(y + ky) * width + (x + kx)] * kernel[kIdx++];
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

function variance(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let sqSum = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    sqSum += d * d;
  }
  return sqSum / arr.length;
}

/**
 * Roda quality check sobre o buffer gerado.
 *
 * @param {Buffer} imageBuffer
 * @param {object} expected - { width, height }
 * @returns {Promise<{
 *   isLowQuality: boolean,
 *   blurScore: number,
 *   isBlurry: boolean,
 *   actualWidth: number,
 *   actualHeight: number,
 *   isLowRes: boolean,
 *   reasons: string[]
 * }>}
 */
async function checkQuality(imageBuffer, expected = {}) {
  const reasons = [];
  let isLowQuality = false;
  let actualWidth = 0;
  let actualHeight = 0;
  let isLowRes = false;
  let blurScore = 0;
  let isBlurry = false;

  try {
    // 1. Resolucao real
    const meta = await sharp(imageBuffer).metadata();
    actualWidth = meta.width || 0;
    actualHeight = meta.height || 0;
    if (expected.width && expected.height && actualWidth && actualHeight) {
      const wRatio = actualWidth / expected.width;
      const hRatio = actualHeight / expected.height;
      if (wRatio < RESOLUTION_TOLERANCE || hRatio < RESOLUTION_TOLERANCE) {
        isLowRes = true;
        reasons.push(`resolucao baixa (${actualWidth}x${actualHeight}, esperado ${expected.width}x${expected.height})`);
      }
    }

    // 2. Laplaciano em thumb 256px (greyscale)
    try {
      const thumb = await sharp(imageBuffer)
        .resize(PROBE_SIZE, PROBE_SIZE, { fit: 'inside', withoutEnlargement: true })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = thumb;
      // Kernel Laplaciano 3x3 (4-conexo): [0 -1 0; -1 4 -1; 0 -1 0]
      const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
      const filtered = applyKernel3x3(data, info.width, info.height, kernel);
      blurScore = variance(filtered);
      isBlurry = blurScore < BLUR_THRESHOLD;
      if (isBlurry) reasons.push(`blur detectado (variancia Laplaciana ${blurScore.toFixed(1)})`);
    } catch (err) {
      console.warn('[WARN][QualityCheck] Laplaciano falhou (silenciado)', { error: err.message });
    }
  } catch (err) {
    console.warn('[WARN][QualityCheck] check falhou (silenciado)', { error: err.message });
  }

  isLowQuality = isLowRes || isBlurry;
  return {
    isLowQuality, blurScore, isBlurry,
    actualWidth, actualHeight, isLowRes,
    reasons,
  };
}

module.exports = { checkQuality, BLUR_THRESHOLD, RESOLUTION_TOLERANCE };
