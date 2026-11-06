import QRCode from "qrcode";

/**
 * The QR code for `text` as one SVG path (one 1×1 square per dark module) plus its size in
 * modules. Error correction H, so the mascot drawn over the middle doesn't break scanning.
 */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}
