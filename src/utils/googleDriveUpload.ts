export const SENTRA_RESI_DRIVE_FOLDER_ID = '1bnDI7oIa7FF2HF-4xn-pV-AX7iXDsrc2';
export const SENTRA_RESI_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1bnDI7oIa7FF2HF-4xn-pV-AX7iXDsrc2?usp=sharing';

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink?: string;
}

/**
 * Upload a Resi file (PDF or Image) directly into Sentra Naturindo's Google Drive folder
 * (`1bnDI7oIa7FF2HF-4xn-pV-AX7iXDsrc2`) using the user's OAuth 2.0 Bearer accessToken.
 */
export async function uploadResiToGoogleDrive(
  file: File,
  accessToken: string,
  customName?: string
): Promise<DriveUploadResult> {
  const finalName = customName && customName.trim() ? customName.trim() : file.name;
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

  const metadata = {
    name: finalName,
    parents: [SENTRA_RESI_DRIVE_FOLDER_ID],
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file, finalName);

  const uploadUrl =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink';

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errMsg: string = errBody?.error?.message || `HTTP ${res.status}`;

    if (
      res.status === 401 ||
      errMsg.toLowerCase().includes('insufficient authentication scopes') ||
      errMsg.toLowerCase().includes('invalid credentials')
    ) {
      const scopeErr = new Error(
        'Sesi login Anda belum memiliki izin Google Drive. Klik tombol "Aktifkan Izin & Upload ke Google Drive" dan centang kotak izin Google Drive saat jendela Google terbuka.'
      );
      (scopeErr as any).code = 'INSUFFICIENT_DRIVE_SCOPE';
      throw scopeErr;
    }

    if (res.status === 404 || res.status === 403) {
      // Fallback to user's Drive root if their Google account only has Viewer access on the shared folder
      const fallbackForm = new FormData();
      fallbackForm.append(
        'metadata',
        new Blob([JSON.stringify({ name: finalName, mimeType })], {
          type: 'application/json',
        })
      );
      fallbackForm.append('file', file, finalName);

      const fallbackRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: fallbackForm,
      });

      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        const fileId = fbData.id as string;
        return {
          fileId,
          fileName: fbData.name || finalName,
          webViewLink:
            fbData.webViewLink ||
            `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
          webContentLink: fbData.webContentLink,
        };
      }
    }

    throw new Error(`Gagal upload ke Google Drive: ${errMsg}`);
  }

  const data = await res.json();
  const fileId = data.id as string;

  return {
    fileId,
    fileName: data.name || finalName,
    webViewLink:
      data.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
    webContentLink: data.webContentLink,
  };
}
