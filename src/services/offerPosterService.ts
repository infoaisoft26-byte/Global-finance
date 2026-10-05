import { auth, storage } from '../lib/firebase.ts';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export interface OfferPoster {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  active: boolean;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt: string;
}

async function headers() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

export async function getActiveOfferPoster(): Promise<OfferPoster | null> {
  const response = await fetch('/api/offer-poster', { headers: await headers(), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load current offer.');
  return data.poster || null;
}

export async function uploadOfferPosterImage(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Poster image must be 10 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storageRef = ref(storage, `offer-posters/${user.uid}/${Date.now()}-${safeName}`);
  const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(snapshot.ref);
}

export async function saveOfferPoster(input: Omit<OfferPoster, 'createdAt' | 'updatedAt'>): Promise<OfferPoster> {
  const response = await fetch('/api/offer-poster', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save offer poster.');
  return data.poster;
}

export async function disableOfferPoster(id: string): Promise<void> {
  const response = await fetch('/api/offer-poster', {
    method: 'DELETE',
    headers: await headers(),
    body: JSON.stringify({ id }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to disable offer poster.');
}
