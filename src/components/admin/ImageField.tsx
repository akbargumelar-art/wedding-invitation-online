'use client';

import { useId, useRef, useState } from 'react';
import { postForm } from '@/lib/client-api';
import { csrfHeaders } from './ui';

/**
 * Isian gambar: boleh ditempel sebagai URL, boleh diunggah langsung.
 *
 * Keduanya disediakan dengan sengaja. Unggahan adalah jalur normal dan tidak
 * menuntut mempelai punya layanan hosting apa pun; kolom URL tetap ada supaya
 * foto yang sudah telanjur ada di Drive atau Cloudinary tidak perlu diunduh dan
 * diunggah ulang hanya untuk bisa dipakai.
 */
export function ImageField({
  label,
  value,
  onChange,
  onUploaded,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /**
   * Dipanggil hanya setelah unggahan benar-benar selesai, bukan pada setiap
   * ketikan. Dipakai pemanggil yang ingin langsung menindaklanjuti berkas baru
   * — mis. tab Galeri, yang menambahkannya ke daftar tanpa menunggu klik lain.
   */
  onUploaded?: (url: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File): Promise<void> {
    setUploading(true);
    setError('');

    const form = new FormData();
    form.set('file', file);
    form.set('label', label);

    const result = await postForm<{ url: string }>('/api/admin/media', form, csrfHeaders());
    setUploading(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    onChange(result.data.url);
    onUploaded?.(result.data.url);
  }

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>

      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          className="field-input"
          value={value}
          placeholder="https://… atau unggah berkas"
          disabled={disabled || uploading}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost shrink-0 text-sm"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Mengunggah…' : 'Unggah'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Nilai dikosongkan supaya memilih berkas yang sama dua kali tetap
          // memicu onChange — kejadian biasa setelah unggahan pertama gagal.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {error ? <p className="field-error">{error}</p> : null}
      {hint && !error ? <p className="field-hint">{hint}</p> : null}

      {value ? (
        // `next/image` tidak dipakai: sumbernya URL sembarang milik admin, dan
        // pratinjau kecil di dashboard tidak layak masuk cache optimizer.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value}
          alt=""
          className="mt-3 h-24 w-24 rounded-lg border border-jade-100 object-cover"
          loading="lazy"
        />
      ) : null}
    </div>
  );
}
