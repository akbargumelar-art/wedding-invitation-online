/**
 * Normalisasi tujuan menjadi chatId WhatsApp.
 *
 * Gateway berbasis chatId (WAHA, whatsapp-web.js, dan turunannya) menuntut JID
 * lengkap, dan akhirannya yang menentukan tujuan: `@c.us` untuk chat pribadi,
 * `@g.us` untuk grup. Menuliskan nomor tanpa akhiran adalah kesalahan yang paling
 * sering terjadi, jadi bentuk itu dilengkapi otomatis — sementara JID yang sudah
 * lengkap tidak pernah disentuh, karena menebak-nebak ID grup akan mengirim pesan
 * ke tempat yang salah.
 */
export function toChatId(recipient: string): string {
  const value = recipient.trim();
  if (!value) return '';

  // Sudah berupa JID (mis. 6281234567890@c.us atau 1203630448@g.us).
  if (/@/.test(value)) return value;

  const digits = value.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : '';
}
