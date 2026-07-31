'use client';

import { useState } from 'react';
import { putJson } from '@/lib/client-api';
import type { PersonConfig, SiteConfig } from '@/lib/content/types';
import { ImageField } from './ImageField';
import {
  ActionButton,
  FieldGroup,
  NoticeBar,
  PanelHeading,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
  csrfHeaders,
  useAdminAction,
} from './ui';

/**
 * Form pengaturan undangan — pengganti langsung tab Config di spreadsheet.
 *
 * Seluruh isian dikirim sebagai satu dokumen utuh, bukan per kolom. Dengan
 * begitu tidak ada keadaan setengah tersimpan bila koneksi putus di tengah
 * penyuntingan: yang tersimpan selalu satu versi yang konsisten.
 */
export function ConfigPanel({ config }: { config: SiteConfig }) {
  const { run, notice, busy } = useAdminAction();
  const [form, setForm] = useState<SiteConfig>(config);

  const set = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const setPerson = (who: 'pria' | 'wanita') => (key: keyof PersonConfig, value: string): void =>
    setForm((current) => ({ ...current, [who]: { ...current[who], [key]: value } }));

  const saving = busy('config');

  async function handleSave(): Promise<void> {
    await run(
      'config',
      () => putJson('/api/admin/content/config', form, csrfHeaders()),
      'Pengaturan tersimpan dan sudah tampil di halaman undangan.',
    );
  }

  return (
    <section aria-label="Pengaturan undangan">
      <PanelHeading
        title="Pengaturan Undangan"
        description="Semua isian di bawah ini langsung mengubah halaman yang dilihat tamu setelah disimpan."
        action={
          <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan pengaturan'}
          </ActionButton>
        }
      />

      <NoticeBar notice={notice} />

      <FieldGroup
        title="Publikasi"
        description="Selama status masih draf, halaman undangan menampilkan penanda dan tidak layak disebar."
        columns={1}
      >
        <Toggle
          label="Masih draf"
          checked={form.isDraft}
          disabled={saving}
          onChange={(value) => set('isDraft', value)}
          hint="Matikan bila undangan sudah siap disebar ke tamu."
        />
        <Toggle
          label="Mode syar'i"
          checked={form.modeSyari}
          disabled={saving}
          onChange={(value) => set('modeSyari', value)}
          hint="Menyembunyikan foto mempelai dan gambar sampul."
        />
        <Toggle
          label="Terima konfirmasi kehadiran"
          checked={form.rsvpOpen}
          disabled={saving}
          onChange={(value) => set('rsvpOpen', value)}
          hint="Matikan setelah rekap kehadiran dikunci."
        />
        <Toggle
          label="Moderasi ucapan sebelum tampil"
          checked={form.moderasiUcapan}
          disabled={saving}
          onChange={(value) => set('moderasiUcapan', value)}
          hint="Bila aktif, ucapan baru tampil setelah Anda menyetujuinya di tab Ucapan."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Urutan nama mempelai"
            value={form.urutanMempelai}
            disabled={saving}
            onChange={(value) => set('urutanMempelai', value as SiteConfig['urutanMempelai'])}
            options={[
              { value: 'wanita_dulu', label: 'Mempelai wanita lebih dulu' },
              { value: 'pria_dulu', label: 'Mempelai pria lebih dulu' },
            ]}
          />
          <TextField
            label="Batas akhir konfirmasi"
            type="date"
            value={form.deadlineRsvp ?? ''}
            disabled={saving}
            onChange={(value) => set('deadlineRsvp', value === '' ? null : value)}
            hint="Kosongkan bila tidak ada batas waktu."
          />
        </div>
      </FieldGroup>

      <PersonFields
        title="Mempelai Wanita"
        person={form.wanita}
        binLabel="Binti"
        disabled={saving}
        onChange={setPerson('wanita')}
      />

      <PersonFields
        title="Mempelai Pria"
        person={form.pria}
        binLabel="Bin"
        disabled={saving}
        onChange={setPerson('pria')}
      />

      <FieldGroup
        title="Kutipan & Salam"
        description="Ayat atau hadis pembuka, serta kalimat sambutan dan penutup undangan."
        columns={1}
      >
        <TextAreaField
          label="Kutipan (teks Arab)"
          value={form.quoteArab}
          rows={3}
          disabled={saving}
          onChange={(value) => set('quoteArab', value)}
        />
        <TextAreaField
          label="Terjemahan kutipan"
          value={form.quoteTerjemahan}
          rows={3}
          disabled={saving}
          onChange={(value) => set('quoteTerjemahan', value)}
        />
        <TextField
          label="Sumber kutipan"
          value={form.quoteSumber}
          placeholder="QS. Ar-Rum: 21"
          disabled={saving}
          onChange={(value) => set('quoteSumber', value)}
        />
        <TextField
          label="Salam pembuka"
          value={form.salamPembuka}
          disabled={saving}
          onChange={(value) => set('salamPembuka', value)}
        />
        <TextAreaField
          label="Kalimat pembuka"
          value={form.kalimatPembuka}
          rows={4}
          disabled={saving}
          onChange={(value) => set('kalimatPembuka', value)}
        />
        <TextAreaField
          label="Kalimat penutup"
          value={form.kalimatPenutup}
          rows={4}
          disabled={saving}
          onChange={(value) => set('kalimatPenutup', value)}
        />
        <TextAreaField
          label="Doa penutup"
          value={form.doaPenutup}
          rows={3}
          disabled={saving}
          onChange={(value) => set('doaPenutup', value)}
        />
        <TextField
          label="Salam penutup"
          value={form.salamPenutup}
          disabled={saving}
          onChange={(value) => set('salamPenutup', value)}
        />
      </FieldGroup>

      <FieldGroup title="Lokasi Acara" columns={1}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nama tempat"
            value={form.venueNama}
            disabled={saving}
            onChange={(value) => set('venueNama', value)}
          />
          <TextField
            label="Catatan tambahan"
            value={form.venueCatatan}
            placeholder="Parkir di halaman belakang"
            disabled={saving}
            onChange={(value) => set('venueCatatan', value)}
          />
        </div>
        <TextAreaField
          label="Alamat lengkap"
          value={form.venueAlamat}
          rows={2}
          disabled={saving}
          onChange={(value) => set('venueAlamat', value)}
        />
        <TextField
          label="Tautan Google Maps"
          value={form.gmapsUrl}
          placeholder="https://maps.app.goo.gl/…"
          disabled={saving}
          onChange={(value) => set('gmapsUrl', value)}
          hint="Dipakai tombol “Buka Peta”. Ambil dari tombol Bagikan di Google Maps."
        />
        <TextField
          label="Peta sematan (embed)"
          value={form.gmapsEmbed}
          placeholder='Tempel kode <iframe …> dari menu "Sematkan peta"'
          disabled={saving}
          onChange={(value) => set('gmapsEmbed', value)}
          hint="Boleh menempel seluruh kode iframe — alamatnya diambil otomatis."
        />
      </FieldGroup>

      <FieldGroup title="Amplop Digital" description="Ditampilkan bersama daftar rekening.">
        <ImageField
          label="Gambar QRIS"
          value={form.qrisImageUrl}
          disabled={saving}
          onChange={(value) => set('qrisImageUrl', value)}
          hint="Kosongkan bila tidak memakai QRIS."
        />
        <TextField
          label="Nama merchant QRIS"
          value={form.qrisNamaMerchant}
          disabled={saving}
          onChange={(value) => set('qrisNamaMerchant', value)}
        />
      </FieldGroup>

      <FieldGroup title="Tampilan & Berbagi">
        <ImageField
          label="Gambar sampul"
          value={form.coverImage}
          disabled={saving}
          onChange={(value) => set('coverImage', value)}
          hint="Latar halaman pembuka. Otomatis disembunyikan saat mode syar'i aktif."
        />
        <ImageField
          label="Gambar pratinjau WhatsApp"
          value={form.ogImage}
          disabled={saving}
          onChange={(value) => set('ogImage', value)}
          hint="Tampil saat link undangan dibagikan. Ukuran ideal 1200 × 630 piksel."
        />
        <TextField
          label="Musik latar"
          value={form.backsoundUrl}
          placeholder="https://… berkas .mp3"
          disabled={saving}
          onChange={(value) => set('backsoundUrl', value)}
          hint="Kosongkan bila tidak ingin ada musik. Tamu tetap bisa mematikannya."
        />
      </FieldGroup>

      <div className="mt-6 flex justify-end pb-4">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan pengaturan'}
        </ActionButton>
      </div>
    </section>
  );
}

function PersonFields({
  title,
  person,
  binLabel,
  disabled,
  onChange,
}: {
  title: string;
  person: PersonConfig;
  binLabel: string;
  disabled: boolean;
  onChange: (key: keyof PersonConfig, value: string) => void;
}) {
  return (
    <FieldGroup title={title}>
      <TextField
        label="Nama panggilan"
        value={person.panggilan}
        disabled={disabled}
        onChange={(value) => onChange('panggilan', value)}
        hint="Nama pendek yang tampil di sampul dan hitung mundur."
      />
      <TextField
        label="Nama lengkap"
        value={person.namaLengkap}
        disabled={disabled}
        onChange={(value) => onChange('namaLengkap', value)}
      />
      <TextField
        label={binLabel}
        value={person.binBinti}
        placeholder={`${binLabel} Nama Ayah`}
        disabled={disabled}
        onChange={(value) => onChange('binBinti', value)}
      />
      <TextField
        label="Anak ke-"
        value={person.anakKe}
        placeholder="pertama"
        disabled={disabled}
        onChange={(value) => onChange('anakKe', value)}
        hint="Ditulis sebagai kata, mis. “pertama”. Boleh dikosongkan."
      />
      <TextField
        label="Nama ayah"
        value={person.ayah}
        disabled={disabled}
        onChange={(value) => onChange('ayah', value)}
      />
      <TextField
        label="Nama ibu"
        value={person.ibu}
        disabled={disabled}
        onChange={(value) => onChange('ibu', value)}
      />
      <TextField
        label="Instagram"
        value={person.instagram}
        placeholder="tanpa tanda @"
        disabled={disabled}
        onChange={(value) => onChange('instagram', value)}
      />
      <ImageField
        label="Foto"
        value={person.foto}
        disabled={disabled}
        onChange={(value) => onChange('foto', value)}
        hint="Disembunyikan otomatis saat mode syar'i aktif."
      />
    </FieldGroup>
  );
}
