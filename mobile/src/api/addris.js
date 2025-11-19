const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export const extractAddresses = async ({ asset }) => {
  const formData = new FormData();
  const uri = asset.uri;
  const filename = asset.fileName ?? uri.split('/').pop() ?? 'upload.jpg';
  const extension = filename.split('.').pop()?.toLowerCase();

  let type = asset.mimeType
    ?? (extension === 'png'
      ? 'image/png'
      : extension === 'heic' || extension === 'heif'
        ? 'image/heic'
        : 'image/jpeg');

  if (type === 'image/heif') {
    type = 'image/heic';
  }

  formData.append('image', {
    uri,
    name: filename,
    type,
  });

  const response = await fetch(`${API_BASE_URL}/v1/addresses/extract`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Extraction failed with status ${response.status}`;
    if (errorText) {
      try {
        const payload = JSON.parse(errorText);
        if (payload?.detail) {
          message = Array.isArray(payload.detail)
            ? payload.detail.map((item) => item.msg ?? String(item)).join('\n')
            : String(payload.detail);
        } else {
          message = errorText;
        }
      } catch (parseError) {
        message = errorText;
      }
    }
    throw new Error(message);
  }

  return response.json();
};

export const computeRoute = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/v1/routes/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Route optimization failed with status ${response.status}`;
    if (errorText) {
      try {
        const payload = JSON.parse(errorText);
        if (payload?.detail) {
          message = Array.isArray(payload.detail)
            ? payload.detail.map((item) => item.msg ?? String(item)).join('\n')
            : String(payload.detail);
        } else {
          message = errorText;
        }
      } catch (parseError) {
        message = errorText;
      }
    }
    throw new Error(message);
  }

  return response.json();
};
