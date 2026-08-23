import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg = null;
let isLoading = false;

/**
 * Initializes the FFmpeg instance if not already initialized.
 */
export async function initFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (isLoading) {
    // Wait until it's loaded by another call
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return ffmpeg;
  }
  
  isLoading = true;
  ffmpeg = new FFmpeg();
  
  // Load ffmpeg.wasm-core
  await ffmpeg.load();
  
  isLoading = false;
  return ffmpeg;
}

/**
 * Converts any audio buffer to a WAV ArrayBuffer using FFmpeg.wasm.
 * @param {ArrayBuffer} arrayBuffer The raw audio data
 * @param {string} fileName Original filename to get the correct extension
 * @returns {Promise<ArrayBuffer>} The converted WAV ArrayBuffer
 */
export async function convertAudioToWav(arrayBuffer, fileName) {
  const ffmpegInstance = await initFFmpeg();
  
  // Extract extension or default to .m4a
  let ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.m4a';
  // Avoid weird extensions breaking ffmpeg
  if (!/^\.[a-zA-Z0-9]+$/.test(ext)) {
    ext = '.m4a';
  }
  
  const inputName = `input${ext}`;
  const outputName = 'output.wav';
  
  // Write the input file to the FFmpeg virtual file system
  const uint8Array = new Uint8Array(arrayBuffer);
  await ffmpegInstance.writeFile(inputName, uint8Array);
  
  // Run the conversion command
  // -i input -ar 44100 -ac 2 (optional to force standard stereo wav)
  await ffmpegInstance.exec(['-i', inputName, outputName]);
  
  // Read the output file
  const data = await ffmpegInstance.readFile(outputName);
  
  // Clean up virtual file system
  await ffmpegInstance.deleteFile(inputName);
  await ffmpegInstance.deleteFile(outputName);
  
  return data.buffer;
}
