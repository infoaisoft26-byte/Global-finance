import { auth } from '../lib/firebase.ts';

export interface OfferPoster {
  id: string; title: string; imageUrl: string; description: string; ctaLabel: string;
  ctaUrl: string; active: boolean; startAt: string; endAt: string; createdAt: string; updatedAt: string;
}

async function headers() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` };
}

// Active poster is intentionally public so it can appear on the login screen.
export async function getActiveOfferPoster(): Promise<OfferPoster | null> {
  const response = await fetch('/api/offer-poster', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load current offer.');
  return data.poster || null;
}

export async function uploadOfferPosterImage(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 3 * 1024 * 1024) throw new Error('Poster image must be 3 MB or smaller for direct Neon upload.');
  const token = await user.getIdToken();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const response = await fetch('/api/offer-poster-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, data: btoa(binary) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.imageUrl) throw new Error(data.error || 'Unable to save poster image in Neon.');
  return data.imageUrl;
}

export async function saveOfferPoster(input: Omit<OfferPoster, 'createdAt' | 'updatedAt'>): Promise<OfferPoster> {
  const response = await fetch('/api/offer-poster', { method: 'POST', headers: await headers(), body: JSON.stringify(input) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save offer poster.');
  return data.poster;
}

export async function disableOfferPoster(id: string): Promise<void> {
  const response = await fetch('/api/offer-poster', { method: 'DELETE', headers: await headers(), body: JSON.stringify({ id }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to disable offer poster.');
}
